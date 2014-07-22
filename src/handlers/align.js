(function() {
    'use strict';

    var worldState = require('../world_state.js');
    var worldAssets = require('../world_assets.js');

    // command == align
    module.exports = function(msg, pilot) {
        // msg.vector == { x, y, z }
        // find out what it's turning speed is
        var ship = worldAssets.get(pilot.myShip);
        // TODO I need to figure out how to limit the rotation 
        // command to the ticker:
        //   apply X rotation matrix until you reach Y vector for Z object
       



        

            
        
        /* 
         * var matrix = new THREE.Matrix4();
         * matrix.extractRotation( mesh.matrix );
         *
         * var direction = new THREE.Vector3( 0, 0, 1 );
         * matrix.multiplyVector3( direction );
         *
         *
         * angle = vector.angleTo( target.position );
         *
         *
         * position and current rotation(matrix or euler angle)
        2deg/tick
        0
        13
        26
        39
        52
        66
        79
        90 11deg


        final rotation
        */

    
    };

})();
