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
            facing: { x: 0, y: 0, z: 0, w: 1 },

            subsystems: ["engines", "weapon"],
            effects: {},
            engine: {
                maxVelocity: 1.0,
                maxTheta: Math.PI / 30,
                maxThrust: 0.1,
                state: "none" // orbit, approach, etc OR manual
            },
            weapon: {
                state: "none"
            }
        };
        fn(obj);

        return worldState.addObject(obj);
    }

    var obj = {
        onClientJoined: function(handler) {
            function bob() {
                var spaceships = worldState.scanDistanceFrom(undefined, "spaceship");

                if (spaceships.length < 2) {
                    var ship1 = spaceships[0];

                    var ship2_key = buildShip(function(s) {
                        s.position = {
                            x: Math.random(),
                            y: -1 * Math.random(),
                            z: Math.random()
                        };

                        s.velocity.z = 0.01;
                    });

                    worldState.mutateWorldState(ship1.key, ship1.rev, {
                        engine: {
                            state: "orbit",
                            orbitRadius: 1,
                            orbitTarget: ship2_key
                        }
                    });

                    setTimeout(function() {
                        ship1 = worldState.get(ship1.key);
                        worldState.mutateWorldState(ship1.key, ship1.rev, {
                            weapon: {
                                state: "shoot",
                                target: ship2_key
                            }
                        });
                    }, 3000);
                }

                setTimeout(bob, 5000);
            }

            bob();
        }
    };

    multiuser.addListener(obj);

    buildShip(function(s) {
        s.position = { x: 2, y: 2, z: 2 };
    });
})();
