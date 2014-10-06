define( [], function () {
    var self = {
        getViewport: function() {
            return document.getElementById('threejs-container');
        },
        sidebarWidth: function() {
            return Math.min(window.innerWidth*0.2, 200);
        },
        viewportWidth: function() {
            return (window.innerWidth - self.sidebarWidth());
        }
    };

    return self;
} );
