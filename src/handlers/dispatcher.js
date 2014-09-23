'use strict';

// TODO some of these are restricted and need to be authenticated
var commands = [ "spawn", "target"  ];
var processors = {};

commands.forEach(function(cmd) {
    processors[cmd] = require('./'+cmd+'.js');
});

module.exports = {
    dispatch: function(msg, info) {
        var cmd = msg.command;

        if (commands.indexOf(cmd) == -1) {
            console.log("invalid command: "+cmd);
            return ;
        }

        processors[cmd](msg, info);
    }
};
