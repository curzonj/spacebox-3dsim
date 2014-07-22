(function() {
    'use strict';

    var commands = [ "align" ];
    var processors = {};

    commands.forEach(function(cmd) {
        processors[cmd] = require('./'+cmd+'.js');
    });

    module.exports = {
        dispatch: function(msg, pilot) {
            var cmd = msg.command;

            if (commands.indexOf(command) == -1) {
                console.log("invalid command");
                return ;
            }

            processors[cmd](msg, pilot);
        }
    };
})();
