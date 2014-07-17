define(['three', './container', 'OrbitControls'], function(THREE, container) {

    'use strict';

    function Builder() {}

    Builder.prototype = {
        constructor: Builder,
        onWindowResize: function() {

            this.camera.aspect = window.innerWidth / window.innerHeight;
            this.camera.updateProjectionMatrix();

            this.renderer.setSize(window.innerWidth, window.innerHeight);

            this.controls.handleResize();

        },
        addControls: function() {
            var controls = this.controls = new THREE.OrbitControls(this.camera);

            controls.rotateSpeed = 2.0;
            controls.zoomSpeed = 1;
            controls.panSpeed = 3;

            controls.noZoom = false;
            controls.noPan = false;

            controls.staticMoving = true;
            controls.dynamicDampingFactor = 0.3;

        },
        start: function() {

            var camera = this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 10000);
            camera.position.z = 5;

            this.addControls();

            var scene = this.scene = new THREE.Scene();
            scene.add(camera);
            scene.add(new THREE.GridHelper(1100, 50));

            var dirLight = new THREE.DirectionalLight(0xffffff);
            dirLight.position.set(200, 200, 1000).normalize();

            camera.add(dirLight);
            camera.add(dirLight.target);

            var starSphere = THREEx.Planets.createStarfield(1000);
            scene.add(starSphere);

            THREEx.SpaceShips.loadSpaceFighter01(function(object3d) {
                // object3d is the loaded spacefighter
                // now we add it to the scene
                object3d.position = new THREE.Vector3(2, 2, 2);
                scene.add(object3d);
            });

            THREEx.SpaceShips.loadSpaceFighter02(function(object3d) {
                // object3d is the loaded spacefighter
                // now we add it to the scene
                object3d.position = new THREE.Vector3(-2, -2, -2);
                scene.add(object3d);
            });

            var renderer = this.renderer = new THREE.WebGLRenderer();
            renderer.setSize(window.innerWidth, window.innerHeight);

            container.innerHTML = "";
            container.appendChild(renderer.domElement);

            window.addEventListener('resize', this.onWindowResize.bind(this), false);

            this.render();
        },
        render: function() {
            var callback = this.render.bind(this);
            window.requestAnimationFrame(callback);

            this.controls.update();

            this.renderer.render(this.scene, this.camera);
        }
    };

    return new Builder();
});
