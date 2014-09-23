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

function buildShip(account, fn) {
    function randomAxis() {
        return ((10 * Math.random()) - 5);
    }

    return getBlueprints().then(function(blueprints) {
        var blueprint = blueprints["6e573ecc-557b-4e05-9f3b-511b2611c474"];
        var ship = deepMerge(blueprint, {
            account: account,
            health_pct: 100,
            effects: {},

            position: {
                x: randomAxis(),
                y: randomAxis(),
                z: randomAxis(),
            },
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
        });

        ship.health = ship.maxHealth;

        ship.subsystems.forEach(function(s) {
            ship[s].state = "none";
        });

        if (fn !== undefined) {
            fn(ship);
        }

        console.log("Adding a ship for account " + account);
        return worldState.addObject(ship);
    });
}

// command == align
module.exports = function(msg, h) {
    buildShip(h.auth.account);
};
