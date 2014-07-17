// As THREE.js comes with many addons/plugins mix them all into one three object here
define([
    "threeCore",
    'threex.planets/package.require',
    'threex.spaceships/package.require',
    'threex.laser/package.require'
], function(threeCore) {
    return threeCore;
});
