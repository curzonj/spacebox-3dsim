'use strict';

var CONST_fpErrorMargin = 0.000001

var worldState = require('../world_state.js'),
    config = require('../../config.js'),
    th = require('spacebox-common/src/three_helpers.js'),
    C = require('spacebox-common'),
    THREE = require('three')

function buildCurrentDirection(direction, orientationQ) {
    return direction.set(0, 0, 1).applyQuaternion(orientationQ).normalize()
}

function assertVector(v) {
    if (v === undefined || v === null || isNaN(v.x) || isNaN(v.y) || isNaN(v.z))
        throw new Error("invalid vector: " + JSON.stringify(v))

    return v
}

function validAcceleration(ship, desired) {
    var max = ship.systems.engine.maxThrust

    if (desired === undefined || isNaN(desired)) {
        desired = max
    }

    return Math.min(desired, max)
}

function filterUnchangedVectors(spo, patch) {
    Object.keys(patch).forEach(function(k) {
        var c = spo[k],
            n = patch[k]
        if (c !== undefined &&
            c.x === n.x &&
            c.y === n.y &&
            c.z === n.z)
            delete patch[k]
    })

    if (Object.keys(patch).length > 0)
        return patch
}

// TODO the math for maxBrakeVelocity and maxVtoTarget is
// a little wonky and needs a good explanation
var move_to_point = function() {
    var velocityV = new THREE.Vector3(),
        position = new THREE.Vector3(),
        target = new THREE.Vector3(),
        interceptCourse = new THREE.Vector3(),
        brakingLookAt = new THREE.Vector3(),
        currentDirection = new THREE.Vector3(),
        orientationQ = new THREE.Quaternion()

    return function(ship, point, targetMoving) {
        var accel = 0,
            system = ship.systems.engine,
            maxThrust = system.maxThrust,
            maxTheta = system.maxTheta,
            maxThrustForMath = maxThrust * 0.95

        th.buildVector(position, ship.position)
        th.buildVector(target, point)
        th.buildVector(velocityV, ship.velocity)
        interceptCourse.subVectors(target, position)

        th.buildQuaternion(orientationQ, ship.facing)
        buildCurrentDirection(currentDirection, orientationQ)

        var velocity = velocityV.length(),
            d = interceptCourse.length(),
            brakingTheta = 1,
            maxBrakeVelocity = 0,
            thetaVelocityVsTarget = 0

        if (velocity > 0) {
            var brakingOrientation = brakingLookAt.copy(velocityV).normalize().negate()
            brakingTheta = currentDirection.angleTo(brakingOrientation)
            brakingLookAt = brakingOrientation.add(position)
            thetaVelocityVsTarget = velocityV.angleTo(interceptCourse)

            /// calculate what what speed we need to brake at given our current distance
            maxBrakeVelocity = maxThrustForMath * (
                Math.sqrt(
                    0.25 +
                    ((2 * d) / maxThrustForMath)
                ) + 0.5)
        } else if (d < CONST_fpErrorMargin) {
            //console.log("moveTo complete")
            return {
                systems: {
                    engine: {
                        state: null,
                        lookAt: null,
                        theta: 0,
                        acceleration: 0
                    }
                }
            }
        }

        // TODO what if we over shoot the target or the floating
        // point math puts us off course, we need to adjust

        if (brakingTheta > CONST_fpErrorMargin) {
            // NOT aligned for breaking
            //// calculate max velocity allowable to the target
            var i1 = (brakingTheta / maxTheta) - 0.5 // how many turns will it take to turn to braking
            var maxVtoTarget = maxThrustForMath * (
                    Math.sqrt(
                        Math.pow(i1, 2) +
                        ((2 * d) / maxThrustForMath)
                    ) - i1)
                //((-1 * i1) + Math.sqrt(Math.pow(i1, 2) + (8 * (d / maxThrust)))) / (4 / maxThrust)
            var theta = currentDirection.angleTo(interceptCourse) // angle in rads

            // TODO allow non-max thrusts
            if ((velocity + maxThrust) > maxVtoTarget) {
                //console.log('going fast enough, breaking', brakingTheta, position, maxVtoTarget, velocity, d)
                target.copy(brakingLookAt)
            } else {
                //console.log('accelerating', velocity, velocityV, target)
                // we will rotate towards the target
                if (theta < CONST_fpErrorMargin || (targetMoving && theta < Math.PI / 2)) {
                    //we are still aligned for thrust
                    accel = 1000
                }
            }
        } else {
            //console.log("aligned for stopping, staying that way", brakingTheta, position, maxBrakeVelocity, velocity, d)
            // If we are aligned for breaking, don't try to look at the target
            target.copy(brakingLookAt)

            // Give ourselves some slack room on braking
            if (velocity > maxBrakeVelocity - maxThrust) {
                if (velocity > d) {
                    // We don't kill the whole velocity, because
                    // we need the velocity to close the distance
                    // This will happen twice because we have to
                    // kill the final bit of velocity after it moves
                    // us to the target
                    accel = velocity - d
                } else {
                    accel = 1000
                }
            }
        }

        // This just keeps our state clean even though
        // the ship can't actually go faster than maxThrust
        accel = validAcceleration(ship, accel)

        return {
            systems: {
                engine: {
                    lookAt: th.explodeVector(target),
                    acceleration: accel
                }
            }
        }
    }
}()

