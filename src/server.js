(function() {
    'use strict';

    var WebSockets = require("ws");
    var http = require("http");
    var express = require("express");
    var app = express();
    var port = process.env.PORT || 5000;

    app.use(express.static(__dirname + "/../public"));

    var server = http.createServer(app);
    server.listen(port);

    var WebSocketServer = WebSockets.Server,
        wss = new WebSocketServer({server: server});

    require("./world_tickers/load_all.js");

    var worldState = require('./world_state.js');
    worldState.runWorldTicker();

    var Handler = require('./handler.js');
    wss.on('connection', function(ws) {
        var handler = new Handler(ws);
    });

    console.log("server ready");
})();
