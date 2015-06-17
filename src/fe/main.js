'use strict';

var Q = require('q')
var WebSockets = require("ws")
var http = require("http")
var express = require("express")
var bodyParser = require('body-parser')
var uriUtils = require('url')
var WTF = require('wtf-shim')
var C = require('spacebox-common')
var config = require('./config')
var ctx = config.ctx
var worldState = config.state

Q.longStackSupport = true

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
        new Controller(ws, ctx)
    })

    console.log('server ready')
})

worldState.subscribe()
