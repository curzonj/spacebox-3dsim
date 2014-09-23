'use strict';

var Q = require('q');
var qhttp = require("q-io/http");

var deepMerge = require('../deepMerge.js'),
    worldState = require('../world_state.js'),
    multiuser = require('../multiuser.js');




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

/*
setInterval(autoSpawn, 1000, [1, 2]);
setInterval(autoTargetEnemy, 100);
*/
