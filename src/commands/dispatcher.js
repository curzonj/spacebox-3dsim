'use strict';

// TODO some of these are restricted and need to be authenticated
// TODO unrestricted commands still need to go the account's ships
// TODO need a standard way to validate messages against a schema
var handlers = [ "spawn", "target", "scanning" ];
var processors = {};

handlers.forEach(function(name) {
    var fns = require('./'+name+'.js');

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

module.exports = {
    dispatch: function(msg, info) {
        var cmd = msg.command;
        console.log(msg);

        if (processors.hasOwnProperty(cmd) && typeof processors[cmd] == 'function') {
            processors[cmd](msg, info);
        } else {
            throw("invalid command: "+cmd);
        }
    }
};
