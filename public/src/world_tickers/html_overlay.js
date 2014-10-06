define(['../world_state', '../renderer', '../camera', '../container'], function(worldState, renderer, camera, container) {

    'use strict';

    // account never changes but this still triggers when each
    // spaceship is loaded
    // TODO remove it on tombstone
    var colors = {},
        colorTags = [];
    worldState.registerMutator(['account'], function(key, values) {
        var elem,
            account = values.account,
            color = colors[account];

        colorTags.push(key);

        if (color === undefined) {
            color = colors[account] = Math.floor(Math.random() * 16777215).toString(16);
        }

        if ($('#tracking-' + key).length === 0) {
            elem = document.createElement("div");
            elem.setAttribute("id", "tracking-" + key);
            elem.setAttribute("class", "tracking-overlay");
            container.getViewport().appendChild(elem);
        }

        elem = $('#tracking-' + key);
        elem.css('border', '5px solid #' + color);
    });

    worldState.registerMutator(['tombstone'], function(key, values) {
        var obj = worldState.get(key),
            elem = $('#tracking-' + key);
        
        if (elem.length !== 0) {
            elem.remove();
        }
    });


    var projector = new THREE.Projector();
    $(renderer).bind('renderComplete', function() {
        colorTags.forEach(function(key) {
            var obj = worldState.get(key);
            var elem = $('#tracking-' + key);

            if (obj !== undefined && elem !== undefined) {
                var object3d = obj.object3d;

                var v = projector.projectVector( object3d.position.clone(), camera );
                var percX = (v.x + 1) / 2;
                var percY = (-v.y + 1) / 2;
                var left = percX * renderer.domElement.offsetWidth;
                var top = percY * renderer.domElement.offsetHeight;

                // ideally we'd find the corner of the object
                // in the camera. for now just shift it up and left
                // TODO change to a tracking-overlay class
                elem.css('left', Math.floor(left - 24) + 'px')
                    .css('top', Math.floor(top - 24) + 'px');
            } else {
                if (elem !== undefined) {
                    elem.remove();
                } else {
                    console.log("missing, removing", key);

                    var i = colorTags.indexOf(key);
                    if (i > -1) colorTags.splice(i, 1);
                }
            }
        });

    });


});

