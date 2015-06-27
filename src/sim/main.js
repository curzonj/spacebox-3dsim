'use strict';

var EventEmitter = require('events').EventEmitter,
    extend = require('extend'),
    util = require('util'),
    C = require('spacebox-common'),
    config = require('./config'),
    worldState = require('./worldState'),
    Q = require('q'),
    zlib = require('zlib'),
    WTF = require('wtf-shim')

Q.longStackSupport = true

var ctx = C.logging.create('3dsim')
var redis = require('spacebox-common-native').buildRedis(ctx)

ctx.measure({
    gameLoopDelay: 'histogram',
    gameLoopJitter: 'histogram',
    gameLoop: 'timer',
    statePublish: 'timer',
    worldTick: 'timer',
})

var tickers = require("./world_tickers/load_all.js"),
    worldTickers = tickers.fns,
    eventReducers = tickers.reducers

var gameLoopInputs, _currentTick, gameLoopTimer

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
        if (gameLoopInputs)
            Q(gameLoopInputs).fail(function(e) {
                ctx.warn({ err: e }, "failure on previous gameLoopInputs")
            })

        gameLoopInputs = Q([])
        _currentTick = Date.now()
        gameLoopTimer = setTimeout(self.gameLoop, config.game.tickInterval)

        ctx.info("world ticker running")
    },

    worldTick: WTF.trace.instrument(function(tickNumber, changeSet) {
        var tickTimer = ctx.worldTick.start()
        var events = {}

        ctx.logger.fields.tick_ts = tickNumber
        worldState.forEach(function(key, ship) {
            ctx.logger.fields.obj_uuid = key

            worldTickers.forEach(function(fn, i) {
                var result

                try {
                    result = fn(tickNumber, ship, ctx)

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
                    ctx.error({ err: e }, "failed to process worldTick handler")
                    if (process.env.PEXIT_ON_TOUGH_ERROR == '1')
                        process.nextTick(function() {
                            console.log("exiting for debugging per ENV['PEXIT_ON_TOUGH_ERROR']")
                            process.exit()
                        })
                }
            })
        })
        delete ctx.logger.fields.obj_uuid

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
            })
        })
        delete ctx.logger.fields.tick_ts

        tickTimer.end()

        return events
    }, 'worldTick'),

    getInputs: function() {
        var query_t = WTF.trace.events.createScope("getInputs:query")
        var scope

        return function() {
            scope = query_t()

            var range_t = WTF.trace.beginTimeRange("LLEN commands")
            var p = redis.llen("commands").
            tap(function() {
                WTF.trace.endTimeRange(range_t)
            }).then(function(len) {
                if (len === 0)
                    return []
                
                var range_t = WTF.trace.beginTimeRange("LRANGE LTRIM commands")
                scope = query_t()
                var p= redis.multi().
                lrange("commands", 0, len - 1).
                ltrim("commands", len, -1).
                exec().
                tap(function() {
                    WTF.trace.endTimeRange(range_t)
                }).then(function(replies) {
                    var commands = replies[0].map(function(buffer) {
                        var s = buffer.toString()

                        try {
                            return JSON.parse(s)
                        } catch (e) {
                            console.log('invalid command', s, e)
                        }
                    })
                    ctx.trace({ commands: commands }, 'redis.commands')
                    return commands
                })

                return WTF.trace.leaveScope(scope, p)
            })
            return WTF.trace.leaveScope(scope, p)
        }
    }(),

    publishState: WTF.trace.instrument(function(storage, tickNumber, changeSet, events) {
        return Q.all([
            // JSON.stringify on storage every tick is not performant
            // nor scalable, but it's good enough until we implement
            // sim sharding which will completely change this section
            Q.nfcall(zlib.gzip, new Buffer(JSON.stringify(storage))).
            then(function(compressed) {
                var range_t = WTF.trace.beginTimeRange("SET worldstate")
                return redis.set('worldstate', compressed).
                tap(function() {
                    WTF.trace.endTimeRange(range_t)
                })
            }),
            Q.fcall(function() {
                var list = Object.keys(changeSet).filter(function(k) {
                    var patch = changeSet[k]
                    return (patch.tombstone === true && (patch.tombstone_cause === 'destroyed' || patch.tombstone_cause === 'despawned'))
                }).map(function(k) { return k })

                if (list.length > 0) {
                    list.unshift('destroyed')
                    return redis.rpush.apply(redis, list)
                }
            }),
            Q.nfcall(zlib.gzip, new Buffer(JSON.stringify({
                ts: tickNumber,
                changes: changeSet,
                events: events
            }))).
            then(function(compressed) {
                var range_t = WTF.trace.beginTimeRange("PUBLISH worldstate")
                return redis.publish("worldstate", compressed).
                tap(function() {
                    WTF.trace.endTimeRange(range_t)
                })
            })
        ])
    }, 'publishState'),

    gameLoop: function() {
        var game_loop_t = WTF.trace.events.createScope("gameLoop")
        var merge_t = WTF.trace.events.createScope("stateMerge")

        return function() {
            _currentTick = _currentTick + config.game.tickInterval

            var startedAt = Date.now()
            var tickNumber = _currentTick
            var range_t = WTF.trace.beginTimeRange("gameLoop_"+tickNumber)

            var jitter = startedAt - tickNumber
            ctx.gameLoopJitter.update(jitter)

            gameLoopInputs.then(function(changesIn) {
                var game_loop_scope = game_loop_t()
                var changeSet = {}

                // Start to fetch gameLoopInputs for the next tick
                gameLoopInputs = self.getInputs()

                // These are so small and few compared
                // to the simulator changeSet, that they
                // don't impact the profile more than the
                // overhead of tracing it
                changesIn.forEach(function(c) {
                    var existing = worldState.get(c.uuid)

                    // Ignore invalid new objects
                    if (existing || c.patch.type) {
                        worldState.applyPatch(c.uuid, c.patch)
                        self.mergePatch(changeSet, c.uuid, c.patch)
                    }
                })

                var events = self.worldTick(tickNumber, changeSet)

                var merge_scope = merge_t()
                Object.keys(changeSet).forEach(function(k) {
                    worldState.applyPatch(k, changeSet[k])
                })
                WTF.trace.leaveScope(merge_scope)

                var publishAt = Date.now()

                return WTF.trace.leaveScope(game_loop_scope,
                self.publishState(worldState.storage, tickNumber, changeSet, events).
                then(function() {
                    ctx.statePublish.update(Date.now() - publishAt)
                    ctx.gameLoop.update(Date.now() - startedAt)

                    var delay = tickNumber + config.game.tickInterval - Date.now()
                    if (delay < 0)
                        delay = 0
                    ctx.gameLoopDelay.update(delay)
                    gameLoopTimer = setTimeout(self.gameLoop, delay)

                    WTF.trace.endTimeRange(range_t)
                }))
            }).fail(function(e) {
                ctx.fatal({ err: e }, 'error in the gameLoop')
                if (process.env.PEXIT_ON_TOUGH_ERROR == '1')
                    process.nextTick(function() {
                        console.log("exiting for debugging per ENV['PEXIT_ON_TOUGH_ERROR']")
                        process.exit()
                    })

                if (redis.ready)
                    self.runWorldTicker()
            }).done()
        }
    }()
}

WTF.trace.node.start({ })

redis.on('error', function() {
    if (gameLoopTimer)
        clearTimeout(gameLoopTimer)
})

worldState.events.on('worldloaded', function() {
    self.runWorldTicker()
    worldState.runRequestHandler(ctx)
})

worldState.loadFromRedis(redis)
