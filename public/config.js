(function() {
    'use strict';

    require.config({
        shim: {
            threeCore: {
                exports: 'THREE'
            },
            VRMLLoader: {
                deps: ['threeCore'],
                exports: 'THREE'
            },
            TrackballControls: {
                deps: ['threeCore'],
                exports: 'THREE'
            },
            detector: {
                exports: 'Detector'
            },
            stats: {
                exports: 'Stats'
            }
        },
        paths: {
            three: 'lib/shims/three',
            threeCore: 'lib/three.js-r67/build/three.min',
            TrackballControls: 'lib/three.js-r67/examples/js/controls/TrackballControls',
            VRMLLoader: 'lib/three.js-r67/examples/js/loaders/VRMLLoader',
            detector: 'lib/three.js-r67/examples/js/Detector',
            stats: 'lib/three.js-r67/examples/js/libs/stats.min',
            text: 'lib/requirejs_plugins/text',
            shader: 'lib/requirejs_plugins/shader',
            shaders: 'src/shaders',
            requirejs: 'bower_components/requirejs/require',
            jquery: 'bower_components/jquery/dist/jquery'
        },
        packages: [

        ]
    });

    require(['detector', 'src/container', 'src/builder'], function(Detector, container, builder) {
        if (!Detector.webgl) {
            Detector.addGetWebGLMessage();
            container.innerHTML = "";
        } else {
            builder.start();
        }
    });
})();
