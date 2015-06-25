'use strict';

var extend = require('extend')
var Q = require('q')
var C = require('spacebox-common')
var WTF = require('wtf-shim')
var kdTree = require('../../vendor/kdTree.js')
var config = require('./config')
var ctx = config.ctx
var worldState = config.state

var safeAttrs = [
    'type', 'position', 'chunk', 'velocity',
    'facing', 'tombstone', 'agent_id', 'tech',
    'model_name', 'model_scale', 'health',
    'solar_system', 'name', 'tech_type', 'size',
    'wormhole'
]

function distance3d(v1, v2) {
    var dx = v1.x - v2.x,
        dy = v1.y - v2.y,
        dz = v1.z - v2.z

    return Math.sqrt(dx * dx + dy * dy + dz * dz)
}

function distance3dRange(v1, v2) {
    var base = distance3d(v1, v2),
        r1 = 0,
        r2 = 0

    if (v1.range !== undefined)
        r1 = v1.range
    if (v1.range !== undefined)
        r1 = v1.range

    return base - r1 - r2
}


var Class = module.exports = function(auth, ctx) {
    this.auth = auth
    this.ctx = ctx

    // pointTrees of points indexed by solar system
    this.pointTrees = {
        dimensions: ["x", "y", "z"],
        fn: distance3d
    }

    // A list of all points
    this.points = {}

    // These are keys we can see atm. It's both
    // a cache of position when position doesn't
    // change and we check it  everytime we change
    // chunks
    this.visibleKeys = {}

    // spawn also depends on sightKeys to know
    // how many vessels the agent_id has out so it can
    // limit them. This is the keys we own
    this.sightKeys = {} // == true

    this.ourTrees = {
        dimensions: ["x", "y", "z", "range"],
        fn: distance3dRange
    }
}

/*
 * Use cases
 *
 * When my ship jumps to another system, I get a tombstone for everything
 * I can't see now.
 *
 * When a ship goes to another system I get a tombstone for it
 */

