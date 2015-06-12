'use strict';

var redis = require('spacebox-common-native').buildRedis(),
    measured = require('measured'),
    stats = measured.createCollection()

var self = module.exports = {
    stats: stats,
    reset: function() {
        Object.keys(self).forEach(function(k) {
            var o = self[k]
            if (typeof o.reset === 'function')
                o.reset()
        })
    },
    worldTick: stats.timer('worldTick'),
    gameLoop: stats.timer('gameLoop'),
    gameLoopJitter: stats.histogram('gameLoopJitter'),
    gameLoopDelay: stats.histogram('gameLoopDelay'),
}

setInterval(function() {
    redis.set('stats', JSON.stringify(stats)).done()
}, 5000)
