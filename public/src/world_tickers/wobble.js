define([ 'three', 'tween', '../sceneCtl', '../world_state' ], function(THREE, TWEEN, sceneCtl, worldState) { 

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

    worldState.registerMutator([ 'tombstone' ], function(key, values) {
        var obj = worldState.get(key);

        if (obj.object3d) {
            sceneCtl.get().remove(obj.object3d);
        }
    });

    worldState.registerMutator([ 'position' ], function(key, values) {
        var obj = worldState.get(key);

        if (obj.object3d) {
            if (obj.object3d.positionTween) {
                obj.object3d.positionTween.stop();
            }

            // TODO don't tween over a certain distance
            if (obj.object3d.position.length() === 0) {
                var p = values.position;
                obj.object3d.position.set(p.x, p.y, p.z);
            } else {
                obj.object3d.positionTween = new TWEEN.Tween(obj.object3d.position).
                    to(values.position, worldState.tickInterval).
                    start();
            }
        }
    });

    worldState.registerHandler('spaceship', function(key, values) {
        THREEx.SpaceShips.loadSpaceFighter01(function(object3d) {
            var ship = worldState.get(key);
            object3d.stateKey = ship.key;
            ship.object3d = object3d;
            object3d.name = "spaceship";

            var v = values.position;
            object3d.baseScale = object3d.scale.length();
            object3d.scale.multiplyScalar(0.25);

            worldState.asyncMutation(ship.key);

            sceneCtl.get().add(object3d);
        });
    });

});
