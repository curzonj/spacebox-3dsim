define(['three', 'tween', './stats', './renderer', './camera', './controls', './scene', './world_state', './keypressed', './world_tickers/load_all'],
       function(THREE, TWEEN, stats, renderer, camera, controls, scene, worldState, keyPressed) {

    'use strict';

    function Builder() {
        this.pendingCommands = [];
        this.paused = false;

        this.renderCallback = this.render.bind(this);
    }

    Builder.prototype = {
        constructor: Builder,
        start: function() {
            this.openConnection();

            this.render(0);

            keyPressed.on("shift+p", function(){
                this.paused = !this.paused;
            }.bind(this));
        },
        openConnection: function() {
            var self = this;
            var connection = new WebSocket('ws://localhost:8080/test');

            // When the connection is open, send some data to the server
            connection.onopen = function() {
                //connection.send('Ping'); // Send the message 'Ping' to the server
            };

            connection.onclose = function() {
                console.log("waiting 1sec to reconnect");
                setTimeout(function() {
                    console.log("reconnecting");
                    self.openConnection();
                }, 1000);
            };

            // Log errors
            connection.onerror = function(error) {
                console.log('WebSocket Error');
                console.log(error);
            };

            connection.onmessage = this.onMessage.bind(this);
        },
        onMessage: function(e) {
            var msg = JSON.parse(e.data);

            switch (msg.type) {
                case "state":
                    this.pendingCommands.push(msg);
                break;
            }
        },
        updateScene: function() {
            var tickMs = worldState.currentTick();
            var list = this.pendingCommands;
            this.pendingCommands = [];

            list.forEach(function(cmd) {
                worldState.onStateChange(tickMs, cmd.timestamp, cmd.state);
            });

            worldState.worldTick(tickMs);
        },
        // NOTE renderStart doesn't seem to be relative to anything other
        // than itself. We could use it to determine the time between renders,
        // but not much else.
        render: function(renderStart) {
            window.requestAnimationFrame(this.renderCallback);

            function liner(color, vr1, vr2) {
                var material = new THREE.LineBasicMaterial({
                    color: color,
                    linewidth: 3
                });

                var geometry = new THREE.Geometry();
                geometry.vertices.push(vr1, vr2);

                var line = new THREE.Line( geometry, material );
                scene.add( line );
            }

            if (!this.paused) {
                controls.update();
                this.updateScene();

                try {
                window.ship1 = worldState.get(1).object3d;
                window.ship2 = worldState.get(2).object3d;

                if (ship1.rotation.y === 0) {
                   ship1.rotation.y = 5;
                   ship1.updateMatrix();
                }

                if (this.limit === undefined) {
                    this.limit = 10000;
                }

                var v1 = new THREE.Vector3();
                v1.copy(ship2.position);
                v1.sub(ship1.position); // directional vector
                v1.normalize();


                var m1 = new THREE.Matrix4();
                m1.extractRotation( ship1.matrix );
                 
                var v2 = new THREE.Vector3( 0, 0, 1 );
                v2.applyMatrix4(m1);// direction is ship1 directional vector
                v2.normalize();

                var rot = v2.angleTo(v1); // angle in rads

                rot = Math.min(rot, 0.03);

                var v3;
                if (this.cross === undefined) {
                    v3 = new THREE.Vector3();
                    v3.crossVectors(v2, v1); // v3 == rotational axis
                    v3.normalize();
                    this.cross = v3;
                    console.log(v3);
                } else {
                    v3 = this.cross;
                }

                if (rot > 0) {
                    liner(0x0000ff, ship1.position, new THREE.Vector3().copy(v1).add(ship1.position));
                    liner(0xff0000, ship1.position, new THREE.Vector3().copy(v2).add(ship1.position));
                    liner(0x00ff00, ship1.position, new THREE.Vector3().copy(v3).add(ship1.position));
                    liner(0x00ffff, ship1.position, new THREE.Vector3().copy(ship1.up).add(ship1.position));
                }

                this.limit -= 1;
                if (this.limit > 0) {
                    ship1.rotateOnAxis(v3, rot);
                }

                } catch(err) {
                    console.log(err);
                }

                TWEEN.update(renderStart);
                renderer.render(scene, camera);

                stats.update();
            }
        }
    };

    return new Builder();
});
