'use strict';

var CONST_fpErrorMargin = 0.000001

var worldState = require('../world_state.js'),
    THREE = require('three')

function buildVector(v, o) {
    if (o && o.hasOwnProperty('x') && o.hasOwnProperty('y') && o.hasOwnProperty('z')) {
        v.set(o.x, o.y, o.z)
    } else {
        v.set(0, 0, 0)
    }
}

function buildQuaternion(q, o) {
    if (o && o.hasOwnProperty('x') && o.hasOwnProperty('y') && o.hasOwnProperty('z') && o.hasOwnProperty('w')) {
        q.set(o.x, o.y, o.z, o.w)
    } else {
        q.set(0, 0, 0, 0)
    }
}

function explodeVector(v) {
    return {
        x: v.x,
        y: v.y,
        z: v.z
    }
}

function buildCurrentDirection(direction, orientationQ) {
    return direction.set(0, 0, 1).applyQuaternion(orientationQ).normalize()
}

function validAcceleration(ship, desired) {
    var max = ship.values.systems.engine.maxThrust

    if (desired === undefined || isNaN(desired)) {
        desired = max
    }

    return Math.min(desired, max)
}

var funcs = {
    handle_fullStop: function() {
        var velocityV = new THREE.Vector3(),
            position = new THREE.Vector3(),
            behind = new THREE.Vector3(),
            currentDirection = new THREE.Vector3(),
            orientationQ = new THREE.Quaternion()

        return function(ship) {
            buildVector(velocityV, ship.values.velocity)
            buildVector(position, ship.values.position)

            if (velocityV.length() > 0) {
                // reverse is the same object as velocityV but
                // we don't share it so we can use it for this
                // purpose. Giving it a new name just makes the
                // other code more understandable
                var reverse = velocityV.negate()

                behind.addVectors(reverse, position)
                buildQuaternion(orientationQ, ship.values.facing)
                buildCurrentDirection(currentDirection, orientationQ)

                // TODO replace with `move to point` logic
                var theta = currentDirection.angleTo(reverse)
                if (theta > CONST_fpErrorMargin) {
                    worldState.mutateWorldState(ship.key, ship.rev, {
                        engine: {
                            lookAt: explodeVector(behind),
                            acceleration: 0
                        }
                    })
                } else {
                    var velocity = velocityV.length()

                    worldState.mutateWorldState(ship.key, ship.rev, {
                        engine: {
                            // thrust by the lesser of current speed or
                            // max thrust
                            acceleration: validAcceleration(ship, velocity)
                        }
                    })
                }

            } else {
                worldState.mutateWorldState(ship.key, ship.rev, {
                    engine: {
                        state: null,
                        acceleration: 0
                    }
                })
            }
        }
    }(),
    handle_orbit: function() {
        var fromTarget = new THREE.Vector3(),
            normal = new THREE.Vector3(),
            radius = new THREE.Vector3(),
            velocityV = new THREE.Vector3(),
            position = new THREE.Vector3(),
            target = new THREE.Vector3(),
            currentDirection = new THREE.Vector3(),
            orientationQ = new THREE.Quaternion()

        return function(ship) {
            var orbitTarget = worldState.get(ship.values.systems.engine.orbitTarget)
            if (orbitTarget === undefined || orbitTarget.values.tombstone === true) {
                worldState.mutateWorldState(ship.key, ship.rev, {
                    engine: {
                        state: "fullStop",
                        lookAt: false,
                        theta: 0,
                        acceleration: 0
                    }
                })

                return
            }

            var orbitRadius = ship.values.systems.engine.orbitRadius
            var maxTheta = ship.values.systems.engine.maxTheta
            var maxVelocity = ship.values.systems.engine.maxVelocity

            buildVector(position, ship.values.position)
            buildVector(target, orbitTarget.values.position)
            buildVector(velocityV, ship.values.velocity)

            fromTarget.subVectors(position, target)
            normal.crossVectors(fromTarget, velocityV)
            radius.copy(fromTarget).applyAxisAngle(normal, maxTheta).setLength(orbitRadius)

            var d = fromTarget.length()
            var sin90 = Math.sin(Math.PI / 2)
            var theta2 = Math.asin(orbitRadius * sin90 / d)
            var accel = 0

            // Some magic number just less than 90deg beyond
            // which we need to use approximations instead of
            // right angles
            var theta2Limit = (Math.PI * 53 / 110)

            if (velocityV.length() === 0) {
                buildQuaternion(orientationQ, ship.values.facing)
                buildCurrentDirection(currentDirection, orientationQ)

                // We're not currently moving, but we are facing within
                // 90deg of the target, lets get some velocity and then
                // we'll correct
                var theta = fromTarget.angleTo(currentDirection)
                if (Math.PI / 2 < theta) {
                    accel = 1000
                }
            } else if (isNaN(theta2) || theta2 > theta2Limit) {
                var v2 = new THREE.Vector3().subVectors(radius, fromTarget)

                var thetaA = fromTarget.angleTo(v2) - v2.angleTo(velocityV)
                var thetaB = v2.angleTo(velocityV)

                accel = (velocityV.length() * Math.sin(thetaB)) / Math.sin(thetaA)
            } else {
                var thetaC = Math.PI / 2 - theta2
                var vNot = d * Math.sin(thetaC) / sin90
                if (vNot < maxVelocity) {
                    console.log("warning, too close to use right angle orbit")
                    return
                }

                var theta4 = Math.PI - fromTarget.angleTo(velocityV) - theta2

                if (theta4 > 0) {
                    var theta3 = Math.PI - theta2 - theta4
                    accel = vNot * Math.sin(theta4) / Math.sin(theta3)

                    if (isNaN(accel)) {
                        console.log("handle_orbit: accel is NaN")
                        return
                    }
                }
            }

            // This just keeps our state clean even though
            // the ship can't actually go faster than maxThrust
            accel = validAcceleration(ship, accel)

            worldState.mutateWorldState(ship.key, ship.rev, {
                engine: {
                    lookAt: explodeVector(target),
                    acceleration: accel
                }
            })
        }
    }(),
    handle_lookAt: function() {

        var target = new THREE.Vector3(),
            position = new THREE.Vector3(),
            currentDirection = new THREE.Vector3(),
            vToTarget = new THREE.Vector3(),
            orientationQ = new THREE.Quaternion(),
            rotationCrossVector = new THREE.Vector3()

        return function(ship) {
            if (typeof ship.values.systems.engine.lookAt !== "object") {
                return
            }

            buildVector(position, ship.values.position)
            buildVector(target, ship.values.systems.engine.lookAt)

            if (target.length() === 0) {
                console.log("lookAt value was bogus")
                console.log(ship.values.systems.engine)
                return
            }

            vToTarget.subVectors(target, position).normalize()

            buildQuaternion(orientationQ, ship.values.facing)
            buildCurrentDirection(currentDirection, orientationQ)
            var theta = currentDirection.angleTo(vToTarget) // angle in rads

            rotationCrossVector.crossVectors(currentDirection, vToTarget).normalize()

            worldState.mutateWorldState(ship.key, ship.rev, {
                engine: {
                    theta: theta,
                    thetaAxis: explodeVector(rotationCrossVector)
                }
            })
        }
    }(),
    handle_rotation: function() {

        var matrix = new THREE.Matrix4(),
            thetaAxis = new THREE.Vector3(),
            orientationM = new THREE.Matrix4(),
            orientationQ = new THREE.Quaternion()

        return function(ship) {
            var maxTheta = ship.values.systems.engine.maxTheta
            var theta = ship.values.systems.engine.theta
            theta = Math.min(theta, maxTheta)

            buildVector(thetaAxis, ship.values.systems.engine.thetaAxis)
            thetaAxis.normalize()

            if (theta <= 0 || thetaAxis.length() === 0) {
                return
            }

            buildQuaternion(orientationQ, ship.values.facing)
            orientationM.makeRotationFromQuaternion(orientationQ)

            matrix.makeRotationAxis(thetaAxis, theta).
            multiply(orientationM)

            // The math accumulates error, so we have
            // to normalize it or it distortes the models
            orientationQ.setFromRotationMatrix(matrix).normalize()

            var q = orientationQ
            worldState.mutateWorldState(ship.key, ship.rev, {
                facing: {
                    x: q.x,
                    y: q.y,
                    z: q.z,
                    w: q.w,
                }
            })
        }
    }(),
    handle_acceleration: function() {

        var currentDirection = new THREE.Vector3(),
            velocityV = new THREE.Vector3(),
            orientationQ = new THREE.Quaternion(),
            thrustVector = new THREE.Vector3()

        return function(ship) {
            var thrust = ship.values.systems.engine.acceleration,
                maxThrust = ship.values.systems.engine.maxThrust

            if (thrust === undefined || isNaN(thrust) || thrust <= 0) {
                return
            }

            buildQuaternion(orientationQ, ship.values.facing)
            buildCurrentDirection(currentDirection, orientationQ)
            buildVector(velocityV, ship.values.velocity)

            thrust = Math.min(thrust, maxThrust)
            thrustVector.copy(currentDirection).multiplyScalar(thrust)

            velocityV.add(thrustVector)

            if (velocityV.length() < CONST_fpErrorMargin) {
                console.log("velocity too small, stopping")
                velocityV.set(0, 0, 0)
            }

            worldState.mutateWorldState(ship.key, ship.rev, {
                velocity: explodeVector(velocityV)
            })
        }
    }(),
    handle_velocity: function() {

        // NodeJS is single threaded so this is instead of object pooling
        var velocityV = new THREE.Vector3()
        var position = new THREE.Vector3()

        return function(ship) {
            buildVector(velocityV, ship.values.velocity)

            if (velocityV.length() > 0) {
                if (velocityV.length() > ship.values.systems.engine.maxVelocity) {
                    velocityV.setLength(ship.values.systems.engine.maxVelocity)
                }

                buildVector(position, ship.values.position)
                position.add(velocityV)

                worldState.mutateWorldState(ship.key, ship.rev, {
                    velocity: explodeVector(velocityV),
                    position: explodeVector(position)
                })
            }
        }
    }(),
    worldTick: function(tickMs) {
        function process(cmd, ship) {
            funcs["handle_" + cmd]()

            return worldState.get(ship.key)
        }

        worldState.scanDistanceFrom(undefined, undefined).forEach(function(ship) {
            if (ship.values.systems.engine === undefined)
                return

            var cmds = ["lookAt", "rotation", "acceleration", "velocity"]
            var engine_state = ship.values.systems.engine.state

            if (engine_state !== null) {
                var fn = funcs["handle_" + engine_state]

                if (fn === undefined) {
                    worldState.mutateWorldState(ship.key, ship.rev, {
                        systems: {
                            engine: {
                                state: null
                            }
                        }
                    })
                } else {
                    cmds.unshift(engine_state)
                }
            }

            // TODO there should be some better way to accumulate the
            // changes and then send them as a batch to world state
            // instead of using mutateWorldState in each command
            cmds.forEach(function(cmd) {
                funcs["handle_" + cmd](ship)
                ship = worldState.get(ship.key)
            })
        }, this)
    }
}

worldState.addListener(funcs)
