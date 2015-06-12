'use strict';

var Q = require('q'),
    C = require('spacebox-common')

require("./world_tickers/load_all.js")

var worldState = require('./world_state.js')

worldState.whenIsReady().
then(function() {
    worldState.runWorldTicker()
    console.log("server ready")
})
