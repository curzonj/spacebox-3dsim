define(['three', './sceneCtl', './container'], function(THREE, sceneCtl, container) {

    'use strict';

    // NOTE treating the camera as a singleton currently prevents
    // us from splitting the screen and allowing multiple viewing
    // angles.
    // http://mrdoob.github.io/three.js/examples/webgl_multiple_views.html

    // each unit == 100 meters
    var maxDistance = 1000;
    var camera = new THREE.PerspectiveCamera(75, container.viewportWidth() / window.innerHeight, 
                                             0.1, sceneCtl.frustrumDistance+maxDistance*2);
    camera.position.z = 5;
    camera.maxDistance = maxDistance; // just a hint to the controls

    window.addEventListener('resize', function() {
        camera.aspect = container.viewportWidth() / window.innerHeight;
        camera.updateProjectionMatrix();
    }, false);


    var dirLight = new THREE.DirectionalLight(0xffffff);
    // TODO implement the sun at the edge of the frustrum
    dirLight.position.set(200, 200, 1000).normalize();

    camera.add(dirLight);
    camera.add(dirLight.target);

    sceneCtl.onCreate(function(scene) {
        scene.add(camera);
    });

    return camera;
});
