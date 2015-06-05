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
    try {
        this.onConnectionOpen()
    } catch(e) {
        console.log('fatal error setting up connection')
        console.log(e.stack)
        ws.close()
    }
}

util.inherits(WSController, EventEmitter)

extend(WSController.prototype, {
    constructor: WSController,
    setupConnectionCallbacks: function() {
        this.ws.on('message', this.onWSMessageReceived.bind(this))
        this.ws.on('close', this.onConnectionClosed.bind(this))
    },
    onConnectionOpen: function() {
        this.setupConnectionCallbacks()
        console.log("connected "+this.auth.account)

        this.visibility = new Visibility(this.auth)

        // We listen for updates so that we don't
        // miss any updates while we fetch the
        // full state.
        // TODO updates need to be queued so they
        // are only sent after the full state is sent
        worldState.addListener(this)

        this.sendWorldState()
        this.send({ type: 'connectionReady' })
        console.log('world state sync complete')
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
        console.log('sending world state')
        // TODO the worldstate itself should have a better sense of time
        var ts = worldState.currentTick()

        this.visibility.loadInitialWorldState(function(obj) {
            this.sendState(ts, obj.uuid, obj)
        }.bind(this))
    },
    onWorldStateChange: function(ts, key, patch) {
        this.sendState(ts, key, patch)
    }
})
