'use strict';

var Q = require('q');
var qhttp = require("q-io/http");
var uuidGen = require('node-uuid');
var C = require('spacebox-common');

Q.longStackSupport = true;

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

function spawnThing(msg, h, fn) {
    return getBlueprints().then(function(blueprints) {
        var account, blueprint = blueprints[msg.blueprint];

        if (blueprint === undefined) {
            throw new Error("no such blueprint: "+msg.blueprint)
        }

        if (h.auth.privileged) {
            account = msg.account || h.auth.account;
        } else {
            account = h.auth.account;
        }

        var position = {},
            axis = ['x', 'y', 'z'];

        axis.forEach(function(a) {
            if (typeof msg.position != 'object') {
                position[a] = 0;
            } else {
                position[a] = parseInt(msg.position[a]);
            }
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

        return worldState.addObject(obj).then(function(uuid) {
            console.log("build a %s as %s", msg.blueprint, uuid);

            return [ uuid, blueprint ];
        });
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
    return C.request('inventory', 'POST', 204, '/inventory', data, {
        sudo_account: account
    });
}

function updateFacility(uuid, blueprint, account) {
    return C.request('build', 'POST', 201, '/facilities/'+uuid, {
        blueprint: blueprint
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
        spawnShip(msg, h).fail(function(e) {
            console.log(e);
            console.log(e.stack);
        }).done();
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
                x: 1,
                y: 1,
                z: 1
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
        }).fail(function(e) {
            console.log(e.stack);
        }).done();
    },
    'undock': function(msg, h) {
        console.log("got the message");
        C.request('inventory', 'POST', 200, '/ships/'+msg.ship_uuid, {
            in_space: true
        }, {
            sudo_account: h.auth.account
        }).then(function(ship) {
            console.log('spawning ship');
            return spawnShip({
                blueprint: ship.blueprint,
                // TODO spawn it at the location it undocked from
                position: {
                    x: 1,
                    y: 1,
                    z: 1
                }
            }, h);
        }).fail(function(e) {
            console.log(e.stack);
        }).done();
    },
    'deploy': function(msg, h) {
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

        updateInventory(h.auth.account, transaction).then(function() {
            return spawnThing({
                blueprint: msg.blueprint,
                // TODO copy the position of the ship
                position: {
                    x: 0,
                    y: 0,
                    z: 0
                }
            }, h);
        }).fail(function(e) {
            console.log(e.stack);
        }).done();
    },
    'spawnStructure': function(msg, h) {
        spawnThing(msg, h).fail(function(e) {
            console.log(e.stack);
        }).done();
    }
};
