import { mathUtils } from './math-utils';
import { Vector3 } from 'three';

var Matrix = mathUtils.Matrix,
  MatrixStack = mathUtils.MatrixStack,
  unprojectToWorld = mathUtils.unprojectToWorld;

var vec3 = new Vector3(), matrix = Matrix(), stack = MatrixStack(),
  mat64 = stack.matrixStack64;

class Camera {

  cameraToWorld = matrix.newIdentity64();

  smoothPan = true;

  setMatrix(r) {
    matrix.copy(this.cameraToWorld, r)
  }

  followMatrix(s, x, r) {
    var w = this, u = mat64.push(), v = w.cameraToWorld, t;
    if (r) {
      t = r
    } else {
      t = v
    }
    matrix.slerp(u, t, s, x);
    u[12] = t[12] + (s[12] - t[12]) * x;
    u[13] = t[13] + (s[13] - t[13]) * x;
    u[14] = t[14] + (s[14] - t[14]) * x;
    matrix.copy(v, u);
    mat64.pop();
  }

  followMatrixGreatCircle(L, A, v, P, C, G, S) {
    var U, T, R, Q, O, x = v[12], F = v[13], M = v[14], w = L[12], E = L[13],
      K = L[14], u, D, I, t, B, H;

    U = Math.sqrt(x * x + F * F + M * M);
    T = Math.sqrt(w * w + E * E + K * K);
    u = x + (w - x) * A;
    D = F + (E - F) * A;
    I = M + (K - M) * A;
    u -= P[0];
    D -= P[1];
    I -= P[2];
    R = Math.sqrt(u * u + D * D + I * I);
    t = w - x;
    B = E - F;
    H = K - M;
    Q = Math.sqrt(t * t + B * B + H * H);
    O = (1 - A * 2);
    O = 1 - O * O;
    O = (U + (T - U) * A + Q * C * O) / R;
    var J = this, N = mat64.push(), z = J.cameraToWorld, y;
    if (v) {
      y = v
    } else {
      y = z
    }
    if (G) {
      if (S === undefined) {
        var s = mat64.push(), r = mat64.push();
        matrix.slerp(s, y, G, A);
        matrix.slerp(r, G, L, Math.pow(A, 10));
        matrix.slerp(N, s, r, A);
        mat64.pop();
        mat64.pop()
      } else {
        if (A < S) {
          matrix.slerp(N, y, G, A / S)
        } else {
          matrix.slerp(N, G, L, (A - S) / (1 - S))
        }
      }
    } else {
      matrix.slerp(N, y, L, A)
    }
    N[12] = P[0] + u * O;
    N[13] = P[1] + D * O;
    N[14] = P[2] + I * O;
    matrix.copy(z, N);
    mat64.pop()
  }

  setOrigin(r, u, t) {
    var s = this.cameraToWorld;
    s[12] = r;
    s[13] = u;
    s[14] = t
  }

  translate(t, s, r) {
    matrix.translate(this.cameraToWorld, t, s, r)
  }

  rotateX(r) {
    matrix.rotateX(this.cameraToWorld, r)
  }

  rotateY(r) {
    matrix.rotateY(this.cameraToWorld, r)
  }

  rotateZ(r) {
    matrix.rotateZ(this.cameraToWorld, r)
  }

  rotate(u, t, s, r) {
    matrix.rotateAxisAngle(this.cameraToWorld, u, t, s, r);
  }

  unprojectToWorld(r, s, v, u, t) {
    unprojectToWorld(
      r, s.cameraToUnit, this.cameraToWorld, s.width, s.height, v, u, t)
  }

  tiltLimit(D, r, E) {
    var t = this, C = t.cameraToWorld, A = D[0], y = D[1], w = D[2], B = r[0],
      z = r[1], x = r[2];
    C[12] -= A;
    C[13] -= y;
    C[14] -= w;

    var l = [];
    l[0] = C[0];
    l[1] = C[1];
    l[2] = C[2];

    var v = (C[8] * B + C[9] * z + C[10] * x),
      u = C[4] * B + C[5] * z + C[6] * x;
    if (u < 0) {
      if (v > -Math.sin(E)) {
        var s = (u > 0) ? -1 : 1;
        matrix.rotateAxisAngleT(
          C, l[0], l[1], l[2], s * (Math.asin(v) + E) * 0.5)
      }
    } else {
      matrix.rotateAxisAngleT(C, l[0], l[1], l[2], -Math.asin(u) * 0.5)
    }
    C[12] += A;
    C[13] += y;
    C[14] += w
  }

