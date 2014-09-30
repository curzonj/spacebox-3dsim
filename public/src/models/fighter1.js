define(['three'], function(THREE) {
    return function(scale, cb) {
        var scalar = scale * 0.25;

        THREEx.SpaceShips.loadSpaceFighter01(function(object3d) {
            object3d.baseScale = object3d.scale.length();
            object3d.scale.multiplyScalar(scalar);

            cb(object3d);
        });
    };
});
