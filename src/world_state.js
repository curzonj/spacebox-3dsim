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

    function WorldState() {}

    WorldState.prototype = {
        constructor: WorldState,

        // TODO this will need an octtree to find objects
        // in a given volume of space and apply filters
        // to the results, until then we have getWorldStateHack
        getWorldStateHack: function() {
            return worldStateStorage;
        },


        get: function(key) {
            return worldStateStorage[key.toString()];
        },

        // handlers call this to send us state changes
        mutateWorldState: function(key, expectedRev, patch) {
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

            for (var attrname in patch) {
                old.values[attrname] = patch[attrname];
            }

            console.log({
                type: "debug_stateChange",
                ts: ts,
                version: newRev,
                key: key,
                patch: patch
            });

            // broadcast the change to all the listeners
            listeners.forEach(function(h) {
                h.onWorldStateChange(ts, key, oldRev, newRev, patch);
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
                h.worldTick(tickNumber);
            });
        }
    };

    module.exports = new WorldState();
})();
