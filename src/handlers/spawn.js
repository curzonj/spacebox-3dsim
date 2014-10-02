'use strict';

var Q = require('q');
var qhttp = require("q-io/http");
var uuidGen = require('node-uuid');

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
            account = msg.account || h.auth.account;
        } else {
            account = h.auth.account;
        }

        var position = {},
            axis = ['x', 'y', 'z'];
        axis.forEach(function(a) {
            position[a] = parseInt(msg.position[a]);
        });

        var obj = deepMerge(blueprint, {
            blueprint: blueprint.uuid,
            account: account,
            health_pct: 100,
            effects: {},
            position: position
        });

        // This is a byproduct of the blueprint tracking itself
        delete obj.uuid;

        obj.health = obj.maxHealth;

        if (fn !== undefined) {
            // TODO error handling
            fn(obj);
        }

        var uuid = worldState.addObject(obj);
        console.log("build a %s as %s", msg.blueprint, uuid);

        return [ uuid, blueprint ];
    }).spread(function(uuid, blueprint) {
        var obj = worldState.get(uuid);
        var transaction = [{
            container_action: "create",
            uuid: uuid,
            blueprint: blueprint.uuid
        }];

        // TODO what happens if we fail to inform build and inventory,
        // how we converge them?
        return updateInventory(h.auth.account, transaction).then(function() {
            if (blueprint.production !== undefined) {
                return updateFacility(uuid, blueprint.uuid, h.auth.account);
            }
        }).then(function() {
            return uuid;
        });
    });

}

function spawnShip(msg, h) {
    return spawnThing(msg, h, function(ship) {
        if (ship.type != 'spaceship') {
            throw new Error("not a spaceship: " + ship.blueprint);
        }

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
    });
}

function updateInventory(account, data) {
    /* data = [{
        inventory: uuid,
        slice: slice,
        blueprint: type,
        quantity: quantity
    }]
    */
    return getAuthToken().then(function(token) {
        return qhttp.request({
            method: "POST",
            url: process.env.INVENTORY_URL + '/inventory',
            headers: {
                "Authorization": "Bearer " + token + '/' + account,
                "Content-Type": "application/json"
            },
            body: [JSON.stringify(data)]
        }).then(function(resp) {
            if (resp.status !== 204) {
                resp.body.read().then(function(b) {
                    console.log("inventory " + resp.status + " reason: " + b.toString());
                }).done();

                throw new Error("inventory responded with " + resp.status);
            }
        });
    });
}

function updateFacility(uuid, blueprint, account) {
    return getAuthToken().then(function(token) {
        return qhttp.request({
            method: "POST",
            url: process.env.BUILD_URL + '/facilities/' + uuid,
            headers: {
                "Authorization": "Bearer " + token + '/' + account,
                "Content-Type": "application/json"
            },
            body: [JSON.stringify({
                blueprint: blueprint
            })]
        }).then(function(resp) {
            if (resp.status !== 201) {
                resp.body.read().then(function(b) {
                    console.log("build " + resp.status + " reason: " + b.toString());
                }).done();

                throw new Error("inventory responded with " + resp.status);
            }
        });
    });
}

var loadout = {
    blueprint: "7abb04d3-7d58-42d8-be93-89eb486a1c67",
    contents: {
        "f9e7e6b4-d5dc-4136-a445-d3adffc23bc6": 35
    }
};
var loadout_accounting = {};

module.exports = {
    'spawn': function(msg, h) {
        spawnShip(msg, h).done();
    },
    'spawnStarter': function(msg, h) {
        if (loadout_accounting[h.auth.account]) {
            // TODO error handling
            return;
        }

        spawnShip({
            blueprint: loadout.blueprint,
            // TODO copy the position of the spawnpoint
            position: {
                x: 0,
                y: 0,
                z: 0
            }
        }, h).then(function(uuid) {
            var list = [];

            for (var type in loadout.contents) {
                list.push({
                    inventory: uuid,
                    slice: "default",
                    blueprint: type,
                    quantity: loadout.contents[type]
                });
            }

            return updateInventory(h.auth.account, list).then(function() {
                // FIXME This could fail in soooo many partial ways
                loadout_accounting[h.auth.account] = true;
            });
        }).done();
    },
    'deploy': function(msg, h) {
        // msg = { 
        // shipID,
        // slice,
        // blueprint
        // }
        //
        var transaction = [{
            inventory: msg.shipID,
            slice: msg.slice,
            blueprint: msg.blueprint,
            quantity: 1
        }, {
            container_action: 'create',
            uuid: uuidGen.v1(),
            blueprint: msg.blueprint
        }];

        getAuthToken().then(function(token) {
            return qhttp.request({
                method: "POST",
                url: process.env.INVENTORY_URL + '/inventory',
                headers: {
                    "Authorization": "Bearer " + token + '/' + h.auth.account,
                    "Content-Type": "application/json"
                },
                body: [JSON.stringify(transaction)]
            }).then(function(resp) {
                if (resp.status !== 204) {
                    resp.body.read().then(function(b) {
                        console.log("inventory " + resp.status + " reason: " + b.toString());
                    }).done();

                    throw new Error("inventory responded with " + resp.status);
                }
            });
        }).then(function() {
            return spawnThing({
                blueprint: msg.blueprint,
                // TODO copy the position of the ship
                position: {
                    x: 0,
                    y: 0,
                    z: 0
                }
            }, h);
        }).done();
    },
    'spawnStructure': function(msg, h) {
        spawnThing(msg, h).done();
    }
};
