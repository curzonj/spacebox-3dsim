define(['three', '../scene', '../world_state'], function(THREE, scene, worldState) {

    Math.radians = function(degrees) {
        return degrees * Math.PI / 180;
    };

    THREEx.LaserBeam.prototype.setTarget = function(position) {
        if (position === -1) {
            this.object3d.traverse(function(o) {
                o.visible = false;
            });
        } else {
            this.object3d.lookAt(position);
            this.object3d.rotateOnAxis(this.object3d.up, Math.radians(-90));
            this.object3d.position.copy(this.origin.position);

            var distance = this.object3d.position.distanceTo(position);
            this.object3d.scale.x = distance;

            this.object3d.traverse(function(o) {
                o.visible = true;
            });
        }
    };

    var lasers = [];

    /*
    // TODO this needs mutators and handlers to be merged. what if
    // we load a ship that is already shooting
    worldState.registerMutator(['shooting'], function(tick, ts, msg) {
        if (msg.values.shooting !== -1) {
            var ship1 = worldState.get(msg.key);

            if (ship1 && ship1.object3d && ship1.laser === undefined) {

                var laser = ship1.laser = new THREEx.LaserBeam();
                lasers.push(ship1.key);

                laser.origin = ship1.object3d;
                new THREEx.LaserCooked(laser);

                scene.add(laser.object3d);
            }
        }
    });

    worldState.registerTicker(function(tick) {
        lasers.forEach(function(key) {
            var ship1 = worldState.get(key);

            if (!ship1) {
                return;
            }

            if (ship1.state.shooting === -1) {
                ship1.laser.setTarget(-1);
            } else {
                var ship2 = worldState.get(ship1.state.shooting);

                if (ship2.object3d) {
                    ship1.laser.setTarget(ship2.object3d.position);
                } else {
                    ship1.laser.setTarget(-1);
                }
            }
        });
    });
    */

});
