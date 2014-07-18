(function() {
    'use strict';

    var WebSocketServer = require('ws').Server,
        wss = new WebSocketServer({
            port: 8080
        });

    var Handler = require('./handler.js');
    var handlerList = [];

    wss.on('connection', function(ws) {
        var handler = new Handler(ws);
        handlerList.push(handler);

        setTimeout(function() {
            handler.send({
                command: "shootSpaceship"
            });
        }, 5000);
    });

    setInterval(function() {
        handlerList.forEach(function(h) {
            var ms = new Date().getTime();
            h.onWorldStateChange(ms);
        });
    }, 80);

    console.log("server ready");
})();
