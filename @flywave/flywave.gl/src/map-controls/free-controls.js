import { dispatch as _dispatch, } from 'd3-dispatch';
import * as THREE from 'three';
import { mathUtils } from './math-utils';
import { GeoCoordinates } from "@flywave/flywave-geoutils";
import { Vector3 } from 'three';

var Vec3 = mathUtils.Vec3, Matrix = mathUtils.Matrix,
  MatrixStack = mathUtils.MatrixStack;
var vec3 = Vec3(), matrix = Matrix(), mat64 = MatrixStack().matrixStack64;

class FreeControl {
  constructor(application, window) {
    var dispatch = _dispatch('pandone', 'zoomdone', 'rotatedone', 'flydone'),
      disableTilt = false, disableHeading = false;

    this.mapView = application.mapView;
    this.application = application;
    this.view = window;

    var panddng = false;
    var zooming = false;
    var rotating = false;

    var _this = this;
    _this.inertial_deltaX = 0, _this.inertial_deltaY = 0,
      _this.inertial_axis = [0, 0, 0, 0];

    _this.lasthitd = -1;
    _this.lasthit = [0, 0, 0, null];
    _this.is_panhit = false;
    _this.panhit = [0, 0, 0];
    _this.lasthitd_center_click = -1;
    _this.lasthit_center_click = [0, 0, 0];
    _this.lasthitd_center = -1;
    _this.lasthit_center = [0, 0, 0, null];
    _this.lasthit_gravity = [0, 0, 0];  // Rotate pivot
    _this.lasthit_dist2globe = 0;
    _this.smooth_zoom = 0;
    _this.pan_velocity_x = 0;
    _this.pan_velocity_y = 0;
    _this.zoom_velocity = 0;
    _this.tilt_velocity = 0;
    _this.heading_velocity = 0;
    _this.prevMouseX = 0;
    _this.prevMouseY = 0;
    _this.prevMouseZ = 0;
    _this.omouseDown = [false, false, false];
    _this.tilt_limit = Math.PI * 0.01;
    _this.distance_limit = 50;//0.000001067855942887398;
    _this.limit_zoomout = 1.5;
    _this.heading_set = undefined;
    _this.zoom_animation = false;
    _this.zoom_start_matrix = matrix.newIdentity64();
    _this.zoom_end_matrix = matrix.newIdentity64();
    _this.zoom_mid_matrix = matrix.newIdentity64();
    _this.zoom_start = [90, 0, 0, 1000];
    _this.zoom_end = [90, 0, 0, 1000];
    _this.zoom_distance = 1;
    _this.zoom_to_city = false;
    _this.zoom_finishCallback = null;
    _this.closest_planet = null;
    _this.lockCenterPoint = null;
    _this.camera_swivel = false;

    _this.worldToCamera = matrix.newIdentity64();
    _this.cameraToUnit = new Float64Array(16);
    _this.width = 0;
    _this.height = 0;

    _this.isPandding = function () {
      return panddng || zooming || rotating;
    };

    var p = (C, x, y) => {
      var B = this.getDistanceToGlobe(y[0], y[1], y[2], C);
      return B;
    }

    _this.update = function () {
      var view = this.view;
      var _camera = this.camera;
      var F = false;

      var tilt_limit = _this.tilt_limit;
      if (_this.camera_swivel) {
        tilt_limit = 0;
      }

      var L = view.lastMouseX, J = view.lastMouseY, O = view.mouseDown,
        R = _this.omouseDown;

      L = this.width - L;
      J = this.height - J;

      if (R[2]) {
        R[2] = !disableTilt && !disableHeading;
      }

      const { width, height } = this.mapView.getCanvasClientSize();
      _this.width = width;
      _this.height = height;
      _this.last_view = view;

      if (_this.zoom_animation) {
        panddng = true;
        if (_this.zoom_to_city) {
          var aw, ao, am, al, aD, ap, E, V, G, aH, au, A, aG, aE, M, aC;
          if (_this.zoom_time > 1) {
            _this.zoom_time = 1;
            _this.zoom_animation = false;
            if (_this.zoom_finishCallback) {
              _this.zoom_finishCallback(_this);
              dispatch.call('flydone');
              _this.zoom_finishCallback = null
              panddng = false;
              this.updateCenter();
            }
          }
          aw = _this.zoom_time;
          M = _this.zoom_start[3] +
            (_this.zoom_end[3] - _this.zoom_start[3]) * aw;
          aC = Math.abs(_this.zoom_end[3] - _this.zoom_start[3]) + 500;
          aw = _this.zoom_time;
          ao = aw * aw * (3 - 2 * aw);
          am = aw * (1 - aw * 0.5) * 2;
          if (_this.zoom_distance > 0.1 * 6378137) {
            var H;
            A = _this.zoom_distance * 0.75;
            aG = _this.zoom_start[2] + (A - _this.zoom_start[2]) * ao;
            aE = A + (_this.zoom_end[2] - A) * ao;
            V = aG + (aE - aG) * ao;
            H = 0.90;
            if (aw < H) {
              al = aw / H;
              al = al * al * (3 - 2 * al);
              aH = _this.zoom_start[4] + (0 - _this.zoom_start[4]) * al
            } else {
              al = (aw - H) / (1 - H);
              al = al * al * (3 - 2 * al);
              aH = _this.zoom_end[4] * al
            }
            ap = _this.zoom_start[0] +
              (_this.zoom_end[0] - _this.zoom_start[0]) * am;
            E = _this.zoom_start[1] +
              (_this.zoom_end[1] - _this.zoom_start[1]) * am
          } else {
            V = _this.zoom_start[2] +
              (_this.zoom_end[2] - _this.zoom_start[2]) * ao;
            aH = _this.zoom_start[4] +
              (_this.zoom_end[4] - _this.zoom_start[4]) * ao;
            ap = _this.zoom_start[0] +
              (_this.zoom_end[0] - _this.zoom_start[0]) * ao;
            E = _this.zoom_start[1] +
              (_this.zoom_end[1] - _this.zoom_start[1]) * ao
          }
          G = _this.zoom_start[3] +
            (_this.zoom_end[3] - _this.zoom_start[3]) * ao;
          aD = _this.zoom_end[5] - _this.zoom_start[5];
          if (aD < -Math.PI) {
            aD += Math.PI * 2
          }
          if (aD > Math.PI) {
            aD -= Math.PI * 2
          }
          au = _this.zoom_start[5] + aD * aw;
          _this.setTo(E, ap, V, G, aH, au);
          _this.zoom_time += _this.zoom_speed * 0.05 * M / aC
        } else {
          var aA = [0, 0, 0];
          var aw = _this.zoom_time;
          _camera.getOrigin(aA);
          var P = -1;
          if (P < 0) {
            P = this.getDistanceToGlobe(aA[0], aA[1], aA[2])
          }
          var ar =
            matrix.distance(_this.zoom_start_matrix, _this.zoom_end_matrix);

          var B = (P / 30) * _this.zoom_speed / ar;
          B = _this.zoom_speed * 0.05 * P / ar;
          _this.zoom_time += B;
          if (_this.zoom_time >= 1) {
            _this.zoom_time = 1;
            _this.zoom_animation = false;

            if (_this.zoom_finishCallback) {
              _this.zoom_finishCallback(_this);

              dispatch.call('flydone');
              _this.zoom_finishCallback = null;
              panddng = false;
              this.updateCenter();
            }

            _camera.setMatrix(_this.zoom_end_matrix)
          } else {
            aw = _this.zoom_time;
            if (_this.zoom_mode === 1) {
              _camera.followMatrix(
                _this.zoom_end_matrix, aw, _this.zoom_start_matrix)
            } else {
              _camera.followMatrixGreatCircle(
                _this.zoom_end_matrix, aw, _this.zoom_start_matrix,
                _this.zoom_globe_center, _this.zoom_height_ratio,
                _this.zoom_mid_matrix)
            }
          }
        }
        var iswheel = _this.prevMouseZ !== view.lastMouseZ;
        if (iswheel || O[0] && !R[0] || O[2] && !R[2]) {
          _this.zoom_animation = false;
          panddng = false;
          if (_this.zoom_finishCallback) {
            _this.zoom_finishCallback(_this);
            _this.zoom_finishCallback = null
            this.updateCenter();
          }
        }
        _this.inertial_deltaX = 0;
        _this.inertial_deltaY = 0;
        _this.lasthitd_center = -1;
        _this.lasthitd_center_click = -1;
        _this.inertial_axis[3] = 0;
        _this.lasthitd = -1;

        _this.camera.getWorldToCamera(_this.worldToCamera);
        if (_this.zoom_animation) {
          return true
        }
      }
      var ae = [0, 0, 0];
      _camera.getOrigin(ae);
      var aD, ab, at = [0, 0, 0], ak = [0, 0, 0];
      ab = p(at, ak, ae);

      var ad = [0, 0, 0], aq, v = [0, 0, 0], K = (O[0] && !R[0]);
      var iswheel = _this.prevMouseZ !== view.lastMouseZ;
      if (iswheel || K) {
        _camera.unprojectToWorld(v, _this, L, J, -1);
        aq = this.rayCastZoomPoint(ad, ae, v, iswheel);
        if (aq > 0) {
          _this.lasthitd = aq;
          _this.lasthit[0] = ad[0];
          _this.lasthit[1] = ad[1];
          _this.lasthit[2] = ad[2];
          _this.lasthit[3] = ad[3];
          if (K) {
            _this.is_panhit = true;
            _this.panhit[0] = ad[0];
            _this.panhit[1] = ad[1];
            _this.panhit[2] = ad[2]
          }
        }
      } else {
        aq = -1
      }
      if (O[0] && _this.is_panhit) {
        var aa = ak;
        panddng = true;
        _camera.unprojectToWorld(v, this, L, J, -1);
        _camera.pan(
          _this.panhit, aa[0], aa[1], aa[2], v[0], v[1], v[2],
          _this.inertial_axis, 0.2)
      } else {
        panddng = false;
        if (_this.inertial_axis[3] !== 0) {
          var aa = ak;
          _camera.inertialPan(aa[0], aa[1], aa[2], _this.inertial_axis, 0.075)
          panddng = true;
          if (_this.inertial_axis[3] == 0) {
            panddng = false;
          }
        }
      }
      if (_this.pan_velocity_x !== 0 || _this.pan_velocity_y !== 0) {
        var D = ab * 0.03 * 0.025;
        _this.pan_velocity(D, ak);
      }

      _camera.getOrigin(ae);
      this._focusCenter(_this, view, _camera, ae);

      var ac = _this.smooth_zoom;
      _this.smooth_zoom += (view.lastMouseZ - _this.smooth_zoom) * 0.3;
      if (_this.smooth_zoom !== ac) {
        zooming = true;
        if (aq > 0 || _this.prevMouseZ == view.lastMouseZ && _this.lasthitd > 0) {
          var af = (_this.smooth_zoom - ac) * 0.08,
            y = vec3.distance(_this.lasthit, ae) / 6378137, D = 1;

          if (af < 0 && y > _this.limit_zoomout) {
            D = (_this.limit_zoomout * 2 - y) / _this.limit_zoomout
          }
          _camera.zoom(_this.lasthit, af * D)
        }
        var n = _this.smooth_zoom + (view.lastMouseZ - _this.smooth_zoom) * 0.3;
        if (Math.abs(_this.smooth_zoom - n) < 0.00001) {
          zooming = false;
        } else {
          zooming = true;
        }
      }
      if (_this.zoom_velocity !== 0) {
        if (_this.lasthitd_center > 0) {
          var af = (_this.zoom_velocity) * 0.03,
            y = vec3.distance(_this.lasthit_center, ae), D = 1;
          if (af < 0 && y > _this.limit_zoomout) {
            D = (_this.limit_zoomout * 2 - y) / _this.limit_zoomout
          }
          _camera.zoom(_this.lasthit_center, af * D)
        }
      }
      if (_this.heading_set !== undefined || _this.tilt_set !== undefined) {
        if (_this.lasthitd_center > 0) {
          var aj = _this.lasthit_center, az = _this.lasthit_gravity;
          if (_this.heading_set !== undefined) {
            var ag = mat64.push();
            var X = [0, 0, 0];
            _camera.getRight(X);
            matrix.rotationLookDown(ag, [0, 0, -1], az);
            matrix.rotateZ(ag, _this.heading_set);
            var ay = ag[4] * X[0] + ag[5] * X[1] + ag[6] * X[2],
              ax = ag[0] * X[0] + ag[1] * X[1] + ag[2] * X[2];
            if (ax > 1) {
              ax = 1
            } else {
              if (ax < -1) {
                ax = -1
              }
            }
            var Y = Math.acos(ax);
            if (ay > 0) {
              Y = -Y
            }
            _camera.rotateAroundPivot(
              aj[0], aj[1], aj[2], az[0], az[1], az[2], Y);
            _this.inertial_deltaX = 0;
            mat64.pop();
          }
          if (_this.tilt_set !== undefined) {
            var Q = [0, 0, 0], an = [0, 0, 0];
            _camera.getDown(Q);
            _camera.getForward(an);
            var ax = az[0] * Q[0] + az[1] * Q[1] + az[2] * Q[2],
              ay = az[0] * an[0] + az[1] * an[1] + az[2] * an[2];
            if (ax > 1) {
              ax = 1
            } else {
              if (ax < -1) {
                ax = -1
              }
            }
            var Y = Math.acos(ax);
            if (ay > 0) {
              Y = -Y
            }
            _camera.rotateAroundPivotAndTilt(
              aj[0], aj[1], aj[2], az[0], az[1], az[2], 0,
              Y - (Math.PI * 0.5 - _this.tilt_set), tilt_limit);
            _this.inertial_deltaY = 0
          }
        }
        _this.heading_set = undefined;
        _this.tilt_set = undefined
      } else {
        if (_this.tilt_velocity !== 0 || _this.heading_velocity !== 0) {
          if (_this.lasthitd_center > 0) {
            var aj = _this.lasthit_center, az = _this.lasthit_gravity, D = 0.03;
            _camera.rotateAroundPivotAndTilt(
              aj[0], aj[1], aj[2], az[0], az[1], az[2],
              _this.heading_velocity * D, _this.tilt_velocity * D, tilt_limit)
          }
        }
      }
      var w = 0.1;
      rotating = true;
      var rotate_op = false;
      if (O[2] && R[2]) {
        rotating = true;
        rotate_op = true;
        var U = view.lastMouseX - _this.prevMouseX,
          T = view.lastMouseY - _this.prevMouseY;
        if (Math.abs(U) > Math.abs(_this.inertial_deltaX)) {
          _this.inertial_deltaX += (U - _this.inertial_deltaX) * w * 2.5
        } else {
          _this.inertial_deltaX += (U - _this.inertial_deltaX) * w * 2
        }
        if (Math.abs(T) > Math.abs(_this.inertial_deltaY)) {
          _this.inertial_deltaY += (T - _this.inertial_deltaY) * w * 2.5
        } else {
          _this.inertial_deltaY += (T - _this.inertial_deltaY) * w * 2
        }
      } else {
        _this.inertial_deltaX += (0 - _this.inertial_deltaX) * w * 0.75;
        _this.inertial_deltaY += (0 - _this.inertial_deltaY) * w * 0.75;
        var factor = 1e-7;
        if ((Math.abs(_this.inertial_deltaX) < factor) &&
          (Math.abs(_this.inertial_deltaY) < factor)) {
          rotating = false;
          if (rotate_op) {
            rotate_op = false;
          }
        }
      }

      if (_this.lasthitd_center > 0) {
        var U = 0, T = 0;
        if (O[2]) {
          U = _this.inertial_deltaX;
          T = _this.inertial_deltaY;
          if (!R[2]) {
            _this.lasthitd_center_click = _this.lasthitd_center;
            _this.lasthit_center_click[0] = _this.lasthit_center[0];
            _this.lasthit_center_click[1] = _this.lasthit_center[1];
            _this.lasthit_center_click[2] = _this.lasthit_center[2];
            _this.lasthit_center_click[3] = _this.lasthit_center[3];
          }
        } else {
          U = _this.inertial_deltaX;
          T = _this.inertial_deltaY
        }
        if (_this.lasthitd_center_click > 0 && (U !== 0 || T !== 0)) {
          var camPos, graviyty;
          if (_this.camera_swivel) {
            camPos = [0, 0, 0];
            graviyty = [0, 0, 0];
            _camera.getOrigin(camPos);
            this.getDistanceToGlobe(camPos[0], camPos[1], camPos[2], graviyty);
          }
          var aj = camPos || _this.lasthit_center_click,
            az = graviyty || _this.lasthit_gravity, aD = 0.0045;
          if (_camera.rotateAroundPivotAndTilt(
            aj[0], aj[1], aj[2], az[0], az[1], az[2], -U * aD, T * aD * 0.5,
            tilt_limit)) {
            _this.inertial_deltaY = 0;
          }
        }
      }
      if ((!O[0] || !_this.is_panhit) && _this.lasthitd_center > 0) {
        var aj, az = _this.lasthit_gravity;
        aj = _this.lasthit_center;
        _camera.tiltLimit(aj, az, tilt_limit);
        _camera.smartBalance(aj, az, tilt_limit)
      }
      _camera.getOrigin(ae);
      var W = [0, 0, 0], S, V, av;
      this.getLatLonAlt(W, ae[0], ae[1], ae[2]);
      S = W[2];
      av = S - _this.distance_limit;
      V = _this.getAltitude(W[1], W[0], av);
      ab = (S - V);

      if (ab < _this.distance_limit) {
        aD = _this.distance_limit - ab;
        ab = _this.distance_limit;
        ae[0] -= aD * at[0];
        ae[1] -= aD * at[1];
        ae[2] -= aD * at[2];
        _camera.setOrigin(ae[0], ae[1], ae[2])
      }
      _this.prevMouseX = view.lastMouseX;
      _this.prevMouseY = view.lastMouseY;
      _this.prevMouseZ = view.lastMouseZ;

      R[0] = O[0];
      R[1] = O[1];
      R[2] = O[2];

      _this.camera.getWorldToCamera(_this.worldToCamera);
      return F;
    };

    _this.disableTilt = function () {
      disableTilt = true;
    };

    _this.disableHeading = function () {
      disableHeading = true;
    };
  }

