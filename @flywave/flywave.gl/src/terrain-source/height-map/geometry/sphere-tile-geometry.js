import { BufferAttribute, BufferGeometry, Vector3 } from "three"

class SphereTileGrids {
  geometryCache = {};
  models = {};

  radminLevel = 4;
  radmaxLevel = 8;

  inverse_flattening = 1 / 298.257223563;
  flatten_factor = 1;
  inverse_flatten_factor = 1;

  e = 0;

  constructor() {
    var model_l = new Float64Array(4097),
      model_k = new Float64Array(4097);

    var v = this.flatten_factor, q, u, t, s = model_l, r = model_k;
    for (q = 0; q < 4097; q++) {
      u = (Math.PI * q / 4096 - Math.PI * 0.5);
      t = Math.atan(v * Math.tan(u)) + Math.PI * 0.5;
      r[q] = t;
      u = 2 * Math.atan(Math.exp(u * 2));
      s[q] = u;
    }

    this.getModel = () => {
      return [model_l, model_k];
    }
  }

  get_patch_tangent(C, q, v, t) {
    var model = this.getModel();
    var E = Math.pow(2, q), G, K, O, M, L, r, s, z, w, u, A, P, J, H, F,
      I = model[0], D;
    for (D = 0, M = 0; M < 2; M++) {
      A = (v + M) / E * 4096;
      P = Math.floor(A);
      K = I[P];
      K += (I[P + 1] - K) * (A - P);
      L = Math.sin(K);
      r = Math.cos(K);
      s = 1 / Math.sqrt(1 - this.e * r * r);
      for (O = 0; O < 2; O++) {
        G = Math.PI * ((t + O) * 2 / E);
        J = -Math.cos(G) * L;
        H = -Math.sin(G) * L;
        F = -r;
        z = J * s;
        w = H * s;
        u = F * s * (1 - this.e);
        C[D] = z;
        C[D + 1] = w;
        C[D + 2] = u;
        // B[D] = J;
        // B[D + 1] = H;
        // B[D + 2] = F;
        D += 3
      }
    }
  }

  computeSimpleROT(tileKey, tilePositon, childTileKey) {
    if (tileKey.level < this.radmaxLevel) {
      return false;
    }

    var U = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    var ab, R, Q;
    ab = tileKey.level;
    R = tileKey.row;
    Q = tileKey.column;
    var Y = 0, X = 0, ag = 1;
    var zoom = tileKey.level;
    if (childTileKey) {
      var K = childTile.level - zoom;
      var xoff = (1 << K) - 1 - (childTile.row - (tileKey.row << K))
      var yoff = childTileKey.column - (childTileKey.column << K);
      ab += K;
      Y = yoff;
      X = (1 << K) - 1 - xoff;
      R = (R << K) + X;
      Q = (Q << K) + Y;
      ag = 1 / (1 << K);
      Y *= ag;
      X *= ag
    }
    var O = tilePositon.x, N = tilePositon.y, L = tilePositon.z;
    this.get_patch_tangent(U, ab, R, Q);

    var mat = new THREE.Matrix4();
    var Z = mat.elements;
    Z[0] = U[0] - O;
    Z[1] = U[1] - N;
    Z[2] = U[2] - L;
    Z[3] = ag;
    Z[4] = U[3] - U[0];
    Z[5] = U[4] - U[1];
    Z[6] = U[5] - U[2];
    Z[7] = 0;
    Z[8] = U[6] - O;
    Z[9] = U[7] - N;
    Z[10] = U[8] - L;
    Z[11] = Y;
    Z[12] = U[9] - U[6];
    Z[13] = U[10] - U[7];
    Z[14] = U[11] - U[8];
    Z[15] = X
    return mat;
  }

