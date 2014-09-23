
(function() {
    'use strict';

    var worldState = require('../world_state.js');
    var worldAssets = require('../world_assets.js');

    // command == align
    module.exports = function(msg, pilot) {
        // msg.thrust == force
        // find out what it's accelleration is
        var ship = worldAssets.get(pilot.myShip);
        // TODO I need to figure out how to limit the rotation 
        // command to the ticker:
        //   apply X translation matrix until you reach Y position for Z object
    
    };

})();
