(function() {
    'use strict';

    var WebSocketServer = require('ws').Server,
        wss = new WebSocketServer({
            port: 8080
        });

    require("./world_tickers/load_all.js");

    var worldState = require('./world_state.js');
    worldState.runWorldTicker();

    var Handler = require('./handler.js');
    wss.on('connection', function(ws) {
        var handler = new Handler(ws);
    });

    console.log("server ready");
})();
