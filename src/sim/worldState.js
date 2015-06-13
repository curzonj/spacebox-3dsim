'use strict';

var merge = require('spacebox-common-native/lib/state_merge')

var storage = {}

var self = module.exports = {
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
        return merge.loadFromRedis(redis, storage)
    }
}

