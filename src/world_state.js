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
    stats = require('./stats.js'),
    Q = require('q'),
    uuidGen = require('node-uuid')

var keys_to_update_on = ["blueprint", "account", "solar_system"]

// WorldState is a private function so it's safe
// to declare these here.
var listeners = [],
    worldTickers = [],
    changesIn = [],
    changesOut = []

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
    update: function(uuid, values) {
        return db.none("update space_objects set doc = $2, system_id = $3 where id = $1", [uuid, values, values.solar_system])
    },
    tombstone: function(uuid) {
        return db.none("update space_objects set tombstone = $2, tombstone_at = current_timestamp where id = $1 and tombstone = false and tombstone_at is null", [uuid, true])
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
            worldStateStorage[obj.id] = obj.doc
            //debug("loaded", obj)
        })
    },

    cleanup: function(uuid) {
        var obj = this.get(uuid)
        if (obj.tombstone !== true)
            throw "you can't clean up an object still alive"

        return db.none("delete from space_objects where id = $1", uuid).
        then(function() {
            delete worldStateStorage[uuid.toString()]
        })
    },

    getAccountObjects: function(account) {
        return db.query("select * from space_objects where account_id = $1", [account]).
        then(function(data) {
            return data.map(function(row) {
                // someday all of this will have to be consolidated
                return row.doc
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
            return (v !== undefined && v.tombstone !== true && (type === undefined || v.type === type))
        })
    },

    get: function(uuid) {
        if (uuid !== undefined) {
            return worldStateStorage[uuid.toString()]
        }
    },

    addObject: function(values) {
        values.uuid = values.uuid || uuidGen.v1()

        var self = this,
            uuid = values.uuid


        return dao.insert(uuid, values).
        then(function() {
            //debug("added object", uuid, values)
            self.queueChangeIn(uuid, values)
            return uuid
        })
    },

    queueChangeIn: function(uuid, patch) {
        this.queueChange(uuid, patch, changesIn)
    },

    queueChangeOut: function(uuid, patch) {
        this.queueChange(uuid, patch, changesOut)
    },

    queueChange: function(uuid, patch, list) {
        list.push({
            uuid: uuid,
            patch: patch
        })
    },

    applyChangeList: function(list, ts) {
        var self = this
        var timer = stats.applyChangeList.start()

        list.forEach(function(c) {
            self.mutateWorldState(ts, c.uuid, c.patch)
        })

        list.length = 0
        timer.end()
    },

    mutateWorldState: function(ts, uuid, patch) {
        uuid = uuid.toString()

        var old = worldStateStorage[uuid] || { uuid: uuid }

        if (worldStateStorage[uuid] === undefined) {
            worldStateStorage[uuid] = old
        }

        if (patch.tombstone === true && old.tombstone !== true) {
            // Ideally these would go out in guaranteed order via a journal
            dao.tombstone(uuid).then(function() {
                if ((patch.tombstone_cause === 'destroyed' || patch.tombstone_cause === 'despawned') && old.type == 'vessel') {
                    C.request('tech', 'DELETE', 204, '/vessels/' + uuid)
                }
            }).done()
        }

        C.deepMerge(patch, old)

        // broadcast the change to all the listeners
        listeners.forEach(function(h) {
            if (h.onWorldStateChange !== undefined) {
                try {
                    h.onWorldStateChange(ts, uuid, patch)
                } catch (e) {
                    console.log("onWorldStateChange failed", h, e, e.stack)
                }
            }
        })

        if (keys_to_update_on.some(function(i) {
                return patch.hasOwnProperty(i)
            })) {

            // Ideally these would go out in guaranteed order via a journal
            dao.update(uuid, old).done()
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
        this.gameLoopBound = this.gameLoop.bind(this)
        this._currentTick = new Date().getTime()
        setTimeout(this.gameLoopBound, config.game.tickInterval)
    },

    currentTick: function() {
        return this._currentTick
    },

    onWorldTick: function(fn) {
        worldTickers.push(fn)
    },

    gameLoop: function() {
        var startedAt = new Date().getTime(),
            tickNumber = this._currentTick = this._currentTick + config.game.tickInterval

        var jitter = startedAt - tickNumber
        stats.gameLoopJitter.update(jitter)

        this.applyChangeList(changesIn, tickNumber)

        var tickTimer = stats.worldTick.start()
        worldTickers.forEach(function(fn) {
            try {
                fn(tickNumber)
            } catch(e) {
                console.log("failed to process gameLoop handler")
                console.log(e.stack)
            }
        })
        tickTimer.end()

        this.applyChangeList(changesOut, tickNumber)

        var now = new Date().getTime()
        stats.gameLoop.update(now - startedAt)
        var delay = tickNumber + config.game.tickInterval - now
        if (delay < 0)
            delay = 0

        stats.gameLoopDelay.update(delay)
        setTimeout(this.gameLoopBound, delay)
    }
})

module.exports = new WorldState()
