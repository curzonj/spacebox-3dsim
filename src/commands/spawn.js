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

        ctx.log('3dsim', 'spawnThing msg', msg)

        var obj = C.deepMerge({
            position: msg.position,
            solar_system: msg.solar_system
        } ,{
            blueprint: blueprint.uuid,
            account: account,
            effects: {},
            subsystems: [],
            position: { x: 0, y: 0, z: 0 },
            velocity: { x: 0, y: 0, z: 0 },
            facing: { x: 0, y: 0, z: 0, w: 1 },
        })

        C.deepMerge(blueprint, obj);

        // This is a byproduct of the blueprint's own uuid
        delete obj.uuid

        obj.health = obj.maxHealth
        obj.subsystems.forEach(function(s) {
            obj[s].state = "none"
        })

        if (fn !== undefined) {
            // TODO error handling
            fn(obj)
        }

        ctx.debug('3dsim', obj)

        var next = Q(null)
        
        if (obj.type === "vessel") {
            if (msg.uuid === undefined) {
                // This is a new object, setup in inventory first
                obj.uuid = uuidGen.v1()
            } else {
                obj.uuid = msg.uuid;
                var target = worldState.get(obj.uuid)

                if (target !== undefined)
                    next = next.then(function() {
                        return worldState.cleanup(obj.uuid)
                    })
            }

            /*
             * Remove item from the inventory, unpacking it if needed
             * Dock is just transfering the item back to inventory
             */

            next = next.then(function() {
                return C.request('tech', 'POST', 204, '/vessels', {
                    uuid: obj.uuid,
                    account: h.auth.account,
                    blueprint: blueprint.uuid,
                    from: msg.from || { uuid: null, slice: null },
                    contents: msg.items
                }, ctx)
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

var loadout = {
    blueprint: "7abb04d3-7d58-42d8-be93-89eb486a1c67",
    contents: {
        "f9e7e6b4-d5dc-4136-a445-d3adffc23bc6": 35
    }
}

module.exports = {
    'spawn': function(ctx, msg, h) {
        if (h.auth.privileged) {
            return spawnThing(ctx, msg, h)
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
                return spawnThing(ctx, {
                    blueprint: loadout.blueprint,
                    // TODO copy the position of the spawnpoint
                    solar_system: solar_system,
                    items: Object.keys(loadout.contents).map(function(key) {
                        return {
                            blueprint: key,
                            quantity: loadout.contents[key],
                        }
                    })
                }, h)
            })
        })
    },
    'dock': function(ctx, msg, h) {
        var target = worldState.get(msg.vessel_uuid)
        if (target === undefined || target.values.tombstone === true) {
            throw new Error("no such vessel")
        }

        return C.request('tech', 'POST', 204, '/vessels/'+msg.vessel_uuid, {
            account: h.auth.account,
            inventory: msg.inventory,
            slice: msg.slice
        }, ctx).then(function() {
            return worldState.mutateWorldState(target.key, target.rev, {
                tombstone_cause: 'docking',
                tombstone: true
            })
        })
    },
    'deploy': function(ctx, msg, h) {
        var container = worldState.get(msg.container_id)

        if (container === undefined)
            throw new Error("failed to find the container to launch the vessel. container_id="+msg.container_id)

        if (msg.slice === undefined || msg.blueprint === undefined)
            throw new Error("missing parameters: slice or blueprint")

        return spawnThing(ctx, {
            uuid: msg.uuid, // uuid make be undefined here, spawnThing will populate it if need be
            blueprint: msg.blueprint,
            position: C.deepMerge(container.values.position, {}),
            solar_system: container.values.solar_system,
            from: {
                uuid: msg.container_id,
                slice: msg.slice
            }
        }, h)
    },
}
