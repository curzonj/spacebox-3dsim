(function() {
    'use strict';

    var worldState = require('../world_state.js'),
        THREE = require('three');

    // NodeJS is single threaded so this is instead of object pooling
    var velocityV = new THREE.Vector3();
    var position = new THREE.Vector3();

    var obj = {
        handle_orbit: function(ship) {
        
        },
        handle_velocity: function(ship) {
            var v = ship.values.velocity;
            velocityV.set(v.x, v.y, v.z);

            if (velocityV.length() > 0) {
                if (velocityV.length() > ship.values.engine.maxVelocity) {
                    velocityV.setLength(ship.values.engine.maxVelocity);
                }

                var p = ship.values.position;
                position.set(p.x, p.y, p.z);
                position.add(velocityV);

                worldState.mutateWorldState(ship.key, ship.rev, {
                    velocity: { x: velocityV.x, y: velocityV.y, z: velocityV.z },
                    position: { x: position.x, y: position.y, z: position.z },
                });
            }
        },
        worldTick: function(tickMs) {
            worldState.scanDistanceFrom(undefined, "spaceship").forEach(function(ship) {
                if (ship.values.engine.state !== "none") {
                    this["handle_" + ship.values.engine.state](ship, tickMs);
                }

                this.handle_velocity(ship);
            }, this);
        }
    };

    worldState.addListener(obj);
})();
