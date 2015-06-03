'use strict';

var Q = require('q'),
    THREE = require('three'),
    uuidGen = require('node-uuid'),
    db = require('spacebox-common-native').db,
    C = require('spacebox-common')

var worldState = require('../world_state.js'),
    solarsystems = require('../solar_systems.js'),
    th = require('spacebox-common/src/three_helpers.js'),
    config = require('../config.js'),
    space_data = require('../space_data.js')

// NodeJS is single threaded so this is instead of object pooling
var position1 = new THREE.Vector3()
var position2 = new THREE.Vector3()

function spawnVessel(ctx, msg, h, fn) {
    return C.getBlueprints().then(function(blueprints) {
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
                if (target.account === account) {
                    next = next.then(function() {
                        return worldState.cleanup(uuid)
                    })
                } else {
                    // Otherwise it would allow attacks
                    throw new Error("uuid collision")
                }
            }
        }

        return next.then(function() {
            return C.request('tech', 'POST', 200, '/vessels', {
                uuid: uuid,
                account: msg.account,
                blueprint: blueprint.uuid,
                from: msg.from || {
                    uuid: null,
                    slice: null
                },
                modules: msg.modules
            }, ctx)
        }).then(function(data) {
            msg.modules = data.modules
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

        return Q.spread([
            solarsystems.getSpawnSystemId(),
            C.getBlueprints(),
            C.request('tech', 'POST', 200, '/getting_started', {
                uuid: uuid,
                account: h.auth.account
            }, ctx)
        ], function(solar_system, blueprints, data) {
            var blueprint = blueprints[data.blueprint_id]

            return space_data.spawn(ctx, uuid, blueprint, {
                modules: data.modules,
                account: h.auth.account,
                position: space_data.random_position(config.game.spawn_range),
                solar_system: solar_system
            })
        })
    },
    'dock': function(ctx, msg, h) {
        var vessel = worldState.get(msg.vessel_uuid)
        var container = worldState.get(msg.container)

        if (vessel === undefined || vessel.tombstone === true) {
            throw new Error("no such vessel")
        } else if (container === undefined || container.tombstone === true) {
            throw new Error("no such container")
        }

        th.buildVector(position1, vessel.position)
        th.buildVector(position2, container.position)

        if (position1.distanceTo(position2) > config.game.docking_range)
            throw ("You are not within range, "+config.game.docking_range)

        return C.request('tech', 'POST', 204, '/vessels/' + msg.vessel_uuid, {
            account: h.auth.account,
            inventory: msg.container,
            slice: msg.slice
        }, ctx).then(function() {
            return worldState.queueChangeIn(vessel.uuid, {
                tombstone_cause: 'docking',
                tombstone: true
            })
        })
    },
    'deploy': function(ctx, msg, h) {
        var container = worldState.get(msg.container_id)

        var num_vessels = Object.keys(h.visibility.privilegedKeys).length
        if (num_vessels >= config.game.maximum_vessels)
            throw new Error("already have the maximum number of deployed vessels")

        if (container === undefined)
            throw new Error("failed to find the container to launch the vessel. container_id=" + msg.container_id)

        if (msg.slice === undefined || msg.blueprint === undefined)
            throw new Error("missing parameters: slice or blueprint")

        msg.account = h.auth.account

        return spawnVessel(ctx, {
            uuid: msg.vessel_uuid, // uuid may be undefined here, spawnVessel will populate it if need be
            blueprint: msg.blueprint,
            account: h.auth.account,
            position: C.deepMerge(container.position, {}),
            solar_system: container.solar_system,
            from: {
                uuid: msg.container_id,
                slice: msg.slice
            }
        }, h)
    },
}
