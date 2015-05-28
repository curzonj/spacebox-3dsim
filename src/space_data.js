'use strict';

var Q = require('q'),
    C = require('spacebox-common')

var worldState = require('./world_state.js')

module.exports = {
    spawn: function(ctx, uuid, blueprint, msg, fn) {
        ctx.log('3dsim', 'space_data.spawn', msg)

        if (blueprint === undefined ||
            msg.solar_system === undefined ||
            msg.account === undefined) {
            throw new Error("invalid spawn params")
        }

        var obj = C.deepMerge(blueprint, {
            solar_system: msg.solar_system,
            account: msg.account,
            blueprint: blueprint.uuid,
            health: blueprint.maxHealth,
            effects: {},
            systems: {},
            position: msg.position || {
                x: 0,
                y: 0,
                z: 0
            },
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
            },
        })

        // If we did it above the blueprint merge
        // would over write it
        obj.uuid = uuid

        // TODO add elements to obj.systems based on modules
        // and we need the response from tech to know what modules
        // are installed

        if (blueprint.thrust !== undefined) {
            // TODO this should obviously be calculated
            obj.systems.engine = {
                state: null,
                "maxVelocity": 1.0,
                "maxTheta": Math.PI / 10,
                "maxThrust": 0.1
            }
        }

        ctx.debug('3dsim', obj)

        return worldState.addObject(obj).then(function(uuid) {
            ctx.log('3dsim', "built space object", {
                blueprint: msg.blueprint,
                id: uuid
            })

            return uuid
        })
    }
}
