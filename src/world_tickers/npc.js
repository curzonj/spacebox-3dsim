'use strict';

var Q = require('q');
var qhttp = require("q-io/http");

var deepMerge = require('../deepMerge.js'),
    worldState = require('../world_state.js'),
    multiuser = require('../multiuser.js');

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

        console.log("Adding a ship for account "+account);
        return worldState.addObject(ship);
    });
}

function setShipTarget(ship1, ship2) {
    worldState.mutateWorldState(ship1.key, ship1.rev, {
        engine: {
            state: "orbit",
            orbitRadius: 1,
            orbitTarget: ship2.key
        }
    });

    setTimeout(function() {
        ship1 = worldState.get(ship1.key);
        worldState.mutateWorldState(ship1.key, ship1.rev, {
            weapon: {
                state: "shoot",
                target: ship2.key
            }
        });
    }, 1000 + (Math.random * 3000));
}

function autoSpawn(accountList) {
    var spaceships = worldState.scanDistanceFrom(undefined, "spaceship");
    var byAccount = mapByAccount(spaceships);

    accountList.forEach(function(account) {
        if (byAccount[account] === undefined) {
            buildShip(account).done();
            buildShip(account).done();

        } else if (byAccount[account].length < 2) {
            buildShip(account).done();
        }
    });
}

function mapByAccount(spaceships) {
    var byAccount = {};

    spaceships.forEach(function(ship) {
        var account = ship.values.account;
        if (byAccount[account] === undefined) {
            byAccount[account] = [];
        }

        byAccount[account].push(ship);
    });

    return byAccount;
}

function autoTargetEnemy() {
    var spaceships = worldState.scanDistanceFrom(undefined, "spaceship");
    var byAccount = mapByAccount(spaceships);

    function getEnemy(account) {
        for (var e in byAccount) {
            if (e !== account) {
                return e;
            }
        }
    }

    spaceships.forEach(function(ship) {
        if (ship.values.weapon.state != "shoot") {
            var enemy = getEnemy(ship.values.account);
            var target = byAccount[enemy] && byAccount[enemy].length > 0 && byAccount[enemy][0];

            if (target) setShipTarget(ship, target);
        }
    });
}

setInterval(function() {
    var list = worldState.scanDistanceFrom(undefined, "spaceship");
    var byAccount = mapByAccount(list);

    list.forEach(function(ship) {
        console.log(ship.values.account+" health "+ship.values.health);
    });

    Object.keys(byAccount).forEach(function(account) {
        console.log("account "+account+" has "+byAccount[account].length+" ships");
    });
}, 1000);

setInterval(autoSpawn, 1000, [1, 2]);
setInterval(autoTargetEnemy, 100);
