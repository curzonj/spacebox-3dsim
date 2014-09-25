'use strict';

// TODO some of these are restricted and need to be authenticated
// TODO unrestricted commands still need to go the account's ships
var handlers = [ "spawn", "target"  ];
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

        if (processors.hasOwnProperty(cmd)) {
            processors[cmd](msg, info);
        } else {
            console.log("invalid command: "+cmd);
            return ;
        }
    }
};