extend(Class.prototype, {
    contstructor: Class,
    dataCopy: function() {
        var result = C.deepMerge(this, {})
        delete result.ctx
        return result
    },

    loadInitialWorldState: function(fn) {
        var self = this;

        var ts = worldState.completedTick()
        var data = worldState.getAllKeys()

        Object.keys(data).forEach(function(k) {
            var obj = data[k]

            if (obj.agent_id == self.auth.agent_id)
                self.sightKeys[obj.uuid] = {}

            self.updatePositions(obj.uuid, obj)
        })

        Object.keys(data).forEach(function(k) {
            fn(ts, data[k])
        })
    },
    visibilityTest: WTF.trace.instrument(function(point) {
        var self = this,
            tree = this.ourTrees[point.solar_system]

        var nearest
        var is_visible = false

        if (tree) {
            nearest = tree.nearest(point, 1)

            // The tree might be empty, I'm not sure
            // if we garbage collect them
            if (nearest.length > 0) {
                nearest = nearest[0][0]
                is_visible = (distance3d(nearest, point) <= nearest.range)
            }
        }

        var oldSightKey = this.visibleKeys[point.uuid]

        var i,l
        if (oldSightKey && (!is_visible || oldSightKey !== nearest.uuid)) {
            delete this.sightKeys[oldSightKey][point.uuid]
            if (!is_visible)
                delete this.visibleKeys[point.uuid]
        }

        if (is_visible && oldSightKey !== nearest.uuid) {
            l = this.sightKeys[nearest.uuid]
            if (!l)
                l = this.sightKeys[nearest.uuid] = {}
            l[point.uuid] = true
            this.visibleKeys[point.uuid] = nearest.uuid
        }

        return is_visible
    }, 'visibility#visibilityTest'),
    checkVisibility: WTF.trace.instrument(function(key, patch) {
        var obj, newPoint, oldPoint, point,
            self = this,
            before = (this.visibleKeys[key] !== undefined),
            currently = before

        point = oldPoint = this.points[key]

        if (patch.agent_id !== undefined &&
            patch.agent_id == this.auth.agent_id &&
            this.sightKeys[key] === undefined)
            this.sightKeys[key] = {}

        var hasSightKey = (this.sightKeys[key] !== undefined),
            privileged = this.auth.privileged || hasSightKey

        this.ctx.trace({ agent_id: this.auth.agent_id, key: key, wasVisible: before, privileged: privileged, visibleBy: this.visibleKeys[key], previous: this.points[key] }, 'checkVisibility')

        if (patch.chunk !== undefined || patch.solar_system !== undefined || patch.tombstone !== undefined) {
            this.updatePositions(key, patch)
            point = newPoint = this.points[key]
        }

        if (!patch.tombstone && (patch.chunk !== undefined || patch.solar_system !== undefined)) {

            currently = privileged || this.visibilityTest(point)
        }

        if (!before && currently) {
            // visibilityTest normally runs this, but not for
            // privileged points because we don't call it on
            // privileged points
            if (privileged)
                this.visibleKeys[point.uuid] = point.uuid

            obj = worldState.get(key)
        }

        return {
            before: before,
            currently: currently,
            privileged: privileged,
            previous: oldPoint,
            obj: obj
        }
    },'visibility#checkVisibility'),
    moveVisibility: function() {
        var old_keys_t = WTF.trace.events.createScope("moveVisibility:scanOldKeys")
        var new_keys_t = WTF.trace.events.createScope("moveVisibility:scanNewKeys")

        return WTF.trace.instrument(function(key, patch, oldpoint) {
            var scope, self = this,
                changes = [],
                visibleKeys = this.sightKeys[key]

            //console.log(oldpoint)

            if (visibleKeys !== undefined) {
                scope = old_keys_t()
                // It will get modified while we iterate
                var visibleKeysKeys = Object.keys(visibleKeys)

                // a point in this system moved, we have to recheck visibility on
                // all our objects
                for (var i in visibleKeysKeys) {
                    var v = visibleKeysKeys[i]
                    if (!this.visibilityTest(this.points[v])) {
                        changes.push({
                            key: v,
                            values: {
                                tombstone_cause: 'own_visibility',
                                tombstone: true
                            }
                        })
                    }
                }
                WTF.trace.leaveScope(scope)
            }

            if (patch.tombstone === true) {
                if (visibleKeys !== undefined)
                    delete this.sightKeys[key]
                return changes
            }

            // updatePositions has already been run when we do this
            var point = this.points[key],
                tree = this.pointTrees[point.solar_system]

            //console.log('newpoint', point, 'patch', patch)

            // If we have not seen any ships other than our own in this
            // system, there won't be any pointTree for it
            if (tree !== undefined) {
                // TODO the number of objects to see should
                // be a sensors limit
                scope = new_keys_t()
                tree.nearest(point, 10000, point.range).forEach(function(search_result) {
                    var search_point = search_result[0]
                    if (self.visibleKeys[search_point.uuid] === undefined &&
                        self.visibilityTest(search_point)) {

                        var obj = worldState.get(search_point.uuid)
                        changes.push({
                            key: obj.uuid,
                            values: self.filterProperties(obj.uuid, obj)
                        })
                    }
                })
                WTF.trace.leaveScope(scope)
            }

            return changes
        }, 'visibility#moveVisibility')
    }(),
    updatePositions: WTF.trace.instrument(function(key, patch) {
        var i, tree,
            treeSet = this.pointTrees,
            hasSightKey = (this.sightKeys[key] !== undefined),
            point = this.points[key]

        if (hasSightKey)
            treeSet = this.ourTrees

        if (point !== undefined) {
            tree = treeSet[point.solar_system]

            // points cannot be updated nor remoed
            // so we just have to remove and insert a new one
            tree.remove(point)
        }

        if (patch.tombstone) {
            if (point === undefined)
                return // we never knew about it

            delete this.visibleKeys[key]
            delete this.points[key]
        } else {
            // The point has moved solar systems
            if (patch.solar_system !== undefined) {
                tree = treeSet[patch.solar_system]

                if (tree === undefined) {
                    tree = treeSet[patch.solar_system] =
                        new kdTree.kdTree([], treeSet.fn, treeSet.dimensions)
                }
            }

            var b = patch.position
            point = this.points[key] = {
                x: b.x,
                y: b.y,
                z: b.z,
                range: (hasSightKey ? 10 : 0),
                uuid: key,
                // Solar system might not have changed if it only moved chunks
                solar_system: patch.solar_system || point.solar_system
            }

            tree.insert(point)
        }
    }, 'visibility#updatePositions'),

    /* Logic
     *
     * Which objects are ours?
     * If we moved, what that we saw before can we no longer see?
     * If something that we could see moved, can we still see it?
     * For all objects in the systems, track where they are
     * If we can now see something that we couldn't see before,
     *  fetch the whole object and send it to the client
     *
     */
    rewriteProperties: WTF.trace.instrument(function(key, patch) {
        var list = [],
            visible = this.checkVisibility(key, patch)

        //console.log('rewriteProperties', this.auth, key, patch, visible)
        this.ctx.trace({ agent_id: this.auth.agent_id, key: key, patch: patch, visible: visible }, 'rewriteProperties')

        if (this.sightKeys[key] !== undefined &&
            visible.previous !== undefined && (
                patch.chunk !== undefined ||
                patch.solar_system !== undefined ||
                patch.tombstone !== undefined
            )) {
            list = this.moveVisibility(key, patch, visible.previous)
        }

        if (visible.before) {
            if (visible.currently) {
                list.push({
                    key: key,
                    values: visible.privileged ? patch : this.filterProperties(key, patch)
                })
            } else {
                // TODO what effect? warp, etc
                list.push({
                    key: key,
                    values: {
                        tombstone_cause: 'other_visibility',
                        tombstone: true
                    }
                })
            }
        } else {
            if (visible.currently) {
                // This is the 1st time they see the object,
                // checkVisibility had to fetch it for us
                list.push({
                    key: key,
                    values: visible.privileged ? visible.obj : this.filterProperties(key, visible.obj)
                })
            }
        }

        this.ctx.trace(this.dataCopy(), 'visibility.data')

        return list
    }, 'visibility#rewriteProperties'),

    filterProperties: function(key, patch) {
        // TODO I'd like health to be reported as health_pct, but I'd need access to the full object.
        var values = {}

        safeAttrs.forEach(function(name) {
            if (patch.hasOwnProperty(name)) {
                values[name] = patch[name]
            }
        }, this)

        // We map effects into the root namespace for simplicity
        // on the clientside
        if (patch.hasOwnProperty("effects")) {
            Object.keys(patch.effects).forEach(function(n) {
                values[n] = patch.effects[n]
            })
        }

        if (Object.getOwnPropertyNames(values).length > 0) {
            return values
        } else {
            return null
        }
    },


})
