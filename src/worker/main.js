'use strict';

var worldState = require('../redisWorldState.js'),
    Q = require("q"),
    redisLib = require('promise-redis')(Q.Promise),
    redis = redisLib.createClient()

worldState.addListener({
    onWorldTick: function(msg) {
        var changeSet = msg.changes

        Object.keys(changeSet).forEach(function(k) {
            if (changeSet[k].tombstone === true) {
                redis.srem('alive', k).done()
            } else {
                redis.sadd('alive', k).done()

                redis.set(k, JSON.stringify(worldState.get(k))).done()
            }
        })

    }
})

worldState.loadWorld()