  computeSphereTileBasePosition(tileKey) {
    if (tileKey.level < 7) {
      return this.createBoundingSphere(tileKey);
    }

    var x = tileKey.row;
    var y = tileKey.column;
    var r = Math.pow(2, tileKey.level),
      p = this.e,
      model = this.getModel()[0];
    var q, T, F, Q, A, Z, Y, W, S, X;


    q = Math.PI * ((y + 0.5) * 2 / r);
    S = (x + 0.5) / r * 4096;
    X = Math.floor(S);
    T = model[X];
    T += (model[X + 1] - T) * (S - X);
    F = Math.sin(T);
    Q = Math.cos(T);
    A = 1 / Math.sqrt(1 - p * Q * Q);
    Z = -Math.cos(q) * F;

    Y = Math.sin(q) * F * -1;

    W = -Q;

    return new Vector3(Z * (A), Y * (A), W * (A * (1 - p)));
  }

  createBoundingSphere(tileKey) {
    var globe_model = this.getModel();
    var z = tileKey.level;
    var x = tileKey.row
    var y = tileKey.column;
    var K = Math.pow(2, z),
      L, P, Q, B, C, v, u, t, J, V, O = globe_model[0],
      p = this.e,
      L = Math.PI * ((y + 0.5) * 2 / K);
    J = (x + 0.5) / K * 4096;
    V = Math.floor(J);
    P = O[V];
    P += (O[V + 1] - P) * (J - V);
    Q = Math.sin(P);
    B = Math.cos(P);
    C = 1 / Math.sqrt(1 - p * B * B);
    v = -Math.cos(L) * Q;
    u = -Math.sin(L) * Q;
    t = -B * C * (1 - p);
    return new Vector3(v * C, u * C, t);
  }

  
	computeVertexNormals(geometry,skritMap) {

		const index = geometry.index;
		const positionAttribute = geometry.getAttribute( 'position' );

		if ( positionAttribute !== undefined ) {

			let normalAttribute = geometry.getAttribute( 'normal' );

			if ( normalAttribute === undefined ) {

				normalAttribute = new BufferAttribute( new Float32Array( positionAttribute.count * 3 ), 3 );
				geometry.setAttribute( 'normal', normalAttribute );

			} else {

				// reset existing normals to zero

				for ( let i = 0, il = normalAttribute.count; i < il; i ++ ) {

					normalAttribute.setXYZ( i, 0, 0, 0 );

				}

			}

			const pA = new Vector3(), pB = new Vector3(), pC = new Vector3();
			const nA = new Vector3(), nB = new Vector3(), nC = new Vector3();
			const cb = new Vector3(), ab = new Vector3();

			// indexed elements

			if ( index ) {

				for ( let i = 0, il = index.count; i < il; i += 3 ) {

					const vA = index.getX( i + 0 );
					const vB = index.getX( i + 1 );
					const vC = index.getX( i + 2 );


					pA.fromBufferAttribute( positionAttribute, vA );
					pB.fromBufferAttribute( positionAttribute, vB );
					pC.fromBufferAttribute( positionAttribute, vC );

          if(skritMap){
            if(skritMap[vA*3]!==false){
              pA.fromArray(skritMap[vA*3]);
            }

            if(skritMap[vB*3]!==false){
              pB.fromArray(skritMap[vB*3]);
            }

            if(skritMap[vC*3]!==false){
              pC.fromArray(skritMap[vC*3]);
            } 
          }

					cb.subVectors( pC, pB );
					ab.subVectors( pA, pB );
					cb.cross( ab );

					nA.fromBufferAttribute( normalAttribute, vA );
					nB.fromBufferAttribute( normalAttribute, vB );
					nC.fromBufferAttribute( normalAttribute, vC );

					nA.add( cb );
					nB.add( cb );
					nC.add( cb ); 
          normalAttribute.setXYZ( vA, nA.x, nA.y, nA.z );
          normalAttribute.setXYZ( vB, nB.x, nB.y, nB.z );
          normalAttribute.setXYZ( vC, nC.x, nC.y, nC.z ); 

				}

			} else {

				// non-indexed elements (unconnected triangle soup)

				for ( let i = 0, il = positionAttribute.count; i < il; i += 3 ) {

					pA.fromBufferAttribute( positionAttribute, i + 0 );
					pB.fromBufferAttribute( positionAttribute, i + 1 );
					pC.fromBufferAttribute( positionAttribute, i + 2 );

					cb.subVectors( pC, pB );
					ab.subVectors( pA, pB );
					cb.cross( ab );

					normalAttribute.setXYZ( i + 0, cb.x, cb.y, cb.z );
					normalAttribute.setXYZ( i + 1, cb.x, cb.y, cb.z );
					normalAttribute.setXYZ( i + 2, cb.x, cb.y, cb.z );

				}

			}

			geometry.normalizeNormals();

			normalAttribute.needsUpdate = true;

		}

	}

