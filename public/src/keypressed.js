define(function() {

    var handlers = { };

    document.addEventListener("keydown", function(event) {
        var h = handlers[event.keyCode];

        if (h !== undefined) {
            var pressed = true;
            for(var i2 = 0; i2 < h.length; i2++){
                var opts = h[i2];

                for(var i = 0; i < opts.modifiers.length; i++){
                    var mod = opts.modifiers[i];
                    pressed = event[mod] && pressed;
                }

                if(pressed) {
                    opts.fn();
                }
            }
        }
    });

    return {
        on: function(keyDesc, fn) {
            var keys        = keyDesc.split("+");
            var modifiers = [];
            var keyCode;

            for(var i = 0; i < keys.length; i++){
                var key       = keys[i];

                if(key.length == 1) {
                    keyCode = key.toUpperCase().charCodeAt(0);
                } else {
                    modifiers.push(key + "Key");
                }
            }

            var list = handlers[keyCode] = handlers[keyCode] || [];
            list.push({
                modifiers: modifiers,
                fn: fn
            });
        }
    };
});
