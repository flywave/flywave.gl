import { BufferAttribute, BufferGeometry, Matrix4, PlaneGeometry, Vector3 } from "three";

declare module "three" {
    interface BufferGeometry {
        mode?: GeometryMode;
    }
}

interface GeometryMode {
    is_simple_patch?: boolean;
    materials: Array<{
        indices_uint: BufferAttribute;
        bucket_levels?: number;
        bucket_count?: number;
        bucket_offsets?: Uint16Array;
        number_of_tris?: number;
        source_index?: number;
    }>;
    sources: Array<{
        xyz_coords_float: BufferAttribute;
        uv_coords_float: BufferAttribute;
        xyz_has_skirt?: any[];
        number_of_verts?: number;
    }>;
    number_of_sources?: number;
    number_of_materials?: number;
    bucket_levels?: number;
    skritMap?: any[];
    skritOffset?: number;
}

class SphereTileGrids {
    private geometryCache: Record<string, BufferGeometry> = {};
    private models: Record<string, GeometryMode> = {};

    private readonly radminLevel: number = 4;
    private readonly radmaxLevel: number = 8;

    private readonly inverse_flattening: number = 1 / 298.257223563;
    private readonly flatten_factor: number = 1;
    private readonly inverse_flatten_factor: number = 1;
    private readonly e: number = 0;

    private readonly simple_skirt_depth: number = 3000;

    private readonly model_l: Float64Array;
    private readonly model_k: Float64Array;

    constructor() {
        this.model_l = new Float64Array(4097);
        this.model_k = new Float64Array(4097);

        const v = this.flatten_factor;
        for (let q = 0; q < 4097; q++) {
            const u = (Math.PI * q) / 4096 - Math.PI * 0.5;
            const t = Math.atan(v * Math.tan(u)) + Math.PI * 0.5;
            this.model_k[q] = t;
            const u2 = 2 * Math.atan(Math.exp(u * 2));
            this.model_l[q] = u2;
        }
    }

    private getModel(): [Float64Array, Float64Array] {
        return [this.model_l, this.model_k];
    }

    private get_patch_tangent(C: number[], q: number, v: number, t: number): void {
        const model = this.getModel();
        const E = Math.pow(2, q);
        const I = model[0];

        for (let M = 0; M < 2; M++) {
            const A = ((v + M) / E) * 4096;
            const P = Math.floor(A);
            let K = I[P];
            K += (I[P + 1] - K) * (A - P);
            const L = Math.sin(K);
            const r = Math.cos(K);
            const s = 1 / Math.sqrt(1 - this.e * r * r);

            for (let O = 0; O < 2; O++) {
                const G = Math.PI * (((t + O) * 2) / E);
                const J = -Math.cos(G) * L;
                const H = -Math.sin(G) * L;
                const F = -r;
                const z = J * s;
                const w = H * s;
                const u = F * s * (1 - this.e);

                const D = (M * 2 + O) * 3;
                C[D] = z;
                C[D + 1] = w;
                C[D + 2] = u;
            }
        }
    }

    computeSimpleROT(
        tileKey: { level: number; row: number; column: number },
        tilePosition: Vector3,
        childTileKey?: { level: number; row: number; column: number }
    ): Matrix4 | false {
        if (tileKey.level < this.radmaxLevel) {
            return false;
        }

        const U = new Array(12).fill(0);
        let ab = tileKey.level;
        let R = tileKey.row;
        let Q = tileKey.column;
        let Y = 0;
        let X = 0;
        let ag = 1;
        const zoom = tileKey.level;

        if (childTileKey) {
            const K = childTileKey.level - zoom;
            const xoff = (1 << K) - 1 - (childTileKey.row - (tileKey.row << K));
            const yoff = childTileKey.column - (tileKey.column << K);
            ab += K;
            Y = yoff;
            X = (1 << K) - 1 - xoff;
            R = (R << K) + X;
            Q = (Q << K) + Y;
            ag = 1 / (1 << K);
            Y *= ag;
            X *= ag;
        }

        const O = tilePosition.x;
        const N = tilePosition.y;
        const L = tilePosition.z;
        this.get_patch_tangent(U, ab, R, Q);

        const mat = new Matrix4();
        const Z = mat.elements;
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
        Z[15] = X;

        return mat;
    }

