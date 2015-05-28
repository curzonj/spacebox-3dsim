'use strict';

var worldState = require('../world_state.js')

module.exports = {
    // TODO make sure they are allowed to give commands to ship1
    // TODO validate the target
    orbit: function(ctx, msg, h) {
        var ship1 = worldState.get(msg.subject);

        if (ship1 === undefined) {
            throw new Error("no such subject")
        } else if (worldState.get(msg.target) === undefined) {
            throw new Error("no such target")
        }

        worldState.mutateWorldState(ship1.key, ship1.rev, {
            engine: {
                state: "orbit",
                orbitRadius: 1,
                orbitTarget: msg.target
            }
        });

    },
    shoot: function(ctx, msg, h) {
        var ship1 = worldState.get(msg.subject);

        if (ship1 === undefined) {
            throw new Error("no such subject")
        } else if (worldState.get(msg.target) === undefined) {
            throw new Error("no such target")
        }

        // TODO make sure ship1 is within range
        worldState.mutateWorldState(ship1.key, ship1.rev, {
            weapon: {
                state: "shoot",
                target: msg.target,
            }
        });
    }
};
