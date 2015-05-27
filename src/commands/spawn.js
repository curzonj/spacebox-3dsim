'use strict';

var Q = require('q'),
    uuidGen = require('node-uuid'),
    db = require('spacebox-common-native').db,
    C = require('spacebox-common')

var worldState = require('../world_state.js'),
    solarsystems = require('../solar_systems.js'),
    space_data = require('../space_data.js')

function spawnVessel(ctx, msg, h, fn) {
    C.getBlueprints().then(function(blueprints) {
        var account,
            target,
            next = Q(null),
            uuid = msg.uuid || uuidGen.v1(),
            blueprint = blueprints[msg.blueprint]

        if (blueprint === undefined ||
            msg.solar_system === undefined ||
            msg.account === undefined) {
            throw new Error("invalid spawn params")
        }

        if (msg.uuid !== undefined) {
            target = worldState.get(uuid)

            if (target !== undefined) {
                if (target.values.account === account) {
                    next = next.then(function() {
                        return worldState.cleanup(uuid)
                    })
                } else {
                    // Otherwise it would allow for uuid
                    // collision attacks
                    throw new Error("uuid collision")
                }
            }
        }

        return next.then(function() {
            return C.request('tech', 'POST', 204, '/vessels', {
                uuid: uuid,
                account: msg.account,
                blueprint: blueprint.uuid,
                from: msg.from || { uuid: null, slice: null },
                modules: msg.modules
            }, ctx)
        }).then(function() {
            return space_data.spawn(ctx, uuid, blueprint, msg)
        })
    })
}

module.exports = {
    'spawn': function(ctx, msg, h) {
        if (h.auth.privileged) {
            return spawnVessel(ctx, msg, h)
        } else {
            throw "spawn requires a privileged account. use spawnStarter"
        }
    },
    'spawnStarter': function(ctx, msg, h) {
        var uuid = uuidGen.v1()

        /*
         * return db.query("select count(*)::int from space_objects where tombstone = 'f' and account_id = $1 and doc::json->>'blueprint' = $2", [ h.auth.account, loadout.blueprint ]).
        if (data[0].count > 0)
                throw "this account already has a starter ship"
        */

        return Q.spread([
            solarsystems.getSpawnSystemId(),
            C.getBlueprints(),
            C.request('tech', 'POST', 204, '/vessels/starter', {
                uuid: uuid,
                account: h.auth.account
            }, ctx)
        ], function(solar_system, blueprints, data) {
            var blueprint = data.blueprint_id
        
            // TODO copy the position of the spawnpoint
            return space_data.spawn(ctx, uuid, blueprint, {
                account: h.auth.account,
                solar_system: solar_system
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

        msg.account = h.auth.account

        return spawnVessel(ctx, {
            uuid: msg.uuid, // uuid make be undefined here, spawnVessel will populate it if need be
            blueprint: msg.blueprint,
            account: h.auth.account,
            position: C.deepMerge(container.values.position, {}),
            solar_system: container.values.solar_system,
            from: {
                uuid: msg.container_id,
                slice: msg.slice
            }
        }, h)
    },
}
