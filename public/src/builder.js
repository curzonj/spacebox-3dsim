define(['jquery', 'three', 'tween', './container', './stats', './renderer', './camera', './controls', './sceneCtl', './world_state', './keypressed', './world_tickers/load_all'],
    function($, THREE, TWEEN, container, stats, renderer, camera, controls, sceneCtl, worldState, keyPressed) {

        'use strict';

        var projector = new THREE.Projector();

        function placeCircle(object3d) {
            var elem = $('#tracking-overlay');

            var v = projector.projectVector( object3d.position.clone(), camera );
            console.log(v);
            var percX = (v.x + 1) / 2;
            var percY = (-v.y + 1) / 2;
            console.log("percX", percX, "precY", percY);
            console.log("width", renderer.domElement.offsetWidth, "precY", renderer.domElement.offsetHeight);
            var left = percX * renderer.domElement.offsetWidth;
            var top = percY * renderer.domElement.offsetHeight;
            console.log(left, top);

            elem
                .css('left', (left - elem.width() / 2) + 'px')
                .css('top', (top - elem.height() / 2) + 'px');
        }

        function Builder() {
            this.pendingCommands = [];
            this.paused = false;

            this.renderCallback = this.render.bind(this);
        }

        Builder.prototype = {
            constructor: Builder,
            start: function() {
                this.openConnection();

                var self = this;
                worldState.registerMutator(['team'], function(key, values) {
                    var obj = worldState.get(key);
                    self.targetShip = obj.object3d;
                    console.log(key);

                    if (self.targetShip && self.overlay === undefined) {
                        var elem = document.createElement("div");
                        elem.setAttribute("id", "tracking-overlay");
                        container.appendChild(elem);

                        self.overlay = $(elem);
                    }
                });

                this.render(0);

                keyPressed.on("shift+p", function() {
                    this.paused = !this.paused;
                    console.log("paused = " + this.paused);
                }.bind(this));
            },
            websocketUrl: function() {
                var loc = window.location,
                    new_uri;
                if (loc.protocol === "https:") {
                    new_uri = "wss:";
                } else {
                    new_uri = "ws:";
                }
                new_uri += "//" + loc.host + "/";

                return new_uri;
            },
            openConnection: function() {
                var self = this;
                var connection = new WebSocket(self.websocketUrl());

                connection.onopen = function() {
                    //connection.send('Ping'); // Send the message 'Ping' to the server
                    console.log("reseting the world");
                    sceneCtl.create();
                    worldState.reset();
                };

                connection.onclose = function() {
                    if (!self.paused) {
                        console.log("waiting 1sec to reconnect");
                    }
                    setTimeout(function() {
                        if (!self.paused) {
                            console.log("reconnecting");
                        }
                        self.openConnection();
                    }, 1000);
                };

                // Log errors
                connection.onerror = function(error) {
                    if (!self.paused) {
                        console.log('WebSocket Error');
                        console.log(error);
                    }
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
                    //console.log(cmd.state);
                    worldState.onStateChange(tickMs, cmd.timestamp, cmd.state);
                });

                worldState.worldTick(tickMs);
            },
            // NOTE renderStart doesn't seem to be relative to anything other
            // than itself. We could use it to determine the time between renders,
            // but not much else.
            render: function(renderStart) {
                window.requestAnimationFrame(this.renderCallback);

                var scene = sceneCtl.get();

                // We get the render loop started before the scene
                // is ready. It's not ready until we connect to the
                // server
                if (scene === undefined) {
                    return;
                }

                controls.update();

                if (!this.paused) {
                    this.updateScene();
                    TWEEN.update(renderStart);
                }

                renderer.render(scene, camera);

                if (!this.paused && this.targetShip) {
                    placeCircle(this.targetShip);
                }

                stats.update();
            }
        };

        return new Builder();
    });
