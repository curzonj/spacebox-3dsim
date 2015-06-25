'use strict';

var EventEmitter = require('events').EventEmitter
var extend = require('extend')
var util = require('util')
var uriUtils = require('url')
var WebSocket = require('ws')
var dispatcher = require('./commands')
var Visibility = require('./visibility.js')
var WTF = require('wtf-shim')
var Q = require('q')
var C = require('spacebox-common')
var config = require('./config')
var worldState = config.state

var WSController = module.exports = function(ws, ctx) {
    this.ws = ws
    this.auth = ws.upgradeReq.authentication
    this.ctx = ctx

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
        this.ctx.info({ agent_id: this.auth.agent_id }, "ws.connected")

        this.visibility = new Visibility(this.auth, this.ctx)

        if (!worldState.loaded()) {
            this.ctx.error("world state not loaded from redis")
            this.ws.close()
        }

        this.setupConnectionCallbacks()

        // Because node is single threaded, and we don't
        // do anything async in here, no changes will be
        // processed until we finish sending the worldState
        this.onWorldTickBound = this.onWorldTick.bind(this)
        worldState.events.on('worldtick', this.onWorldTickBound)

        this.onWorldResetBound = this.onWorldReset.bind(this)
        worldState.events.on('worldreset', this.onWorldResetBound)

        this.syncInitialWorldState()

        this.send({
            type: 'connectionReady'
        })
        this.ctx.debug('world state sync complete')
    },
    onConnectionClosed: function() {
        worldState.events.removeListener('worldtick', this.onWorldTickBound)
        worldState.events.removeListener('worldreset', this.onWorldResetBound)

        this.ctx.info('disconnected')
    },
    onWSMessageReceived: function(message) {
        try {
            if (this.auth.agent_id !== undefined) {
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
        this.ctx.trace({ send: obj, agent_id: this.auth.agent_id }, 'ws.send')
        if (this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(obj))
        } else {
            this.ctx.error({ state: this.ws.readyState }, "failed to send message, websocket closed or closing")
        }
    },
    syncInitialWorldState: WTF.trace.instrument(function() {
        this.ctx.debug('sending world state')
        this.visibility.loadInitialWorldState(function(ts, obj) {
            this.sendState(ts, obj.uuid, obj)
        }.bind(this))
    }, 'Controller#syncInitialWorldState'),
    onWorldReset: function() {
        this.ctx.warn("lost connection to redis, closing")
        this.ws.close()
    },
    onWorldTick: WTF.trace.instrument(function(msg) {
        var self = this,
            currentTick = msg.ts

        Object.keys(msg.changes).forEach(function(uuid) {
            try {
                self.sendState(currentTick, uuid, msg.changes[uuid])
            } catch (e) {
                self.ctx.error({ err: e, uuid: uuid, changes: msg.changes[uuid] }, 'onWorldStateChange failed')
                if (process.env.PEXIT_ON_TOUGH_ERROR == '1')
                    process.nextTick(function() {
                        console.log("exiting for debugging per ENV['PEXIT_ON_TOUGH_ERROR']")
                        process.exit()
                    })
            }
        })
    }, 'Controller#onWorldTick')
})
