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
                console.log("paused = " + this.paused);
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

            controls.update();

            if (!this.paused) {
                this.updateScene();
                TWEEN.update(renderStart);
            }

            renderer.render(scene, camera);

            stats.update();
        }
    };

    return new Builder();
});
