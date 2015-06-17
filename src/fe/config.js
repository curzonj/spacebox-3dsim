'use strict'

var C = require('spacebox-common')

var ctx = C.logging.create('firehose')
var worldState = require('spacebox-common-native/src/redis-state')(ctx)

module.exports = {
    game: require('../../configs/'+process.env.GAME_ENV),
    ctx: ctx,
    state: worldState
}
