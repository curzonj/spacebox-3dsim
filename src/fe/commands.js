'use strict';

var Q = require('q'),
    C = require('spacebox-common')

var processors = {};
processors.debug = function(ctx, msg, h) {
    var result = C.deepMerge(h.visibility, {})
    delete result.ctx
    return result
}

function send_error(ctx, e, ws, request_id) {
    ctx.error({ err: e }, 'error handling command')

    var details

    if (e.stack !== undefined) {
        details = e.stack.toString()
    }

    ws.send({
        type: 'result',
        request_id: request_id,
        error: {
            message: e.toString(),
            details: details
        }
    })
}

module.exports = {
    dispatch: function(msg, info) {
        var request_id = msg.request_id,
            ctx = info.ctx.child({ request_id: request_id }),
            cmd = msg.command

        delete msg.request_id

        ctx.trace({ msg: msg }, 'websocket command');

        try {
            if (processors.hasOwnProperty(cmd) && typeof processors[cmd] == 'function') {
                Q(processors[cmd](ctx, msg, info)).
                then(function(result) {
                    info.send({
                        type: "result",
                        request_id: request_id,
                        result: result
                    })
                }).fail(function(e) {
                    send_error(ctx, e, info, request_id)
                }).done()
            } else {
                throw ("invalid command: " + cmd);
            }
        } catch (e) {
            send_error(ctx, e, info, request_id)
        }
    }
};
