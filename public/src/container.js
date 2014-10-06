define( [], function () {
    var self = {
        viewport: document.getElementById('threejs-container'),
        sidebarWidth: function() {
            return Math.min(window.innerWidth*0.2, 200);
        },
        viewportWidth: function() {
            return (window.innerWidth - self.sidebarWidth());
        }
    };

    return self;
} );
