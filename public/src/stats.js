define(['stats', './container'], function(Stats, container) {
    'use strict';

    var stats = new Stats();
    stats.domElement.style.position = 'absolute';
    stats.domElement.style.top = '0px';
    container.getViewport().appendChild( stats.domElement );

    return stats;
});