  getTileModel(tileKey) {
    var y = tileKey.row, z = tileKey.level;
    var models = this.models;
    var geoCache = this.geometryCache;
    const { radmaxLevel, radminLevel } = this;

    var sub = 7 - z, tileCount = 1 << z, name;
    if (sub < 4) {
      sub = 4
    }

    var mode;
    var calNormal;
    if (z >= radmaxLevel) {
      name = 'simple.patch/' + sub;
      if (!models[name]) {
        var count = (1 << sub) + 1, X = count;
        mode = models[name] =
          this.generate_patch_simple_skirt(count * 4, X * 4, 0, 0, 1, 1, 2000, true);
        mode.is_simple_patch = true;
      } else {
        mode = models[name];
      }
    } else {
      name = z + '/' + y + '/patch';
      if (!models[name]) {
        calNormal = true;
        if (z >= radminLevel) {
          mode = models[name] = this.generate_patch_buckets_skirt(
            true, sub, y, 0, tileCount, tileCount, true)
        } else {
          mode = models[name] = this.generate_patch_buckets(
            true, sub, y, 0, tileCount, tileCount, true)
        }
        mode.is_simple_patch = false;
      } else {
        mode = models[name];
      }
    }

    if (!geoCache[name]) {
      var geometry = new BufferGeometry();
      geometry.mode = mode;
      geometry.setIndex(mode.materials[0].indices_uint);
      geometry.setAttribute('uv', mode.sources[0].uv_coords_float);
      geometry.setAttribute(
        'position', mode.sources[0].xyz_coords_float);
      geoCache[name] = geometry; 
      if(calNormal)
      this.computeVertexNormals(geometry,mode.skritMap);
    }

    return geoCache[name];
  }
   
  generate_patch_simple_skirt(
    segX, segY, offsetX, offsetY, paddingX, paddingY, skirt, bol, aa) {
    var W = segX, ag = segY, V = offsetX, U = offsetY, M = paddingX,
      L = paddingY, r = skirt, K = bol;

    var ae, Q, D, ac, ab, Y, X, ah, af, I, G, F, C;
    if (aa !== 0) {
      W += 2;
      ag += 2
    }
    var aj = W * ag, R = (W - 1) * (ag - 1) * 2 - 8, ai = {
      number_of_sources: 1,
      sources: [{
        number_of_verts: aj,
        xyz_coords_float: new BufferAttribute(new Float32Array(aj * 3), 3),
        uv_coords_float: new BufferAttribute(new Float32Array(aj * 2), 2)
      }],
      number_of_materials: 1,
      materials: [{
        source_index: 0,
        number_of_tris: R,
        indices_uint: new BufferAttribute(new Uint16Array(R * 3), 1)
      }]
    };

    var H = ai.sources[0], J = H.xyz_coords_float.array,
      P = H.uv_coords_float.array, s = ai.materials[0].indices_uint.array;
    D = 0;
    Q = 0;
    ae = 0;
    if (K && (M > 1 || L > 1)) {
      I = 0.5;
      G = 0.5;
      F = 0
    } else {
      I = 0;
      G = 0;
      F = 0
    }
    var aa = -r;
    for (ab = 0; ab < ag; ab++) {
      for (ac = 0; ac < W; ac++, D += 3, Q += 2) {
        C = 0;
        Y = (ac - 1) / (W - 3);
        X = (ab - 1) / (ag - 3);
        if (Y < 0) {
          Y = 0;
          C = aa
        } else {
          if (Y > 1) {
            Y = 1;
            C = aa
          }
        }
        if (X < 0) {
          X = 0;
          C = aa
        } else {
          if (X > 1) {
            X = 1;
            C = aa
          }
        }
        ah = (U + Y) / (L);
        af = (V + X) / (M);
        J[D] = ah - I;
        J[D + 1] = af - G;
        J[D + 2] = C - F;
        P[Q] = Y;
        P[Q + 1] = X;
        if (ac > 0 && ab > 0 &&
          (((ac - 1) % (W - 2)) != 0 || ((ab - 1) % (ag - 2)) !== 0)) {
          s[ae] = (ab - 1) * W + (ac - 1);
          s[ae + 1] = (ab - 1) * W + (ac);
          s[ae + 2] = (ab) * W + (ac - 1);
          s[ae + 3] = (ab - 1) * W + (ac);
          s[ae + 4] = (ab) * W + (ac);
          s[ae + 5] = (ab) * W + (ac - 1);
          ae += 6
        }
      }
    }
    return ai
  };

