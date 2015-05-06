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
    'jumpWormhole': function(msg, h) {
        var ship = worldState.get(msg.shipID)
        var wormhole = worldState.get(msg.wormhole)

        var systemId = ship.values.solar_system
        if (wormhole.values.solar_system !== systemId) {
            log("requested wormhole is in the wrong system")
            return
        } else if (wormhole.values.type !== 'wormhole') {
            log("worldstate really needs a type system")
            return
        }

        debug(wormhole)

        C.db.query("select * from wormholes where id = $1", [ wormhole.values.wormhole_id ]).
            then(function(data) {
                debug(data)
                var destination_id, row = data[0],
                    direction = wormhole.values.direction,
                    before = Q(null)

                if (direction === 'outbound' && row.inbound_id === null) {
                    // this only happens on WHs outbound from this system
                    before = worldState.addObject({
                        type: 'wormhole',
                        position: { x: 0, y: 0, z: 0 },
                        solar_system: row.inbound_system,
                        wormhole_id: row.id,
                        destination: systemId,
                        direction: 'inbound',
                        expires_at: row.expires_at
                    }).then(function(spo_id) {
                        debug([row.id, spo_id])
                        destination_id = spo_id

                        return C.db.query("update wormholes set inbound_id = $2 where id = $1", [ row.id, spo_id ])
                    })
                } else {
                    destination_id = row.outbound_id
                }

                return before.then(function() {
                    var destination_spo = worldState.get(destination_id)

                    return worldState.mutateWorldState(msg.shipID, ship.rev, {
                        solar_system: destination_spo.values.solar_system,
                        position: destination_spo.values.position,
                    })
                })

                // TODO we need to get the spo in the destination system
                // and if it doesn't exist we spawn it

            }).fail(function(e) {
                console.log(e.stack)
            }).done()
    },
    'scanWormholes': function(msg, h) {
        var shipId = msg.shipID
        var ship = worldState.get(shipId)
        var systemId = ship.values.solar_system

        solarsystems.getWormholes(systemId).then(function(data) {
            debug(data)

            return Q.all(data.map(function(row) {
                var spodb_id, destination, direction;

                if (row.outbound_system === systemId) {
                    direction = 'outbound'
                    spodb_id = row.inbound_id
                    destination = row.inbound_system
                } else {
                    direction = 'inbound'
                    spodb_id = row.inbound_id
                    destination = row.outbound_system
                }

                if (spodb_id === null) {
                    return worldState.addObject({
                        type: 'wormhole',
                        position: { x: 0, y: 0, z: 0 },
                        solar_system: systemId,
                        wormhole_id: row.id,
                        destination: destination,
                        direction: direction,
                        expires_at: row.expires_at
                    }).then(function(spo_id) {
                        debug([row.id, spo_id])
                        return C.db.query("update wormholes set "+direction+"_id = $2 where id = $1", [ row.id, spo_id ])
                    })
                } 
            }))
        }).fail(function(e) {
            console.log(e.stack)
        }).done()
    }
}