    computeSphereTileBasePosition(tileKey: {
        level: number;
        row: number;
        column: number;
    }): Vector3 {
        if (tileKey.level < 7) {
            return this.createBoundingSphere(tileKey);
        }

        const x = tileKey.row;
        const y = tileKey.column;
        const r = Math.pow(2, tileKey.level);
        const p = this.e;
        const model = this.getModel()[0];

        const q = Math.PI * (((y + 0.5) * 2) / r);
        const S = ((x + 0.5) / r) * 4096;
        const X = Math.floor(S);
        let T = model[X];
        T += (model[X + 1] - T) * (S - X);
        const F = Math.sin(T);
        const Q = Math.cos(T);
        const A = 1 / Math.sqrt(1 - p * Q * Q);
        const Z = -Math.cos(q) * F * A;
        const Y = -Math.sin(q) * F * A;
        const W = -Q * A * (1 - p);

        return new Vector3(Z, Y, W);
    }

    private createBoundingSphere(tileKey: { level: number; row: number; column: number }): Vector3 {
        const globe_model = this.getModel();
        const z = tileKey.level;
        const x = tileKey.row;
        const y = tileKey.column;
        const K = Math.pow(2, z);
        const O = globe_model[0];
        const p = this.e;

        const L = Math.PI * (((y + 0.5) * 2) / K);
        const J = ((x + 0.5) / K) * 4096;
        const V = Math.floor(J);
        let P = O[V];
        P += (O[V + 1] - P) * (J - V);
        const Q = Math.sin(P);
        const B = Math.cos(P);
        const C = 1 / Math.sqrt(1 - p * B * B);
        const v = -Math.cos(L) * Q * C;
        const u = -Math.sin(L) * Q * C;
        const t = -B * C * (1 - p);

        return new Vector3(v, u, t);
    }

    computeVertexNormals(geometry: BufferGeometry, skritMap?: any[]): void {
        const index = geometry.index;
        const positionAttribute = geometry.getAttribute("position");

        if (!positionAttribute) return;

        let normalAttribute = geometry.getAttribute("normal");

        if (!normalAttribute) {
            normalAttribute = new BufferAttribute(new Float32Array(positionAttribute.count * 3), 3);
            geometry.setAttribute("normal", normalAttribute);
        } else {
            for (let i = 0, il = normalAttribute.count; i < il; i++) {
                normalAttribute.setXYZ(i, 0, 0, 0);
            }
        }

        const pA = new Vector3();
        const pB = new Vector3();
        const pC = new Vector3();
        const nA = new Vector3();
        const nB = new Vector3();
        const nC = new Vector3();
        const cb = new Vector3();
        const ab = new Vector3();

        if (index) {
            for (let i = 0, il = index.count; i < il; i += 3) {
                const vA = index.getX(i + 0);
                const vB = index.getX(i + 1);
                const vC = index.getX(i + 2);

                pA.fromBufferAttribute(positionAttribute, vA);
                pB.fromBufferAttribute(positionAttribute, vB);
                pC.fromBufferAttribute(positionAttribute, vC);

                if (skritMap) {
                    if (skritMap[vA * 3] !== false) {
                        pA.fromArray(skritMap[vA * 3]);
                    }
                    if (skritMap[vB * 3] !== false) {
                        pB.fromArray(skritMap[vB * 3]);
                    }
                    if (skritMap[vC * 3] !== false) {
                        pC.fromArray(skritMap[vC * 3]);
                    }
                }

                cb.subVectors(pC, pB);
                ab.subVectors(pA, pB);
                cb.cross(ab);

                nA.fromBufferAttribute(normalAttribute, vA);
                nB.fromBufferAttribute(normalAttribute, vB);
                nC.fromBufferAttribute(normalAttribute, vC);

                nA.add(cb);
                nB.add(cb);
                nC.add(cb);
                normalAttribute.setXYZ(vA, nA.x, nA.y, nA.z);
                normalAttribute.setXYZ(vB, nB.x, nB.y, nB.z);
                normalAttribute.setXYZ(vC, nC.x, nC.y, nC.z);
            }
        } else {
            for (let i = 0, il = positionAttribute.count; i < il; i += 3) {
                pA.fromBufferAttribute(positionAttribute, i + 0);
                pB.fromBufferAttribute(positionAttribute, i + 1);
                pC.fromBufferAttribute(positionAttribute, i + 2);

                cb.subVectors(pC, pB);
                ab.subVectors(pA, pB);
                cb.cross(ab);

                normalAttribute.setXYZ(i + 0, cb.x, cb.y, cb.z);
                normalAttribute.setXYZ(i + 1, cb.x, cb.y, cb.z);
                normalAttribute.setXYZ(i + 2, cb.x, cb.y, cb.z);
            }
        }

        geometry.normalizeNormals();
        normalAttribute.needsUpdate = true;
    }

