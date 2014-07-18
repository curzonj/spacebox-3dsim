(function() {
    'use strict';

    var Handler = module.exports = function(ws) {
        this.ws = ws;

        this.onConnectionOpen();
        this.setupConnectionCallbacks();
    };

    Handler.prototype = {
        constructor: Handler,
        setupConnectionCallbacks: function() {
            this.ws.on('message', this.onWSMessageReceived.bind(this));
            this.ws.on('close', this.onConnectionClosed.bind(this));
        },
        onWSMessageReceived: function(message) {
            // TODO this is where we'd handle commands from the client
            console.log('received: %s', message);

        },
        send: function(obj) {
            this.ws.send(JSON.stringify(obj));
        },
        onConnectionOpen: function() {
            this.sendWorldState();
        },
        sendWorldState: function() {
            this.send({
                command: "addSpaceship",
                id: 1,
                position: {
                    x: 2,
                    y: 2,
                    z: 2
                }
            });

            this.send({
                command: "addSpaceship",
                id: 2,
                position: {
                    x: -2,
                    y: -2,
                    z: -2
                }
            });
        },
        onConnectionClosed: function() {
            var index = connections.indexOf(ws);
            connections.splice(index, 1);

            console.log('disconnected');
        },

        onWorldStateChange: function(tickMs) {
            this.send({ command: "wobble", timestamp: tickMs });
        }
    };

})();
