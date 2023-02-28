
import { mathUtils } from './math-utils';

import { Camera } from './camera';

var Vec3 = mathUtils.Vec3, Matrix = mathUtils.Matrix;

var vec3 = Vec3(), matrix = Matrix();

class EarthCamera extends Camera {

    constructor(mapView) {
        super();
        this.mapView = mapView;
    }

    globeCollisionTo(m, org, target,radio) {
        var s = 1 / radio;
        var orig = [org.x * s, org.y * s, org.z * s], tar = [target.x * s, target.y * s, target.z * s];
        return mathUtils.rayCastToEllipsoid(m, orig, tar, 1, 1)
    }

    collisionTo(r, s, t, radio) {
        var sorc = { x: s[0], y: s[1], z: s[2] }, targ = { x: t[0], y: t[1], z: t[2] };

        var _r = this.globeCollisionTo(r, sorc, targ,radio);
        if (_r === -1) {
            return -1;
        }
        return _r;
    }

    inertialPan(v, u, t, s, w, precision) {
        var r = this.cameraToWorld;
        s[3] += (0 - s[3]) * w;

        if (Math.abs(s[3]) < (precision || 1e-8)) {
            s[3] = 0
        }

        r[12] -= v;
        r[13] -= u;
        r[14] -= t;
        matrix.rotateAxisAngleT(r, s[0], s[1], s[2], s[3]);
        r[12] += v;
        r[13] += u;
        r[14] += t;
    };

    pan(F, D, C, z, x, w, u, E, r) {
        var J = this.cameraToWorld, A, s = [0, 0, 0], L, G = [0, 0, 0],
            B = [F[0] - D, F[1] - C, F[2] - z],
            M = [J[12] - D, J[13] - C, J[14] - z], y = [x - D, w - C, u - z],
            v = vec3.normalize(B);

        if (this.collisionTo(G, M, y, v) < 0) {
            return
        }

        vec3.normalize(G);
        vec3.cross(s, B, G);
        var K = vec3.dot(s, s);

        if (K > 0) {
            L = vec3.normalize(s);
            var I;
            if (L <= -1) {
                I = -Math.PI * 0.5
            } else {
                if (L >= 1) {
                    I = Math.PI * 0.5
                } else {
                    I = Math.asin(L)
                }
            }
            J[12] -= D;
            J[13] -= C;
            J[14] -= z;

            if (this.smoothPan) {
                I *= 0.25;
                L = Math.sin(I);
                A = Math.cos(I);
                matrix.rotateAxisAngleT(J, s[0], s[1], s[2], I)
            } else {
                A = vec3.dot(G, B);
                matrix.rotateAxisSinCosT(J, s[0], s[1], s[2], L, A)
            }
            J[12] += D;
            J[13] += C;
            J[14] += z;
            I *= 0.7;
            if (I > Math.abs(E[3])) {
                E[0] = s[0];
                E[1] = s[1];
                E[2] = s[2];
                E[3] = I;
            } else {
                var H = r;
                E[0] += (s[0] - E[0]) * H;
                E[1] += (s[1] - E[1]) * H;
                E[2] += (s[2] - E[2]) * H;
                vec3.normalize(E);
                E[3] += (I - E[3]) * H
            }
        } else {
            E[3] += (0 - E[3]) * r
        }
        if (Math.abs(E[3]) < 1e-15) {
            E[3] = 0
        }
    }
}

export { EarthCamera };
