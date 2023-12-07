import { mathUtils } from './math-utils';

import { FreeControl } from './free-controls';
import { EarthCamera } from './earth-camera';
var Vec3 = mathUtils.Vec3, Matrix = mathUtils.Matrix;

var vec3 = Vec3(), matrix = Matrix();
class EarthFreeControl extends FreeControl {
    constructor(application, window) {
        super(application, window);
        this.camera = new EarthCamera(application);
    }

    pan_velocity(D, ak) {
        var W = [0, 0, 0];
        this.camera.getDown(W);
        this.camera.rotateAroundPivot(
            ak[0], ak[1], ak[2], W[0],
            W[1], W[2], this.pan_velocity_x * D);
        this.camera.getRight(W);
        this.camera.rotateAroundPivot(ak[0], ak[1], ak[2], W[0], W[1], W[2], -this.pan_velocity_y * D);
    };

    rotationLookDown(result, y) {
        matrix.rotationLookDown(result, [0, 0, -1], y);
    };

    setTorotationLookDown(D, E) {
        matrix.rotationLookDown(D, [0, 0, -1], E);
    };

    flyTorotationLookDown(a, b) {
        matrix.rotationLookDown(a, [0, 0, -1], b);
    };

    rayCastToGlobeAndScene(reslut, origin, target, x, y, hitCountPrecision,noLineNear,noPickMap) {
        if (this.mapView.zoomLevel >= 17 && x && y&&!noPickMap) {
            var selections = this.application.pickMap(x, y);
            for (var selectId = 0; selectId < selections.length; selectId++) {
                var selection = selections[selectId];
                if (selection && selection.intersection) {
                    var { distance, point, intersection: { pointOnLine,object: { userData: { feature, _3dtile } } } } = selection;
                    
                    if(pointOnLine&&!noLineNear){
                        point = pointOnLine;
                    }
                    if (feature || _3dtile) {
                        const { position } = this.application.camera;
                        reslut[0] = position.x + point.x;
                        reslut[1] = position.y + point.y;
                        reslut[2] = position.z + point.z;
                        this.lastCast = reslut.slice();
                        this.lastCast.push(distance);
                        return distance;
                    }
                }
            }
            if (x && y) {
                this.lastCast = null;
            }
        }

        if (this.mapView.zoomLevel >= 17 && this.lastCast&&!noPickMap) {
            reslut[0] = this.lastCast[0];
            reslut[1] = this.lastCast[1];
            reslut[2] = this.lastCast[2];
            return this.lastCast[3];
        }

        {
            if (x == undefined && y == undefined) {
                x = this.width / 2;
                y = this.height / 2;
            }
            // if (this.application.elevation) {
            //     var rayRet = this.application.elevation.rayCast(x, y);
            //     if (rayRet) {
            //         reslut[0] = rayRet.point.x;
            //         reslut[1] = rayRet.point.y;
            //         reslut[2] = rayRet.point.z;
            //         return rayRet.distance;
            //     }
            // }
        }
        return super.rayCastToGlobe(reslut, origin, target, hitCountPrecision)
    };

    getLocationAtCenter(z, v) {
        var y = this, A = y.camera, B;
        var w = [0, 0, 0];
        A.getOrigin(w);
        if (y.lasthitd_center > 0) {
            B = y.lasthit_center
        } else {
            if (!v && !y.last_view) {
                return false
            } else {
                if (!v) {
                    v = y.last_view
                }

                var C = [0, 0, 0];
                B = [0, 0, -1];
                A.unprojectToWorld(C, this, v.center_x, v.center_y, 1);
                if (this.rayCastToGlobeAndScene(B, w, C, v.center_x, v.center_y) < 0) {
                    return false
                }
            }
        }

        this.getLatLonAlt(z, B[0], B[1], B[2]);

        z[3] = vec3.distance(B, w);

        if (z[2] < 0) {
            z[2] = 0
        } else {
            z[2];
        }

        z[3];

        return true
    };

    getCenterToCameraDistance() {
        var org = [];
        this.camera.getOrigin(org);
        if (this.lasthitd_center === -1) {
            return vec3.length(org) - 1;
        }
        return vec3.distance(this.lasthit_center, org);
    };
}


export { EarthFreeControl };