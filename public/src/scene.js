define(['three'], function(THREE) {

    'use strict';

    var scene = new THREE.Scene();

    // Grid squares are 10km
    scene.add(new THREE.GridHelper(4000, 100));

    scene.frustrumDistance = 10000;
    var starSphere = THREEx.Planets.createStarfield(scene.frustrumDistance);
    scene.add(starSphere);

    return scene;

});
