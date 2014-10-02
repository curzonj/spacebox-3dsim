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
    this.visibilityKeys = [];
    this.privilegedKeys = [];

    this.auth = ws.upgradeReq.authentication;

    var self = this;
    Q.fcall(function() {
        if (ws.upgradeReq.url == '/arena') {
            return self.getArenaToken().then(function() {
                self.send({
                    type: "arenaAccount",
                    account: self.auth
                });
            });
        }
    }).then(self.onConnectionOpen.bind(self));
};

util.inherits(Handler, EventEmitter);

extend(Handler.prototype, {
    constructor: Handler,
    setupConnectionCallbacks: function() {
        this.ws.on('message', this.onWSMessageReceived.bind(this));
        this.ws.on('close', this.onConnectionClosed.bind(this));
    },
    getArenaToken: function() {
        // TODO drop the connection when the arena account expires
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
        this.setupConnectionCallbacks();
        console.log("connected");

        // We listen for updates so that we don't
        // miss any updates while we fetch the
        // full state.
        worldState.addListener(this);
        this.sendWorldState();

        this.send({type:'connectionReady'});
    
        // This is not really true
        multiuser.onClientJoined(this);
    },
    onConnectionClosed: function() {
        worldState.removeListener(this);

        console.log('disconnected');
    },
    onWSMessageReceived: function(message) {
        try {
            if (this.auth.account !== undefined) {
                dispatcher.dispatch(JSON.parse(message), this);
            }
        } catch(e) {
            // TODO send an error back to the client
            console.log('error handling command', e, e.stack);
        }
    },
    sendState: function(ts, key, oldRev, newRev, values) {
        var i = this.visibilityKeys.indexOf(key);

        if (i == -1) oldRev = 0;
        if (!this.checkVisibility(key, values, i)) return;

        var safeValues;
        if (this.checkPrivilege(key, values)) {
            safeValues = values;
        } else {
            safeValues = this.sanitizeState(values);
        }

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
    checkVisibility: function(key, values, i) {
        if (i === undefined) {
            // it's an optimization to only look this up once
            i = this.visibilityKeys.indexOf(key);
        }

        if (values.tombstone) {
            if (i > -1) {
                this.visibilityKeys.splice(i, 1);
                return true;
            } else {
                return false;
            }
        } else {
            if (i == -1) {
                this.visibilityKeys.push(key);
            }

            // show everybody everything for now
            return true;
        }
    },
    checkPrivilege: function(key, values) {
        if (this.auth.privileged) return true;

        var i = this.privilegedKeys.indexOf(key);

        if (values.tombstone) {
            if (i > -1) {
                this.privilegedKeys.splice(i, 1);
            }
        }

       if (i > -1) {
           return true;
       } else if (values.account !== undefined && values.account == this.auth.account) {
           this.privilegedKeys.push(key);
       } else {
           return false;
       }
    },
    sanitizeState: function(values) {
        var safeAttrs = ['type', 'position', 'velocity', 'facing', 'tombstone', 'health_pct', 'account', 'model_name', 'model_scale'];
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
    }
});

