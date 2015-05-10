'use strict';

var EventEmitter = require('events').EventEmitter,
    extend = require('extend'),
    util = require('util'),
    WebSocket = require('ws'),
    worldState = require('./world_state.js'),
    dispatcher = require('./commands/dispatcher.js'),
    Q = require('q'),
    C = require('spacebox-common')

var WSController = module.exports = function(ws) {
    this.ws = ws
    this.visibilityKeys = []
    this.privilegedKeys = []

    this.auth = ws.upgradeReq.authentication

    var self = this
    Q.fcall(function() {
        if (ws.upgradeReq.url == '/arena') {
            return self.getArenaToken().then(function() {
                self.send({
                    type: "arenaAccount",
                    account: self.auth
                })
            })
        }
    }).then(self.onConnectionOpen.bind(self))
}

util.inherits(WSController, EventEmitter)

extend(WSController.prototype, {
    constructor: WSController,
    setupConnectionCallbacks: function() {
        this.ws.on('message', this.onWSMessageReceived.bind(this))
        this.ws.on('close', this.onConnectionClosed.bind(this))
    },
    getArenaToken: function() {
        // TODO drop the connection when the arena account expires
        var self = this
        return C.request('auth', 'POST', 200, '/accounts/temporary', {
            ttl: 300, // 5min
        }, {
            sudo_account: self.auth.account,
        }).then(function(resp) {
            self.auth = resp
        }).fail(function(e) {
            throw new Error("not authorized")
        })
    },
    onConnectionOpen: function() {
        this.setupConnectionCallbacks()
        console.log("connected")

        // We listen for updates so that we don't
        // miss any updates while we fetch the
        // full state.
        worldState.addListener(this)
        this.sendWorldState()

        this.send({type:'connectionReady'})
    },
    onConnectionClosed: function() {
        worldState.removeListener(this)

        console.log('disconnected')
    },
    onWSMessageReceived: function(message) {
        var request_id

        try {
            if (this.auth.account !== undefined) {
                var parsed = JSON.parse(message)
                request_id = parsed.request_id

                dispatcher.dispatch(parsed, this)
            } else {
                console.log("ignoring command on unauthenticated socket")
            }
        } catch(e) {
            console.log('error handling command', e, e.stack)

            var details

            if (e.stack !== undefined) {
                details = e.stack.toString()
            }

            this.send({
                type: 'error',
                request_id: request_id,
                message: e.toString(),
                details: details
            })
        }
    },
    sendState: function(ts, key, values) {
        var i = this.visibilityKeys.indexOf(key)

        if (!this.checkVisibility(key, values.tombstone))
            return

        var safeValues
        if (this.checkPrivilege(key, values)) {
            safeValues = values
        } else {
            safeValues = this.sanitizeState(values)
        }

        // TODO don't send the message if the safeValues are empty

        this.send({
            type: "state",
            timestamp: ts,
            state: {
                key: key,
                values: safeValues
            }
        })
    },
    send: function(obj) {
        if (this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(obj))
        } else {
            console.log("failed to send message, websocket closed or closing")
        }
    },
    checkVisibility: function(key, tombstone) {
        // it's an optimization to only look this up once
        var i = this.visibilityKeys.indexOf(key)

        if (tombstone) {
            if (i > -1) {
                this.visibilityKeys.splice(i, 1)
                return true
            } else {
                return false
            }
        } else {
            if (i == -1) {
                this.visibilityKeys.push(key)
            }

            // show everybody everything for now
            return true
        }
    },
    checkPrivilege: function(key, values) {
        if (this.auth.privileged) return true

        var i = this.privilegedKeys.indexOf(key)

        if (values.tombstone) {
            if (i > -1) {
                this.privilegedKeys.splice(i, 1)
            }
        }

       if (i > -1) {
           return true
       } else if (values.account !== undefined && values.account == this.auth.account) {
           this.privilegedKeys.push(key)
       } else {
           return false
       }
    },
    sanitizeState: function(values) {
        // TODO I'd like health to be reported as health_pct, but I'd need access to the full object.
        var safeAttrs = ['type', 'position', 'velocity', 'facing', 'tombstone', 'account', 'model_name', 'model_scale', 'health']
        var safeValues = {}

        safeAttrs.forEach(function(name) {
            if (values.hasOwnProperty(name)) {
                safeValues[name] = values[name]
            }
        }, this)

        // We map effects into the root namespace for simplicity
        // on the clientside
        if (values.hasOwnProperty("effects")) {
            Object.keys(values.effects).forEach(function(n) {
                safeValues[n] = values.effects[n]
            })
        }

        this.emit('sanitizeClientValues', values, safeValues)

        return safeValues
    },
    sendWorldState: function() {
        // TODO the worldstate itself should have a better sense of time
        var ts = worldState.currentTick()

        worldState.scanDistanceFrom(undefined).forEach(function(obj) {
            this.sendState(ts, obj.key, obj.values)
        }, this)
    },
    onWorldStateChange: function(ts, key, oldRev, newRev, patch) {
        this.sendState(ts, key, patch)
    }
})

