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
    uuidGen = require('node-uuid')

var minimum_count = 4,
    maximum_count = 6

var dao = {
    systems: {
        insert: function(id, doc) {
            return C.db.
                query("insert into solar_systems (id, doc) values ($1, $2)", [ id, doc ])
        }
    },
    wormholes: {
        randomGeneratorFn: function(system_id) {
            return function() {
                return C.db.query("with available_systems as (select * from system_wormholes where count < $3 and id != $1) insert into wormholes (id, outbound, inbound) select uuid_generate_v4(), $1, (select id from available_systems offset floor(random()*(select count(*) from available_systems)) limit 1) where not exists (select id from system_wormholes where id = $1 and count >= $2) returning id", [ system_id, minimum_count, maximum_count ])
            }
        }
    }

}

var self = {
    getSpawnSystemId: function() {
        return C.db.query("select * from solar_systems limit 1").
            then(function(data) {
                if (data.length === 0) {
                    return self.createSystem().then(function(doc) {
                        debug(doc)
                        return doc.id
                    })
                } else {
                    debug(data)
                    return data[0].id
                }
            })
    },
    createSystem: function() {
        var id = uuidGen.v4(),
            doc = { uuid: id }

        return C.db.
            query("insert into solar_systems (id, doc) values ($1, $2)", [ id, doc ]).
            then(function() { return doc })
    },
    getWormholes: function(systemid) {

    },
    ensurePoolSize: function() {
        return Q.all([
            self.createSystem(),
            self.createSystem(),
            self.createSystem(),
            self.createSystem(),
            self.createSystem(),
            self.createSystem()
        ])
    },
    whenIsReady: function() {
        return self.ensurePoolSize().
            then(function() {
                return C.db.query("select * from system_wormholes where count < $1", [ minimum_count ])
            }).then(function(data) {
                return data.map(function(row) {
                    var q = Q(null),
                        fn = dao.wormholes.randomGeneratorFn(row.id)

                    // The generator function SQL will make sure
                    // we only create the correct number of wormholes
                    for (var i=0; i < minimum_count; i++) {
                        q = q.then(fn);
                    }

                    return q
                })
            }).all()
    }
}

module.exports = self
