(function() {
    'use strict';

    var worldState = require('../world_state.js'),
        multiuser = require('../multiuser.js');

    var spaceships = [];

    var obj = {
        worldTick: function(tickMs) {
            spaceships.forEach(function(i) {
                var ship = worldState.get(i);
                if (ship.values.shooting !== undefined && ship.values.shooting !== -1) {
                    var target = worldState.get(ship.values.shooting);
                    console.log({type: "target_eval", target: target});
                    if (target !== undefined && !target.values.destroyed) {
                        if (target.values.health > ship.values.damage) {
                            worldState.mutateWorldState(target.key, target.rev, {
                                health: target.values.health - ship.values.damage
                            });
                        } else {
                            worldState.mutateWorldState(target.key, target.rev, {
                                health: target.values.health - ship.values.damage,
                                destroyed: true
                            });
                            worldState.mutateWorldState(ship.key, ship.rev, {
                                shooting: -1
                            });
                        }
                    } else {
                        worldState.mutateWorldState(ship.key, ship.rev, {
                            shooting: -1
                        });
                    }
                }
            });
        },
        onClientJoined: function(handler) {
            setTimeout(function() {
                var ship1 = worldState.get(spaceships[0]);
                var ship2_key = spaceships[spaceships.length - 1];

                if (ship1.values.shooting === undefined || ship1.values.shooting === -1) {
                    worldState.mutateWorldState(ship1.key, ship1.rev, {
                        shooting: ship2_key
                    });
                }
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
        maxHealth: 100,
        health: 100,
        damage: 1,
        position: {
            x: 2,
            y: 2,
            z: 2
        }
    });
    worldState.mutateWorldState(2, 0, {
        type: 'spaceship',
        maxHealth: 100,
        health: 100,
        damage: 1,
        position: {
            x: 0,
            y: 0,
            z: 0
        }
    });
})();
