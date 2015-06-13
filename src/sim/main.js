'use strict';

var EventEmitter = require('events').EventEmitter,
    extend = require('extend'),
    util = require('util'),
    C = require('spacebox-common'),
    config = require('../config'),
    worldState = require('./worldState'),
    Q = require('q')

C.logging.configure('3dsim')

var redis = require('spacebox-common-native').buildRedis(),
    ctx = C.logging.create()

C.stats.defineAll({
    worldTick: 'timer',
    gameLoop: 'timer',
    gameLoopJitter: 'histogram',
    gameLoopDelay: 'histogram',
})

var tickers = require("./world_tickers/load_all.js"),
    worldTickers = tickers.fns,
    eventReducers = tickers.reducers

var self  = {
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

    worldTick: function(tickNumber, changeSet) {
        var tickTimer = C.stats.worldTick.start()
        var events = {},
            self = this

        worldState.forEach(function(key, ship) {
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
                ship = worldState.get(key),
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
                ctx.trace({ commands: replies }, 'redis.commands')
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
        C.stats.gameLoopJitter.update(jitter)

        this.getInputs().then(function(changesIn) {
            var changeSet = {}

            changesIn.forEach(function(c) {
                worldState.applyPatch(c.uuid, c.patch)
                self.mergePatch(changeSet, c.uuid, c.patch)
            })

            var events = self.worldTick(tickNumber, changeSet)

            Object.keys(changeSet).forEach(function(k) {
                worldState.applyPatch(k, changeSet[k])
            })

            redis.publish("worldstate", JSON.stringify({
                ts: tickNumber,
                changes: changeSet,
                events: events
            })).done()

            var now = new Date().getTime()
            C.stats.gameLoop.update(now - startedAt)
            var delay = tickNumber + config.game.tickInterval - now
            if (delay < 0)
                delay = 0

            C.stats.gameLoopDelay.update(delay)
            setTimeout(self.gameLoopBound, delay)
        }).done()
    }
}

worldState.loadFromRedis(redis).
then(function() {
    self.runWorldTicker()
    ctx.info("server ready")
}).done()
