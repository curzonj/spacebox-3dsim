define([ 'three', '../scene', '../world_state' ], function(THREE, scene, worldState) { 

    Math.radians = function(degrees) {
        return degrees * Math.PI / 180;
    };

    // TODO this is pretty hackishs and not extensible
    worldState.registerMutator([ 'shooting' ], function(tick, ts, msg) {
        var state = worldState.get();

        var ship1 = state[1];
        var ship2 = state[2];

        if (!ship1.object3d || !ship2.object3d ) {
            return;
        }

        var laserBeam = new THREEx.LaserBeam();
        laserBeam.object3d.position.copy(ship1.object3d.position);

        laserBeam.setTarget = function(position) {
            this.object3d.lookAt(position);
            this.object3d.rotateOnAxis(this.object3d.up, Math.radians(-90));

            var distance = this.object3d.position.distanceTo(position);
            this.object3d.scale.x = distance;
        };

        scene.add(laserBeam.object3d);
        new THREEx.LaserCooked(laserBeam);

        laserBeam.setTarget(ship2.object3d.position);

        ship1.laser = laserBeam;
    });

});