  updateCenter(){ 
    var ae = [0, 0, 0];
    this.camera.getOrigin(ae);
    this._focusCenter(this,this.view,this.camera,ae);
  }

  _focusCenter(ctrl, B, camera, F) {
    var C, v = [0, 0, 0], z = [0, 0, 0];
    if (!this.lockCenterPoint) {
      var h = this.height / 2;
      if (this.getTilt() > (Math.PI * 80 / 180)) {
        h = this.height*0.1;
      }
      camera.unprojectToWorld(z, ctrl, this.width / 2, h, -1);
      C = this.rayCastToGlobeAndScene(v, F, z);
    } else {
      var aA = [0, 0, 0];
      camera.getOrigin(aA);
      C = vec3.distance(this.lockCenterPoint, aA);
      v = this.lockCenterPoint;
    }

    if (C > 0) {
      ctrl.lasthitd_center = C;
      ctrl.lasthit_center[0] = v[0];
      ctrl.lasthit_center[1] = v[1];
      ctrl.lasthit_center[2] = v[2];
      ctrl.lasthit_dist2globe =
        this.getDistanceToGlobe(v[0], v[1], v[2], ctrl.lasthit_gravity);
    }

    return C;
  }

  getXYZ(result, lon, lat, alt) {
    var xyz = this.mapView.projection.projectPoint(new GeoCoordinates(lat, lon, alt));
    result[0] = xyz.x;
    result[1] = xyz.y;
    result[2] = xyz.z;
  }

