'use strict';

var worldState = require('spacebox-common-native/lib/redis-state'),
    redis = require('spacebox-common-native').buildRedis(),
    Q = require('q'),
    C = require('spacebox-common'),
    ctx = C.logging.create('sim_worker')

worldState.addListener({
    onWorldTick: function(msg) {
        var changeSet = msg.changes

        Object.keys(changeSet).forEach(function(k) {
            Q.fcall(function() {
                if (changeSet[k].tombstone === true) {
                    return Q.all([
                        redis.srem('alive', k),
                        redis.del(k),
                    ])
                } else {
                    return Q.all([
                        redis.sadd('alive', k),
                        redis.set(k, JSON.stringify(worldState.get(k))),
                    ])
                }
            }).then(function() {
                ctx.trace({ uuid: k, patch: changeSet[k], timestamp: msg.ts }, 'updated redis')
            }).done()
        })
    }
})

worldState.loadWorld()
