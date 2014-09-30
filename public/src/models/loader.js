define(['../sceneCtl', '../world_state'], function(sceneCtl, worldState) {
    var self = {
        load: function(name, size, cb) {
            require(['src/models/'+name], function(fn) {
                fn(size, cb);
            });
        },
        loadModel: function(key, cb) {
            var spo = worldState.get(key);
            var model_name = spo.values.model_name || "cube";
            var model_scale = parseInt(spo.values.model_scale || 1);
            if (spo.values.type != 'spaceship') {
                console.log(spo);
            }

            self.load(model_name, model_scale, function(object3d) {
                // Reload it because it may be stale
                spo = worldState.get(key);

                spo.object3d = object3d;
                object3d.name = key; // key is a string

                if (cb !== undefined) {
                    cb(object3d, spo);
                }

                worldState.asyncMutation(spo.key);

                sceneCtl.get().add(object3d);
            });
        }
    };

    worldState.registerHandler(function(key, values) {
        self.loadModel(key);
    });

    return self;
});