  getDistanceToGlobe(x, y, z, d) {
    var v = new THREE.Vector3();
    var dis = this.getDistanceAndNormal(v, { x: x, y: y, z: z });

    if (d) {
      d[0] = -v.x;
      d[1] = -v.y;
      d[2] = -v.z;
    }
    return dis;
  }

  getLatLonAlt(r, x, y, z) {
    var _r = this.mapView.projection.unprojectPoint({ x: x, y: y, z: z });
    r[0] = _r.latitude;
    r[1] = _r.longitude;
    r[2] = _r.altitude;
  }

  getAltitude(x, y, df) {
    if (this.mapView.zoomLevel < 13) return 0;
    else
      return this.application.elevationProvider ? this.application.elevationProvider.getHeight(new GeoCoordinates(y, x, df), true) : 0;
  }

  getDistanceAndNormal(result, xyz) {
    var x = xyz.x, y = xyz.y, z = xyz.z;
    var t = Math.sqrt(x * x + y * y + z * z), s = 1 / t;

    result.x = x * s;
    result.y = y * s;
    result.z = z * s;
    return t - 6378137;
  };

  rayCastToGlobe(result, sourc, tar, hitCountPrecision) {
    var s = 1 / 6378137;
    sourc = [sourc[0] * s, sourc[1] * s, sourc[2] * s];
    tar = [tar[0] * s, tar[1] * s, tar[2] * s];

    var Z = [0, 0, 0], Q = [0, 0, 0], T = [0, 0, 0], ai = [0, 0, 0];

    vec3.sub(Z, tar, sourc);
    var aa =
      this.getDistanceAndNormal(Q, { x: sourc[0] / s, y: sourc[1] / s, z: sourc[2] / s }) * s;
    Q = [Q.x, Q.y, Q.z]
    vec3.cross(T, Z, Q);
    var V, Y, S = vec3.length(T);
    if (S > 0) {
      Y = aa * (1 << 13) - 50;
      if (Y < 1) {
        Y = 1
      }
      Y *= 1 / ((1 << 19) * S)
    } else {
      Y = 1e+32
    }
    var M = mathUtils.rayCastToEllipsoid(
      result, sourc, tar, 1, 1) * s;


    vec3.sub(Z, result, sourc);

    if (M >= 0) {
      if (Y > M) {
        Y = M;
      }
      var N = 0;
      hitCountPrecision = hitCountPrecision || 0.01;
      V = 0;
      while (V <= 1) {
        var X = sourc[0] + Z[0] * V, W = sourc[1] + Z[1] * V,
          U = sourc[2] + Z[2] * V;

        var lt = this.mapView.projection.unprojectPoint(new THREE.Vector3(X / s, W / s, U / s));
        ai[0] = lt.longitude;
        ai[1] = lt.latitude;
        ai[2] = lt.altitude;

        lt.altitude = 50;
        var af;

        if (this.mapView.zoomLevel < 13) af = 0;
        else
          af = this.application.elevationProvider ? this.application.elevationProvider.getHeight(lt) || 0 : 0;
        if (ai[2] < af) {
          N = af;
          break
        }
        V += hitCountPrecision;
      }
      var ae = 1,
        lt = this.mapView.projection.unprojectPoint(new THREE.Vector3(sourc[0] / s, sourc[1] / s, sourc[2] / s));
      var R = lt.altitude - ae;
      ai[0] = lt.longitude;
      ai[1] = lt.latitude;
      ai[2] = lt.altitude;
      if (N > R) {
        result[0] = result[0] / s;
        result[1] = result[1] / s;
        result[2] = result[2] / s;

        return 0.000001 / s
      }
      var O = 1 + N * s;
      var ret = mathUtils.rayCastToEllipsoid(
        result, sourc, tar, 1, O);

      result[0] = result[0] / s;
      result[1] = result[1] / s;
      result[2] = result[2] / s;
      return ret / s
    }
    return -1
  };


