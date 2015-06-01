'use strict';

var EventEmitter = require('events').EventEmitter,
    extend = require('extend'),
    util = require('util'),
    npm_debug = require('debug'),
    log = npm_debug('3dsim:info'),
    error = npm_debug('3dsim:error'),
    debug = npm_debug('3dsim:debug'),
    C = require('spacebox-common'),
    db = require('spacebox-common-native').db,
    config = require('./config.js'),
    Q = require('q'),
    uuidGen = require('node-uuid')

var keys_to_update_on = ["blueprint", "account", "solar_system"]

// WorldState is a private function so it's safe
// to declare these here.
var listeners = []

var dao = {
    loadIterator: function(fn) {
        return db.
        query("select * from space_objects where tombstone = $1", [false]).
        then(function(data) {
            for (var row in data) {
                fn(data[row])
            }
        })
    },
    insert: function(uuid, values) {
        return db.
        none("insert into space_objects (id, system_id, account_id, doc) values ($4, $1, $2, $3)", [values.solar_system, values.account, values, uuid])
    },
    update: function(key, values) {
        return db.none("update space_objects set doc = $2, system_id = $3 where id = $1", [key, values, values.solar_system])
    },
    tombstone: function(key) {
        return db.none("update space_objects set tombstone = $2, tombstone_at = current_timestamp where id = $1 and tombstone = false and tombstone_at is null", [key, true])
    }

}

// worldStateStorage is modeled a lot like riak,
// each object has a version and has attributes and
// it's basically a key value store. this class acts
// like a pubsub sending the changes to all the
// listeners and storing a compelete snapshot of state
// for bootstrapping.
var worldStateStorage = {}

function WorldState() {}

util.inherits(WorldState, EventEmitter)

extend(WorldState.prototype, {
    whenIsReady: function() {
        return this.loadFromDBOnBoot()
    },
    loadFromDBOnBoot: function() {
        return dao.loadIterator(function(obj) {
            worldStateStorage[obj.id] = {
                key: obj.id,
                rev: 0,
                values: obj.doc
            }

            debug("loaded", obj)
        })
    },

    cleanup: function(key) {
        var obj = this.get(key)
        if (obj.values.tombstone !== true)
            throw "you can't clean up an object still alive"

        return db.none("delete from space_objects where id = $1", key).
        then(function() {
            delete worldStateStorage[key.toString()]
        })
    },

    getAccountObjects: function(account) {
        return db.query("select * from space_objects where account_id = $1", [account]).
        then(function(data) {
            return data.map(function(row) {
                // Almost like the in memory version but without the rev.
                // someday all of this will have to be consolidated
                return {
                    key: row.id,
                    values: row.doc
                }
            })
        })
    },

    // TODO implement the distance limit
    scanKeysDistanceFrom: function(obj) {
        if (obj === undefined) {
            return Object.keys(worldStateStorage)
        } else {
            // This is easy but it won't handle when we add missiles and stuff
            // that never get added to the database. this also violates the return
            // signature of the previous if clause
            return db.query("select id, account_id from space_objects where system_id = $1", [obj.solar_system]).then(function(data) {
                return data.map(function(row) {
                    return row.id
                })
            })
        }
    },

    getHack: function() {
        return worldStateStorage
    },

    scanDistanceFrom: function(_, type) {
        var list = this.scanKeysDistanceFrom(undefined).map(function(k) {
            return this.get(k)
        }, this)

        return list.filter(function(v, i) {
            return (v !== undefined && v.values.tombstone !== true && (type === undefined || v.values.type === type))
        })
    },

    get: function(key) {
        if (key !== undefined) {
            return worldStateStorage[key.toString()]
        }
    },

    addObject: function(values) {
        var uuid = values.uuid || uuidGen.v1(),
            self = this

        delete values.uuid;

        self.emit('worldStatePrepareNewObject', values)

        return dao.insert(uuid, values).
        then(function() {
            debug("added object", uuid, values)
            self.mutateWorldState(uuid, 0, values)
            return uuid
        })
    },

    mutateWorldState: function(key, expectedRev, patch, withDebug) {
        key = key.toString()

        if (withDebug === true) {
            debug(patch)
        }

        // TODO this needs to sync tick time
        var ts = this.currentTick()
        var old = worldStateStorage[key] || {
            key: key,
            rev: 0,
            values: {}
        }

        var oldRev = old.rev
        var newRev = old.rev = oldRev + 1

        if (oldRev !== expectedRev) {
            var data = {
                type: "revisionError",
                expected: expectedRev,
                found: oldRev,
                key: key
            }

            debug(data)
            var e = new Error("revisionError expected=" + expectedRev + " found=" + oldRev)
            e.data = data
            throw e
        }

        if (worldStateStorage[key] === undefined) {
            worldStateStorage[key] = old
        }

        if (patch.tombstone === true && old.values.tombstone !== true) {
            dao.tombstone(key).then(function() {
                if ((patch.tombstone_cause === 'destroyed' || patch.tombstone_cause === 'despawned') && old.values.type == 'vessel') {
                    return C.request('tech', 'DELETE', 204, '/vessels/' + key)
                }
            })
        }

        C.deepMerge(patch, old.values)

        // broadcast the change to all the listeners
        listeners.forEach(function(h) {
            if (h.onWorldStateChange !== undefined) {
                try {
                    h.onWorldStateChange(ts, key, oldRev, newRev, patch)
                } catch (e) {
                    console.log("onWorldStateChange failed", h, e, e.stack)
                }
            }
        })

        // TODO if this updates tombstone it needs to set tombstone_at
        if (keys_to_update_on.some(function(i) {
                return patch.hasOwnProperty(i)
            })) {
            return dao.update(key, old.values)
        } else {
            return Q(null)
        }
    },

    addListener: function(l) {
        listeners.push(l)
    },
    removeListener: function(l) {
        var index = listeners.indexOf(l)
        listeners.splice(index, 1)
    },

    runWorldTicker: function() {
        setInterval(this.worldTick.bind(this), config.game.tickInterval)
    },

    currentTick: function() {
        var ms = new Date().getTime()
        var tickNumber = ms - (ms % config.game.tickInterval)

        return tickNumber
    },

    worldTick: function() {
        // TODO the tickNumber should be synced with
        // worldstate mutations
        var tickNumber = this.currentTick()

        listeners.forEach(function(h) {
            if (h.worldTick !== undefined) {
                try {
                    h.worldTick(tickNumber)
                } catch(e) {
                    console.log("failed to process worldTick handler")
                    console.log(e.stack)
                }
            }
        })
    }
})

module.exports = new WorldState()
