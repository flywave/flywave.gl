import { mathUtils } from "./math-utils";

import { FreeControl } from "./free-controls";
import { EarthCamera } from "./earth-camera";
var Vec3 = mathUtils.Vec3,
    Matrix = mathUtils.Matrix;

var vec3 = Vec3(),
    matrix = Matrix();
class EarthFreeControl extends FreeControl {
    camera = new EarthCamera();

    constructor(mapOrbitControl) {
        super();
        this.mapOrbitControl = mapOrbitControl;
    }

    bindApplication(application) {
        this.mapView = application;
        this.application = application;
        this.view = application.window;
        this.camera.mapView = application;
    }

    pan_velocity(D, ak) {
        var W = [0, 0, 0];
        this.camera.getDown(W);
        this.camera.rotateAroundPivot(
            ak[0],
            ak[1],
            ak[2],
            W[0],
            W[1],
            W[2],
            this.pan_velocity_x * D
        );
        this.camera.getRight(W);
        this.camera.rotateAroundPivot(
            ak[0],
            ak[1],
            ak[2],
            W[0],
            W[1],
            W[2],
            -this.pan_velocity_y * D
        );
    }

    rotationLookDown(result, y) {
        matrix.rotationLookDown(result, [0, 0, -1], y);
    }

    setTorotationLookDown(D, E) {
        matrix.rotationLookDown(D, [0, 0, -1], E);
    }

    flyTorotationLookDown(a, b) {
        matrix.rotationLookDown(a, [0, 0, -1], b);
    }

    adjustGPUPoint(p, x, y) {
        let ret = [];
        this.camera.unprojectToWorld(ret, this, this.width - x, this.height - y, -1);
        let J = this.camera.cameraToWorld;
        let source = [J[12], J[13], J[14]];
        let v = vec3.normalize(p);
        this.camera.collisionTo(p, source, ret, v);
        vec3.normalize(p);
        p[0] =  p[0] *v;
        p[1] =  p[1] *v;
        p[2] =  p[2] *v; 
    }

    rayCastToGlobeAndScene(reslut, origin, target, x, y, hitCountPrecision) {
        var selections = this.mapOrbitControl.pickMap(x, y);
        for (var selectId = 0; selectId < selections.length; selectId++) {
            var selection = selections[selectId];
            if (selection && selection.intersection) {
                var { distance, point } = selection;
                const { position } = this.application.camera;
                reslut[0] = position.x + point.x;
                reslut[1] = position.y + point.y;
                reslut[2] = position.z + point.z;
                this.adjustGPUPoint(reslut, x, y);
                return distance;
            }
        }

        return super.rayCastToGlobe(reslut, origin, target, hitCountPrecision);
    }

    getLocationAtCenter(z, v) {
        var y = this,
            A = y.camera,
            B;
        var w = [0, 0, 0];
        A.getOrigin(w);
        if (y.lasthitd_center > 0) {
            B = y.lasthit_center;
        } else {
            if (!v && !y.last_view) {
                return false;
            } else {
                if (!v) {
                    v = y.last_view;
                }

                var C = [0, 0, 0];
                B = [0, 0, -1];
                A.unprojectToWorld(C, this, v.center_x, v.center_y, 1);
                if (this.rayCastToGlobeAndScene(B, w, C, v.center_x, v.center_y) < 0) {
                    return false;
                }
            }
        }

        this.getLatLonAlt(z, B[0], B[1], B[2]);

        z[3] = vec3.distance(B, w);

        if (z[2] < 0) {
            z[2] = 0;
        } else {
            z[2];
        }

        z[3];

        return true;
    }

    getCenterToCameraDistance() {
        var org = [];
        this.camera.getOrigin(org);
        if (this.lasthitd_center === -1) {
            return vec3.length(org) - 1;
        }
        return vec3.distance(this.lasthit_center, org);
    }

    __ellipsoidMaximumDepth = 0;
    getEquatorialRadius() {
        return super.getEquatorialRadius() - this.__ellipsoidMaximumDepth;
    }

    setEllipsoidMaximumDepth(maximumDepth) {
        this.distance_limit = -maximumDepth;
        this.__ellipsoidMaximumDepth = maximumDepth;
    }

    getEllipsoidMaximumDepth() {
        return this.__ellipsoidMaximumDepth;
    }
}

export { EarthFreeControl };
