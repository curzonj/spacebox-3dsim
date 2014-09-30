define(['three'], function(THREE) {
    return function(scale, cb) {
        var sides = scale * 0.5;

        var geometry = new THREE.BoxGeometry(sides, sides, sides);
        var mats = [];
        mats.push(new THREE.MeshBasicMaterial({
            color: 0xff0000
        }));
        mats.push(new THREE.MeshBasicMaterial({
            color: 0x00ff00
        }));
        mats.push(new THREE.MeshBasicMaterial({
            color: 0x0000ff
        }));
        mats.push(new THREE.MeshBasicMaterial({
            color: 0xff00ff
        }));
        mats.push(new THREE.MeshBasicMaterial({
            color: 0xffff00
        }));
        mats.push(new THREE.MeshBasicMaterial({
            color: 0x00ffff
        }));
        var faceMaterial = new THREE.MeshFaceMaterial(mats);

        mesh = new THREE.Mesh(geometry, faceMaterial);

        cb(mesh);
    };
});
