define(['three'], function(THREE) {

    'use strict';

    var scene = new THREE.Scene();

    scene.add(new THREE.GridHelper(1100, 50));

    var starSphere = THREEx.Planets.createStarfield(1000);
    scene.add(starSphere);

    return scene;

});
