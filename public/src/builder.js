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

            this.shipList = [];
            this.lastTimeMsec = 0;

            Math.radians = function(degrees) {
                return degrees * Math.PI / 180;
            };

            var renderer = this.renderer = new THREE.WebGLRenderer();
            renderer.setSize(window.innerWidth, window.innerHeight);

            container.innerHTML = "";
            container.appendChild(renderer.domElement);

            window.addEventListener('resize', this.onWindowResize.bind(this), false);

            this.openConnection();
            this.render(0);
        },
        onMessage: function(e) {
            /*
            key: key,
            previous: oldRev,
            version: newRev,
            values: patch
            */

            try {
                var msg = JSON.parse(e.data);
                switch (msg.type) {
                    case "state":
                        if (msg.state.previous === 0) {
                            // TODO add support for more world elements
                            this.addSpaceship(msg.state.values);
                        } else if(msg.state.values.x_rotation !== undefined){
                            this.wobble(msg.state.values);
                        } else if(msg.state.values.shooting !== undefined){
                            this.shootSpaceship();
                        }
                        break;
                }

            } catch (err) {
                console.log(err.message);
                console.log(e.data);
            }
        },
        addSpaceship: function(server_obj) {
            var ctx = this;
            THREEx.SpaceShips.loadSpaceFighter01(function(object3d) {
                ctx.shipList.push(object3d);
                object3d.serverId = server_obj.id;

                var v = server_obj.position;
                object3d.position = new THREE.Vector3(v.x, v.y, v.z);
                ctx.scene.add(object3d);
            });
        },
        shootSpaceship: function() {
            var ship1 = this.shipList[0];
            var ship2 = this.shipList[1];

            if (!ship1 || !ship2) {
                return;
            }

            var laserBeam = new THREEx.LaserBeam();
            laserBeam.object3d.position.copy(ship1.position);

            laserBeam.setTarget = function(position) {
                this.object3d.lookAt(position);
                this.object3d.rotateOnAxis(this.object3d.up, Math.radians(-90));

                var distance = this.object3d.position.distanceTo(position);
                this.object3d.scale.x = distance;
            };

            this.scene.add(laserBeam.object3d);
            var laserCooked = new THREEx.LaserCooked(laserBeam);

            laserBeam.setTarget(ship2.position);
        },
        openConnection: function() {
            var ctx = this;
            var connection = new WebSocket('ws://localhost:8080/test');

            // When the connection is open, send some data to the server
            connection.onopen = function() {
                connection.send('Ping'); // Send the message 'Ping' to the server
            };

            // Log errors
            connection.onerror = function(error) {
                console.log('WebSocket Error');
                console.log(error);
            };

            connection.onmessage = this.onMessage.bind(this);
        },
        wobble: function(msg) {
            this.shipList.forEach(function(ship) {
                ship.rotation.x = msg.x_rotation;
            });
        },
        updateScene: function(nowMsec) {

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
