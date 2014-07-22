define(['three', './scene'], function(THREE, scene) {

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
        get: function(key) {
            return worldState[key.toString()];
        },
        registerTicker: function(fn) {
            this.tickers.push(fn);
        },
        registerHandler: function(type, fn) {
            this.handlers.push({
                type: type,
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
                state: msg.values,
                type: msg.values.type,
                version: msg.version
            };
        },
        updateState: function(currentTick, timestamp, msg) {
            var current = worldState[msg.key];

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
                current.state[attrname] = msg.values[attrname];
            }
        },
        notifyMutators: function(currentTick, timestamp, msg) {
            this.mutators.forEach(function(o) {
                // Test that this change message has all the required fields
                var gonogo = o.list.reduce(
                    function(previousValue, currentValue, index, array) {
                        return previousValue && msg.values.hasOwnProperty(currentValue);
                    },
                    true
                );

                if (gonogo) {
                    //try {
                        o.fn(currentTick, timestamp, msg);
                    /*} catch (err) {
                        console.log(err);
                    } */
                }
            });
        },
        notifyHandlers: function(currentTick, timestamp, msg) {
            this.handlers.forEach(function(o) {
                if (o.type == msg.values.type) {
                    //try {
                        o.fn(currentTick, timestamp, msg);
                    /*} catch (err) {
                        console.log(err);
                    } */
                }
            });
        },
        onStateChange: function(currentTick, timestamp, msg) {
            // TODO messages that update things can come before the 
            // messages to create those things. deal with it
            // TODO I think handlers and mutators are going to merge

            if (msg.previous === 0 && worldState[msg.key] === undefined) {
                this.notifyHandlers(currentTick, timestamp, msg);
                this.initialState(currentTick, timestamp, msg);
            } else {
                this.notifyMutators(currentTick, timestamp, msg);
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
