define([ 'three', 'tween', '../scene', '../world_state' ], function(THREE, TWEEN, scene, worldState) { 

    worldState.registerMutator([ 'rotation' ], function(key, values) {
        var obj = worldState.get(key);

        if (obj.object3d) {
            if (obj.object3d.rotationTween) {
                obj.object3d.rotationTween.stop();
            }

            // totally broken
            obj.object3d.rotationTween = new TWEEN.Tween(obj.object3d.rotation).
                to(values.rotation, worldState.tickInterval).
                start();
        }
    });

    worldState.registerMutator([ 'position' ], function(key, values) {
        var obj = worldState.get(key);

        if (obj.object3d) {
            if (obj.object3d.positionTween) {
                obj.object3d.positionTween.stop();
            }

            obj.object3d.positionTween = new TWEEN.Tween(obj.object3d.position).
                to(values.position, worldState.tickInterval).
                start();
        }
    });

    worldState.registerHandler('spaceship', function(key, values) {
        THREEx.SpaceShips.loadSpaceFighter01(function(object3d) {
            var ship = worldState.get(key);
            object3d.stateKey = ship.key;
            ship.object3d = object3d;

            var v = values.position;
            object3d.baseScale = object3d.scale.length();
            object3d.scale.multiplyScalar(0.25);

            worldState.asyncMutation(ship.key);

            scene.add(object3d);
        });
    });

});
