'use strict';

var Q = require('q'),
    uuidGen = require('node-uuid'),
    db = require('spacebox-common-native').db,
    C = require('spacebox-common')

var worldState = require('../world_state.js'),
    solarsystems = require('../solar_systems.js')

function spawnThing(ctx, msg, h, fn) {
    return Q.spread([C.getBlueprints(), solarsystems.getSpawnSystemId()], function(blueprints, solar_system) {
        var account,
            blueprint = blueprints[msg.blueprint]

        if (blueprint === undefined) {
            throw new Error("no such blueprint: "+msg.blueprint)
        }

        if (msg.solar_system === undefined)
            throw new Error("must specify the spawn solar_system")

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
        })

        C.deepMerge(blueprint, obj);

        // This is a byproduct of the blueprint's own uuid
        delete obj.uuid

        obj.health = obj.maxHealth

        if (fn !== undefined) {
            // TODO error handling
            fn(obj)
        }

        ctx.debug('3dsim', obj)

        var next = Q(null)

        if (msg.uuid === undefined && obj.inventory_limits !== undefined) {
            // This is a new object, setup in inventory first
            obj.uuid = uuidGen.v1()

            next = next.then(function() {
                return C.request('tech', 'POST', 204, '/containers', {
                    uuid: obj.uuid,
                    account: h.auth.account,
                    blueprint: blueprint.uuid,
                    from: msg.from,
                    items: msg.items
                })
            })
        } else {
            // This is an existing object that we may
            // need to cleanup in spodb before creating again

            obj.uuid = msg.uuid;
            var target = worldState.get(obj.uuid)

            if (target !== undefined)
                next = next.then(function() {
                    return worldState.cleanup(obj.uuid)
                })
        }

        return next.then(function() {
            return worldState.addObject(obj).then(function(uuid) {
                ctx.log('3dsim', "built space object", { blueprint: msg.blueprint, id: uuid })

                return uuid
            })
        })
    })
}

function spawnShip(ctx, msg, h) {
    return spawnThing(ctx, msg, h, function(ship) {
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

var loadout = {
    blueprint: "7abb04d3-7d58-42d8-be93-89eb486a1c67",
    contents: {
        "f9e7e6b4-d5dc-4136-a445-d3adffc23bc6": 35
    }
}

module.exports = {
    'spawn': function(ctx, msg, h) {
        if (h.auth.privileged) {
            return spawnShip(msg, h)
        } else {
            throw "spawn requires a privileged account. use spawnStarter"
        }
    },
    'spawnStarter': function(ctx, msg, h) {
        return db.query("select count(*)::int from space_objects where tombstone = 'f' and account_id = $1 and doc::json->>'blueprint' = $2", [ h.auth.account, loadout.blueprint ]).
            then(function(data) {
                if (data[0].count > 0)
                    throw "this account already has a starter ship"

                return solarsystems.getSpawnSystemId().then(function(solar_system) {
                    return spawnShip(ctx, {
                        blueprint: loadout.blueprint,
                        solar_system: solar_system,
                        items: Object.keys(loadout.contents).map(function(key) {
                            return {
                                blueprint: key,
                                quantity: loadout.contents[key],
                            }
                        }),
                        // TODO copy the position of the spawnpoint
                        position: {
                            x: 1,
                            y: 1,
                            z: 1
                        }
                    }, h)
                })
            })
    },
    'dock': function(ctx, msg, h) {
        var target = worldState.get(msg.ship_uuid)
        if (target === undefined || target.values.tombstone === true) {
            throw new Error("no such ship")
        }

        return C.request('tech', 'POST', 200, '/ships/'+msg.ship_uuid, {
            status: 'docked',
            account: h.auth.account,
            inventory: msg.inventory,
            slice: msg.slice
        }).then(function() {
            return worldState.mutateWorldState(target.key, target.rev, {
                tombstone_cause: 'docking',
                tombstone: true
            })
        })
    },
    'undock': function(ctx, msg, h) {
        return C.request('tech', 'POST', 200, '/ships/'+msg.ship_uuid, {
            account: h.auth.account,
            status: 'undocked'
        }).then(function(ship) {
            var container = worldState.get(ship.container_id)

            if (container === undefined)
                throw new Error("failed to find the container that launched the ship. lost in space! ship_id="+msg.ship_uuid)

            var position = C.deepMerge(container.values.position, {})

            return spawnShip(ctx, {
                uuid: ship.id,
                blueprint: ship.doc.blueprint,
                position: position,
                solar_system: container.values.solar_system
            }, h)
        })
    },
    'deploy': function(ctx, msg, h) {
        var ship = worldState.get(msg.shipID)

        // Only ships may deploy things
        if (ship === undefined) {
            throw new Error("no such ship in space")
        } else if (ship.values.type != 'spaceship') {
            throw new Error("not a spaceship: " + ship.values.blueprint)
        }

        var position = C.deepMerge(ship.values.position, {})

        return spawnThing(ctx, {
            blueprint: msg.blueprint,
            solar_system: ship.values.solar_system,
            position: position,
            from: {
                uuid: msg.shipID,
                slice: msg.slice
            }
        }, h)
    },
    'spawnStructure': function(ctx, msg, h) {
        if (h.auth.privileged) {
            return spawnThing(ctx, msg, h)
        } else {
            throw "spawnStructure requires a privileged account"
        }
    }
}
