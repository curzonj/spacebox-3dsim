define(['three', '../sceneCtl', '../world_state'], function(THREE, sceneCtl, worldState) {

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
    window.laserList = lasers;

    worldState.registerMutator(['shooting'], function(key, values) {
        // The world ticker keeps track of the laser after it's created
        if (values.shooting !== -1) {
            var ship1 = worldState.get(key);

            if (ship1 && ship1.object3d && ship1.laser === undefined) {

                var laser = ship1.laser = new THREEx.LaserBeam();
                laser.object3d.name = key+'-laser';
                lasers.push(ship1.key);

                laser.origin = ship1.object3d;
                new THREEx.LaserCooked(laser);

                sceneCtl.get().add(laser.object3d);
            }
        }
    });

    worldState.registerTicker(function(tick) {
        lasers.forEach(function(key) {
            var ship1 = worldState.get(key);

            if (!ship1 || ship1.laser === undefined) {
                var index = lasers.indexOf(key);
                lasers.splice(index, 1);

                return;
            }

            if (ship1.values.tombstone || ship1.values.shooting === -1 || ship1.values.shooting === undefined) {
                ship1.laser.setTarget(-1);
            } else {
                var ship2 = worldState.get(ship1.values.shooting);

                // When first loading the world, we make not have
                // a record of ship2 yet
                if (ship2 && ship2.object3d && ship2.values.tombstone !== true) {
                    ship1.laser.setTarget(ship2.object3d.position);
                } else {
                    ship1.laser.setTarget(-1);
                }
            }
        });
    });

});
