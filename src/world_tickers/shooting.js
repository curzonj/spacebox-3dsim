'use strict';

var worldState = require('../world_state.js'),
    C = require('spacebox-common'),
    th = require('spacebox-common/src/three_helpers.js'),
    THREE = require('three')

function stopShooting() {
    return {
        patch: {
            systems: {
                weapon: {
                    state: null
                },
            },
            effects: {
                shooting: null
            }
        }
    }
}

// NodeJS is single threaded so this is instead of object pooling
var position1 = new THREE.Vector3()
var position2 = new THREE.Vector3()

worldState.onWorldTick(function(tickMs, ship) {
    if (ship.type !== 'vessel' )
        return 
    var system = ship.systems.weapon

    // TODO Should make a better api for handling a subsystem state
    if (system === undefined || system.state !== "shoot")
        return 

    var target = worldState.get(system.target)

    if (target === undefined ||
        target.tombstone === true ||
        target.solar_system !== ship.solar_system
    ) {
        return stopShooting()
    }

    th.buildVector(position1, ship.position)
    th.buildVector(position2, target.position)

    //console.log(system.range, position1.distanceTo(position2), position1, position2)

    if (position1.distanceTo(position2) > system.range) {
        return stopShooting()
    }

    var result = {
        events: [{
            uuid: target.uuid,
            source: ship.uuid,
            type: 'damage',
            amount: system.damage
        }]
    }

    if (ship.effects.shooting !== target.uuid) {
        result.patch = {
            effects: {
                shooting: target.uuid
            }
        }
    }

    return result
})

worldState.addEventReducer('damage', function(tickMs, ship, patch, events) {
    var totalDamage = events.reduce(function(total, e) {
        return total + e.amount
    }, 0)

    var health = ship.health - totalDamage
    if (health === null || isNaN(health)) {
        console.log(ship, events)
        throw new Error("invalid health")
    }

    if (health <= 0) {
        C.deepMerge({
            health: 0,
            effects: {
                explosion: true
            },
            tombstone_cause: 'destroyed',
            tombstone: true
        }, patch)
    } else {
        patch.health = health
    }
})
