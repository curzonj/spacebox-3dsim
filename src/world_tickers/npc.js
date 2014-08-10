(function() {
    'use strict';

    var worldState = require('../world_state.js'),
        multiuser = require('../multiuser.js');

    var spaceships = [];

    function addShip(position) {
        worldState.addObject({
            type: 'spaceship',
            maxHealth: 100,
            health: 100,
            damage: 1,
            position: position
        });
    }

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
                                // TODO make an explosion
                                tombstone: true
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
            addShip({ x: 0, y: 0, z: 0 });

            setTimeout(function() {
                var ship1 = worldState.get(spaceships[0]);
                var ship2_key = spaceships[spaceships.length - 1];

                if (ship1 && (ship1.values.shooting === undefined || ship1.values.shooting === -1)) {
                    worldState.mutateWorldState(ship1.key, ship1.rev, {
                        shooting: ship2_key
                    });
                } else {
                    console.log("Can't find a spaceship");
                    console.log(spaceships);
                }
            }, 3000);
        },
        onWorldStateChange: function(ts, key, oldRev, newRev, patch) {
            if (oldRev === 0 && patch.type == "spaceship") {
                spaceships.push(key);
            } else if (patch.tombstone) {
                var index = spaceships.indexOf(key);

                if (index !== undefined) {
                    spaceships.splice(index, 1);
                }
            }
        }
    };

    multiuser.addListener(obj);
    worldState.addListener(obj);

    addShip({ x: 2, y: 2, z: 2 });
})();
