define([ 'three', 'tween', '../scene', '../world_state' ], function(THREE, TWEEN, scene, worldState) { 

    worldState.registerMutator([ 'rotation' ], function(tick, ts, msg) {
        var obj = worldState.get(msg.key);

        // TODO what do we do if we get a mutation when there is no
        // object3d to deal with
        if (obj.object3d) {
            if (obj.object3d.rotationTween) {
                obj.object3d.rotationTween.stop();
            }

            obj.object3d.rotationTween = new TWEEN.Tween(obj.object3d.rotation).
                to(msg.values.rotation, worldState.tickInterval).
                start();
        }
    });

    worldState.registerMutator([ 'position' ], function(tick, ts, msg) {
        var obj = worldState.get(msg.key);

        // TODO what do we do if we get a mutation when there is no
        // object3d to deal with
        if (obj.object3d) {
            if (obj.object3d.positionTween) {
                obj.object3d.positionTween.stop();
            }

            obj.object3d.positionTween = new TWEEN.Tween(obj.object3d.position).
                to(msg.values.position, worldState.tickInterval).
                start();
        }
    });

    worldState.registerHandler('spaceship', function(tick, ts, msg) {
        THREEx.SpaceShips.loadSpaceFighter01(function(object3d) {
            var ship = worldState.get(msg.key);
            object3d.stateKey = msg.key;
            ship.object3d = object3d;

            // TODO this may be out of sync because it's async, test
            // the version
            var v = msg.values.position;
            object3d.position = new THREE.Vector3(v.x, v.y, v.z);
            scene.add(object3d);
        });
    });

});
