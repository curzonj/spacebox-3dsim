'use strict';

var EventEmitter = require('events').EventEmitter;
var extend = require('extend');
var util = require('util');
var WebSocket = require('ws');
var worldState = require('./world_state.js');
var multiuser = require('./multiuser.js');
var dispatcher = require('./handlers/dispatcher.js');
var Q = require('q');
var qhttp = require("q-io/http");

var auth_token;
function getAuthToken() {
    return Q.fcall(function() {
        var now = new Date().getTime();

        if (auth_token !== undefined && auth_token.expires > now) {
            return auth_token.token;
        } else {
            return qhttp.read({
                url: process.env.AUTH_URL + '/auth?ttl=3600',
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": 'Basic ' + new Buffer(process.env.INTERNAL_CREDS).toString('base64')
                }
            }).then(function(b) {
                auth_token = JSON.parse(b.toString());
                return auth_token.token;
            });
        }
    });
}

var Handler = module.exports = function(ws) {
    this.ws = ws;

    this.auth = ws.upgradeReq.authentication;

    var self = this;
    self.getArenaToken().then(function() {
        self.setupConnectionCallbacks();

        self.send({
            type: "arenaAccount",
            account: self.auth
        });

        // TODO the flow of this should be reworked
        self.onConnectionOpen();
    });
};

util.inherits(Handler, EventEmitter);

extend(Handler.prototype, {
    constructor: Handler,
    setupConnectionCallbacks: function() {
        this.ws.on('message', this.onWSMessageReceived.bind(this));
        this.ws.on('close', this.onConnectionClosed.bind(this));
    },
    getArenaToken: function() {
        // NOTE this is basically the pattern for the arena handler
        var self = this;
        return getAuthToken().then(function(token) {
            // This will fail if it's not authorized
            return qhttp.read({
                method: "POST",
                url: process.env.AUTH_URL + '/accounts/temporary',
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": 'Bearer ' + token
                },
                body: [JSON.stringify({
                    parent: self.auth.account,
                    ttl: 300, // 5min
                })]
            }).then(function(body) {
                self.auth = JSON.parse(body.toString());
            }).fail(function(e) {
                throw new Error("not authorized");
            });
        });
    },
    onConnectionOpen: function() {
        console.log("connected");

        // We listen for updates so that we don't
        // miss any updates while we fetch the
        // full state.
        worldState.addListener(this);
        this.sendWorldState();
    
        // This is not really true
        multiuser.onClientJoined(this);
    },
    onConnectionClosed: function() {
        worldState.removeListener(this);

        console.log('disconnected');
    },
    onWSMessageReceived: function(message) {
        try {
            dispatcher.dispatch(JSON.parse(message), this);
        } catch(e) {
            // TODO send an error back to the client
            console.log(e);
        }
    },
    sendState: function(ts, key, oldRev, newRev, values) {
        var safeValues = this.sanitizeState(values);

        // Currently we have to send the messages even if
        // nothing public was changed or the revisions
        // get messed up

        this.send({
            type: "state",
            timestamp: ts,
            state: {
                key: key,
                previous: oldRev,
                version: newRev,
                values: safeValues
            }
        });
    },
    send: function(obj) {
        if (this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(obj));
        } else {
            console.log("failed to send message, websocket closed or closing");
        }
    },
    sanitizeState: function(values) {
        // TODO allow the client access to it's own subsystems
        var safeAttrs = ['type', 'position', 'velocity', 'facing', 'tombstone', 'health_pct', 'account'];
        var safeValues = {};

        safeAttrs.forEach(function(name) {
            if (values.hasOwnProperty(name)) {
                safeValues[name] = values[name];
            }
        }, this);

        // We map effects into the root namespace for simplicity
        // on the clientside
        if (values.hasOwnProperty("effects")) {
            Object.keys(values.effects).forEach(function(n) {
                safeValues[n] = values.effects[n];
            });
        }

        this.emit('sanitizeClientValues', values, safeValues);

        return safeValues;
    },
    sendWorldState: function() {
        // TODO the worldstate itself should have a better sense of time
        var ts = worldState.currentTick();

        worldState.scanDistanceFrom(undefined).forEach(function(obj) {
            this.sendState(ts, obj.key, 0, obj.rev, obj.values);
        }, this);
    },
    onWorldStateChange: function(ts, key, oldRev, newRev, patch) {
        this.sendState(ts, key, oldRev, newRev, patch);
    },

    // this is called on every tick
    worldTick: function(tickMs) {

    }
});

