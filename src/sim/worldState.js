'use strict';

var merge = require('spacebox-common-native/src/state_merge')
var EventEmitter = require('events').EventEmitter

var storage = {}

var self = module.exports = {
    events: new EventEmitter(),
    storage: storage,
    get: function(key) {
        return storage[key]
    },

    forEach: function(fn) {
        Object.keys(storage).forEach(function(key) {
            // user input changes have already been applied
            // to worldStateStorage
            var obj = storage[key]

            fn(key, obj)
        })
    },

    // TODO should this module be moved to common-native
    // or should the content of these functions be moved
    // here?
    applyPatch: function(uuid, patch) {
        merge.apply(storage, uuid, patch)
    },

    loadFromRedis: function(redis) {
        redis.on('ready', function() {
            merge.loadFromRedis(redis, storage).
            then(function() {
                self.events.emit('worldloaded')
            }).done()
        })
    },

    runRequestHandler: function(ctx) {
        var redis = require('spacebox-common-native').buildRedis(ctx)

        function blpopLoop() {
            redis.blpop('requests', 0).
            then(function(result) {
                var request = JSON.parse(result[1].toString())
                var obj = storage[request.key]
                var data

                if (obj) {
                    data = {
                        systems: Object.keys(obj.systems)
                    }

                    var list = [ 'uuid', 'solar_system', 'position', 'velocity', 'agent_id' ]
                    list.forEach(function(k) {
                        data[k] = obj[k]
                    })
                } else {
                    data = null
                }

                return redis.rpush(request.response, JSON.stringify(data))
            }).fail(function(e) {
                ctx.error({ err: e })
            }).fin(function() {
                blpopLoop()
            }).done()
        }

        blpopLoop()
    }
}

