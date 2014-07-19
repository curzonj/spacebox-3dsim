(function() {
    'use strict';

    var worldState = require('../world_state.js'),
        multiuser = require('../multiuser.js');

    var spaceships = [];

    var obj = {
        worldTick: function(tickMs) {
            var state = worldState.getWorldState();

            spaceships.forEach(function(i) {
                var ship = state[i];
                var rot = Math.sin(tickMs / 500);

                worldState.mutateWorldState(i, ship.rev, {
                    x_rotation: rot
                });
            });
        },
        onClientJoined: function(handler) {
            setTimeout(function() {
                var state = worldState.getWorldState();
                var ship1 = state[1];

                worldState.mutateWorldState(1, ship1.rev, {
                    shooting: 2
                });

                setTimeout(function() {
                    worldState.mutateWorldState(1, ship1.rev, {
                        shooting: -1
                    });

                }, 1000);
            }, 3000);
        },
        onWorldStateChange: function(ts, key, oldRev, newRev, patch) {
            if (oldRev === 0 && patch.type == "spaceship") {
                spaceships.push(key);
            }
        }
    };

    multiuser.addListener(obj);

    // NOTE the world tickers are responsible for loading
    // content into the world when it first launches
    worldState.addListener(obj);
    worldState.mutateWorldState(1, 0, {
        type: 'spaceship',
        position: {
            x: 2,
            y: 2,
            z: 2
        }
    });
    worldState.mutateWorldState(2, 0, {
        type: 'spaceship',
        position: {
            x: -2,
            y: -2,
            z: -2
        }
    });
})();
