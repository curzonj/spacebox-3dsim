(function() {
    'use strict';

    var WebSocketServer = require('ws').Server,
        wss = new WebSocketServer({
            port: 8080
        });

    var connections = [];

    console.log("connection opened");

    function wsend(ws, obj) {
        ws.send(JSON.stringify(obj));
    }

    wss.on('connection', function(ws) {
        ws.on('message', function(message) {
            console.log('received: %s', message);
        });

        ws.on('close', function() {
            // TODO this is is a race condition
            var index = connections.indexOf(ws);
            connections.splice(index, 1);

            console.log('disconnected');
        });

        wsend(ws, {
            command: "addSpaceship",
            id: 1,
            position: { x: 2, y: 2, z: 2 }
        });

        wsend(ws, {
            command: "addSpaceship",
            id: 2,
            position: { x: -2, y: -2, z: -2 }
        });

        connections.push(ws);

        setTimeout(function() {
            wsend(ws, {
                command: "shootSpaceship"
            });
        }, 5000);
    });

    setInterval(function() {
        connections.forEach(function(ws) {
            var ms = new Date().getTime();
            wsend(ws, { command: "wobble", timestamp: ms });
        });
    }, 50);
})();
