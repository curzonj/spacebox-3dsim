define(['three', './scene' ], function(THREE, scene) {

    'use strict';

    function WorldState() {
        this.shipList = [];
    }

    Math.radians = function(degrees) {
        return degrees * Math.PI / 180;
    };

    WorldState.prototype = {
        onMessage: function(tickMs, e) {
            /*
            key: key,
            previous: oldRev,
            version: newRev,
            values: patch
            */

            // TODO messages that update things can come before the 
            // messages to create those things. deal with it
            try {
                var msg = JSON.parse(e.data);
                switch (msg.type) {
                    case "state":
                        if (msg.state.previous === 0) {
                            // TODO add support for more world elements
                            this.addSpaceship(msg.state.values);
                        } else if (msg.state.values.x_rotation !== undefined) {
                            this.wobble(msg.state.values);
                        } else if (msg.state.values.shooting !== undefined) {
                            this.shootSpaceship();
                        }
                        break;
                }

            } catch (err) {
                console.log(err);
            }
        },
        wobble: function(msg) {
            this.shipList.forEach(function(ship) {
                ship.rotation.x = msg.x_rotation;
            });
        },
        addSpaceship: function(server_obj) {
            var ctx = this;
            THREEx.SpaceShips.loadSpaceFighter01(function(object3d) {
                ctx.shipList.push(object3d);
                object3d.serverId = server_obj.id;

                var v = server_obj.position;
                object3d.position = new THREE.Vector3(v.x, v.y, v.z);
                scene.add(object3d);
            });
        },
        shootSpaceship: function() {
            var ship1 = this.shipList[0];
            var ship2 = this.shipList[1];

            if (!ship1 || !ship2) {
                return;
            }

            var laserBeam = new THREEx.LaserBeam();
            laserBeam.object3d.position.copy(ship1.position);

            laserBeam.setTarget = function(position) {
                this.object3d.lookAt(position);
                this.object3d.rotateOnAxis(this.object3d.up, Math.radians(-90));

                var distance = this.object3d.position.distanceTo(position);
                this.object3d.scale.x = distance;
            };

            scene.add(laserBeam.object3d);
            var laserCooked = new THREEx.LaserCooked(laserBeam);

            laserBeam.setTarget(ship2.position);
        }

    };

    return new WorldState();

});
