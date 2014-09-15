'use strict';

var WebSockets = require("ws");
var http = require("http");
var express = require("express");
var logger = require('morgan');
var bodyParser = require('body-parser');
var uuidGen = require('node-uuid');

var app = express();
var port = process.env.PORT || 5000;

app.use(logger('dev'));
app.use(express.static(__dirname + "/../public"));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({
    extended: false
}));

var server = http.createServer(app);
server.listen(port);

var WebSocketServer = WebSockets.Server,
    wss = new WebSocketServer({
        server: server
    });

require("./world_tickers/load_all.js");

var worldState = require('./world_state.js');
worldState.runWorldTicker();

// TODO this doesn't even belong in this app
var debug = require('debug')('spodb');
app.get('/spodb', function(req, res) {
    var hash = {},
        list = worldState.scanDistanceFrom();
    list.forEach(function(item) {
        hash[item.key] = item;
    });

    res.send(hash);
});

app.post('/spodb', function(req, res) {
    var key = worldState.addObject(req.body);
    res.send(key);
});

app.post('/spodb/:uuid', function(req, res) {
    worldState.mutateWorldState(req.param('uuid'), parseInt(req.param('rev')), req.body, true);
    res.sendStatus(204);
});
// TODO end spodb

var Handler = require('./handler.js');
wss.on('connection', function(ws) {
    var handler = new Handler(ws);
});

console.log("server ready");
