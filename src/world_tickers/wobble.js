(function() {
    'use strict';

    var worldState = require('../world_state.js'),
        multiuser = require('../multiuser.js');

    var spaceships = [];

    var obj = {
        worldTick: function(tickMs) {
            return;
            spaceships.forEach(function(i) {
                var ship = worldState.get(i);
                var rot = Math.sin(tickMs / 500);

                worldState.mutateWorldState(i, ship.rev, {
                    rotation: {
                        x: rot
                    },
                    position: {
                        x: ship.values.position.x + rot/4,
                        y: ship.values.position.y,
                        z: ship.values.position.z,
                    }
                });
            });
        },
        onClientJoined: function(handler) {
            setTimeout(function() {
                var ship1 = worldState.get(1);

                worldState.mutateWorldState(1, ship1.rev, {
                    shooting: 2
                });

                /*setTimeout(function() {
                    worldState.mutateWorldState(1, ship1.rev, {
                        shooting: -1
                    });

                }, 5000); */
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
            x: 0,
            y: 0,
            z: 0 
        }
    });
})();
