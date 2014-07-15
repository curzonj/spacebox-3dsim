define(['three', './container', 'VRMLLoader', 'TrackballControls'], function(THREE, container) {
    'use strict';

    function Builder() {}

    Builder.prototype = {
        constructor: Builder,
        addCube: function() {
            var geometry = new THREE.CubeGeometry(1, 1, 1);
            var material = new THREE.MeshLambertMaterial({
                color: 0xCC0000
            });
            var cube = this.object = new THREE.Mesh(geometry, material);
            this.scene.add(cube);
        },
        addCone: function() {
            var cylinder = new THREE.Mesh(new THREE.CylinderGeometry(0, 100, 400, 50, 50, false), new THREE.MeshNormalMaterial());
            cylinder.overdraw = true;
            this.scene.add(cylinder);
        },
        addShip: function() {
            var ctx = this;
            var loader = new THREE.VRMLLoader();
            loader.addEventListener('load', function(event) {

                ctx.scene.add(event.content);

            });
            loader.load("/assets/ship.wrl");
        },
        addLathe: function() {
            var points = [];
            for (var i = 0; i < 10; i++) {
                points.push(new THREE.Vector3(Math.sin(i * 0.2) * 15 + 50, 0, (i - 5) * 2));

            }
            var geometry = new THREE.LatheGeometry(points);
            var material = new THREE.MeshBasicMaterial({
                color: 0xffff00
            });
            var lathe = this.object = new THREE.Mesh(geometry, material);
            this.scene.add(lathe);
        },
        onWindowResize: function() {

            this.camera.aspect = window.innerWidth / window.innerHeight;
            this.camera.updateProjectionMatrix();

            this.renderer.setSize(window.innerWidth, window.innerHeight);

            this.controls.handleResize();

        },
        addControls: function() {
            var controls = this.controls = new THREE.TrackballControls(this.camera);

            controls.rotateSpeed = 5.0;
            controls.zoomSpeed = 5;
            controls.panSpeed = 2;

            controls.noZoom = false;
            controls.noPan = false;

            controls.staticMoving = true;
            controls.dynamicDampingFactor = 0.3;

        },
        start: function() {

            var camera = this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
            camera.position.z = 5;

            this.addControls();

            var scene = this.scene = new THREE.Scene();
            scene.add(camera);

            var dirLight = new THREE.DirectionalLight(0xffffff);
            dirLight.position.set(200, 200, 1000).normalize();

            camera.add(dirLight);
            camera.add(dirLight.target);

            this.addCone();

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
