'use strict';

var worldState = require('../world_state.js')

function buildShip(fn) {
    var obj = {
        type: 'spaceship',
        maxHealth: 30,
        health: 30,
        health_pct: 100,
        damage: 1,

        position: { x: 0, y: 0, z: 0 },
        velocity: { x: 0, y: 0, z: 0 },
        facing: { x: 0, y: 0, z: 0, w: 1 },

        subsystems: ["engines", "weapon"],
        effects: {},
        engine: {
            maxVelocity: 0.5,
            maxTheta: Math.PI / 40,
            maxThrust: 0.05,
            state: "none" // orbit, approach, etc OR manual
        },
        weapon: {
            state: "none"
        }
    }
    fn(obj)

    return worldState.addObject(obj)
}

buildShip(function(s) {
    s.position = { x: 2, y: 2, z: 2 }
}).then(function(ship1_id) {
    var ship1 = worldState.get(ship1_id)
    worldState.mutateWorldState(ship1.key, ship1.rev, {
        engine: {
            theta: Math.PI / 60,
            thetaAxis: { x: 1, y: 1, z: 0 }
        }
    })
}).done()