  rayCastZoomPoint(reslut, origin, target, iswheel) {
    if (!this.lockCenterPoint || !iswheel) {
      return this.rayCastToGlobeAndScene(reslut, origin, target, this.view.lastMouseX, this.view.lastMouseY, false, true);
    } else {
      var aA = [0, 0, 0], C;
      camera.getOrigin(aA);
      C = vec3.distance(this.lockCenterPoint, aA);
      reslut[0] = this.lockCenterPoint[0];
      reslut[1] = this.lockCenterPoint[1];
      reslut[2] = this.lockCenterPoint[2];
      return C;
    }
  }

  animatePan(x, w) {
    this.pan_velocity_x = x;
    this.pan_velocity_y = w;
  };

  animateHeading(v) {
    this.heading_velocity = v;
  };

  setHeading(v) {
    this.heading_set = v;
  };

  setPenPrecision(v) {
    this.penPrecision = v;
  };

  getHeading() {
    var w = this, z = w.camera;
    if (w.heading_set !== undefined) {
      return w.heading_set;
    }
    if (w.lasthitd_center > 0) {
      var y = w.lasthit_gravity;
      var x = mat64.push(), v = [0, 0, 0];

      z.getRight(v);
      this.rotationLookDown(x, y);

      var C = x[4] * v[0] + x[5] * v[1] + x[6] * v[2],
        B = x[0] * v[0] + x[1] * v[1] + x[2] * v[2];
      if (B > 1) {
        B = 1
      } else {
        if (B < -1) {
          B = -1
        }
      }
      var A = Math.acos(B);
      if (C < 0) {
        A = -A
      }
      mat64.pop();
      if (A < 0) {
        A += 2 * Math.PI
      }
      return A
    }
    return 0
  };

