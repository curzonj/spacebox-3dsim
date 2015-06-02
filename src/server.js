'use strict';

require('spacebox-common-native').db_select('spodb')

var WebSockets = require("ws"),
    http = require("http"),
    express = require("express"),
    morgan = require('morgan'),
    bodyParser = require('body-parser'),
    uuidGen = require('node-uuid'),
    Q = require('q'),
    uriUtils = require('url'),
    C = require('spacebox-common'),
    space_data = require('./space_data.js'),
    config = require('./config.js')

Q.longStackSupport = true

C.configure({
    AUTH_URL: process.env.AUTH_URL,
    credentials: process.env.INTERNAL_CREDS,
})

var app = express()
var port = process.env.PORT || 5000

var req_id = 0
app.use(function(req, res, next) {
    req_id = req_id + 1
    req.request_id = req_id
    req.ctx = new C.TracingContext(req_id)

    next()
});

morgan.token('request_id', function(req, res) {
    return req.ctx.id
})

app.use(morgan('req_id=:request_id :method :url', {
    immediate: true
}))

app.use(morgan('req_id=:request_id :method :url :status :res[content-length] - :response-time ms'))

C.http.cors_policy(app)
app.use(bodyParser.json())
app.use(bodyParser.urlencoded({
    extended: false
}))

var server = http.createServer(app)

var WebSocketServer = WebSockets.Server,
    wss = new WebSocketServer({
        server: server,
        verifyClient: function(info, callback) {
            var parts = uriUtils.parse(info.req.url, true)
            var token = parts.query.token

            C.http.authorize_token(token).then(function(auth) {
                info.req.authentication = auth
                callback(true)
            }, function(e) {
                callback(false)
            })
        }
    })

require("./world_tickers/load_all.js")

var worldState = require('./world_state.js'),
    solarsystems = require('./solar_systems.js')

var debug = require('debug')('spodb')
app.get('/game_config', function(req, res) {
    res.send(config.game)
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
        delete new_obj.uuid

        return worldState.mutateWorldState(uuid, obj.rev, new_obj, true)
    }).then(function() {
        res.sendStatus(204)
    }).fail(C.http.errHandler(req, res, console.log)).done()
})

var Controller = require('./controller/ws.js')

Q.all([worldState.whenIsReady(), solarsystems.whenIsReady()]).
then(function() {
    server.listen(port)
    wss.on('connection', function(ws) {
        new Controller(ws)
    })

    worldState.runWorldTicker()
    console.log("server ready")
})
