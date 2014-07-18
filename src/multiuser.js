(function() {
    'use strict';

    // Multiuser is a private function so it's safe
    // to declare these here.
    var listeners = [];

    function Multiuser() {}

    Multiuser.prototype = {
        constructor: Multiuser,

        addListener: function(l) {
            listeners.push(l);
        },
        removeListener: function(l) {
            var index = listeners.indexOf(l);
            listeners.splice(index, 1);
        },

        onClientJoined: function(handler) {
            // broadcast the change to all the listeners
            listeners.forEach(function(l) {
                l.onClientJoined(handler);
            });

        }
    };

    module.exports = new Multiuser();

})();