  setTo(lon, lat, z, alt, theta, phi) {
    var C = lon, w = lat, v = alt, F = theta, H = phi;

    var G = this, B = G.camera;
    var A = [0, 0, 0], E = [0, 0, 0];

    B.getOrigin(A);
    this.getXYZ(A, C, w, z || 0);
    this.getDistanceToGlobe(A[0], A[1], A[2], E);

    var D = B.cameraToWorld;
    matrix.setIdentity(D);
    matrix.translate(D, A[0], A[1], A[2]);
    this.setTorotationLookDown(D, E);
    if (H !== undefined) {
      matrix.rotateZ(D, H)
    }
    matrix.rotateX(D, ((F !== undefined) ? F : Math.PI * 0.25));
    matrix.translate(D, 0, 0, (v));
    G.inertial_deltaX = 0;
    G.inertial_deltaY = 0
  };

  setToWithVector(lon, lat, z, vector) {
    var C = lon, w = lat;

    var G = this, B = G.camera;
    var A = [0, 0, 0], E = [0, 0, 0];

    B.getOrigin(A);
    this.getXYZ(A, C, w, z || 0);

    var D = B.cameraToWorld;
    matrix.setIdentity(D);
    matrix.translate(D, A[0], A[1], A[2]);

    if (vector)
      matrix.rotationLookAt(D, [0, 0, 0], vector, A)

    matrix.translate(D, 0, 0, (0));
    G.inertial_deltaX = 0;
    G.inertial_deltaY = 0
  };

