define(['three', './renderer', './camera', './controls', './scene', './world_state', './world_tickers/load_all'], function(THREE, renderer, camera, controls, scene, worldState) {

    'use strict';

    function Builder() {
        this.tickInterval = 80;
        this.pendingCommands = [];

        this.renderCallback = this.render.bind(this);
    }

    Builder.prototype = {
        constructor: Builder,
        start: function() {
            this.openConnection();
            this.render(0);
        },
        openConnection: function() {
            var connection = new WebSocket('ws://localhost:8080/test');

            // When the connection is open, send some data to the server
            connection.onopen = function() {
                //connection.send('Ping'); // Send the message 'Ping' to the server
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
        updateScene: function(tickMs) {
            var list = this.pendingCommands;
            this.pendingCommands = [];

            list.forEach(function(cmd) {
                worldState.onStateChange(tickMs, cmd.timestamp, cmd.state);
            });
        },
        // NOTE renderStart doesn't seem to be relative to anything other
        // than itself. We could use it to determine the time between renders,
        // but not much else.
        render: function(renderStart) {
            window.requestAnimationFrame(this.renderCallback);

            var ms = new Date().getTime();
            var tickMs = ms - (ms % this.tickInterval);

            controls.update();
            this.updateScene(tickMs);

            renderer.render(scene, camera);
        }
    };

    return new Builder();
});
