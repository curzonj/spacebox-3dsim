'use strict';

var EventEmitter = require('events').EventEmitter,
    extend = require('extend'),
    util = require('util'),
    npm_debug = require('debug'),
    log = npm_debug('3dsim:info'),
    error = npm_debug('3dsim:error'),
    debug = npm_debug('3dsim:debug'),
    C = require('spacebox-common'),
    merge = require('../state_merge'),
    config = require('../config.js'),
    stats = require('./stats.js'),
    Q = require('q'),
    redisLib = require("redis")

var redis = function() {
    var promiseFactory = require("q").Promise,
        lib = require('promise-redis')(promiseFactory)
    return lib.createClient()
}()

var worldTickers = [],
    eventReducers = {},
    worldStateStorage = {}

module.exports = {
    whenIsReady: function() {
        return merge.loadFromRedis(redis, worldStateStorage)
    },

    get: function(uuid) {
        if (uuid !== undefined) {
            return worldStateStorage[uuid.toString()]
        }
    },

    mergePatch: function(changeSet, key, input) {
        var patch = changeSet[key]
        if (patch === undefined)
            patch = changeSet[key] = {}

        C.deepMerge(input, patch)

        if (Object.keys(patch).length === 0)
            throw new Error("empty patch " + key)
    },

    runWorldTicker: function() {
        this.gameLoopBound = this.gameLoop.bind(this)
        this._currentTick = new Date().getTime()
        setTimeout(this.gameLoopBound, config.game.tickInterval)
    },

    onWorldTick: function(fn) {
        worldTickers.push(fn)
    },

    addEventReducer: function(type, fn) {
        eventReducers[type] = fn
    },

    worldTick: function(tickNumber, changeSet) {
        var tickTimer = stats.worldTick.start()
        var events = {},
            self = this

        Object.keys(worldStateStorage).forEach(function(key) {
            // user input changes have already been applied
            // to worldStateStorage
            var ship = worldStateStorage[key]

            worldTickers.forEach(function(fn, i) {
                var result

                try {
                    result = fn(tickNumber, ship)

                    if (result !== undefined) {
                        if (result.patch !== undefined)
                            self.mergePatch(changeSet, key, result.patch)

                        if (result.events !== undefined)
                            result.events.forEach(function(e) {
                                var ship = events[e.uuid] = events[e.uuid] || {}
                                var type = ship[e.type] = ship[e.type] || []
                                type.push(e)
                            })
                    }
                } catch (e) {
                    console.log("failed to process worldTick handler")
                    console.log(e.stack)
                }
            })
        }, this)

        Object.keys(events).forEach(function(key) {
            var event_types = events[key],
                ship = worldStateStorage[key],
                patch = changeSet[key]

            if (patch === undefined)
                patch = changeSet[key] = {}

            Object.keys(event_types).forEach(function(type) {
                var event_list = event_types[type],
                    fn = eventReducers[type]

                try {
                    fn(tickNumber, ship, patch, event_list)
                } catch (e) {
                    console.log("failed to process worldTick event handler")
                    console.log(e.stack)
                }
            }, this)
        }, this)

        tickTimer.end()

        return events
    },

    getInputs: function() {
        return redis.llen("commands").
        then(function(len) {
            if (len === 0)
                return []

            return redis.multi().
            lrange("commands", 0, len - 1).
            ltrim("commands", len, -1).
            exec().
            then(function(replies) {
                console.log(replies)
                return replies[0].map(function(s) {
                    try {
                        return JSON.parse(s)
                    } catch (e) {
                        console.log('invalid command', s, e)
                    }
                })
            })
        })
    },

    gameLoop: function() {
        var self = this,
            startedAt = new Date().getTime(),
            tickNumber = this._currentTick = this._currentTick + config.game.tickInterval

        var jitter = startedAt - tickNumber
        stats.gameLoopJitter.update(jitter)

        this.getInputs().then(function(changesIn) {
            var changeSet = {}

            changesIn.forEach(function(c) {
                merge.apply(worldStateStorage, c.uuid, c.patch)
                self.mergePatch(changeSet, c.uuid, c.patch)
            })

            var events = self.worldTick(tickNumber, changeSet)

            Object.keys(changeSet).forEach(function(k) {
                merge.apply(worldStateStorage, k, changeSet[k])
            })

            redis.publish("worldstate", JSON.stringify({
                ts: tickNumber,
                changes: changeSet,
                events: events
            })).done()

            var now = new Date().getTime()
            stats.gameLoop.update(now - startedAt)
            var delay = tickNumber + config.game.tickInterval - now
            if (delay < 0)
                delay = 0

            stats.gameLoopDelay.update(delay)
            setTimeout(self.gameLoopBound, delay)
        }).done()
    }
}
