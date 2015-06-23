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
var buildRedis = require('spacebox-common-native').buildRedis

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

var listeners = []

worldState.events.once('worldloaded', function() {
    server.listen(port)
    wss.on('connection', function(ws) {
        listeners.push(ws)

        new Controller(ws, ctx)

        ws.on('close', function() {
            var i = listeners.indexOf(ws)
            if (i > -1) {
                listeners.splice(i, 1)
            }
        })
    })

    console.log('server ready')
})

worldState.subscribe();

(function() {
    var redis = buildRedis(ctx)

    redis.on('message', function(_, data) {
        try {
            var message = JSON.parse(data)

            ctx.trace({
                message: message,
                agent_ids: listeners.map(function(ws) {
                    return ws.upgradeReq.authentication.agent_id
                })
            }, 'received tech message')

            listeners.forEach(function(ws) {
                var agent_id = ws.upgradeReq.authentication.agent_id

                ctx.trace({
                    agent_id: agent_id,
                    message: message
                }, 'publishing')

                if (ws.readyState == WebSockets.OPEN && message.agent_id == agent_id) {
                    ws.send(JSON.stringify(message))
                }
            })
        } catch(e) {
            ctx.error({ err: e, data: data }, 'failure processing tech message')
        }
    })

    redis.on('ready', function() {
        redis.subscribe('techmessages')
    })
})()
