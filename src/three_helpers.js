'use strict';

module.exports = {
    buildVector: function (v, o) {
        if (o && o.hasOwnProperty('x') && o.hasOwnProperty('y') && o.hasOwnProperty('z')) {
            v.set(o.x, o.y, o.z)
        } else {
            v.set(0, 0, 0)
        }
    },

    buildQuaternion: function(q, o) {
        if (o && o.hasOwnProperty('x') && o.hasOwnProperty('y') && o.hasOwnProperty('z') && o.hasOwnProperty('w')) {
            q.set(o.x, o.y, o.z, o.w)
        } else {
            q.set(0, 0, 0, 0)
        }
    },

    explodeVector: function(v) {
        return {
            x: v.x,
            y: v.y,
            z: v.z
        }
    }
}
