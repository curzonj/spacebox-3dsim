'use strict';

var WebSockets = require("ws"),
    http = require("http"),
    express = require("express"),
    logger = require('morgan'),
    bodyParser = require('body-parser'),
    uuidGen = require('node-uuid'),
    Q = require('q'),
    db = require('spacebox-common-native').db,
    C = require('spacebox-common')

db.select('spodb')
Q.longStackSupport = true

var app = express()
var port = process.env.PORT || 5000

app.use(logger('dev'))
C.http.cors_policy(app)
app.use(bodyParser.json())
app.use(bodyParser.urlencoded({
    extended: false
}))

var server = http.createServer(app)

var WebSocketServer = WebSockets.Server,
wss = new WebSocketServer({
    server: server,
    verifyClient: function (info, callback) {
        C.http.authorize_req(info.req).then(function(auth) {
            info.req.authentication = auth
            callback(true)
        }, function(e) {
            info.req.authentication = {}
            callback(true)
        })
    }
})

require("./world_tickers/load_all.js")

var worldState = require('./world_state.js'),
    solarsystems = require('./solar_systems.js')

app.post('/solar_systems', function(req, res) {
    C.http.authorize_req(req).then(function(auth) {
        return solarsystems.createSystem()
    }).then(function(doc) {
        res.send(doc)
    }).fail(C.http.errHandler(req, res, console.log)).done()
})

var debug = require('debug')('spodb')
app.get('/spodb', function(req, res) {
    C.http.authorize_req(req).then(function(auth) {
        var hash = {},
        list = worldState.scanDistanceFrom()
        list.forEach(function(item) {
            hash[item.key] = item
        })

        res.send(hash)
    }).fail(C.http.errHandler(req, res, console.log)).done()
})

// TODO what happens to a structure's health when it's
// upgraded?
app.post('/spodb/:uuid', function(req, res) {
    var uuid = req.param('uuid')
    var blueprint_id = req.param('blueprint')

    Q.spread([C.getBlueprints(), C.http.authorize_req(req, true)], function(blueprints, auth) {
        var blueprint = blueprints[blueprint_id]

        var obj = worldState.get(uuid)
        var new_obj = C.deepMerge(obj.values, {})
        C.deepMerge(blueprint, new_obj)

        return worldState.mutateWorldState(uuid, obj.rev, new_obj, true)
    }).then(function() {
        res.sendStatus(204)
    }).fail(C.http.errHandler(req, res, console.log)).done()
})

var Handler = require('./handler.js')

Q.all([ worldState.whenIsReady(), solarsystems.whenIsReady() ]).
then(function() {
    server.listen(port)
    wss.on('connection', function(ws) {
        var handler = new Handler(ws)
    })

    worldState.runWorldTicker()
    console.log("server ready")
})

