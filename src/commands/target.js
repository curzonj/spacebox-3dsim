'use strict';

var worldState = require('../world_state.js')

function validateSubjectTarget(subject, target, h) {
    if (subject === undefined || subject.values.account !== h.auth.account) {
        throw new Error("no such subject")
    } else if (target === undefined) {
        throw new Error("no such target")
    } else if (target.values.solar_system !== subject.values.solar_system) {
        throw new Error("")
    }
}

module.exports = {
    full_stop: function(ctx, msg, h) {
        var ship = worldState.get(msg.vessel);
        if (ship === undefined || ship.values.account !== h.auth.account)
            throw new Error("no such vessel")

        worldState.mutateWorldState(ship.key, ship.rev, {
            systems: {
                engine: {
                    state: "fullStop"
                }
            }
        });
    
    },
    move_to: function(ctx, msg, h) {
        var ship = worldState.get(msg.vessel);
        if (ship === undefined || ship.values.account !== h.auth.account)
            throw new Error("no such vessel")

        worldState.mutateWorldState(ship.key, ship.rev, {
            systems: {
                engine: {
                    state: "moveTo",
                    moveTo: msg.target
                }
            }
        });
    },
    orbit: function(ctx, msg, h) {
        var ship = worldState.get(msg.vessel);
        var target = worldState.get(msg.target)
        validateSubjectTarget(ship, target, h)

        worldState.mutateWorldState(ship.key, ship.rev, {
            systems: {
                engine: {
                    state: "orbit",
                    orbitRadius: msg.radius || 1,
                    orbitTarget: msg.target
                }
            }
        });
    },

    shoot: function(ctx, msg, h) {
        var ship = worldState.get(msg.vessel)
        var target = worldState.get(msg.target)
        validateSubjectTarget(ship, target, h)

        worldState.mutateWorldState(ship.key, ship.rev, {
            systems: {
                weapon: {
                    state: "shoot",
                    target: msg.target,
                }
            }
        });
    }
};