    private getTileModelClosedBackGeometry(tileKey: {
        level: number;
        row: number;
    }): BufferGeometry {
        const y = tileKey.row;
        const z = tileKey.level;
        const { radmaxLevel } = this;

        let sub = 7 - z;
        const tileCount = 1 << z;
        if (sub < 4) {
            sub = 4;
        }

        if (z >= radmaxLevel) {
            const p = new PlaneGeometry(1, 1, 1, 1);
            p.translate(0.5, 0.5, -this.simple_skirt_depth);
            p.deleteAttribute("normal");
            p.index!.array.reverse();
            return p;
        } else {
            const mode = this.generate_patch_buckets(
                true,
                sub,
                y,
                0,
                tileCount,
                tileCount,
                true,
                0.2 / tileCount
            );

            const geometry = new BufferGeometry();
            geometry.mode = mode;
            geometry.setIndex(mode.materials[0].indices_uint);
            geometry.setAttribute("uv", mode.sources[0].uv_coords_float);
            geometry.setAttribute("position", mode.sources[0].xyz_coords_float);
            this.computeVertexNormals(geometry, mode.skritMap);

            geometry.index!.array.reverse();
            return geometry;
        }
    }

    getTileModelGeometry(tileKey: { level: number; row: number; column: number }): BufferGeometry {
        const y = tileKey.row;
        const z = tileKey.level;
        const { radmaxLevel, radminLevel } = this;

        let sub = 7 - z;
        const tileCount = 1 << z;
        let name: string;
        if (sub < 4) {
            sub = 4;
        }

        let mode: GeometryMode;
        let calNormal = false;
        if (z >= radmaxLevel) {
            name = "simple.patch/" + sub;
            if (!this.models[name]) {
                const count = (1 << sub) + 1;
                const X = count;
                mode = this.models[name] = this.generate_patch_simple_skirt(
                    count * 4,
                    X * 4,
                    0,
                    0,
                    1,
                    1,
                    this.simple_skirt_depth,
                    true
                );
                mode.is_simple_patch = true;
            } else {
                mode = this.models[name];
            }
        } else {
            name = z + "/" + y + "/patch";
            if (!this.models[name]) {
                calNormal = true;
                if (z >= radminLevel) {
                    mode = this.models[name] = this.generate_patch_buckets_skirt(
                        true,
                        sub,
                        y,
                        0,
                        tileCount,
                        tileCount,
                        true
                    );
                } else {
                    mode = this.models[name] = this.generate_patch_buckets(
                        true,
                        sub,
                        y,
                        0,
                        tileCount,
                        tileCount,
                        true
                    );
                }
                mode.is_simple_patch = false;
            } else {
                mode = this.models[name];
            }
        }

        const geometry = new BufferGeometry();
        geometry.mode = mode;
        geometry.setIndex(mode.materials[0].indices_uint);
        geometry.setAttribute("uv", mode.sources[0].uv_coords_float);
        geometry.setAttribute("position", mode.sources[0].xyz_coords_float);
        if (calNormal) {
            this.computeVertexNormals(geometry, mode.skritMap);
        }
        return geometry;
    }

