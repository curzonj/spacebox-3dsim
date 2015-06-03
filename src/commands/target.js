'use strict';

var worldState = require('../world_state.js')

function validateSubjectTarget(subject, target, h) {
    if (subject === undefined || subject.account !== h.auth.account) {
        throw new Error("no such subject")
    } else if (target === undefined) {
        throw new Error("no such target")
    } else if (target.solar_system !== subject.solar_system) {
        throw new Error("")
    }
}

function setState(ship, system, state, patch) {
    patch = patch || {}
    patch.state = state
    var obj = { systems: {} }
    obj.systems[system] = patch

    worldState.queueChangeIn(ship.uuid, obj)
}

module.exports = {
    full_stop: function(ctx, msg, h) {
        var ship = worldState.get(msg.vessel);
        if (ship === undefined || ship.account !== h.auth.account)
            throw new Error("no such vessel")

        setState(ship, 'engine', 'fullStop')
    },
    move_to: function(ctx, msg, h) {
        var ship = worldState.get(msg.vessel);
        if (ship === undefined || ship.account !== h.auth.account)
            throw new Error("no such vessel")

        setState(ship, 'engine', 'moveTo', { moveTo: msg.target })
    },
    orbit: function(ctx, msg, h) {
        var ship = worldState.get(msg.vessel);
        var target = worldState.get(msg.target)
        validateSubjectTarget(ship, target, h)

        setState(ship, 'engine', 'orbit', {
            orbitRadius: msg.radius || 1,
            orbitTarget: msg.target
        })
    },

    shoot: function(ctx, msg, h) {
        var ship = worldState.get(msg.vessel)
        var target = worldState.get(msg.target)
        validateSubjectTarget(ship, target, h)

        setState(ship, 'weapon', 'shoot', { target: msg.target })
    }
};