  generate_patch_buckets_skirt(
    use, level, x, _ab, countX, countY, bol) {
    var D = use, ap = level, ac = x, ab = _ab, T = countX, S = countY, R = bol;
    var model = this.getModel();
    var al, am, X, I, ak, aj, af, ae, aq, ao, q, aa, K, V, C, G, F, E, Z, ah, P,
      M, L, H, t, s, B;
    if (D) {
      B = model[0]
    } else {
      B = model[1]
    }
    var ad = (1 << ap) + 1, an = ad;
    ad += 2;
    an += 2;

    var r = 1 << (ap << 1), au = ad * an, Y = (ad - 1) * (an - 1) * 2, ar = {
      number_of_sources: 1,
      sources: [{
        number_of_verts: au,
        xyz_has_skirt: [],
        xyz_coords_float: new BufferAttribute(new Float32Array(au * 3), 3),
        uv_coords_float: new BufferAttribute(new Float32Array(au * 2), 2)
      }],
      number_of_materials: 1,
      materials: [{
        source_index: 0,
        number_of_tris: Y,
        indices_uint: new BufferAttribute(new Uint16Array(Y * 3), 1),
        bucket_levels: ap,
        bucket_count: r,
        bucket_offsets: new Uint16Array(r + 1)
      }],
      bucket_levels: ap,
      skritMap:[]
    };

    var O = ar.sources[0], Q = O.xyz_coords_float.array,
      W = O.uv_coords_float.array, z = ar.materials[0].indices_uint.array,
      ag = ar.materials[0].bucket_offsets;
    I = 0;
    X = 0;
    am = 0;
    if (R && (T > 1 || S > 1)) {
      q = Math.PI * (ab + 0.5) / S * 2;
      Z = (ac + 0.5) / T * 4096;
      ah = Math.floor(Z);
      aa = B[ah];
      aa += (B[ah + 1] - aa) * (Z - ah);
      K = Math.sin(aa);
      V = Math.cos(aa);
      C = 1 / Math.sqrt(1 - this.e * V * V);
      P = -Math.cos(q) * K * C;
      M = -Math.sin(q) * K * C;
      L = -V * C * (1 - this.e)
    } else {
      P = 0;
      M = 0;
      L = 0
    }
    for (al = 0; al < r; al++) {
      ag[al] = 0
    }
    for (aj = 0; aj < an; aj++) {
      for (ak = 0; ak < ad; ak++) {
        if (ak > 0 && aj > 0) {
          t = ak - 2;
          if (t < 0) {
            t = 0
          } else {
            if (t > ad - 4) {
              t = ad - 4
            }
          }
          s = an - 2 - aj;
          if (s < 0) {
            s = 0
          } else {
            if (s > an - 4) {
              s = an - 4
            }
          }
          t = (t & 255) + ((t & 65280) << 8);
          t = (t & 252645135) + ((t & 4042322160) << 4);
          t = (t & 858993459) + ((t & 3435973836) << 2);
          t = (t & 1431655765) + ((t & 2863311530) << 1);
          s = (s & 255) + ((s & 65280) << 8);
          s = (s & 252645135) + ((s & 4042322160) << 4);
          s = (s & 858993459) + ((s & 3435973836) << 2);
          s = (s & 1431655765) + ((s & 2863311530) << 1);
          am = ((t << 1) + s);
          ag[am] += 2
        }
      }
    }
    var at = 0, J = 0;
    for (al = 0; al < r; al++) {
      var A = ag[al];
      J += at;
      ag[al] = J + A;
      at = A
    }
    J += at;
    ag[al] = J;
    var ai = 0.2 / T; 
    var skritMap=ar.skritMap;
    for (aj = 0; aj < an; aj++) {
      for (ak = 0; ak < ad; ak++, I += 3, X += 2) {
        H = 0;
        af = (ak - 1) / (ad - 3);
        ae = (aj - 1) / (an - 3);
        if (af < 0) {
          af = 0;
          H = ai
        } else {
          if (af > 1) {
            af = 1;
            H = ai
          }
        }
        if (ae < 0) {
          ae = 0;
          H = ai
        } else {
          if (ae > 1) {
            ae = 1;
            H = ai
          }
        }
        aq = (ab + af) / (S);
        ao = (ac + ae) / (T);
        q = Math.PI * aq * 2;
        Z = ao * 4096;
        ah = Math.floor(Z);
        aa = B[ah];
        aa += (B[ah + 1] - aa) * (Z - ah);
        K = Math.sin(aa);
        V = Math.cos(aa);
        C = 1 / Math.sqrt(1 - this.e * V * V);
        G = -Math.cos(q) * K * (C - H);
        F = -Math.sin(q) * K * (C - H);
        E = -V * (C * (1 - this.e) - H);
        Q[I] = G - P;
        Q[I + 1] = F - M;
        Q[I + 2] = E - L;
        {
          G = -Math.cos(q) * K * (C);
          F = -Math.sin(q) * K * (C);
          E = -V * (C * (1 - this.e)); 
          skritMap[I]=(H!=0)?[(G - P),(F - M),(E - L)]:false; 
        }

        W[X] = af;
        W[X + 1] = ae;
        if (ak > 0 && aj > 0) {
          t = ak - 2;
          if (t < 0) {
            t = 0
          } else {
            if (t > ad - 4) {
              t = ad - 4
            }
          }
          s = an - 2 - aj;
          if (s < 0) {
            s = 0
          } else {
            if (s > an - 4) {
              s = an - 4
            }
          }
          t = (t & 255) + ((t & 65280) << 8);
          t = (t & 252645135) + ((t & 4042322160) << 4);
          t = (t & 858993459) + ((t & 3435973836) << 2);
          t = (t & 1431655765) + ((t & 2863311530) << 1);
          s = (s & 255) + ((s & 65280) << 8);
          s = (s & 252645135) + ((s & 4042322160) << 4);
          s = (s & 858993459) + ((s & 3435973836) << 2);
          s = (s & 1431655765) + ((s & 2863311530) << 1);
          am = ((t << 1) + s);
          ag[am] -= 2;
          am = ag[am] * 3;
          z[am] = (aj - 1) * ad + (ak - 1);
          z[am + 1] = (aj - 1) * ad + (ak);
          z[am + 2] = (aj) * ad + (ak - 1);
          z[am + 3] = (aj - 1) * ad + (ak);
          z[am + 4] = (aj) * ad + (ak);
          z[am + 5] = (aj) * ad + (ak - 1); 
        }
      }
    } 
    return ar
  };

