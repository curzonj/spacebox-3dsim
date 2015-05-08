'use strict';

var EventEmitter = require('events').EventEmitter,
    extend = require('extend'),
    util = require('util'),
    npm_debug = require('debug'),
    log = npm_debug('3dsim:info'),
    error = npm_debug('3dsim:error'),
    debug = npm_debug('3dsim:debug'),
    C = require('spacebox-common'),
    Q = require('q'),
    db = require('spacebox-common-native').db,
    uuidGen = require('node-uuid')

var minimum_count = 4,
    maximum_count = 6

var dao = {
    systems: {
        insert: function(id, doc) {
            return db.
                query("insert into solar_systems (id, doc) values ($1, $2)", [ id, doc ])
        }
    },
    wormholes: {
        randomGeneratorFn: function(system_id) {
            return function() {
                return db.query("with available_systems as (select * from system_wormholes where count < $3 and id != $1 and id not in (select inbound_system from wormholes where outbound_system = $1)) insert into wormholes (id, expires_at, outbound_system, inbound_system) select uuid_generate_v4(), current_timestamp + interval '2 minutes', $1, (select id from available_systems offset floor(random()*(select count(*) from available_systems)) limit 1) where not exists (select id from system_wormholes where id = $1 and count >= $2) returning id", [ system_id, minimum_count, maximum_count ])
            }
        }
    }
}

var self = {
    getSpawnSystemId: function() {
        return db.query("select * from solar_systems limit 1").
            then(function(data) {
                if (data.length === 0) {
                    return self.createSystem().then(function(doc) {
                        return doc.id
                    })
                } else {
                    return data[0].id
                }
            })
    },
    createSystem: function() {
        var id = uuidGen.v4(),
            doc = { uuid: id }

        return db.
            query("insert into solar_systems (id, doc) values ($1, $2)", [ id, doc ]).
            then(function() { return doc })
    },
    populateWormholes: function(data) {
        debug(data)

        return Q.all(data.map(function(row) {
            var q = Q(null),
                fn = dao.wormholes.randomGeneratorFn(row.id)

            // The generator function SQL will make sure
            // we only create the correct number of wormholes
            for (var i=0; i < minimum_count; i++) {
                q = q.then(fn);
            }

            return q
        }))
    },
    getWormholes: function(systemid) {
        debug(systemid)

        return db.query("select * from system_wormholes where id = $1", [ systemid ]).
            then(self.populateWormholes).
            then(function() {
                return db.query("select * from wormholes where inbound_system = $1 or outbound_system = $1", [ systemid ])
            })
    },
    ensurePoolSize: function() {
        return db.query("select count(*) from solar_systems").
            then(function(data) {
                for (var i=data[0].count; i < 10; i++) {
                    self.createSystem()
                }
            })
    },
    whenIsReady: function() {
        return self.ensurePoolSize()
    }
}

module.exports = self