  flyTo(
    lat, lng, camVdistance, speed, centerDistance, theta, phi, toCity = false, I) {
    var D = lat, w = lng, A = camVdistance, x = speed, v = centerDistance,
      H = theta, J = phi;

    var G = this, C = G.camera;

    G.zoom_finishCallback = I;
    G.zoom_animation = true;
    G.zoom_mode = 0;
    G.zoom_time = 0;
    G.zoom_speed = x || 1;
    G.zoom_to_city = false;
    var E = [0, 0, 0], B = [0, 0, 0], F = [0, 0, 0];

    C.getOrigin(E);

    var tar = new Vector3();
    this.mapView.projection.projectPoint(new GeoCoordinates(lat, lng, 0), tar);
    tar.normalize()
    var current = new Vector3().fromArray(this.lasthit_center).normalize();

    if (Math.acos(tar.dot(current)) > Math.PI / 4) {
      toCity = true;
      G.zoom_speed = 0.4;
    }

    if (toCity && G.getLocationAtCenter(G.zoom_start)) {
      G.zoom_to_city = true;
      G.zoom_start[4] = G.getTilt();
      G.zoom_start[5] = G.getHeading();
      G.zoom_end[0] = D;
      G.zoom_end[1] = w;
      G.zoom_end[2] = A || 0;
      G.zoom_end[3] = (v || 2000);
      G.zoom_end[4] = H || 0;
      G.zoom_end[5] = J || 0;
      this.getXYZ(B, w, D, A || 0);
      G.zoom_distance = vec3.distance(E, B);
      return;
    }
    G.zoom_speed *= 5;
    this.getXYZ(B, w, D, A || 0);
    this.getDistanceToGlobe(B[0], B[1], B[2], F);

    G.zoom_height_ratio = 0.25;
    matrix.copy(G.zoom_start_matrix, C.cameraToWorld);
    //
    G.zoom_globe_center = [0, 0, 0]  // y.center;
    matrix.setIdentity(G.zoom_end_matrix);
    matrix.translate(G.zoom_end_matrix, B[0], B[1], B[2]);

    this.flyTorotationLookDown(G.zoom_end_matrix, F);

    if (J !== undefined) {
      matrix.rotateZ(G.zoom_end_matrix, J)
    }
    if (G.zoom_mode !== 1) {
      matrix.copy(G.zoom_mid_matrix, G.zoom_end_matrix);
      matrix.slerp(
        G.zoom_mid_matrix, G.zoom_start_matrix, G.zoom_mid_matrix, 0.5)
    }
    matrix.rotateX(G.zoom_end_matrix, (H));
    matrix.translate(G.zoom_end_matrix, 0, 0, (v || 2000));
  };

  animateTilt(v) {
    this.tilt_velocity = v
  };

  setTilt(v) {
    this.tilt_set = v
  };

  getTilt() {
    var w = this, y = w.camera;
    if (w.heading_set !== undefined) {
      return w.heading_set
    }
    if (w.lasthitd_center > 0) {
      var x = w.lasthit_gravity;
      var v = [0, 0, 0], C = [0, 0, 0];
      y.getDown(v);
      y.getForward(C);

      var A = x[0] * v[0] + x[1] * v[1] + x[2] * v[2],
        B = x[0] * C[0] + x[1] * C[1] + x[2] * C[2];

      if (A > 1) {
        A = 1
      } else {
        if (A < -1) {
          A = -1
        }
      }
      var z = Math.acos(A);
      if (B > 0) {
        z = -z
      }
      if (z < 0) {
        z += 2 * Math.PI
      }
      return z - Math.PI * 0.5;
    }
    return 0
  };

  animateZoom(v) {
    this.zoom_velocity = v;
  };
}

export { FreeControl };