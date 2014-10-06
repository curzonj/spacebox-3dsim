define(['three', 'jquery', './container'], function(THREE, $, container) {

    'use strict';

    var viewport = container.viewport;

    function setSizes() {
        renderer.setSize(container.viewportWidth(), window.innerHeight);
        var sidebar = container.sidebarWidth()+'px';
        $('#sidebar').css('width', sidebar);
        $(viewport).css('margin-left', sidebar);
    }

    var renderer = new THREE.WebGLRenderer();

    setSizes();
    viewport.appendChild(renderer.domElement);

    window.addEventListener('resize', setSizes, false);

    return renderer;
});
