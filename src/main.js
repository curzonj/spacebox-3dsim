'use strict';

var WebSockets = require("ws"),
    http = require("http"),
    express = require("express"),
    bodyParser = require('body-parser'),
    uriUtils = require('url'),
    worldState = require('spacebox-common-native/lib/redis-state'),
    C = require('spacebox-common')

C.configure({
    AUTH_URL: process.env.AUTH_URL,
    credentials: process.env.INTERNAL_CREDS,
})

var app = express()
var port = process.env.PORT || 5000

C.http.cors_policy(app)
var server = http.createServer(app)

var WebSocketServer = WebSockets.Server,
    wss = new WebSocketServer({
        server: server,
        verifyClient: function(info, callback) {
            var parts = uriUtils.parse(info.req.url, true)
            var token = parts.query.token

            C.http.authorize_token(token).then(function(auth) {
                info.req.authentication = auth
                callback(true)
            }, function(e) {
                callback(false)
            })
        }
    })

var Controller = require('./controller/ws.js')

worldState.loadWorld().then(function() {
    server.listen(port)
    wss.on('connection', function(ws) {
        new Controller(ws)
    })

    console.log('server ready')
})

