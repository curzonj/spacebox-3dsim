define(function() {

    'use strict';

    function WorldState() {
        this.handlers = [];
        this.mutators = [];
        this.tickers = [];
    }

    /*
     * THIS IS THE MESSAGE SCHEMA
    key: key,
    previous: oldRev,
    version: newRev,
    values: patch
    */

    // this is a singleton, so this is ok
    // we want it to be private
    var worldState = {};

    WorldState.prototype = {
        reset: function() {
            worldState = {};
        },
        getHack: function() {
            return worldState;
        },
        get: function(key) {
            if (key !== undefined) {
                return worldState[key.toString()];
            }
        },
        registerTicker: function(fn) {
            this.tickers.push(fn);
        },
        registerHandler: function(fn) {
            this.handlers.push({
                fn: fn
            });
        },
        registerMutator: function(list, fn) {
            this.mutators.push({
                list: list,
                fn: fn
            });
        },
        initialState: function(currentTick, timestamp, msg) {
            worldState[msg.key] = {
                key: msg.key,
                values: msg.values,
                type: msg.values.type,
                version: msg.version
            };
        },
        updateState: function(currentTick, timestamp, msg) {
            var current = worldState[msg.key];

            if (current === undefined) {
                console.log({
                    type: "missingState",
                    msg: msg
                });

                throw "missingState";
            }

            if (msg.previous != current.version) {
                console.log({
                    type: "revisionError",
                    expected: msg.previous,
                    found: current.version,
                    key: msg.key
                });
            }

            current.version = msg.version;

            for (var attrname in msg.values) {
                current.values[attrname] = msg.values[attrname];
            }
        },
        notifyMutators: function(key, values) {
            this.mutators.forEach(function(o) {
                // Test that this change message has all the required fields
                var gonogo = o.list.reduce(
                    function(previousValue, currentValue, index, array) {
                        return previousValue && values.hasOwnProperty(currentValue);
                    },
                    true
                );

                if (gonogo) {
                    //try {
                        o.fn(key, values);
                    /*} catch (err) {
                        console.log(err);
                    } */
                }
            });
        },
        notifyHandlers: function(key, values) {
            this.handlers.forEach(function(o) {
                //try {
                    o.fn(key, values);
                /*} catch (err) {
                    console.log(err);
                } */
            });
        },
        asyncMutation: function(key) {
            var obj = this.get(key);

            this.notifyMutators(key, obj.values);
        },
        onStateChange: function(currentTick, timestamp, msg) {
            // TODO messages that update things can come before the 
            // messages to create those things. deal with it
            // TODO this method needs to handle all timestamp
            // and revision issues
            if (msg.previous === 0 && worldState[msg.key] === undefined) {
                if (msg.values.tombstone !== true) {
                    this.initialState(currentTick, timestamp, msg);

                    this.notifyHandlers(msg.key, msg.values);
                }
            } else {
                this.notifyMutators(msg.key, msg.values);

                this.updateState(currentTick, timestamp, msg);
            }
        },
        tickInterval: 80,
        currentTick: function() {
            var ms = new Date().getTime();
            var tickNumber = ms - (ms % this.tickInterval);

            return tickNumber;
        },
        worldTick: function(currentTick) {
            this.tickers.forEach(function(fn) {
                fn(currentTick);
            });
        }
    };

    var bob = new WorldState();
    window.worldState = bob;

    return bob;

});
