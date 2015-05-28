'use strict';

var EventEmitter = require('events').EventEmitter,
    extend = require('extend'),
    util = require('util'),
    uriUtils = require('url'),
    WebSocket = require('ws'),
    worldState = require('../world_state.js'),
    dispatcher = require('../commands/dispatcher.js'),
    Visibility = require('./visibility.js'),
    Q = require('q'),
    C = require('spacebox-common')

var WSController = module.exports = function(ws) {
    this.ws = ws
    this.auth = ws.upgradeReq.authentication
    this.onConnectionOpen()
}

util.inherits(WSController, EventEmitter)

extend(WSController.prototype, {
    constructor: WSController,
    setupConnectionCallbacks: function() {
        this.ws.on('message', this.onWSMessageReceived.bind(this))
        this.ws.on('close', this.onConnectionClosed.bind(this))
    },
    onConnectionOpen: function() {
        this.visibility = new Visibility(this.auth)

        this.setupConnectionCallbacks()
        console.log("connected")

        // We listen for updates so that we don't
        // miss any updates while we fetch the
        // full state.
        // TODO updates need to be queued so they
        // are only sent after the full state is sent
        worldState.addListener(this)

        this.sendWorldState().then(function() {
            this.send({
                type: 'connectionReady'
            })
        }.bind(this)).done()
    },
    onConnectionClosed: function() {
        worldState.removeListener(this)

        console.log('disconnected')
    },
    onWSMessageReceived: function(message) {
        try {
            if (this.auth.account !== undefined) {
                var parsed = JSON.parse(message)
                dispatcher.dispatch(parsed, this)
            } else {
                console.log("ignoring command on unauthenticated socket")
            }
        } catch (e) {
            console.log('error handling command', e, e.stack)
        }
    },
    sendState: function(ts, key, patch) {
        var values = this.visibility.rewriteProperties(key, patch)

        if (values.length === 0)
            return

        this.send({
            type: "state",
            timestamp: ts,
            state: values
        })
    },
    send: function(obj) {
        if (this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(obj))
        } else {
            console.log("failed to send message, websocket closed or closing")
        }
    },
    sendWorldState: function() {
        // TODO the worldstate itself should have a better sense of time
        var ts = worldState.currentTick()

        return this.visibility.loadInitialWorldState(function(key) {
            this.sendState(ts, key, {})
        }.bind(this))
    },
    onWorldStateChange: function(ts, key, oldRev, newRev, patch) {
        this.sendState(ts, key, patch)
    }
})