    getTileModel(tileKey: { level: number; row: number; column: number }): BufferGeometry {
        const y = tileKey.row;
        const z = tileKey.level;
        const { radmaxLevel } = this;
        const sub = 7 - z;
        let name: string;

        if (z >= radmaxLevel) {
            name = "simple.patch/" + sub;
        } else {
            name = z + "/" + y + "/patch";
        }

        if (!this.geometryCache[name]) {
            const model = this.getTileModelGeometry(tileKey);
            this.geometryCache[name] = model;
            this.geometryCache[name].mode = model.mode;
        }

        return this.geometryCache[name];
    }

    private generate_patch_simple_skirt(
        segX: number,
        segY: number,
        offsetX: number,
        offsetY: number,
        paddingX: number,
        paddingY: number,
        skirt: number,
        bol: boolean,
        aa?: number
    ): GeometryMode {
        let W = segX;
        let ag = segY;
        const V = offsetX;
        const U = offsetY;
        const M = paddingX;
        const L = paddingY;
        const r = skirt;
        const K = bol;

        if (aa !== 0) {
            W += 2;
            ag += 2;
        }

        const aj = W * ag;
        const R = (W - 1) * (ag - 1) * 2 - 8;
        const ai: GeometryMode = {
            number_of_sources: 1,
            sources: [
                {
                    number_of_verts: aj,
                    xyz_coords_float: new BufferAttribute(new Float32Array(aj * 3), 3),
                    uv_coords_float: new BufferAttribute(new Float32Array(aj * 2), 2)
                }
            ],
            number_of_materials: 1,
            materials: [
                {
                    source_index: 0,
                    number_of_tris: R,
                    indices_uint: new BufferAttribute(new Uint16Array(R * 3), 1)
                }
            ]
        };

        const H = ai.sources[0];
        const J = H.xyz_coords_float.array;
        const P = H.uv_coords_float.array;
        const s = ai.materials[0].indices_uint.array;

        let D = 0;
        let Q = 0;
        let ae = 0;
        let I: number, G: number, F: number;

        if (K && (M > 1 || L > 1)) {
            I = 0.5;
            G = 0.5;
            F = 0;
        } else {
            I = 0;
            G = 0;
            F = 0;
        }

        const aa_val = -r;

        for (let ab = 0; ab < ag; ab++) {
            for (let ac = 0; ac < W; ac++, D += 3, Q += 2) {
                let C = 0;
                let Y = (ac - 1) / (W - 3);
                let X = (ab - 1) / (ag - 3);

                if (Y < 0) {
                    Y = 0;
                    C = aa_val;
                } else if (Y > 1) {
                    Y = 1;
                    C = aa_val;
                }

                if (X < 0) {
                    X = 0;
                    C = aa_val;
                } else if (X > 1) {
                    X = 1;
                    C = aa_val;
                }

                const ah = (U + Y) / L;
                const af = (V + X) / M;

                J[D] = ah - I;
                J[D + 1] = af - G;
                J[D + 2] = C - F;

                P[Q] = Y;
                P[Q + 1] = X;

                if (ac > 0 && ab > 0 && ((ac - 1) % (W - 2) !== 0 || (ab - 1) % (ag - 2) !== 0)) {
                    s[ae] = (ab - 1) * W + (ac - 1);
                    s[ae + 1] = (ab - 1) * W + ac;
                    s[ae + 2] = ab * W + (ac - 1);
                    s[ae + 3] = (ab - 1) * W + ac;
                    s[ae + 4] = ab * W + ac;
                    s[ae + 5] = ab * W + (ac - 1);
                    ae += 6;
                }
            }
        }

        return ai;
    }

