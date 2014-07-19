(function() {
    'use strict';

    var WebSocket = require('ws');
    var worldState = require('./world_state.js');
    var multiuser = require('./multiuser.js');

    var Handler = module.exports = function(ws) {
        this.ws = ws;

        this.setupConnectionCallbacks();
        this.onConnectionOpen();
    };

    Handler.prototype = {
        constructor: Handler,
        setupConnectionCallbacks: function() {
            this.ws.on('message', this.onWSMessageReceived.bind(this));
            this.ws.on('close', this.onConnectionClosed.bind(this));
        },
        onConnectionOpen: function() {
            // We listen for updates so that we don't
            // miss any updates while we fetch the
            // full state.
            worldState.addListener(this);

            this.sendWorldState();

            // TODO put the spaceship in space, but you have
            // to get it from the `centeral storage`
            // worldState.mutateWorldState({ });

            multiuser.onClientJoined(this);
        },
        onConnectionClosed: function() {
            worldState.removeListener(this);

            console.log('disconnected');
        },
        onWSMessageReceived: function(message) {
            // NOTE this is where we'd handle commands from the client
            console.log('received: %s', message);

            // NOTE you'll receive this change from the world
            // state so you don't need to send it directly
            // to the client
            // worldState.mutateWorldState(stateChange);
        },
        sendState: function(ts, obj) {
            this.send({
                type: "state",
                timestamp: ts,
                state: obj
            });
        },
        send: function(obj) {
            console.log(obj);

            if (this.ws.readyState === WebSocket.OPEN) {
                this.ws.send(JSON.stringify(obj));
            } else {
                console.log("failed to send message, websocket closed or closing");
            }
        },
        sendWorldState: function() {
            // TODO the worldstate itself should have a better sense of time
            var ts = worldState.currentTick();
            var state = worldState.getWorldState();

            for (var key in state) {
                var obj = state[key];
                this.sendState(ts, {
                    key: key,
                    previous: 0,
                    version: obj.rev,
                    values: obj.values
                });
            }
        },
        onWorldStateChange: function(ts, key, oldRev, newRev, patch) {
            this.sendState(ts, {
                key: key,
                previous: oldRev,
                version: newRev,
                values: patch
            });
        },

        // this is called on every tick
        worldTick: function(tickMs) {

        }
    };

})();
