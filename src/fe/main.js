'use strict';

var Q = require('q'),
    WebSockets = require("ws"),
    http = require("http"),
    express = require("express"),
    bodyParser = require('body-parser'),
    uriUtils = require('url'),
    WTF = require('wtf-shim'),
    C = require('spacebox-common')

Q.longStackSupport = true

C.logging.configure('firehose')
C.configure({
    AUTH_URL: process.env.AUTH_URL,
    credentials: process.env.INTERNAL_CREDS,
})

var worldState = require('spacebox-common-native/src/redis-state')

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

var Controller = require('./ws.js')

WTF.trace.node.start({ })

worldState.events.once('worldloaded', function() {
    server.listen(port)
    wss.on('connection', function(ws) {
        new Controller(ws)
    })

    console.log('server ready')
})

worldState.subscribe()