    private generate_patch_buckets_skirt(
        use: boolean,
        level: number,
        x: number,
        _ab: number,
        countX: number,
        countY: number,
        bol: boolean
    ): GeometryMode {
        const ap = level;
        const ac = x;
        const ab = _ab;
        const T = countX;
        const S = countY;
        const R = bol;
        const model = this.getModel();

        let ad = (1 << ap) + 1;
        let an = ad;
        ad += 2;
        an += 2;

        const r = 1 << (ap << 1);
        const au = ad * an;
        const Y = (ad - 1) * (an - 1) * 2;
        const ar: GeometryMode = {
            number_of_sources: 1,
            sources: [
                {
                    number_of_verts: au,
                    xyz_has_skirt: [],
                    xyz_coords_float: new BufferAttribute(new Float32Array(au * 3), 3),
                    uv_coords_float: new BufferAttribute(new Float32Array(au * 2), 2)
                }
            ],
            number_of_materials: 1,
            materials: [
                {
                    source_index: 0,
                    number_of_tris: Y,
                    indices_uint: new BufferAttribute(new Uint16Array(Y * 3), 1),
                    bucket_levels: ap,
                    bucket_count: r,
                    bucket_offsets: new Uint16Array(r + 1)
                }
            ],
            bucket_levels: ap,
            skritMap: [],
            skritOffset: 0.2 / T
        };

        const O = ar.sources[0];
        const Q = O.xyz_coords_float.array;
        const W = O.uv_coords_float.array;
        const z = ar.materials[0].indices_uint.array;
        const ag = ar.materials[0].bucket_offsets;

        let I = 0;
        let X = 0;
        let aj = 0;

        let q: number,
            Z: number,
            ah: number,
            aa: number,
            K: number,
            V: number,
            C: number,
            G: number,
            F: number,
            E: number;

        if (R && (T > 1 || S > 1)) {
            q = ((Math.PI * (ab + 0.5)) / S) * 2;
            Z = ((ac + 0.5) / T) * 4096;
            ah = Math.floor(Z);
            aa = model[0][ah];
            aa += (model[0][ah + 1] - aa) * (Z - ah);
            K = Math.sin(aa);
            V = Math.cos(aa);
            C = 1 / Math.sqrt(1 - this.e * V * V);
            G = -Math.cos(q) * K * C;
            F = -Math.sin(q) * K * C;
            E = -V * C * (1 - this.e);
        } else {
            G = 0;
            F = 0;
            E = 0;
        }

        for (let al = 0; al < r; al++) {
            ag[al] = 0;
        }

        for (let aj_val = 0; aj_val < an; aj_val++) {
            for (let ak = 0; ak < ad; ak++) {
                if (ak > 0 && aj_val > 0) {
                    let t = ak - 2;
                    if (t < 0) {
                        t = 0;
                    } else if (t > ad - 4) {
                        t = ad - 4;
                    }

                    let s = an - 2 - aj_val;
                    if (s < 0) {
                        s = 0;
                    } else if (s > an - 4) {
                        s = an - 4;
                    }

                    t = (t & 255) + ((t & 65280) << 8);
                    t = (t & 252645135) + ((t & 4042322160) << 4);
                    t = (t & 858993459) + ((t & 3435973836) << 2);
                    t = (t & 1431655765) + ((t & 2863311530) << 1);

                    s = (s & 255) + ((s & 65280) << 8);
                    s = (s & 252645135) + ((s & 4042322160) << 4);
                    s = (s & 858993459) + ((s & 3435973836) << 2);
                    s = (s & 1431655765) + ((s & 2863311530) << 1);

                    aj = (t << 1) + s;
                    ag[aj] += 2;
                }
            }
        }

        let at = 0;
        let J_val = 0;
        for (let al = 0; al < r; al++) {
            const A = ag[al];
            J_val += at;
            ag[al] = J_val + A;
            at = A;
        }

        J_val += at;
        ag[r] = J_val;

        const ai = ar.skritOffset!;
        const skritMap = ar.skritMap!;

        for (let aj_val = 0; aj_val < an; aj_val++) {
            for (let ak = 0; ak < ad; ak++, I += 3, X += 2) {
                let H = 0;
                let af_val = (ak - 1) / (ad - 3);
                let ae = (aj_val - 1) / (an - 3);

                if (af_val < 0) {
                    af_val = 0;
                    H = ai;
                } else if (af_val > 1) {
                    af_val = 1;
                    H = ai;
                }

                if (ae < 0) {
                    ae = 0;
                    H = ai;
                } else if (ae > 1) {
                    ae = 1;
                    H = ai;
                }

                const aq = (ab + af_val) / S;
                const ao = (ac + ae) / T;
                q = Math.PI * aq * 2;
                Z = ao * 4096;
                ah = Math.floor(Z);
                aa = model[0][ah];
                aa += (model[0][ah + 1] - aa) * (Z - ah);
                K = Math.sin(aa);
                V = Math.cos(aa);
                C = 1 / Math.sqrt(1 - this.e * V * V);
                const F_val = -Math.cos(q) * K * (C - H);
                const E_val = -Math.sin(q) * K * (C - H);
                const D_val = -V * (C * (1 - this.e) - H);

                Q[I] = F_val - G;
                Q[I + 1] = E_val - F;
                Q[I + 2] = D_val - E;

                {
                    const F_orig = -Math.cos(q) * K * C;
                    const E_orig = -Math.sin(q) * K * C;
                    const D_orig = -V * C * (1 - this.e);
                    skritMap[I] = H !== 0 ? [F_orig - G, E_orig - F, D_orig - E] : false;
                }

                W[X] = af_val;
                W[X + 1] = ae;

                if (ak > 0 && aj_val > 0) {
                    let t = ak - 2;
                    if (t < 0) {
                        t = 0;
                    } else if (t > ad - 4) {
                        t = ad - 4;
                    }

                    let s = an - 2 - aj_val;
                    if (s < 0) {
                        s = 0;
                    } else if (s > an - 4) {
                        s = an - 4;
                    }

                    t = (t & 255) + ((t & 65280) << 8);
                    t = (t & 252645135) + ((t & 4042322160) << 4);
                    t = (t & 858993459) + ((t & 3435973836) << 2);
                    t = (t & 1431655765) + ((t & 2863311530) << 1);

                    s = (s & 255) + ((s & 65280) << 8);
                    s = (s & 252645135) + ((s & 4042322160) << 4);
                    s = (s & 858993459) + ((s & 3435973836) << 2);
                    s = (s & 1431655765) + ((s & 2863311530) << 1);

                    aj = (t << 1) + s;
                    ag[aj] -= 2;
                    const am = ag[aj] * 3;
                    z[am] = (aj_val - 1) * ad + (ak - 1);
                    z[am + 1] = (aj_val - 1) * ad + ak;
                    z[am + 2] = aj_val * ad + (ak - 1);
                    z[am + 3] = (aj_val - 1) * ad + ak;
                    z[am + 4] = aj_val * ad + ak;
                    z[am + 5] = aj_val * ad + (ak - 1);
                }
            }
        }

        return ar;
    }

