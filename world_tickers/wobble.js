(function() {
    'use strict';

    var worldState = require('../world_state.js');
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
        onWorldStateChange: function(key, oldRev, newRev, patch) {
            if (oldRev === 0 && patch.type == "spaceship") {
                spaceships.push(key);
            }
        }
    };

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
