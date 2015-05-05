'use strict';

var Q = require('q'),
    qhttp = require("q-io/http"),
    uuidGen = require('node-uuid'),
    npm_debug = require('debug'),
    log = npm_debug('3dsim:info'),
    error = npm_debug('3dsim:error'),
    debug = npm_debug('3dsim:debug'),
    C = require('spacebox-common')

var worldState = require('../world_state.js'),
    solarsystems = require('../solar_systems.js')

module.exports = {
    'scanWormholes': function(msg, h) {
        var shipId = msg.shipID
        var ship = worldState.get(shipId)
        var systemId = ship.solar_system

        solarsystems.getWormholes(systemId).then(function(data) {
            // add the wormholes as spobs if they don't already exist
        }).fail(function(e) {
            console.log(e.stack)
        }).done()
    }
}
