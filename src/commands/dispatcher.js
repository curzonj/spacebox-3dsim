'use strict';

var Q = require('q'),
    C = require('spacebox-common')

// TODO some of these are restricted and need to be authenticated
// TODO unrestricted commands still need to go the account's ships
// TODO need a standard way to validate messages against a schema
var handlers = ["spawn", "target", "scanning", "account"];
var processors = {};

handlers.forEach(function(name) {
    var fns = require('./' + name + '.js');

    if (typeof fns == 'function') {
        processors[name] = fns;
    } else {
        for (var command in fns) {
            if (fns.hasOwnProperty(command)) {
                processors[command] = fns[command];
            }
        }
    }

});

function send_error(ctx, e, ws) {
    ctx.log('3dsim', 'error handling command: ', e, e.stack)

    var details

    if (e.stack !== undefined) {
        details = e.stack.toString()
    }

    ws.send({
        type: 'error',
        request_id: ctx.id,
        message: e.toString(),
        details: details
    })

}

module.exports = {
    dispatch: function(msg, info) {
        var request_id = msg.request_id,
            ctx = new C.TracingContext(request_id),
            cmd = msg.command

        delete msg.request_id

        ctx.log('3dsim', msg);

        try {
            if (processors.hasOwnProperty(cmd) && typeof processors[cmd] == 'function') {
                Q(processors[cmd](ctx, msg, info)).fail(function(e) {
                    send_error(ctx, e, info)
                }).done()
            } else {
                throw ("invalid command: " + cmd);
            }
        } catch (e) {
            send_error(ctx, e, info)
        }
    }
};
