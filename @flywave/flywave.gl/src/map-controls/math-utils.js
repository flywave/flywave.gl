var mathUtils = {};
(function (scope) {
  scope.Vec3 = function () {
    var j = {};
    j.add = function (n, m, l) {
      n[0] = m[0] + l[0];
      n[1] = m[1] + l[1];
      n[2] = m[2] + l[2]
    };
    j.sub = function (n, m, l) {
      n[0] = m[0] - l[0];
      n[1] = m[1] - l[1];
      n[2] = m[2] - l[2]
    };
    j.copy = function (m, l) {
      m[0] = l[0];
      m[1] = l[1];
      m[2] = l[2]
    };
    j.cross = function (n, m, l) {
      n[0] = m[1] * l[2] - m[2] * l[1];
      n[1] = m[2] * l[0] - m[0] * l[2];
      n[2] = m[0] * l[1] - m[1] * l[0]
    };
    j.dot = function (m, l) {
      return (m[0] * l[0] + m[1] * l[1] + m[2] * l[2])
    };
    j.distance = function (o, m) {
      var p = o[0] - m[0],
        n = o[1] - m[1],
        l = o[2] - m[2];
      return Math.sqrt(p * p + n * n + l * l)
    };
    j.sqrDist = function (o, m) {
      var p = o[0] - m[0],
        n = o[1] - m[1],
        l = o[2] - m[2];
      return (p * p + n * n + l * l)
    };
    j.length = function (l) {
      return Math.sqrt(l[0] * l[0] + l[1] * l[1] + l[2] * l[2])
    };
    j.normalize = function (l) {
      var m = Math.sqrt(l[0] * l[0] + l[1] * l[1] + l[2] * l[2]);
      var n = 1 / m;
      l[0] *= n;
      l[1] *= n;
      l[2] *= n;
      return m
    };
    j.transform = function (l, n, m) {
      l[0] = n[0] * m[0] + n[1] * m[4] + n[2] * m[8] + m[12];
      l[1] = n[0] * m[1] + n[1] * m[5] + n[2] * m[9] + m[13];
      l[2] = n[0] * m[2] + n[1] * m[6] + n[2] * m[10] + m[14]
    };
    j.rotate = function (l, n, m) {
      l[0] = n[0] * m[0] + n[1] * m[4] + n[2] * m[8];
      l[1] = n[0] * m[1] + n[1] * m[5] + n[2] * m[9];
      l[2] = n[0] * m[2] + n[1] * m[6] + n[2] * m[10]
    };
    return j
  };

  scope.Matrix = function () {
    var k = {};
    var l = window;
    var j = new scope.Vec3();
    k.setZero = function (n) {
      n[0] = 0;
      n[1] = 0;
      n[2] = 0;
      n[3] = 0;
      n[4] = 0;
      n[5] = 0;
      n[6] = 0;
      n[7] = 0;
      n[8] = 0;
      n[9] = 0;
      n[10] = 0;
      n[11] = 0;
      n[12] = 0;
      n[13] = 0;
      n[14] = 0;
      n[15] = 0
    };
    k.setIdentity = function (n) {
      n[0] = 1;
      n[1] = 0;
      n[2] = 0;
      n[3] = 0;
      n[4] = 0;
      n[5] = 1;
      n[6] = 0;
      n[7] = 0;
      n[8] = 0;
      n[9] = 0;
      n[10] = 1;
      n[11] = 0;
      n[12] = 0;
      n[13] = 0;
      n[14] = 0;
      n[15] = 1
    };
    k.newIdentity32 = function () {
      var n = new Float32Array(16);
      k.setIdentity(n);
      return n
    };
    k.Float64Array = l.Float64Array || Array;
    k.newIdentity64 = function () {
      var n = new k.Float64Array(16);
      k.setIdentity(n);
      return n
    };
    k.inverseCamera = function (n, o) {
      n[0] = o[0];
      n[1] = o[4];
      n[2] = o[8];
      n[3] = 0;
      n[4] = o[1];
      n[5] = o[5];
      n[6] = o[9];
      n[7] = 0;
      n[8] = o[2];
      n[9] = o[6];
      n[10] = o[10];
      n[11] = 0;
      n[12] = -(o[12] * o[0] + o[13] * o[1] + o[14] * o[2]);
      n[13] = -(o[12] * o[4] + o[13] * o[5] + o[14] * o[6]);
      n[14] = -(o[12] * o[8] + o[13] * o[9] + o[14] * o[10]);
      n[15] = 1
    };   
    k.rotateX = function (r, o) {
      var q, n, p;
      q = Math.cos(o);
      n = Math.sin(o);
      p = r[4];
      r[4] = p * q + r[8] * n;
      r[8] = p * -n + r[8] * q;
      p = r[5];
      r[5] = p * q + r[9] * n;
      r[9] = p * -n + r[9] * q;
      p = r[6];
      r[6] = p * q + r[10] * n;
      r[10] = p * -n + r[10] * q;
      p = r[7];
      r[7] = p * q + r[11] * n;
      r[11] = p * -n + r[11] * q
    };
    k.rotateXT = function (r, o) {
      var q, n, p;
      q = Math.cos(o);
      n = Math.sin(o);
      p = r[1];
      r[1] = q * p - n * r[2];
      r[2] = n * p + q * r[2];
      p = r[5];
      r[5] = q * p - n * r[6];
      r[6] = n * p + q * r[6];
      p = r[9];
      r[9] = q * p - n * r[10];
      r[10] = n * p + q * r[10];
      p = r[13];
      r[13] = q * p - n * r[14];
      r[14] = n * p + q * r[14]
    };
    k.setRotateY = function (p, o) {
      var q, n;
      q = Math.cos(o);
      n = Math.sin(o);
      p[0] = q;
      p[1] = 0;
      p[2] = n;
      p[3] = 0;
      p[4] = 0;
      p[5] = 1;
      p[6] = 0;
      p[7] = 0;
      p[8] = -n;
      p[9] = 0;
      p[10] = q;
      p[11] = 0;
      p[12] = 0;
      p[13] = 0;
      p[14] = 0;
      p[15] = 1
    };
    k.rotateY = function (r, o) {
      var q, n, p;
      q = Math.cos(o);
      n = Math.sin(o);
      p = r[0];
      r[0] = p * q + r[8] * n;
      r[8] = p * -n + r[8] * q;
      p = r[1];
      r[1] = p * q + r[9] * n;
      r[9] = p * -n + r[9] * q;
      p = r[2];
      r[2] = p * q + r[10] * n;
      r[10] = p * -n + r[10] * q;
      p = r[3];
      r[3] = p * q + r[11] * n;
      r[11] = p * -n + r[11] * q
    };
    k.rotateZ = function (r, o) {
      var q, n, p;
      q = Math.cos(o);
      n = Math.sin(o);
      p = r[0];
      r[0] = p * q + r[4] * n;
      r[4] = p * -n + r[4] * q;
      p = r[1];
      r[1] = p * q + r[5] * n;
      r[5] = p * -n + r[5] * q;
      p = r[2];
      r[2] = p * q + r[6] * n;
      r[6] = p * -n + r[6] * q;
      p = r[3];
      r[3] = p * q + r[7] * n;
      r[7] = p * -n + r[7] * q
    };
    k.rotateAxisAngle = function (E, z, y, x, I) {
      var G, w, t, J, H, F, D, C, B;
      G = Math.sin(I);
      w = Math.cos(I);
      t = 1 - w;
      J = t * z;
      H = t * y;
      F = t * x;
      D = G * z;
      C = G * y;
      B = G * x;
      var v, u, s, r, q, p, o, n, A;
      v = J * z + w;
      r = J * y + B;
      o = J * x - C;
      u = J * y - B;
      q = H * y + w;
      n = H * x + D;
      s = J * x + C;
      p = H * x - D;
      A = F * x + w;
      J = E[0];
      H = E[4];
      F = E[8];
      E[0] = J * v + H * u + F * s;
      E[4] = J * r + H * q + F * p;
      E[8] = J * o + H * n + F * A;
      J = E[1];
      H = E[5];
      F = E[9];
      E[1] = J * v + H * u + F * s;
      E[5] = J * r + H * q + F * p;
      E[9] = J * o + H * n + F * A;
      J = E[2];
      H = E[6];
      F = E[10];
      E[2] = J * v + H * u + F * s;
      E[6] = J * r + H * q + F * p;
      E[10] = J * o + H * n + F * A;
      J = E[3];
      H = E[7];
      F = E[11];
      E[3] = J * v + H * u + F * s;
      E[7] = J * r + H * q + F * p;
      E[11] = J * o + H * n + F * A
    };
    k.rotateAxisAngleT = function (E, s, r, q, I) {
      var G, o, n, J, H, F, x, w, u;
      G = Math.sin(I);
      o = Math.cos(I);
      n = 1 - o;
      J = n * s;
      H = n * r;
      F = n * q;
      x = G * s;
      w = G * r;
      u = G * q;
      var D, C, B, A, z, y, v, t, p;
      D = J * s + o;
      A = J * r + u;
      v = J * q - w;
      C = J * r - u;
      z = H * r + o;
      t = H * q + x;
      B = J * q + w;
      y = H * q - x;
      p = F * q + o;
      J = E[0];
      H = E[1];
      F = E[2];
      E[0] = J * D + H * A + F * v;
      E[1] = J * C + H * z + F * t;
      E[2] = J * B + H * y + F * p;
      J = E[4];
      H = E[5];
      F = E[6];
      E[4] = J * D + H * A + F * v;
      E[5] = J * C + H * z + F * t;
      E[6] = J * B + H * y + F * p;
      J = E[8];
      H = E[9];
      F = E[10];
      E[8] = J * D + H * A + F * v;
      E[9] = J * C + H * z + F * t;
      E[10] = J * B + H * y + F * p;
      J = E[12];
      H = E[13];
      F = E[14];
      E[12] = J * D + H * A + F * v;
      E[13] = J * C + H * z + F * t;
      E[14] = J * B + H * y + F * p
    };
    k.rotateAxisSinCosT = function (E, s, r, q, G, o) {
      var n, I, H, F, x, w, u;
      n = 1 - o;
      I = n * s;
      H = n * r;
      F = n * q;
      x = G * s;
      w = G * r;
      u = G * q;
      var D, C, B, A, z, y, v, t, p;
      D = I * s + o;
      A = I * r + u;
      v = I * q - w;
      C = I * r - u;
      z = H * r + o;
      t = H * q + x;
      B = I * q + w;
      y = H * q - x;
      p = F * q + o;
      I = E[0];
      H = E[1];
      F = E[2];
      E[0] = I * D + H * A + F * v;
      E[1] = I * C + H * z + F * t;
      E[2] = I * B + H * y + F * p;
      I = E[4];
      H = E[5];
      F = E[6];
      E[4] = I * D + H * A + F * v;
      E[5] = I * C + H * z + F * t;
      E[6] = I * B + H * y + F * p;
      I = E[8];
      H = E[9];
      F = E[10];
      E[8] = I * D + H * A + F * v;
      E[9] = I * C + H * z + F * t;
      E[10] = I * B + H * y + F * p;
      I = E[12];
      H = E[13];
      F = E[14];
      E[12] = I * D + H * A + F * v;
      E[13] = I * C + H * z + F * t;
      E[14] = I * B + H * y + F * p
    };
    k.translate = function (q, p, o, n) {
      q[12] += q[0] * p + q[4] * o + q[8] * n;
      q[13] += q[1] * p + q[5] * o + q[9] * n;
      q[14] += q[2] * p + q[6] * o + q[10] * n
    };
    k.scale = function (o, r, q, p, n) {
      o[0] *= r;
      o[1] *= r;
      o[2] *= r;
      o[4] *= q;
      o[5] *= q;
      o[6] *= q;
      o[8] *= p;
      o[9] *= p;
      o[10] *= p;
      o[12] *= n;
      o[13] *= n;
      o[14] *= n
    };
    k.getScale = function (n) {
      return Math.sqrt(n[0] * n[0] + n[1] * n[1] + n[2] * n[2])
    };
    k.copy = function (o, n) {
      o[0] = n[0];
      o[1] = n[1];
      o[2] = n[2];
      o[3] = n[3];
      o[4] = n[4];
      o[5] = n[5];
      o[6] = n[6];
      o[7] = n[7];
      o[8] = n[8];
      o[9] = n[9];
      o[10] = n[10];
      o[11] = n[11];
      o[12] = n[12];
      o[13] = n[13];
      o[14] = n[14];
      o[15] = n[15]
    };
    k.transpose = function (o, n) {
      o[0] = n[0];
      o[1] = n[4];
      o[2] = n[8];
      o[3] = n[12];
      o[4] = n[1];
      o[5] = n[5];
      o[6] = n[9];
      o[7] = n[13];
      o[8] = n[2];
      o[9] = n[6];
      o[10] = n[10];
      o[11] = n[14];
      o[12] = n[3];
      o[13] = n[7];
      o[14] = n[11];
      o[15] = n[15]
    };
    k.getOrigin = function (o, n) {
      n[0] = o[12];
      n[1] = o[13];
      n[2] = o[14]
    };
    k.distance = function (q, o) {
      var r = q[12] - o[12],
        p = q[13] - o[13],
        n = q[14] - o[14];
      return Math.sqrt(r * r + p * p + n * n)
    };
    k.multiply = function (V, S, n) {
      var U = S[0],
        T = S[1],
        R = S[2],
        Q = S[3],
        P = S[4],
        O = S[5],
        N = S[6],
        M = S[7],
        L = S[8],
        K = S[9],
        D = S[10],
        C = S[11],
        B = S[12],
        A = S[13],
        z = S[14],
        y = S[15],
        x = n[0],
        w = n[1],
        v = n[2],
        u = n[3],
        t = n[4],
        s = n[5],
        r = n[6],
        q = n[7],
        p = n[8],
        o = n[9],
        J = n[10],
        I = n[11],
        H = n[12],
        G = n[13],
        F = n[14],
        E = n[15];
      V[0] = U * x + P * w + L * v + B * u;
      V[1] = T * x + O * w + K * v + A * u;
      V[2] = R * x + N * w + D * v + z * u;
      V[3] = Q * x + M * w + C * v + y * u;
      V[4] = U * t + P * s + L * r + B * q;
      V[5] = T * t + O * s + K * r + A * q;
      V[6] = R * t + N * s + D * r + z * q;
      V[7] = Q * t + M * s + C * r + y * q;
      V[8] = U * p + P * o + L * J + B * I;
      V[9] = T * p + O * o + K * J + A * I;
      V[10] = R * p + N * o + D * J + z * I;
      V[11] = Q * p + M * o + C * J + y * I;
      V[12] = U * H + P * G + L * F + B * E;
      V[13] = T * H + O * G + K * F + A * E;
      V[14] = R * H + N * G + D * F + z * E;
      V[15] = Q * H + M * G + C * F + y * E
    };
    k.slerp = function (G, F, n, z) {
      var L, K, I, J, H, E, D, r, p, o, C, B, A, y, x, w, v, u, q;
      if (z === 1) {
        G[0] = n[0];
        G[1] = n[1];
        G[2] = n[2];
        G[3] = n[3];
        G[4] = n[4];
        G[5] = n[5];
        G[6] = n[6];
        G[7] = n[7];
        G[8] = n[8];
        G[9] = n[9];
        G[10] = n[10];
        G[11] = n[11];
        G[12] = n[12];
        G[13] = n[13];
        G[14] = n[14];
        G[15] = n[15];
        return
      }
      G[0] = F[0];
      G[1] = F[1];
      G[2] = F[2];
      G[3] = F[3];
      G[4] = F[4];
      G[5] = F[5];
      G[6] = F[6];
      G[7] = F[7];
      G[8] = F[8];
      G[9] = F[9];
      G[10] = F[10];
      G[11] = F[11];
      G[12] = F[12];
      G[13] = F[13];
      G[14] = F[14];
      G[15] = F[15];
      if (z === 0) {
        return
      }
      L = F[1] * n[2] - F[2] * n[1] + F[5] * n[6] - F[6] * n[5] + F[9] * n[10] - F[10] * n[9];
      K = F[2] * n[0] - F[0] * n[2] + F[6] * n[4] - F[4] * n[6] + F[10] * n[8] - F[8] * n[10];
      I = F[0] * n[1] - F[1] * n[0] + F[4] * n[5] - F[5] * n[4] + F[8] * n[9] - F[9] * n[8];
      D = L * L + K * K + I * I;
      if (D === 0) {
        return
      }
      r = F[0] * L + F[1] * K + F[2] * I;
      p = F[4] * L + F[5] * K + F[6] * I;
      if (Math.abs(r) < Math.abs(p)) {
        H = F[0] * n[0] + F[1] * n[1] + F[2] * n[2];
        E = r * r
      } else {
        H = F[4] * n[4] + F[5] * n[5] + F[6] * n[6];
        E = p * p
      }
      if (D === E) {
        return
      }
      H = (H * D - E) / (D - E);
      if (H < -1) {
        H = -1
      }
      if (H > 1) {
        H = 1
      }
      J = Math.acos(H) * z;
      H = Math.cos(J);
      E = Math.sin(J);
      D = 1 / Math.sqrt(D);
      L *= D;
      K *= D;
      I *= D;
      D = 1 - H;
      C = L * D;
      u = L * E;
      o = K * C;
      x = K * D;
      A = K * E;
      p = I * C;
      q = I * D;
      y = I * E;
      r = I * x;
      C = L * C + H;
      w = r - u;
      u += r;
      x = K * x + H;
      v = p - A;
      A += p;
      q = I * q + H;
      B = o - y;
      y += o;
      r = G[0];
      p = G[1];
      o = G[2];
      G[0] = r * C + p * B + o * A;
      G[1] = r * y + p * x + o * w;
      G[2] = r * v + p * u + o * q;
      r = G[4];
      p = G[5];
      o = G[6];
      G[4] = r * C + p * B + o * A;
      G[5] = r * y + p * x + o * w;
      G[6] = r * v + p * u + o * q;
      r = G[8];
      p = G[9];
      o = G[10];
      G[8] = r * C + p * B + o * A;
      G[9] = r * y + p * x + o * w;
      G[10] = r * v + p * u + o * q
    };
    k.setLookDown = function (u, p, o, r, n) {
      var s = [0, 0, 0],
        q = [0, 0, 0],
        t = [o[0] - r[0], o[1] - r[1], o[2] - r[2]];
      j.normalize(t);
      j.cross(s, t, p);
      j.normalize(s);
      j.cross(q, t, s);
      j.normalize(q);
      u[0] = s[0];
      u[1] = s[1];
      u[2] = s[2];
      u[3] = 0;
      u[4] = q[0];
      u[5] = q[1];
      u[6] = q[2];
      u[7] = 0;
      u[8] = t[0];
      u[9] = t[1];
      u[10] = t[2];
      u[11] = 0;
      if (n !== undefined) {
        u[12] = o[0] - t[0] * n;
        u[13] = o[1] - t[1] * n;
        u[14] = o[2] - t[2] * n
      }
      u[15] = 1
    };
    k.rotationLookDown = function (r, n, s) {
      var p = [0, 0, 0],
        o = [0, 0, 0],
        q = [-s[0], -s[1], -s[2]];
      j.normalize(q);
      j.cross(p, q, n);
      j.normalize(p);
      j.cross(o, q, p);
      j.normalize(o);
      r[0] = p[0];
      r[1] = p[1];
      r[2] = p[2];
      r[4] = o[0];
      r[5] = o[1];
      r[6] = o[2];
      r[8] = q[0];
      r[9] = q[1];
      r[10] = q[2]
    };
    k.rotationLookAt = function (t, r, s, u) {
      var p = [0, 0, 0],
        n = [-u[0], -u[1], -u[2]],
        o = [0, 0, 0],
        q = [s[0] - r[0], s[1] - r[1], s[2] - r[2]];
      j.normalize(n);
      j.normalize(q);
      j.cross(p, q, n);
      j.normalize(p);
      j.cross(o, q, p);
      j.normalize(o);
      t[0] = p[0];
      t[1] = p[1];
      t[2] = p[2];
      t[4] = o[0];
      t[5] = o[1];
      t[6] = o[2];
      t[8] = q[0];
      t[9] = q[1];
      t[10] = q[2]
    };
    return k
  };

  scope.MatrixStack = function (l) {
    var j = {};
    var k = window;
    j.MatrixStack = function (n) {
      var m = [];
      m.top = 0;
      this.stack = m;
      this.push = function () {
        var o = this.stack;
        if (o.top < o.length) {
          return o[o.top++]
        }
        var p = new n(16);
        o[o.top] = p;
        if (++o.top > 100) {
          console.log("error: matrix stack overflow!")
        }
        return p
      };
      this.pop = function () {
        if (--this.stack.top < 0) {
          console.log("error: matrix stack underflow")
        }
      }
    };
    j.matrixStack32 = new j.MatrixStack(k.Float32Array), j.matrixStack64 = new j.MatrixStack(k.Float64Array || Array);
    return j
  };

  scope.unprojectToWorld = function (x, n, u, p, t, r, q, o) {
    var w, v, s, m;
    m = o;
    w = (((r / p) * 2 - 1) - n[8]) * m / n[0];
    v = ((-((q / t) * 2) + 1) - n[9]) * m / n[5];
    s = m;
    x[0] = u[0] * w + u[4] * v + u[8] * s + u[12];
    x[1] = u[1] * w + u[5] * v + u[9] * s + u[13];
    x[2] = u[2] * w + u[6] * v + u[10] * s + u[14]
    x[3] = u[3] * w + u[7] * v + u[11] * s + u[15]
  };
  scope.castToGlobe = function (m, globeMesh, global_scale) {
    var n = globeMesh.inverse_flatten_factor;
    var p = n * n;
    var o = globeMesh.major_axis * global_scale;
    var w = 0;
    var v = 0;
    var t = 0;
    var z = m[0] - w;
    var y = m[1] - v;
    var x = m[2] - t;
    var u = z * z + y * y + x * x * p;
    var s = 2 * (z * w + y * v + x * t * n);
    var r = w * w + v * v + t * t * p - o * o;
    var q = s * s - 4 * u * r;
    if (q > 0) {
      q = (-s + Math.sqrt(q)) / (2 * u);
      m[0] = w + z * q;
      m[1] = v + y * q;
      m[2] = t + x * q;
      return true
    }
    return false
  };

  scope.rayCastToEllipsoid = function (m, o, z, p, q) {
    var y = o[0];
    var x = o[1];
    var v = o[2];
    var C = z[0] - y;
    var B = z[1] - x;
    var A = z[2] - v;
    var u = v * p;
    var n = A * p;
    var w = C * C + B * B + n * n;
    var t = 2 * (C * y + B * x + n * u);
    var s = y * y + x * x + u * u - q * q;
    if (s > 0) {
      var r = t * t - 4 * w * s;
      if (r > 0) {
        r = (-t - Math.sqrt(r)) / (2 * w);
        m[0] = y + C * r;
        m[1] = x + B * r;
        m[2] = v + A * r;
        return r
      }
    }
    return -1
  };

})(mathUtils);

export { mathUtils };
