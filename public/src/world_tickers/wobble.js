define(['three', 'tween', '../sceneCtl', '../world_state'], function(THREE, TWEEN, sceneCtl, worldState) {

    'use strict';

    worldState.registerMutator(['rotation'], function(key, values) {
        var obj = worldState.get(key);

        if (obj.object3d) {
            if (obj.object3d.rotationTween) {
                obj.object3d.rotationTween.stop();
            }

            // totally broken
            obj.object3d.rotationTween = new TWEEN.Tween(obj.object3d.rotation).
            to(values.rotation, worldState.tickInterval).
            start();
        }
    });

    worldState.registerMutator(['tombstone'], function(key, values) {
        var obj = worldState.get(key);

        if (obj.object3d) {
            sceneCtl.get().remove(obj.object3d);
        }
    });

    var greenLines = [];
    worldState.registerTicker(function(tick) {
        greenLines.forEach(function(data) {
            /*
             * {
             *   key: 3,
             *   geometry: geom
             * }
             */
            var obj = worldState.get(data.key);
            var vr1 = obj.object3d.position,
                vr2 = new THREE.Vector3().copy(obj.greenLine).multiplyScalar(10).add(vr1);

            data.geometry.vertices[1].copy(vr2);
            data.geometry.verticesNeedUpdate = true;
        });
    });

    worldState.registerMutator(['greenLine'], function(key, values) {
        var obj = worldState.get(key);

        if (obj.object3d) {
            var scene = sceneCtl.get(),
                a = values.greenLine,
                axis = scene.getObjectByName("greenLine" + key);

            if (obj.greenLine === undefined || axis === undefined) {
                var material = new THREE.LineBasicMaterial({
                    color: 0xff000,
                    linewidth: 2
                });

                var geometry = new THREE.Geometry(),
                    vr1 = obj.object3d.position;
                obj.greenLine = new THREE.Vector3(a.x, a.y, a.z);
                var vr2 = new THREE.Vector3().copy(obj.greenLine).multiplyScalar(10).add(vr1);
                geometry.vertices.push(vr1, vr2);

                var line = new THREE.Line(geometry, material);
                line.name = "greenLine" + key;

                scene.add(line);
                greenLines.push({
                    key: key,
                    geometry: geometry
                });
            } else {
                obj.greenLine.set(a.x, a.y, a.z);
            }
        }
    });

    worldState.registerMutator(['facing'], function(key, values) {
        var obj = worldState.get(key);

        if (obj.object3d) {
            var p = values.facing;
            obj.object3d.quaternion.set(p.x, p.y, p.z, p.w);
        }
    });

    worldState.registerMutator(['position'], function(key, values) {
        var obj = worldState.get(key);

        if (obj.object3d) {
            if (obj.object3d.positionTween) {
                obj.object3d.positionTween.stop();
            }

            // TODO don't tween over a certain distance
            if (obj.object3d.position.length() === 0) {
                var p = values.position;
                obj.object3d.position.set(p.x, p.y, p.z);
            } else {
                obj.object3d.positionTween = new TWEEN.Tween(obj.object3d.position).
                to(values.position, worldState.tickInterval).
                start();
            }
        }
    });

});
