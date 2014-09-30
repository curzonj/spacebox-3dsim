'use strict';

var Q = require('q');
var qhttp = require("q-io/http");

var deepMerge = require('../deepMerge.js'),
    worldState = require('../world_state.js'),
    worldAssets = require('../world_assets.js');

var blueprintsCache;

function getBlueprints() {
    if (blueprintsCache !== undefined) {
        return Q.fcall(function() {
            return blueprintsCache;
        });
    } else {
        return qhttp.read(process.env.TECHDB_URL + '/blueprints').then(function(b) {
            blueprintsCache = JSON.parse(b.toString());

            return getBlueprints();
        });
    }
}

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

function spawnThing(msg, h, fn) {
    return getBlueprints().then(function(blueprints) {
        var account, blueprint = blueprints[msg.blueprint];

        if (blueprint === undefined) {
            // TODO send an error
            return;
        }

        if (typeof msg.position != 'object') {
            // TODO send an error
            return;
        }

        if (h.auth.privileged) {
            if (msg.account === undefined) {
                // TODO send an error
                return;
            }

            account = msg.account;
        } else if (msg.account !== undefined) {
            // TODO send an error
        } else {
            account = h.auth.account;
        }

        var position = {},
            axis = ['x', 'y', 'z'];
        axis.forEach(function(a) {
            position[a] = parseInt(msg.position[a]);
        });

        var obj = deepMerge(blueprint, {
            account: account,
            health_pct: 100,
            effects: {},
            position: position
        });

        obj.health = obj.maxHealth;

        if (fn !== undefined) {
            // TODO error handling
            fn(obj);
        }

        var uuid = worldState.addObject(obj);
        console.log("build a %s as %s", msg.blueprint, uuid);
    });

}

module.exports = {
    'spawn': function(msg, h) {
        spawnThing(msg, h, function(ship) {
            deepMerge({
                velocity: {
                    x: 0,
                    y: 0,
                    z: 0
                },
                facing: {
                    x: 0,
                    y: 0,
                    z: 0,
                    w: 1
                }
            }, ship);

            ship.subsystems.forEach(function(s) {
                ship[s].state = "none";
            });
        }).done();
    },
    'spawnStructure': function(msg, h) {
        spawnThing(msg, h).done();
    }
};