  smartBalance(F, r, D) {
    var t = this, E = t.cameraToWorld, B = F[0], z = F[1], x = F[2];
    var w = (E[0] * r[0] + E[1] * r[1] + E[2] * r[2]),
      v = (E[4] * r[0] + E[5] * r[1] + E[6] * r[2]),
      u = (E[8] * r[0] + E[9] * r[1] + E[10] * r[2]), s;
    if (Math.abs(v) > Math.abs(u)) {
      if (w < -1) {
        w = -1
      } else {
        if (w > 1) {
          w = 1
        }
      }
      s = Math.asin(w) * D;
      t.rotateAroundPivot(B, z, x, -E[8], -E[9], -E[10], s)
    } else {
      if (w < -1) {
        w = -1
      } else {
        if (w > 1) {
          w = 1
        }
      }
      s = Math.asin(w) * D;
      t.rotateAroundPivot(B, z, x, E[4], E[5], E[6], s)
    }
  }

  autoBalance(z, y, x, t, r, B) {
    var u = this, A = u.cameraToWorld, s;
    s = (A[0] * z + A[1] * y + A[2] * x) * t;
    if (r) {
      if (B) {
        var v = (A[4] * z + A[5] * y + A[6] * x);
        if (v < 0) {
          return
        }
      }
      var w = (A[8] * z + A[9] * y + A[10] * x);
      if (w < -1 + r) {
        s *= (w + 1) / r
      }
    }
    u.rotateZ(-s);
    u.rotateZ(-s)
  }

  autoBalanceAroundPivot(C, B, A, y, x, w, u) {
    var z = this, D = z.cameraToWorld,
      r = (D[0] * C + D[1] * B + D[2] * A) * u, v = D[8], t = D[9],
      s = D[10];
    z.rotateAroundPivot(y, x, w, v, t, s, r)
  }

  zoom(t, s) {
    var r = this.cameraToWorld;
    r[12] += (t[0] - r[12]) * s;
    r[13] += (t[1] - r[13]) * s;
    r[14] += (t[2] - r[14]) * s
  }

  rotateAroundPivot(w, u, s, x, v, t, y) {
    var r = this.cameraToWorld;
    r[12] -= w;
    r[13] -= u;
    r[14] -= s;
    matrix.rotateAxisAngleT(r, x, v, t, y);
    r[12] += w;
    r[13] += u;
    r[14] += s
  }

  rotateAroundPivotAndTilt(_x, _y, _z, pivoX, pivoY, pivoZ, velocity, tilt, maxtilt) {
    var A = _x, y = _y, x = _z, C = pivoX, B = pivoY, z = pivoZ, u = velocity,
      E = tilt, F = maxtilt;
    var D = this.cameraToWorld, t = [0, 0, 0];
    D[12] -= A;
    D[13] -= y;
    D[14] -= x;
    matrix.rotateAxisAngleT(D, C, B, z, u);
    t[0] = D[0];
    t[1] = D[1];
    t[2] = D[2];
    vec3.fromArray(t).normalize().toArray(t);
    matrix.rotateAxisAngleT(D, t[0], t[1], t[2], E);
    var r = false;

    if (F) {
      var w = (D[8] * C + D[9] * B + D[10] * z),
        v = D[4] * C + D[5] * B + D[6] * z;
      if (v < 0) {
        if (w > Math.sin(F)) {
          var s = (v > 0) ? -1 : 1;
          matrix.rotateAxisAngleT(
            D, t[0], t[1], t[2], s * (Math.asin(w) + F));
          r = true
        }
      } else {
        matrix.rotateAxisAngleT(D, t[0], t[1], t[2], -Math.asin(v));
        r = true
      }
    }

    D[12] += A;
    D[13] += y;
    D[14] += x;
    return r
  }

  getWorldToCamera(r) {
    matrix.inverseCamera(r, this.cameraToWorld);
  }

  getOrigin(r) {
    var s = this.cameraToWorld;
    r[0] = s[12];
    r[1] = s[13];
    r[2] = s[14]
  }

  getRight(r) {
    var s = this.cameraToWorld;
    r[0] = s[0];
    r[1] = s[1];
    r[2] = s[2]
  }

  getDown(r) {
    var s = this.cameraToWorld;
    r[0] = s[4];
    r[1] = s[5];
    r[2] = s[6]
  }

  getForward(r) {
    var s = this.cameraToWorld;
    r[0] = s[8];
    r[1] = s[9];
    r[2] = s[10]
  } 
}


export { Camera };
