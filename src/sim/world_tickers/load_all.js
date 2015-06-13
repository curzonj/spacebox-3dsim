'use strict';

var data = module.exports = {
    fns: [],
    reducers: {}
}

var funcs = {
    onWorldTick: function(fn) {
        data.fns.push(fn)
    },
    addEventReducer: function(type, fn) {
        data.reducers[type] = fn
    },
}

require("./shooting.js")(funcs)
require("./engines.js")(funcs)
