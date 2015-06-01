'use strict';

var worldState = require('../world_state.js'),
    th = require('../three_helpers.js'),
    THREE = require('three')

function stopShooting(ship) {
    worldState.mutateWorldState(ship.key, ship.rev, {
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
        filter(function(s) { return s.values.type == 'vessel' }).
        forEach(function(ship) {
            var system = ship.values.systems.weapon

            // TODO Should make a better api for handling a subsystem state
            if (system && system.state == "shoot") {
                var target = worldState.get(system.target)

                if (target === undefined ||
                    target.values.tombstone === true ||
                    target.values.solar_system !== ship.values.solar_system
                ) {
                    stopShooting(ship)
                    return
                }

                th.buildVector(position1, ship.values.position)
                th.buildVector(position2, target.values.position)

                if (position1.distanceTo(position2) > system.range) {
                    stopShooting(ship)
                    return
                }

                if (target.values.health > system.damage) {
                    var health = target.values.health - system.damage
                    worldState.mutateWorldState(target.key, target.rev, {
                        health: health,
                        health_pct: health / target.values.maxHealth
                    })

                    if (ship.values.effects.shooting !== target.key) {
                        worldState.mutateWorldState(ship.key, ship.rev, {
                            effects: {
                                shooting: target.key
                            }
                        })
                    }
                } else {
                    worldState.mutateWorldState(target.key, target.rev, {
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

worldState.addListener(obj)
