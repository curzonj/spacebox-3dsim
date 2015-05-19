'use strict';

var worldState = require('../world_state.js')

var obj = {
    worldTick: function(tickMs) {
        worldState.scanDistanceFrom(undefined, "spaceship").forEach(function(ship) {
            // TODO Should make a better api for handling a subsystem state
            if (ship.values.weapon && ship.values.weapon.state == "shoot") {
                var target = worldState.get(ship.values.weapon.target)

                if (target === undefined || target.values.tombstone === true) {
                    worldState.mutateWorldState(ship.key, ship.rev, {
                        weapon: {
                            state: "none"
                        },
                        effects: {
                            shooting: -1
                        }
                    })
                } else {
                    var damage = ship.values.weapon.damage

                    if (target.values.health > damage) {
                        var health = target.values.health - damage
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
                        worldState.mutateWorldState(ship.key, ship.rev, {
                            weapon: {
                                state: "none"
                            },
                            effects: {
                                shooting: -1
                            }
                        })
                    }
                }
            }
        })
    }
}

worldState.addListener(obj)
