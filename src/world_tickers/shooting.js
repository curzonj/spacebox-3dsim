'use strict';

var worldState = require('../world_state.js'),
    th = require('spacebox-common/src/three_helpers.js'),
    THREE = require('three')

function stopShooting(ship) {
    worldState.queueChangeOut(ship.uuid, {
        systems: {
            weapon: {
                state: null
            },
        },
        effects: {
            shooting: null
        }
    })
}

// NodeJS is single threaded so this is instead of object pooling
var position1 = new THREE.Vector3()
var position2 = new THREE.Vector3()

var obj = {
    worldTick: function(tickMs) {
        worldState.scanDistanceFrom(undefined, undefined).
        filter(function(s) { return s.type == 'vessel' }).
        forEach(function(ship) {
            var system = ship.systems.weapon

            // TODO Should make a better api for handling a subsystem state
            if (system && system.state == "shoot") {
                var target = worldState.get(system.target)

                if (target === undefined ||
                    target.tombstone === true ||
                    target.solar_system !== ship.solar_system
                ) {
                    stopShooting(ship)
                    return
                }

                th.buildVector(position1, ship.position)
                th.buildVector(position2, target.position)

                //console.log(system.range, position1.distanceTo(position2), position1, position2)

                if (position1.distanceTo(position2) > system.range) {
                    stopShooting(ship)
                    return
                }

                if (target.health > system.damage) {
                    var health = target.health - system.damage
                    worldState.queueChangeOut(target.uuid, {
                        health: health,
                        health_pct: health / target.maxHealth
                    })

                    if (ship.effects.shooting !== target.uuid) {
                        worldState.queueChangeOut(ship.uuid, {
                            effects: {
                                shooting: target.uuid
                            }
                        })
                    }
                } else {
                    worldState.queueChangeOut(target.uuid, {
                        health: 0,
                        health_pct: 0,
                        effects: {
                            // TODO implement this effect
                            explosion: true
                        },
                        tombstone_cause: 'destroyed',
                        tombstone: true
                    })
                    stopShooting(ship)
                }
            }
        })
    }
}

worldState.onWorldTick(obj.worldTick)
