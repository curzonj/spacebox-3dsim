'use strict';

var Q = require('q'),
    C = require('spacebox-common')

C.logging.configure('sim_worker')

var redisState = require('spacebox-common-native/lib/redis-state'),
    redis = require('spacebox-common-native').buildRedis(),
    ctx = C.logging.create()

redisState.addListener({
    onWorldTick: function(msg) {
        var changeSet = msg.changes

        return Q.all(Object.keys(changeSet).map(function(k) {
            return Q.fcall(function() {
                if (changeSet[k].tombstone === true) {
                    return Q.all([
                        redis.srem('alive', k),
                        redis.del(k),
                    ])
                } else {
                    return Q.all([
                        redis.sadd('alive', k),
                        redis.set(k, JSON.stringify(redisState.get(k))),
                    ])
                }
            }).then(function() {
                ctx.trace({ uuid: k, patch: changeSet[k], timestamp: msg.ts }, 'updated redis')
            })
        }))
    }
})

redisState.loadWorld()
