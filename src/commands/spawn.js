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
        var account,
            blueprint = blueprints[msg.blueprint]

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

        var next = Q(null)

        // undock sets the uuid that inventory generated
        // for the ship
        if (msg.uuid !== undefined) {
            var target = worldState.get(msg.uuid)

            if (target !== undefined)
                next = next.then(function() {
                    return worldState.cleanup(msg.uuid)
                })

            obj.uuid = msg.uuid;
        }

        // TODO what if the call to /spawn fails?
        return next.then(function() {
            return worldState.addObject(obj).then(function(uuid) {
                console.log("build a %s as %s", msg.blueprint, uuid)

                return [ uuid, blueprint ]
            })
        })
    }).spread(function(uuid, blueprint) {
        // if msg.uuid exists then the ship is pre-existing
        if (msg.uuid !== undefined)
            return
        
        var obj = worldState.get(uuid)

        var transactions = msg.inventory_transaction || []
        transactions.forEach(function(t) {
            console.log(t)
            if (t.inventory === 'spawned')
                t.inventory = uuid
        })

        return C.request('tech', 'POST', 204, '/spawn', {
            uuid: uuid,
            blueprint: blueprint.uuid,
            transactions: transactions,
        }, {
            sudo_account: h.auth.account
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

function updateFacility(uuid, blueprint, account) {
    return C.request('tech', 'POST', 201, '/facilities/'+uuid, {
        blueprint: blueprint
    })
}

var loadout = {
    blueprint: "7abb04d3-7d58-42d8-be93-89eb486a1c67",
    contents: {
        "f9e7e6b4-d5dc-4136-a445-d3adffc23bc6": 35
    }
}

module.exports = {
    'spawn': function(msg, h) {
        if (h.auth.privileged) {
            return spawnShip(msg, h)
        } else {
            throw "spawn requires a privileged account. use spawnStarter"
        }
    },
    'spawnStarter': function(msg, h) {
        return db.query("select count(*)::int from space_objects where account_id = $1 and doc::json->>'blueprint' = $2", [ h.auth.account, loadout.blueprint ]).
            then(function(data) {
                if (data[0].count > 0)
                    throw "this account already has a starter ship"

                var list = []

                for (var type in loadout.contents) {
                    list.push({
                        inventory: 'spawned',
                        slice: "default",
                        blueprint: type,
                        quantity: loadout.contents[type]
                    })
                }

                return spawnShip({
                    blueprint: loadout.blueprint,
                    inventory_transaction: list,
                    // TODO copy the position of the spawnpoint
                    position: {
                        x: 1,
                        y: 1,
                        z: 1
                    }
                }, h)
            })
    },
    'dock': function(msg, h) {
        var target = worldState.get(msg.ship_uuid)
        if (target === undefined || target.values.tombstone === true) {
            throw new Error("no such ship")
        }

        return worldState.mutateWorldState(target.key, target.rev, {
            tombstone: true
        }).then(function() {
            return C.request('tech', 'POST', 200, '/ships/'+msg.ship_uuid, {
                status: 'docked',
                inventory: msg.inventory,
                slice: msg.slice
            }, {
                sudo_account: h.auth.account
            })
        })
    },
    'undock': function(msg, h) {
        return C.request('tech', 'POST', 200, '/ships/'+msg.ship_uuid, {
            status: 'undocked'
        }, {
            sudo_account: h.auth.account
        }).then(function(ship) {
            // TODO it has a uuid in inventory, we need to use the same one
            return spawnShip({
                uuid: msg.ship_uuid,
                blueprint: ship.doc.blueprint,
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
        }, h)
    },
    'spawnStructure': function(msg, h) {
        if (h.auth.privileged) {
            return spawnThing(msg, h)
        } else {
            throw "spawnStructure requires a privileged account"
        }
    }
}
