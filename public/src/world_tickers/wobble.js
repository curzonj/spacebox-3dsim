define([ 'three', '../scene', '../world_state' ], function(THREE, scene, worldState) { 

    var state = worldState.get();

    worldState.registerMutator([ 'x_rotation' ], function(tick, ts, msg) {
        for (var key in state) {
            var obj = state[key];

            // TODO what do we do if we get a mutation when there is no
            // object3d to deal with
            if (obj.type == "spaceship" && obj.object3d) {
                obj.object3d.rotation.x = msg.values.x_rotation;
            }
        }
    });

    worldState.registerHandler('spaceship', function(tick, ts, msg) {
        THREEx.SpaceShips.loadSpaceFighter01(function(object3d) {
            object3d.serverKey = msg.key;
            state[msg.key].object3d = object3d;

            // TODO this may be out of sync because it's async, test
            // the version
            var v = msg.values.position;
            object3d.position = new THREE.Vector3(v.x, v.y, v.z);
            scene.add(object3d);
        });
    });

});
