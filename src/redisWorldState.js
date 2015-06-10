'use strict';

var uuidGen = require('node-uuid'),
    config = require('./config.js'),
    Q = require("q"),
    redisLib = require('promise-redis')(Q.Promise),
    redis = redisLib.createClient(),
    merge = require('./state_merge'),
    th = require('spacebox-common/src/three_helpers.js')

var listeners = [],
    currentTick,
    worldStateStorage = {};

var self = module.exports = {
    subscribe: function(fn) {
        var redis = redisLib.createClient()

        redis.on("error", function (err) {
            console.log("Redis error " + err);
        });

        redis.on("end", function () {
            console.log("Redis connection closed");
        });

        redis.on("ready", function () {
            console.log("Redis connection opened");
        });

        fn(redis)

        redis.subscribe("worldstate")
    },

    loadWorld: function() {
        var worldLoaded = Q.defer()

        self.subscribe(function(redis) {
            redis.on("message", function(channel, blob) {
                var msg = JSON.parse(blob)
                worldLoaded.promise.then(function() {
                    currentTick = msg.ts

                    Object.keys(msg.changes).forEach(function(uuid) {
                        merge.apply(worldStateStorage, uuid, msg.changes[uuid])
                    })

                    listeners.forEach(function(h) {
                        h.onWorldTick(msg)
                    })

                }).done()
            })
        })
    
        // we need to start receiving messages before we load state,
        // but we have to wait to apply them until afterwards
        return merge.loadFromRedis(redis, worldStateStorage).
        then(function() {
            worldLoaded.resolve()
        })
    },

    queueChangeIn: function(uuid, patch) {
        return redis.rpush("commands", JSON.stringify({
            uuid: uuid,
            patch: patch
        }))
    },
    get: function(uuid) {
        return worldStateStorage[uuid]
    },
    addListener: function(l) {
        listeners.push(l)
    },
    removeListener: function(l) {
        var index = listeners.indexOf(l)
        listeners.splice(index, 1)
    },

    currentTick: function() {
        return currentTick
    },
    getAllKeys: function() {
        return worldStateStorage
    },

    addObject: function(values) {
        values.uuid = values.uuid || uuidGen.v1()

        var self = this,
            uuid = values.uuid

        values.chunk = th.buildVectorBucket(values.position, config.game.chunk_size)

        //debug("added object", uuid, values)
        return self.queueChangeIn(uuid, values).then(function() {
            return uuid
        })
    },
}
