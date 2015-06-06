'use strict';

var extend = require('extend'),
    Q = require('q'),
    C = require('spacebox-common'),
    config = require('../config.js'),
    worldState = require('../world_state.js'),
    kdTree = require('../../vendor/kdTree.js')

var safeAttrs = [
    'type', 'position', 'chunk', 'velocity',
    'facing', 'tombstone', 'account', 'tech',
    'model_name', 'model_scale', 'health',
    'solar_system', 'name', 'tech_type', 'size'
]
                
function distance3d(v1, v2) {
    var dx = v1.x - v2.x,
        dy = v1.y - v2.y,
        dz = v1.z - v2.z

    return Math.sqrt(dx*dx+dy*dy+dz*dz)
}

function distance3dRange(v1, v2) {
    var base = distance3d(v1, v2),
        r1 = 0, r2 = 0

    if (v1.range !== undefined)
        r1 = v1.range
    if (v1.range !== undefined)
        r1 = v1.range

    return base - r1 -r2
}


var Class = module.exports = function(auth) {
    this.auth = auth

    // pointTrees of points indexed by solar system
    this.pointTrees = {
        dimensions: [ "x", "y", "z" ],
        fn: distance3d
    }

    // A list of all points
    this.points = {}

    // These are keys we can see atm. It's both
    // a cache of position when position doesn't
    // change and we check it  everytime we change
    // chunks
    this.visibleKeysBySystem = {}

    // spawn also depends on privilegedKeys to know
    // how many vessels the account has out so it can
    // limit them. This is the keys we own
    this.privilegedKeys = {} // == true

    this.ourTrees = {
        dimensions: [ "x", "y", "z", "range" ],
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

    loadInitialWorldState: function(fn) {
        var self = this;

        var data = worldState.scanDistanceFrom()

        data.forEach(function(obj) {
            if (obj.account == self.auth.account)
                self.privilegedKeys[obj.uuid] = true

            self.updatePositions(obj.uuid, obj)
        })

        data.forEach(fn)
    },
    visibilityTest: function(point) {
        var self = this,
            tree = this.ourTrees[point.solar_system]

        if (tree === undefined)
            return false

        var nearest = tree.nearest(point, 1)[0][0]
        //console.log('we have an object in '+point.solar_system+' and it is ', nearest, point, distance3d(nearest, point))
        return (distance3d(nearest, point) <= nearest.range)
    },
    checkVisibility: function(key, patch) {
        if (patch.account !== undefined &&
            patch.account == this.auth.account &&
            this.privilegedKeys[key] === undefined)
            this.privilegedKeys[key] = true

        //console.log('oldpoint', key, this.points[key])

        var obj, newPoint,
            self = this,
            oldPoint = this.points[key],
            privileged = this.auth.privileged || (this.privilegedKeys[key] !== undefined),
            visibleSystem = (oldPoint === undefined ? undefined : this.visibleKeysBySystem[oldPoint.solar_system]),
            before = (visibleSystem !== undefined && visibleSystem[key] !== undefined),
            currently = before

        if (patch.chunk !== undefined || patch.solar_system !== undefined || patch.tombstone !== undefined) {
            this.updatePositions(key, patch)
            newPoint = this.points[key]
        }

        function deleteVisibleKey() {
            if (oldPoint === undefined)
                return

            delete self.visibleKeysBySystem[oldPoint.solar_system][key]
            if (Object.keys(self.visibleKeysBySystem[oldPoint.solar_system]).length === 0)
                delete self.visibleKeysBySystem[oldPoint.solar_system]
        }

        if (patch.tombstone) {
            if (privileged) {
                // We run this for any tombstone on a privileged key
                // even if it doesn't actually exist. Oh well, it's probably
                // not that big of a performance hit.
                delete this.privilegedKeys[key]
            }

            if (before)
                deleteVisibleKey()
        } else if (patch.chunk !== undefined || patch.solar_system !== undefined) {
            currently = privileged || this.visibilityTest(this.points[key])
        }

        if (!before && currently) {
            obj = worldState.get(key)
            visibleSystem = this.visibleKeysBySystem[newPoint.solar_system]
            if (visibleSystem === undefined)
                visibleSystem = this.visibleKeysBySystem[newPoint.solar_system] = {}
            visibleSystem[key] = true
        } else if (before && !currently) {
            // The patch doesn't contain a tombstone, but they can't see
            // the object so they are going to receive a tombstone anyways
            deleteVisibleKey()
        }

        return {
            before: before,
            currently: currently,
            privileged: privileged,
            previous: oldPoint,
            obj: obj
        }
    },
    moveVisibility: function(key, patch, oldpoint) {
        var self =this,
            changes = [],
            oldSystem = oldpoint.solar_system

        //console.log(oldpoint)

        // When the world is first loaded on a privilged connection,
        // it will trigger before visibleKeysBySystem has been
        // populated for some reason FIXME
        if (this.visibleKeysBySystem[oldSystem] !== undefined) {
            // a point in this system moved, we have to recheck visibility on
            // all our objects
            for (var v in this.visibleKeysBySystem[oldSystem]) {
                if (key !== v && !this.visibilityTest(this.points[v])) {
                    delete this.visibleKeys[v]

                    changes.push({
                        key: v,
                        values: {
                            tombstone_cause: 'own_visibility',
                            tombstone: true
                        }
                    })
                }
            }
        }

        if (patch.tombstone === true)
            return changes

        // updatePositions has already been run when we do this
        var point = this.points[key],
            tree = this.pointTrees[point.solar_system]

        //console.log('newpoint', point, 'patch', patch)

        // If we have not seen any ships other than our own in this
        // system, there won't be any pointTree for it
        if (tree !== undefined) {
            // TODO the number of objects to see should
            // be a sensors limit
            tree.nearest(point, 10000, point.range).forEach(function(search_result) {
                var search_point = search_result[0]
                var visibleSystem = self.visibleKeysBySystem[search_point.solar_system]

                if (visibleSystem !== undefined &&
                    visibleSystem[search_point.uuid] !== true &&
                    self.visibilityTest(search_point)) {

                    if (visibleSystem === undefined)
                        visibleSystem = self.visibleKeysBySystem[search_point.solar_system] = {}
                    visibleSystem[search_point.uuid] = true

                    var obj = worldState.get(search_point.uuid)
                    changes.push({
                        key: obj.uuid,
                        values: self.filterProperties(obj.uuid, obj)
                    })
                }
            })
        }

        return changes
    },

    updatePositions: function(key, patch) {
        var i, tree,
            treeSet = this.pointTrees,
            privileged = this.privilegedKeys[key] || false,
            point = this.points[key]

        if (privileged)
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

            delete this.points[key]
        } else {
            // The point has moved solar systems
            if(patch.solar_system !== undefined) {
                tree = treeSet[patch.solar_system]

                if (tree === undefined) {
                    tree = treeSet[patch.solar_system] =
                        new kdTree.kdTree([], treeSet.fn, treeSet.dimensions)
                }
            }

            var b = patch.position
            point = this.points[key] = {
                x: b.x, y: b.y, z: b.z, 
                range: (privileged ? 10: 0),
                uuid: key,
                // Solar system might not have changed if it only moved chunks
                solar_system: patch.solar_system || point.solar_system
            }

            tree.insert(point)
        }
    },

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
    rewriteProperties: function(key, patch) {
        var list = [],
            visible = this.checkVisibility(key, patch)

        //console.log('rewrote', this.auth, key, patch, visible)

        if (this.privilegedKeys[key] === true &&
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

        return list
    },

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
