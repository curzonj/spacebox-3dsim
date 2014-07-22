(function() {
    'use strict';

    // TODO this is a hack
    var storage = {
        "1": {

        
        }
    };

    module.exports = {
        get: function(key) {
            return storage[key];
        }
    };
})();
