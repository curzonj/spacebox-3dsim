define(['three', 'jquery', './container'], function(THREE, $, container) {

    'use strict';

    function setSizes() {
        renderer.setSize(container.viewportWidth(), window.innerHeight);
        var sidebar = container.sidebarWidth()+'px';
        $('#sidebar').css('width', sidebar);
        $(container.getViewport()).css('margin-left', sidebar);
    }

    var renderer = new THREE.WebGLRenderer();

    setSizes();
    container.getViewport().appendChild(renderer.domElement);

    window.addEventListener('resize', setSizes, false);

    return renderer;
});
