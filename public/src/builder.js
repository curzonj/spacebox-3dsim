define(['jquery', 'three', 'tween', './stats', './renderer', './camera', './controls', './sceneCtl', './world_state', './keypressed', './world_tickers/load_all', './models/loader'],
    function($, THREE, TWEEN, stats, renderer, camera, controls, sceneCtl, worldState, keyPressed) {

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
                    // TODO as soon as this opens we start receiving
                    // messages, is there a race condition?
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

                $(renderer).trigger("renderComplete");

                stats.update();
            }
        };

        return new Builder();
    });
