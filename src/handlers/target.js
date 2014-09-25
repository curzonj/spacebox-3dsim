
(function() {
    'use strict';

    var worldState = require('../world_state.js');
    var worldAssets = require('../world_assets.js');

    module.exports = {
        // TODO make sure they are allowed to give commands to ship1
        // TODO validate the target
        orbit: function(msg, h) {
            var ship1 = worldState.get(msg.subject);

            if (worldState.get(msg.target) === undefined) {
                // TODO add some way to send the client an error
                return;
            }

            worldState.mutateWorldState(ship1.key, ship1.rev, {
                engine: {
                    state: "orbit",
                    orbitRadius: 1,
                    orbitTarget: msg.target
                }
            });
        
        },
        shoot: function(msg, h) {
            var ship1 = worldState.get(msg.subject);

            if (worldState.get(msg.target) === undefined) {
                // TODO add some way to send the client an error
                return;
            }

            // TODO make sure ship1 is within range
            worldState.mutateWorldState(ship1.key, ship1.rev, {
                weapon: {
                    state: "shoot",
                    target: msg.target,
                }
            });
        }
    };

})();
