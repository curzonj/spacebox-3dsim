'use strict';

var Q = require('q'),
    uuidGen = require('node-uuid'),
    npm_debug = require('debug'),
    log = npm_debug('3dsim:info'),
    error = npm_debug('3dsim:error'),
    debug = npm_debug('3dsim:debug'),
    db = require('spacebox-common-native').db,
    C = require('spacebox-common')

var worldState = require('../world_state.js'),
    solarsystems = require('../solar_systems.js')

function spawnThing(msg, h, fn) {
    return Q.spread([C.getBlueprints(), solarsystems.getSpawnSystemId()], function(blueprints, solar_system) {
        var account, blueprint = blueprints[msg.blueprint]

        if (blueprint === undefined) {
            throw new Error("no such blueprint: "+msg.blueprint)
        }

        if (h.auth.privileged) {
            account = msg.account || h.auth.account
        } else {
            account = h.auth.account
        }

        var obj = C.deepMerge({
            position: msg.position,
            solar_system: msg.solar_system
        } ,{
            blueprint: blueprint.uuid,
            account: account,
            effects: {},
            position: { x: 0, y: 0, z: 0 },
            solar_system: solar_system
        })

        C.deepMerge(blueprint, obj);

        // This is a byproduct of the blueprint's own uuid
        delete obj.uuid

        obj.health = obj.maxHealth

        if (fn !== undefined) {
            // TODO error handling
            fn(obj)
        }

        debug(obj)

        // TODO what if the inventory transaction fails?
        return worldState.addObject(obj).then(function(uuid) {
            console.log("build a %s as %s", msg.blueprint, uuid)

            return [ uuid, blueprint ]
        })
    }).spread(function(uuid, blueprint) {
        var obj = worldState.get(uuid)
        var transaction = msg.inventory_transaction || []

        transaction.push({
            container_action: "create",
            uuid: uuid,
            blueprint: blueprint.uuid
        })

        // TODO what happens if we fail to inform build and inventory,
        // how we converge them?
        return updateInventory(h.auth.account, transaction).then(function() {
            if (blueprint.production !== undefined) {
                return updateFacility(uuid, blueprint.uuid, h.auth.account)
            }
        }).then(function() {
            return uuid
        })
    })

}

function spawnShip(msg, h) {
    return spawnThing(msg, h, function(ship) {
        if (ship.type != 'spaceship') {
            throw new Error("not a spaceship: " + ship.blueprint)
        }

        C.deepMerge({
            velocity: {
                x: 0,
                y: 0,
                z: 0
            },
            facing: {
                x: 0,
                y: 0,
                z: 0,
                w: 1
            }
        }, ship)

        ship.subsystems.forEach(function(s) {
            ship[s].state = "none"
        })
    })
}

function updateInventory(account, data) {
    /* data = [{
        inventory: uuid,
        slice: slice,
        blueprint: type,
        quantity: quantity
    }]
    */
    return C.request('inventory', 'POST', 204, '/inventory', data, {
        sudo_account: account
    })
}

function updateFacility(uuid, blueprint, account) {
    return C.request('build', 'POST', 201, '/facilities/'+uuid, {
        blueprint: blueprint
    })
}

var loadout = {
    blueprint: "7abb04d3-7d58-42d8-be93-89eb486a1c67",
    contents: {
        "f9e7e6b4-d5dc-4136-a445-d3adffc23bc6": 35
    }
}
var loadout_accounting = {}

module.exports = {
    'spawn': function(msg, h) {
        return spawnShip(msg, h)
    },
    'spawnStarter': function(msg, h) {
        return db.query("select count(*)::int from space_objects where account_id = $1 and doc::json->>'blueprint' = $2", [ h.auth.account, loadout.blueprint ]).
            then(function(data) {
                if (data[0].count > 0)
                    throw "this account already has a starter ship"

                return spawnShip({
                    blueprint: loadout.blueprint,
                    // TODO copy the position of the spawnpoint
                    position: {
                        x: 1,
                        y: 1,
                        z: 1
                    }
                }, h)
            }).then(function(uuid) {
                var list = []

                for (var type in loadout.contents) {
                    list.push({
                        inventory: uuid,
                        slice: "default",
                        blueprint: type,
                        quantity: loadout.contents[type]
                    })
                }

                return updateInventory(h.auth.account, list)
            })
    },
    'undock': function(msg, h) {
        console.log("got the message")
        return C.request('inventory', 'POST', 200, '/ships/'+msg.ship_uuid, {
            in_space: true
        }, {
            sudo_account: h.auth.account
        }).then(function(ship) {
            console.log('spawning ship')
            return spawnShip({
                blueprint: ship.blueprint,
                // TODO spawn it at the location it undocked from
                position: {
                    x: 1,
                    y: 1,
                    z: 1
                }
            }, h)
        })
    },
    'deploy': function(msg, h) {
        return spawnThing({
            blueprint: msg.blueprint,
            inventory_transaction: [{
                inventory: msg.shipID,
                slice: msg.slice,
                blueprint: msg.blueprint,
                quantity: -1
            }]
            // TODO copy the position of the ship
        })
    },
    'spawnStructure': function(msg, h) {
        return spawnThing(msg, h)
    }
}
