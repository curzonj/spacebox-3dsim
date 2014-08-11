(function() {
    'use strict';

    var worldState = require('../world_state.js'),
        multiuser = require('../multiuser.js');

    function buildShip(fn) {
        var obj = {
            type: 'spaceship',
            maxHealth: 30,
            health: 30,
            health_pct: 100,
            damage: 1,

            position: { x: 0, y: 0, z: 0 },
            velocity: { x: 0, y: 0, z: 0 },
            facing: { x: 0, y: 0, z: 0 },

            subsystems: ["engines", "weapon"],
            effects: {},
            engine: {
                maxVelocity: 1.0,
                maxTheta: Math.PI / 60,
                maxThrust: 0.1,
                state: "none" // orbit, approach, etc OR manual
            },
            weapon: {
                state: "none"
            }
        };
        fn(obj);
        worldState.addObject(obj);
    }

    var obj = {
        onClientJoined: function(handler) {
            (function() {
                var spaceships = worldState.scanDistanceFrom(undefined, "spaceship");

                if (spaceships.length < 2) {
                    buildShip(function(s) {
                        s.position = {
                            x: 5 * Math.random(),
                            y: -5 * Math.random(),
                            z: 5 * Math.random()
                        };

                        s.velocity.z = 0.01;
                    });
                }
            })();

            setTimeout(function() {
                var spaceships = worldState.scanDistanceFrom(undefined, "spaceship");
                var ship1 = spaceships[0];
                var ship2 = spaceships[spaceships.length - 1];

                if (ship1 && ship2) {
                    // TODO this needs to be a command to a handler that
                    // turns it into state
                    worldState.mutateWorldState(ship1.key, ship1.rev, {
                        weapon: {
                            state: "shoot",
                            target: ship2.key
                        },
                        engines: {
                            state: "orbit",
                            orbitRadius: 3,
                            orbitTarget: ship2.key
                        }
                    });
                }
            }, 3000);
        }
    };

    multiuser.addListener(obj);

    buildShip(function(s) {
        s.position = { x: 2, y: 2, z: 2 };
    });
})();