    private generate_patch_buckets(
        use: boolean,
        level: number,
        x: number,
        _ab: number,
        countX: number,
        countY: number,
        bol: boolean,
        offset: number = 0
    ): GeometryMode {
        const am = level;
        const aa = x;
        const Z = _ab;
        const R = countX;
        const Q = countY;
        const P = bol;
        const model = this.getModel();

        const ab = (1 << am) + 1;
        const ak = ab;
        const r = 1 << (am << 1);
        const ap = ab * ak;
        const W = (ab - 1) * (ak - 1) * 2;
        const ao: GeometryMode = {
            number_of_sources: 1,
            sources: [
                {
                    number_of_verts: ap,
                    xyz_coords_float: new BufferAttribute(new Float32Array(ap * 3), 3),
                    uv_coords_float: new BufferAttribute(new Float32Array(ap * 2), 2)
                }
            ],
            number_of_materials: 1,
            materials: [
                {
                    source_index: 0,
                    number_of_tris: W,
                    indices_uint: new BufferAttribute(new Uint16Array(W * 3), 1),
                    bucket_levels: am,
                    bucket_count: r,
                    bucket_offsets: new Uint16Array(r + 1)
                }
            ],
            bucket_levels: am
        };

        const L = ao.sources[0];
        const O = L.xyz_coords_float.array;
        const U = L.uv_coords_float.array;
        const z = ao.materials[0].indices_uint.array;
        const ae = ao.materials[0].bucket_offsets;

        let H = 0;
        let V = 0;
        let aj = 0;

        let q: number,
            X: number,
            af: number,
            Y: number,
            I: number,
            T: number,
            B: number,
            F: number,
            E: number,
            D: number;

        if (P && (R > 1 || Q > 1)) {
            q = ((Math.PI * (Z + 0.5)) / Q) * 2;
            X = ((aa + 0.5) / R) * 4095;
            af = Math.floor(X);
            Y = model[0][af];
            Y += (model[0][af + 1] - Y) * (X - af);
            I = Math.sin(Y);
            T = Math.cos(Y);
            B = 1 / Math.sqrt(1 - this.e * T * T);
            F = -Math.cos(q) * I * B;
            E = -Math.sin(q) * I * B;
            D = -T * B * (1 - this.e);
        } else {
            F = 0;
            E = 0;
            D = 0;
        }

        for (let ag = 0; ag < ak; ag++) {
            for (let ah = 0; ah < ab; ah++, H += 3, V += 2) {
                const ad = ah / (ab - 1);
                const ac = ag / (ak - 1);
                const an = (Z + ad) / Q;
                const al = (aa + ac) / R;

                q = Math.PI * an * 2;
                X = al * 4095;
                af = Math.floor(X);
                Y = model[0][af];
                Y += (model[0][af + 1] - Y) * (X - af);
                I = Math.sin(Y);
                T = Math.cos(Y);
                B = 1 / Math.sqrt(1 - this.e * T * T);

                const F_val = -Math.cos(q) * I * (B - offset);
                const E_val = -Math.sin(q) * I * (B - offset);
                const D_val = -T * (B * (1 - this.e) - offset);

                O[H] = F_val - F;
                O[H + 1] = E_val - E;
                O[H + 2] = D_val - D;

                U[V] = ad;
                U[V + 1] = ac;

                if (ah > 0 && ag > 0) {
                    let t = ah - 1;
                    let s = ak - 1 - ag;

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
                    z[aj + 1] = (ag - 1) * ab + ah;
                    z[aj + 2] = ag * ab + (ah - 1);
                    z[aj + 3] = (ag - 1) * ab + ah;
                    z[aj + 4] = ag * ab + ah;
                    z[aj + 5] = ag * ab + (ah - 1);
                }
            }
        }

        ae[0] = 0;
        for (let ai = 0; ai < r; ai++) {
            ae[ai + 1] = ae[ai] + 2;
        }

        return ao;
    }
}

const sphereTileGridGeometry = new SphereTileGrids();
export { sphereTileGridGeometry };
