define(['three', './container', 'OrbitControls'], function(THREE, container) {

    'use strict';

    function Builder() {}

    Builder.prototype = {
        constructor: Builder,
        onWindowResize: function() {

            this.camera.aspect = window.innerWidth / window.innerHeight;
            this.camera.updateProjectionMatrix();

            this.renderer.setSize(window.innerWidth, window.innerHeight);
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
            var onRenderFns = this.onRenderFns = [];

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

            var shipList = this.shipList = [];
            var ship1;
            var ship2;




            this.lastTimeMsec = 0;
            THREEx.SpaceShips.loadSpaceFighter01(function(object3d) {
                shipList.push(object3d);
                ship1 = object3d;

                object3d.position = new THREE.Vector3(2, 2, 2);
                scene.add(object3d);

                var laserBeam = new THREEx.LaserBeam();
                laserBeam.object3d.position.copy(ship1.position);

                Math.radians = function(degrees) {
                  return degrees * Math.PI / 180;
                };

                laserBeam.setTarget = function(position) {
                    this.object3d.lookAt(position);
                    this.object3d.rotateOnAxis(this.object3d.up, Math.radians(-90));

                    var distance = this.object3d.position.distanceTo(position);
                    this.object3d.scale.x = distance;
                };

                scene.add(laserBeam.object3d);
                var laserCooked = new THREEx.LaserCooked(laserBeam);

                onRenderFns.push(function(delta, now) {
                    if (ship2) {
                        laserBeam.setTarget(ship2.position);
                    }
                });
            });

            THREEx.SpaceShips.loadSpaceFighter02(function(object3d) {
                shipList.push(object3d);
                ship2 = object3d;

                object3d.position = new THREE.Vector3(-2, -2, -2);
                scene.add(object3d);
            });

            var renderer = this.renderer = new THREE.WebGLRenderer();
            renderer.setSize(window.innerWidth, window.innerHeight);

            container.innerHTML = "";
            container.appendChild(renderer.domElement);

            window.addEventListener('resize', this.onWindowResize.bind(this), false);

            this.render(0);
        },
        updateScene: function(nowMsec) {
            var a = Math.sin(nowMsec / 500);

            this.shipList.forEach(function(ship) {
                ship.rotation.x = a;
            });
        },
        render: function(nowMsec) {
            var callback = this.render.bind(this);
            window.requestAnimationFrame(callback);

            this.controls.update();
            this.updateScene(nowMsec);

            var deltaMsec = Math.min(200, nowMsec - this.lastTimeMsec);
            this.lastTimeMsec = nowMsec;

            // call each update function
            this.onRenderFns.forEach(function(updateFn) {
                updateFn(deltaMsec / 1000, nowMsec / 1000);
            });

            this.renderer.render(this.scene, this.camera);
        }
    };

    return new Builder();
});
