'use strict';

var measured = require('measured'),
    stats = measured.createCollection()

module.exports = {
    stats: stats,
    worldTick: stats.timer('worldTick'),
    worldTickSkew: stats.histogram('worldTickSkew'),
    worldTickDelay: stats.histogram('worldTickDelay'),
}