  generate_patch_buckets(
    use, level, x, _ab, countX, countY, bol) {
    var C = use, am = level, aa = x, Z = _ab, R = countX, Q = countY, P = bol;
    var model = this.getModel();
    var ai, aj, V, H, ah, ag, ad, ac, an, al, q, Y, I, T, B, F, E, D, X, af, M,
      K, J, t, s, A;
    if (C) {
      A = model[0]
    } else {
      A = model[1]
    }
    var ab = (1 << am) + 1, ak = ab, r = 1 << (am << 1), ap = ab * ak,
      W = (ab - 1) * (ak - 1) * 2, ao = {
        number_of_sources: 1,
        sources: [{
          number_of_verts: ap,
          xyz_coords_float: new BufferAttribute(new Float32Array(ap * 3), 3),
          uv_coords_float: new BufferAttribute(new Float32Array(ap * 2), 2)
        }],
        number_of_materials: 1,
        materials: [{
          source_index: 0,
          number_of_tris: W,
          indices_uint: new BufferAttribute(new Uint16Array(W * 3), 1),
          bucket_levels: am,
          bucket_count: r,
          bucket_offsets: new Uint16Array(r + 1)
        }],
        bucket_levels: am
      };

    var L = ao.sources[0], O = L.xyz_coords_float.array,
      U = L.uv_coords_float.array, z = ao.materials[0].indices_uint.array,
      ae = ao.materials[0].bucket_offsets;
    H = 0;
    V = 0;
    aj = 0;
    if (P && (R > 1 || Q > 1)) {
      q = Math.PI * (Z + 0.5) / Q * 2;
      X = (aa + 0.5) / R * 4095;
      af = Math.floor(X);
      Y = A[af];
      Y += (A[af + 1] - Y) * (X - af);
      I = Math.sin(Y);
      T = Math.cos(Y);
      B = 1 / Math.sqrt(1 - this.e * T * T);
      M = -Math.cos(q) * I * B;
      K = -Math.sin(q) * I * B;
      J = -T * B * (1 - this.e)
    } else {
      M = 0;
      K = 0;
      J = 0
    }
    for (ag = 0; ag < ak; ag++) {
      for (ah = 0; ah < ab; ah++, H += 3, V += 2) {
        ad = (ah) / (ab - 1);
        ac = (ag) / (ak - 1);
        an = (Z + ad) / (Q);
        al = (aa + ac) / (R);
        q = Math.PI * an * 2;
        X = al * 4095;
        af = Math.floor(X);
        Y = A[af];
        Y += (A[af + 1] - Y) * (X - af);
        I = Math.sin(Y);
        T = Math.cos(Y);
        B = 1 / Math.sqrt(1 - this.e * T * T);
        F = -Math.cos(q) * I * (B);
        E = -Math.sin(q) * I * (B);
        D = -T * (B * (1 - this.e));

        O[H] = F - M;
        O[H + 1] = E - K;
        O[H + 2] = D - J;
        U[V] = ad;
        U[V + 1] = ac;
        if (ah > 0 && ag > 0) {
          t = ah - 1;
          s = ak - 1 - ag;
          t = (t & 255) + ((t & 65280) << 8);
          t = (t & 252645135) + ((t & 4042322160) << 4);
          t = (t & 858993459) + ((t & 3435973836) << 2);
          t = (t & 1431655765) + ((t & 2863311530) << 1);
          s = (s & 255) + ((s & 65280) << 8);
          s = (s & 252645135) + ((s & 4042322160) << 4);
          s = (s & 858993459) + ((s & 3435973836) << 2);
          s = (s & 1431655765) + ((s & 2863311530) << 1);
          aj = ((t << 1) + s) * 6;
          z[aj] = (ag - 1) * ab + (ah - 1);
          z[aj + 1] = (ag - 1) * ab + (ah);
          z[aj + 2] = (ag) * ab + (ah - 1);
          z[aj + 3] = (ag - 1) * ab + (ah);
          z[aj + 4] = (ag) * ab + (ah);
          z[aj + 5] = (ag) * ab + (ah - 1)
        }
      }
    }
    ae[0] = 0;
    for (ai = 0; ai < r; ai++) {
      ae[ai + 1] = ae[ai] + 2
    }
    return ao
  }
}

var sphereTileGridGeometry = new SphereTileGrids();

export { sphereTileGridGeometry };
