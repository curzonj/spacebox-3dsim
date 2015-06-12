'use strict';

var Q = require('q'),
    C = require('spacebox-common')

C.logging.configure('3dsim')

require("./world_tickers/load_all.js")

var worldState = require('./world_state.js')

worldState.whenIsReady().
then(function() {
    worldState.runWorldTicker()
    console.log("server ready")
})