var funcs = {
    handle_fullStop: function() {
        var velocityV = new THREE.Vector3(),
            position = new THREE.Vector3(),
            behind = new THREE.Vector3(),
            currentDirection = new THREE.Vector3(),
            orientationQ = new THREE.Quaternion()

        return function(ship) {
            th.buildVector(velocityV, ship.velocity)
            th.buildVector(position, ship.position)

            if (velocityV.length() > 0) {
                // reverse is the same object as velocityV but
                // we don't share it so we can use it for this
                // purpose. Giving it a new name just makes the
                // other code more understandable
                var reverse = velocityV.negate()

                behind.addVectors(reverse, position)
                th.buildQuaternion(orientationQ, ship.facing)
                buildCurrentDirection(currentDirection, orientationQ)

                // TODO replace with `move to point` logic
                var theta = currentDirection.angleTo(reverse)
                if (theta > CONST_fpErrorMargin) {
                    return {
                        systems: {
                            engine: {
                                lookAt: th.explodeVector(behind),
                                acceleration: 0
                            }
                        }
                    }
                } else {
                    var velocity = velocityV.length()

                    return {
                        systems: {
                            engine: {
                                // thrust by the lesser of current speed or
                                // max thrust
                                acceleration: validAcceleration(ship, velocity)
                            }
                        }
                    }
                }

            } else {
                return {
                    systems: {
                        engine: {
                            state: null,
                            lookAt: null,
                            theta: 0,
                            acceleration: 0
                        }
                    }
                }
            }
        }
    }(),
    handle_moveTo: function(ship) {
        //var interceptPoint = new THREE.Vector3().subVectors(position, target).setLength(3).add(target)
        move_to_point(ship, ship.systems.engine.moveTo, false)
    },
    handle_orbit: function() {
        var fromTarget = new THREE.Vector3(),
            normal = new THREE.Vector3(),
            radius = new THREE.Vector3(),
            velocityV = new THREE.Vector3(),
            velocityVNorm = new THREE.Vector3(),
            position = new THREE.Vector3(),
            target = new THREE.Vector3(),
            currentDirection = new THREE.Vector3(),
            currentDiff = new THREE.Vector3(),
            orientationQ = new THREE.Quaternion()

        return function(ship) {
            var orbitTarget = worldState.get(ship.systems.engine.orbitTarget)
            if (orbitTarget === undefined || orbitTarget.tombstone === true) {
                return {
                    systems: {
                        engine: {
                            state: "fullStop",
                            lookAt: null,
                            theta: 0,
                            acceleration: 0
                        }
                    }
                }
            }

            var system = ship.systems.engine,
                orbitRadius = system.orbitRadius,
                maxTheta = system.maxTheta,
                maxVelocity = system.maxVelocity

            th.buildVector(position, ship.position)
            th.buildVector(target, orbitTarget.position)
            th.buildVector(velocityV, ship.velocity)

            fromTarget.subVectors(position, target)
            normal.crossVectors(fromTarget, velocityV)
            radius.copy(fromTarget).applyAxisAngle(normal, maxTheta).setLength(orbitRadius)
            velocityVNorm.copy(velocityV).normalize()
            currentDiff.copy(fromTarget).normalize().sub(velocityVNorm)

            var d = fromTarget.length()
            var sin90 = Math.sin(Math.PI / 2)
            var theta2 = Math.asin(orbitRadius * sin90 / d)
            var accel = 0

            // Some magic number just less than 90deg beyond
            // which we need to use approximations instead of
            // right angles
            var theta2Limit = (Math.PI * 53 / 110)

            if (velocityV.length() === 0) {
                th.buildQuaternion(orientationQ, ship.facing)
                buildCurrentDirection(currentDirection, orientationQ)

                // We're not currently moving, but we are facing within
                // 90deg of the target, lets get some velocity and then
                // we'll correct
                var theta = fromTarget.angleTo(currentDirection)
                if (isNaN(theta) || Math.PI / 2 < theta) {
                    accel = 1000 // this gets validated later in the fn
                }
            } else if (currentDiff.length() === 0) {
                // We are going exactly away from the target, get some right angle motion
                target.copy(velocityV).applyQuaternion(orientationQ.set(0, 0.7071, 0, 0.7071))
                accel = 1000
            } else if (isNaN(theta2) || theta2 > theta2Limit) {
                var v2 = new THREE.Vector3().subVectors(radius, fromTarget)

                var thetaA = fromTarget.angleTo(v2) - v2.angleTo(velocityV)
                var thetaB = v2.angleTo(velocityV)

                accel = (velocityV.length() * Math.sin(thetaB)) / Math.sin(thetaA)
            } else {
                var thetaC = Math.PI / 2 - theta2
                var vNot = d * Math.sin(thetaC) / sin90
                if (vNot < maxVelocity) {
                    //console.log("warning, too close to use right angle orbit")
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

            return {
                systems: {
                    engine: {
                        lookAt: th.explodeVector(target),
                        acceleration: accel
                    }
                }
            }
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
            var system = ship.systems.engine
            if (typeof system.lookAt !== "object" || system.lookAt === null) {
                return
            }

            assertVector(ship.position)
            assertVector(ship.facing)
            assertVector(system.lookAt)

            th.buildVector(position, ship.position)
            th.buildVector(target, system.lookAt)

            vToTarget.subVectors(target, position).normalize()

            // We can't look at it if we're sitting on it
            if (vToTarget.length() === 0)
                return

            th.buildQuaternion(orientationQ, ship.facing)
            buildCurrentDirection(currentDirection, orientationQ)
            var theta = currentDirection.angleTo(vToTarget) // angle in rads

            // CONST_fpErrorMargin is not good enough here
            // this function will constantly trigger if you don't
            // set lookAt null, but you can't use the CONST_fpErrorMargin
            if (theta === 0 || isNaN(theta))
                return

            rotationCrossVector.crossVectors(currentDirection, vToTarget).normalize()

            // If we are in perfect alignment, rotate around our local X axis
            // to kickstart things. We can't rotate around nothing, and when all
            // directions are an option, the crossvector is zero
            if (rotationCrossVector.length() === 0)
                rotationCrossVector.copy(currentDirection).applyQuaternion(orientationQ.set(0, 0.7071, 0, 0.7071))

            if (isNaN(theta))
                throw new Error("invalid theta")

            return {
                systems: {
                    engine: {
                        theta: theta,
                        thetaAxis: assertVector(th.explodeVector(rotationCrossVector))
                    }
                }
            }
        }
    }(),
    handle_rotation: function() {

        var matrix = new THREE.Matrix4(),
            thetaAxis = new THREE.Vector3(),
            orientationM = new THREE.Matrix4(),
            orientationQ = new THREE.Quaternion()

        return function(ship) {
            var system = ship.systems.engine,
                maxTheta = system.maxTheta,
                theta = Math.min(system.theta, maxTheta)

            th.buildVector(thetaAxis, system.thetaAxis)
            thetaAxis.normalize()

            if (theta <= 0 || thetaAxis.length() === 0) {
                return
            }

            th.buildQuaternion(orientationQ, ship.facing)
            orientationM.makeRotationFromQuaternion(orientationQ)

            matrix.makeRotationAxis(thetaAxis, theta).
            multiply(orientationM)

            // The math accumulates error, so we have
            // to normalize it or it distortes the models
            orientationQ.setFromRotationMatrix(matrix).normalize()

            var q = orientationQ
            return {
                facing: assertVector({
                    x: q.x,
                    y: q.y,
                    z: q.z,
                    w: q.w,
                })
            }
        }
    }(),
    handle_acceleration: function() {

        var currentDirection = new THREE.Vector3(),
            velocityV = new THREE.Vector3(),
            orientationQ = new THREE.Quaternion(),
            thrustVector = new THREE.Vector3()

        return function(ship) {
            var thrust = ship.systems.engine.acceleration,
                maxThrust = ship.systems.engine.maxThrust

            if (thrust === undefined || isNaN(thrust) || thrust <= 0) {
                return
            }

            th.buildQuaternion(orientationQ, ship.facing)
            buildCurrentDirection(currentDirection, orientationQ)
            th.buildVector(velocityV, ship.velocity)

            thrust = Math.min(thrust, maxThrust)
            thrustVector.copy(currentDirection).multiplyScalar(thrust)


            velocityV.add(thrustVector)
                //console.log("applying", thrust, "along", currentDirection, "to", ship.velocity, "resulting", velocityV, velocityV.length())

            if (velocityV.length() < CONST_fpErrorMargin) {
                console.log("velocity too small, stopping")
                velocityV.set(0, 0, 0)
            }

            return {
                velocity: assertVector(th.explodeVector(velocityV))
            }
        }
    }(),
    handle_velocity: function() {

        // NodeJS is single threaded so this is instead of object pooling
        var velocityV = new THREE.Vector3()
        var position = new THREE.Vector3()

        return function(ship) {
            th.buildVector(velocityV, ship.velocity)

            if (velocityV.length() > 0) {
                if (velocityV.length() > ship.systems.engine.maxVelocity) {
                    velocityV.setLength(ship.systems.engine.maxVelocity)
                }

                th.buildVector(position, ship.position)
                position.add(velocityV)

                return filterUnchangedVectors(ship, {
                    velocity: th.explodeVector(velocityV),
                    chunk: th.buildVectorBucket(position, config.game.chunk_size),
                    position: th.explodeVector(position)
                })
            }
        }
    }(),
    worldTick: function(tickMs, ship) {
        if (ship.type !== 'vessel')
            return
        if (ship.systems.engine === undefined)
            return

        var cmds = ["lookAt", "rotation", "acceleration", "velocity"]
        var patch,
            engine_state = ship.systems.engine.state,
            pseudoState = {
                // Be careful deepMerge doesn't give you a deep cloned
                // object unless you use it just right
                uuid: ship.uuid,
                position: C.deepMerge(ship.position, {}),
                chunk: C.deepMerge(ship.chunk, {}),
                facing: C.deepMerge(ship.facing, {}),
                velocity: C.deepMerge(ship.velocity, {}),
                systems: {
                    engine: C.deepMerge(ship.systems.engine, {}),
                }
            }

        function applyPatch(p) {
            //console.log(p)
            if (patch === undefined)
                patch = {}

            C.deepMerge(p, pseudoState)
            C.deepMerge(p, patch)
        }

        if (engine_state !== null) {
            var fn = funcs["handle_" + engine_state]

            if (fn === undefined) {
                applyPatch({
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
        // instead of using queueChangeOut in each command
        cmds.forEach(function(cmd) {
            try {
                var result = funcs["handle_" + cmd](pseudoState)
                if (result !== undefined && result !== null)
                    applyPatch(result)
            } catch (e) {
                console.log(e.stack)
                throw new Error("in handle_" + cmd + ": " + e.message)
            }
        })

        return {
            patch: patch
        }
    }
}

worldState.onWorldTick(funcs.worldTick)
