(function() {
    'use strict';

    var worldState = require('./world_state.js');

    function Multiuser() {}

    Multiuser.prototype = {
        constructor: Multiuser,
        onClientJoined: function(handler) {
            setTimeout(function() {
                var state = worldState.getWorldState();
                var ship1 = state[1];

                worldState.mutateWorldState(1, ship1.rev, {
                    shooting: 2
                });
            }, 5000);
        }
    };

    module.exports = new Multiuser();

})();
