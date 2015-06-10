'use strict';

var Q = require('q')

require("./world_tickers/load_all.js")

var worldState = require('./world_state.js')

worldState.whenIsReady().
then(function() {
    worldState.runWorldTicker()
    console.log("server ready")
})
