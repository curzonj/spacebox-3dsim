'use strict';

var EventEmitter = require('events').EventEmitter,
    extend = require('extend'),
    util = require('util'),
    uriUtils = require('url'),
    WebSocket = require('ws'),
    worldState = require('spacebox-common-native/lib/redis-state'),
    dispatcher = require('./commands'),
    Visibility = require('./visibility.js'),
    WTF = require('wtf-shim'),
    Q = require('q'),
    C = require('spacebox-common')

var ctx = C.logging.create()
var WSController = module.exports = function(ws) {
    this.ws = ws
    this.auth = ws.upgradeReq.authentication
    this.ctx = ctx.child()

    try {
        this.onConnectionOpen()
    } catch (e) {
        this.ctx.error({err: e}, 'fatal error setting up connection')
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
        this.ctx.info({ account: this.auth.account }, "ws.connected")

        this.visibility = new Visibility(this.auth, this.ctx)

        // We listen for updates so that we don't
        // miss any updates while we fetch the
        // full state.
        // TODO updates need to be queued so they
        // are only sent after the full state is sent
        worldState.addListener(this)

        this.sendWorldState()
        this.send({
            type: 'connectionReady'
        })
        this.ctx.debug('world state sync complete')
    },
    onConnectionClosed: function() {
        worldState.removeListener(this)

        this.ctx.info('disconnected')
    },
    onWSMessageReceived: function(message) {
        try {
            if (this.auth.account !== undefined) {
                var parsed = JSON.parse(message)
                dispatcher.dispatch(parsed, this)
            } else {
                this.ctx.warn("ignoring command on unauthenticated socket")
            }
        } catch (e) {
            this.ctx.error({ err: e, command: message }, 'fatal error handling command')
        }
    },
    sendState: WTF.trace.instrument(function(ts, key, patch) {
        var values = this.visibility.rewriteProperties(key, patch)
        if (values.length === 0)
            return

        //console.log('sendState.values', values)

        this.send({
            type: "state",
            timestamp: ts,
            state: values
        })
    }, 'Controller#sendState'),
    send: function(obj) {
        this.ctx.trace({ send: obj, account: this.auth.account }, 'ws.send')
        if (this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(obj))
        } else {
            this.ctx.error({ state: this.ws.readyState }, "failed to send message, websocket closed or closing")
        }
    },
    sendWorldState: function() {
        this.ctx.debug('sending world state')
            // TODO the worldstate itself should have a better sense of time
        var ts = worldState.currentTick()

        this.visibility.loadInitialWorldState(function(obj) {
            this.sendState(ts, obj.uuid, obj)
        }.bind(this))
    },
    onWorldStateChange: function(ts, key, patch) {
        //console.log(key, patch)
        this.sendState(ts, key, patch)
    },
    onWorldTick: WTF.trace.instrument(function(msg) {
        var self = this,
            currentTick = msg.ts

        Object.keys(msg.changes).forEach(function(uuid) {
            try {
                self.onWorldStateChange(currentTick, uuid, msg.changes[uuid])
            } catch (e) {
                console.log("onWorldStateChange failed", uuid, msg.changes[uuid], e, e.stack)
                process.exit()
            }
        })
    }, 'Controller#onWorldTick')
})
