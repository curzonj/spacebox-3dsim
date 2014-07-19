define(['stats', './container'], function(Stats, container) {
    'use strict';

    var stats = new Stats();
    stats.domElement.style.position = 'absolute';
    stats.domElement.style.top = '0px';
    container.appendChild( stats.domElement );

    return stats;
});
