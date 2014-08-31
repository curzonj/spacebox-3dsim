(function() {
    'use strict';

    // WorldState is a private function so it's safe
    // to declare these here.
    var listeners = [];

    // worldStateStorage is modeled a lot like riak,
    // each object has a version and has attributes and
    // it's basically a key value store. this class acts
    // like a pubsub sending the changes to all the
    // listeners and storing a compelete snapshot of state
    // for bootstrapping.
    var worldStateStorage = {};
    var nextID = 1;

    function WorldState() {}

    WorldState.prototype = {
        constructor: WorldState,

        // TODO implement the distance limit
        scanKeysDistanceFrom: function(coords) {
            return Object.keys(worldStateStorage);
        },

        scanDistanceFrom: function(coords, type) {
            var list = this.scanKeysDistanceFrom(coords).map(function(k) {
                return this.get(k);
            }, this);

            return list.filter(function(v, i) {
                return (v !== undefined && v.values.tombstone !== true && (type === undefined || v.values.type === type));
            });
        },

        get: function(key) {
            if (key !== undefined) {
                return worldStateStorage[key.toString()];
            }
        },

        addObject: function(values) {
            var id = nextID;
            nextID += 1;

            this.mutateWorldState(id, 0, values);

            return id;
        },

        // handlers call this to send us state changes
        mutateWorldState: function(key, expectedRev, patch, debug) {
            key = key.toString();

            if (debug === true) {
                console.log(patch);
            }

            // TODO this needs to sync tick time
            var ts = this.currentTick();
            var old = worldStateStorage[key] || { key: key, rev: 0, values: {} };

            if (worldStateStorage[key] === undefined) {
                worldStateStorage[key] = old;
            }

            var oldRev = old.rev;
            var newRev = old.rev = oldRev + 1;

            if (oldRev !== expectedRev) {
                console.log({
                    type: "revisionError",
                    expected: expectedRev,
                    found: oldRev,
                    key: key
                });
            }

            function deepMerge(src, tgt) {
                for (var attrname in src) {
                    var v = src[attrname];
                    if (typeof v == "object" &&
                        tgt.hasOwnProperty(attrname) &&
                            (typeof (tgt[attrname])) == "object") {

                        deepMerge(v, tgt[attrname]);
                    } else {
                        tgt[attrname] = v;
                    }
                }
            
            }

            deepMerge(patch, old.values);

            // broadcast the change to all the listeners
            listeners.forEach(function(h) {
                if (h.onWorldStateChange !== undefined) {
                    h.onWorldStateChange(ts, key, oldRev, newRev, patch);
                }
            });
        },

        addListener: function(l) {
            listeners.push(l);
        },
        removeListener: function(l) {
            var index = listeners.indexOf(l);
            listeners.splice(index, 1);
        },

        tickInterval: 80,
        runWorldTicker: function() {
            setInterval(this.worldTick.bind(this), this.tickInterval);
        },

        currentTick: function() {
            var ms = new Date().getTime();
            var tickNumber = ms - (ms % this.tickInterval);

            return tickNumber;
        },

        // NOTE this ticks everything that isn't
        // controled by external logic, those are
        // ticked by the handlers. This is the
        // traditional NPCs.
        worldTick: function() {
            // TODO the tickNumber should be synced with
            // worldstate mutations
            var tickNumber = this.currentTick();

            listeners.forEach(function(h) {
                if (h.worldTick !== undefined) {
                    h.worldTick(tickNumber);
                }
            });
        }
    };

    module.exports = new WorldState();
})();
