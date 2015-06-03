'use strict';

var extend = require('extend'),
    Q = require('q'),
    C = require('spacebox-common'),
    npm_debug = require('debug'),
    log = npm_debug('3dsim:info'),
    error = npm_debug('3dsim:error'),
    debug = npm_debug('3dsim:debug'),
    worldState = require('../world_state.js')

var safeAttrs = [
    'type', 'position', 'velocity',
    'facing', 'tombstone', 'account',
    'model_name', 'model_scale', 'health',
    'solar_system',
]

var Class = module.exports = function(auth) {
    this.auth = auth

    this.visiblePoints = {}
    // spawn also depends on privilegedKeys to know
    // how many vessels the account has out so it can
    // limit them
    this.privilegedKeys = {}
    this.scanPoints = {}
    this.visibleSystems = {}
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

        return worldState.getAccountObjects(this.auth.account).then(function(data) {
            data.forEach(function(obj) {
                self.privilegedKeys[obj.uuid] = true

                var list = self.visibleSystems[obj.solar_system] || []
                if (list.indexOf(obj.uuid) === -1)
                    list.push(obj.uuid)
                self.visibleSystems[obj.solar_system] = list

                self.scanPoints[obj.uuid] = {
                    position: obj.position,
                    solar_system: obj.solar_system
                }
            })

            return Q.all(Object.keys(self.visibleSystems).map(function(solar_system) {
                var fakeScanPoint = {
                    solar_system: solar_system
                }
                return Q(worldState.scanKeysDistanceFrom(fakeScanPoint)).then(function(data) {
                    data.forEach(fn)
                })
            }))
        })
    },
    addVisiblePoint: function(key, v) {
        this.visiblePoints[key] = {
            solar_system: v.solar_system,
            position_bucket: v.position_bucket,
            position: v.position,
        }
    },
    visibilityTest: function(values, before) {
        if (values.solar_system !== undefined) {
            return (this.visibleSystems[values.solar_system] !== undefined)
        } else {
            return before
        }
    },
    checkVisibility: function(key, patch) {
        if (patch.account !== undefined && patch.account == this.auth.account) {
            this.privilegedKeys[key] = true
        }

        var obj,
            privileged = this.auth.priviliged || (this.privilegedKeys[key] === true),
            point = this.visiblePoints[key],
            before = (point !== undefined),
            currently = false


        if (patch.tombstone) {
            if (privileged) {
                // We run this for any tombstone on a privileged connection
                // even if it doesn't actually exist. Oh well, it's probably
                // not that big of a performance hit.
                delete this.privilegedKeys[key]
            }

            if (before) {
                delete this.visiblePoints[key]

                // if you saw it before, you need a tombstone regardless
                currently = true
            }
        } else {
            currently = privileged || this.visibilityTest(patch, before)
        }

        if (!before && currently) {
            obj = worldState.get(key)
            this.addVisiblePoint(key, obj)
        } else if (before && !currently) {
            // The patch doesn't contain a tombstone, but they can't see
            // the object so they are going to receive a tombstone anyways
            delete this.visiblePoints[key]
        }

        //debug("visiblePoints", this.visiblePoints)

        return {
            before: before,
            currently: currently,
            privileged: privileged,
            obj: obj
        }
    },
    updateScanPoints: function(key, patch) {
        var changes = [],
            point = this.scanPoints[key] = this.scanPoints[key] || {},
            oldSystem = point.solar_system

        //debug('old scanpoint', point)

        C.deepMerge({
            position: patch.position,
            solar_system: patch.solar_system
        }, point)

        if (patch.solar_system !== undefined || patch.tombstone === true) {
            if (oldSystem !== undefined) {
                var oldList = this.visibleSystems[oldSystem]
                //debug('spos in old system', oldList)
                oldList.splice(oldList.indexOf(key), 1)

                if (oldList.length === 0) {
                    delete this.visibleSystems[oldSystem]
                    //debug('testing', this.visiblePoints, 'against', this.visibleSystems)

                    for (var v in this.visiblePoints) {
                        if (key !== v && !this.visibilityTest(this.visiblePoints[v])) {
                            delete this.visiblePoints[v]

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

                //debug('changes', changes)
            }

            var list = this.visibleSystems[patch.solar_system]
            if (list === undefined) {
                this.visibleSystems[patch.solar_system] = list = []

                // TODO we can't actually pas it our new scan
                // point because that'll hit the db and be async
                worldState.scanDistanceFrom(undefined).forEach(function(obj) {
                    if (key != obj.uuid && this.visibilityTest(obj)) {
                        this.addVisiblePoint(obj.uuid, obj)

                        changes.push({
                            key: obj.uuid,
                            values: this.filterProperties(obj.uuid, obj)
                        })
                    }
                }.bind(this))
            }

            if (list.indexOf(key) === -1)
                list.push(key)
        }

        return changes
    },

    rewriteProperties: function(key, patch) {
        var list = [],
            visible = this.checkVisibility(key, patch)

        //debug('rewrote', key, patch, visible)

        if (visible.privileged) {
            list = this.updateScanPoints(key, patch)
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
