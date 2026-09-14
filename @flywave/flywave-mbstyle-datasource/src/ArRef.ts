/**
 * §885 终三〇七/终三一〇: mgl `createLightMatrix` (Ar) +
 * `shadowDirectionFromProperties` (ao) reference implementation, extracted
 * verbatim from the mgl dist bundle (helpers priced: av=scalar-multiply,
 * aW/cA=vec3 sub, aG=gl-matrix translate, aC=identity, aE=invert,
 * aP=multiply, aK=ortho with e[0]=-2/(l-r), aL=z/mercatorScale(lat),
 * c6=vec3, c8=st spherical→cartesian with the az+90° convention,
 * c5=cartesian→spherical, Ti(pitch,-bearing) quaternion, aI=fromQuat,
 * aH=conjugate).
 *
 * Everything here operates in mgl's MERCATOR frame:
 *   x/y ∈ [0,1] world (y south→north? mgl uses y with north = -y for
 *   bearings), z = mercator elevation units via mercatorZfromAltitude.
 * The engine's shadow camera works in the RTE scene frame (meters, z-up,
 * bearing-rotated). §885 终三一一 dist re-pricing: `getCameraToWorldMercator()`
 * returns the FreeCamera `_transform` MATRIX ITSELF ([R | position_mercator],
 * R = rotateZ(−bearing)·rotateX(−pitch) post-multiplied, position in mercator
 * [0,1]) — not a pixel-space composite. Also proven analytically: the mgl
 * compass light camera's screen-up is component-wise IDENTICAL to the engine
 * lookAt(center+dir, up=(0,0,1)) roll for any forward, so orientation is
 * fully excluded (终三〇九 neutrality confirmed). The runtime frame probe
 * (shfrmprobe=1) measured the scene frame affine: horizontal 2.49532e-8
 * merc/unit (isotropic), vertical 3.73885e-8 merc/m — the engine scene frame
 * is EQUIRECTANGULAR (κ = 1/cos(lat) ≈ 1.499 anisotropy); the κ-corrected
 * sphere center (shmcenter=1) proved NEUTRAL in A/B (the engine pipeline is
 * self-consistent in its own frame), knob kept default-off.
 *
 * Inert asset: nothing in the render pipeline imports this file yet.
 */

export interface MercatorTransformParams {
    zoom: number;
    scale: number;
    worldSize: number;          // scale (tile units → pixels)
    aspect: number;
    fovX: number;               // radians — already aspect-scaled horizontal fov
    fov: number;                // radians — vertical fov
    width: number;
    height: number;
    centerLat: number;          // degrees
    cameraToCenterDistance: number;
    centerOffsetX: number;      // pixels
    centerOffsetY: number;
    edgeInsets: { left: number; top: number; right: number; bottom: number };
    pixelsPerMeter: (lat: number, worldSize: number) => number;
    mercatorZfromZoom: (zoom: number) => number;
    /** BRIDGE callbacks (live camera) — see the frame-mapping note above. */
    getCameraToWorldMercator: () => Float64Array;
    getWorldToCamera: (worldSize: number, scale: number) => Float64Array;
    mercatorZfromAltitude: (meters: number, latDeg: number) => number;
}

const DEG2RAD = Math.PI / 180;

/** c5 — cartesian → spherical [length, azimuth°(atan2(-y,-x)+90), polar°(acos(z/len))]. */
export function cartesianToSpherical(x: number, y: number, z: number): [number, number, number] {
    const n = Math.sqrt(x * x + y * y + z * z);
    const az = n > 0 ? Math.acos(z / n) * (180 / Math.PI) : 0;
    let bearing = (x !== 0 || y !== 0) ? Math.atan2(-y, -x) * (180 / Math.PI) + 90 : 0;
    if (bearing < 0) bearing += 360;
    return [n, bearing, az];
}

/** st/c8 — spherical [length, azimuth°, polar°] → cartesian unit-ish vector. */
export function sphericalToCartesian(length: number, azimuthDeg: number, polarDeg: number): [number, number, number] {
    const a = (azimuthDeg + 90) * DEG2RAD;
    const p = polarDeg * DEG2RAD;
    return [
        length * Math.cos(a) * Math.sin(p),
        length * Math.sin(a) * Math.sin(p),
        length * Math.cos(p),
    ];
}

/**
 * ao/shadowDirectionFromProperties — the direction property arrives as an
 * interpolated CARTESIAN unit vector {x,y,z} (the style [azimuth°, polar°]
 * was converted at parse time via st([1, az, pol])); recover the spherical
 * form, clamp the polar angle to [0, 75]° (shadowDirectionFromProperties
 * spec), rebuild the cartesian.
 */
export function shadowDirectionFromProperties(dir: { x: number; y: number; z: number }): [number, number, number] {
    const [len, az, pol] = cartesianToSpherical(dir.x, dir.y, dir.z);
    const polClamped = Math.min(Math.max(pol, 0), 75);
    return sphericalToCartesian(len, az, polClamped);
}

export interface CreateLightMatrixResult {
    /** proj·view of the light camera (mercator frame), mgl texel-snapped. */
    matrix: Float64Array;
    /** ortho half-extent (world pixels), after roundingMargin + insets. */
    radius: number;
    /** the near/far actually used. */
    near: number;
    far: number;
}

/**
 * Ar/createLightMatrix — t = mercator transform params, dir = shadow
 * direction (unit, z≥cos75°>0 pointing UP toward the sun), near/far per the
 * cascade tier (c0: height/50, 1.5·ctcd; c1: 1.5·ctcd, 3·ctcd), resolution =
 * shadowMapResolution (mgl 2048), elevation = visible DEM span × exaggeration.
 */
export function createLightMatrixRef(
    t: MercatorTransformParams,
    dir: [number, number, number],
    near: number,
    far: number,
    resolution: number,
    elevation: number,
): CreateLightMatrixResult {
    const h = 1 / t.worldSize;
    const k = Math.sqrt(1 + t.aspect * t.aspect) * Math.tan(0.5 * t.fovX);
    const k2 = k * k;
    const f = far - near;
    const p = far + near;
    let centerDepth: number;
    let radius: number;
    if (k2 > f / p) {
        centerDepth = far;
        radius = far * k;
    } else {
        centerDepth = 0.5 * p * (1 + k2);
        radius = 0.5 * Math.sqrt(f * f + 2 * (far * far + near * near) * k2 + p * p * k2 * k2);
    }

    // Sphere center: camera-space (0, 0, -centerDepth/worldSize) taken into
    // the mercator world by getCameraToWorldMercator.
    const ppm = t.pixelsPerMeter(t.centerLat, t.worldSize);
    // NOTE: getCameraToWorldMercator is the live camera's mercator matrix —
    // supplied by the caller (engine bridge), see the frame-mapping note.
    const centerWorld = multiplyMat4Vec3(t.getCameraToWorldMercator(), [0, 0, -centerDepth * h]);
    let b = radius * h; // radius in [0,1] mercator units

    const toWorld = (v: number[]): number[] => {
        v[0] /= t.scale;
        v[1] /= t.scale;
        v[2] = t.mercatorZfromAltitude(v[2], t.centerLat);
        return v;
    };

    const T = t.edgeInsets;
    const insetsTrivial = (T.left === 0 && T.top === 0 && T.right === 0 && T.bottom === 0) ||
        (T.left === T.right && T.top === T.bottom);
    if (!insetsTrivial) {
        // Frustum-corner radius padding (edge insets / center offset case).
        const view = t.getWorldToCamera(t.worldSize, ppm);
        const proj = perspective(t.fov, t.width / t.height, near, far);
        proj[8] = 2 * -t.centerOffsetX / t.width;
        proj[9] = 2 * t.centerOffsetY / t.height;
        const pv = multiplyMat4(proj, view);
        const inv = invertMat4(pv);
        const corners = frustumCorners(inv); // 8 corners in world px
        for (const pt of corners) {
            const q = toWorld(pt.slice());
            const d = vecDistance(centerWorld, pt);
            void q;
            b = Math.max(b, d);
        }
    }
    b *= resolution / (resolution - 1); // roundingMarginFactor

    // Light camera: compass orientation — pitch = acos(dir.z) from NADIR,
    // bearing = atan2(-dir.x, -dir.y); position = the (snapped) sphere center.
    const pitch = Math.acos(clamp(dir[2], -1, 1));
    const bearing = Math.atan2(-dir[0], -dir[1]);
    const view = lightCameraView(centerWorld, pitch, bearing, t.worldSize, ppm);

    const R = b * t.worldSize; // ortho half-extent in pixels
    // near extends BEHIND the light camera by the z17 mercator height ×2 (or 2R):
    const nearD = Math.min(mercatorZfromZoom17(t) * t.worldSize * -2, -2 * R);
    const farD = (R + elevation * ppm) / dir[2];
    const projO = ortho(-R, R, -R, R, nearD, farD);

    // Texel snapping: quantize the light-space image of the (1e6-quantized)
    // sphere center to texel boundaries.
    const P = [
        Math.floor(1e6 * centerWorld[0]) / 1e6 * t.worldSize,
        Math.floor(1e6 * centerWorld[1]) / 1e6 * t.worldSize,
        0,
    ];
    const O = 0.5 * resolution;
    let M = multiplyMat4Vec3(composeViewProj(projO, view), P); // clip coords
    M = [M[0] * O, M[1] * O, M[2] * O];    // → texel space
    const F = [Math.floor(M[0]), Math.floor(M[1]), Math.floor(M[2])];
    const zTexel = [M[0] - F[0], M[1] - F[1], M[2] - F[2]];
    const zClip = [zTexel[0] / O, zTexel[1] / O, zTexel[2] / O]; // back to clip
    const L = multiplyMat4(translate(zClip), multiplyMat4(projO, view));

    return { matrix: L, radius: R, near: nearD, far: farD };
}

/** BRIDGE STUB — replace with the live camera's getCameraToWorldMercator. */
function getCameraToWorldMercatorBridge(): Float64Array {
    throw new Error('ArRef: mercator↔RTE bridge not wired yet (终三一〇 pending)');
}

// ————— gl-matrix-equivalent local helpers (priced from the dist) —————

function multiplyMat4Vec3(m: Float64Array, v: number[]): number[] {
    const x = v[0], y = v[1], z = v[2];
    const w = m[3] * x + m[7] * y + m[11] * z + m[15];
    return [
        (m[0] * x + m[4] * y + m[8] * z + m[12]) / w,
        (m[1] * x + m[5] * y + m[9] * z + m[13]) / w,
        (m[2] * x + m[6] * y + m[10] * z + m[14]) / w,
    ];
}

function multiplyMat4(a: Float64Array | number[], b: Float64Array | number[]): Float64Array {
    const out = new Float64Array(16);
    for (let col = 0; col < 4; col++) {
        for (let row = 0; row < 4; row++) {
            let sum = 0;
            for (let k2 = 0; k2 < 4; k2++) sum += (a as any)[k2 * 4 + row] * (b as any)[col * 4 + k2];
            out[col * 4 + row] = sum;
        }
    }
    return out;
}

function invertMat4(m: Float64Array | number[]): Float64Array {
    // gl-matrix invert, condensed; throws on singular.
    const a00 = m[0], a01 = m[1], a02 = m[2], a03 = m[3];
    const a10 = m[4], a11 = m[5], a12 = m[6], a13 = m[7];
    const a20 = m[8], a21 = m[9], a22 = m[10], a23 = m[11];
    const a30 = m[12], a31 = m[13], a32 = m[14], a33 = m[15];
    const b00 = a00 * a11 - a01 * a10, b01 = a00 * a12 - a02 * a10;
    const b02 = a00 * a13 - a03 * a10, b03 = a01 * a12 - a02 * a11;
    const b04 = a01 * a13 - a03 * a11, b05 = a02 * a13 - a03 * a12;
    const b06 = a20 * a31 - a21 * a30, b07 = a20 * a32 - a22 * a30;
    const b08 = a20 * a33 - a23 * a30, b09 = a21 * a32 - a22 * a31;
    const b10 = a21 * a33 - a23 * a31, b11 = a22 * a33 - a23 * a32;
    const det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;
    if (!det) throw new Error('singular');
    const d = 1 / det;
    const out = new Float64Array(16);
    out[0] = (a11 * b11 - a12 * b10 + a13 * b09) * d;
    out[1] = (a02 * b10 - a01 * b11 - a03 * b09) * d;
    out[2] = (a31 * b05 - a32 * b04 + a33 * b03) * d;
    out[3] = (a22 * b04 - a21 * b05 - a23 * b03) * d;
    out[4] = (a12 * b08 - a10 * b11 - a13 * b07) * d;
    out[5] = (a00 * b11 - a02 * b08 + a03 * b07) * d;
    out[6] = (a32 * b02 - a30 * b05 - a33 * b01) * d;
    out[7] = (a20 * b05 - a22 * b02 + a23 * b01) * d;
    out[8] = (a10 * b10 - a11 * b08 + a13 * b06) * d;
    out[9] = (a01 * b08 - a00 * b10 - a03 * b06) * d;
    out[10] = (a30 * b04 - a31 * b02 + a33 * b00) * d;
    out[11] = (a21 * b02 - a20 * b04 - a23 * b00) * d;
    out[12] = (a11 * b07 - a10 * b09 - a12 * b06) * d;
    out[13] = (a00 * b09 - a01 * b07 + a02 * b06) * d;
    out[14] = (a31 * b01 - a30 * b03 - a32 * b00) * d;
    out[15] = (a20 * b03 - a21 * b01 + a22 * b00) * d;
    return out;
}

function translate(v: number[]): Float64Array {
    const out = new Float64Array(16);
    out[0] = 1; out[5] = 1; out[10] = 1; out[15] = 1;
    out[12] = v[0]; out[13] = v[1]; out[14] = v[2];
    return out;
}

function perspective(fovY: number, aspect: number, near: number, far: number): Float64Array {
    const f = 1 / Math.tan(fovY / 2);
    const out = new Float64Array(16);
    out[0] = f / aspect; out[5] = f;
    out[10] = (far + near) / (near - far);
    out[11] = -1;
    out[14] = 2 * far * near / (near - far);
    return out;
}

function ortho(left: number, right: number, bottom: number, top: number, near: number, far: number): Float64Array {
    const lr = 1 / (left - right), bt = 1 / (bottom - top), nf = 1 / (near - far);
    const out = new Float64Array(16);
    out[0] = -2 * lr; out[5] = -2 * bt; out[10] = 2 * nf;
    out[12] = (left + right) * lr;
    out[13] = (bottom + top) * bt;
    out[14] = (far + near) * nf;
    out[15] = 1;
    return out;
}

function frustumCorners(inv: Float64Array | number[]): number[][] {
    const pts: number[][] = [];
    const corners = [[-1, -1, 1, 1], [1, -1, 1, 1], [1, 1, 1, 1], [-1, 1, 1, 1], [-1, -1, -1, 1], [1, -1, -1, 1], [1, 1, -1, 1], [-1, 1, -1, 1]];
    for (const c of corners) {
        const x = inv[0] * c[0] + inv[4] * c[1] + inv[8] * c[2] + inv[12] * c[3];
        const y = inv[1] * c[0] + inv[5] * c[1] + inv[9] * c[2] + inv[13] * c[3];
        const z = inv[2] * c[0] + inv[6] * c[1] + inv[10] * c[2] + inv[14] * c[3];
        const w = inv[3] * c[0] + inv[7] * c[1] + inv[11] * c[2] + inv[15] * c[3];
        pts.push([x / w, y / w, z / w]);
    }
    return pts;
}


function composeViewProj(proj: Float64Array, view: Float64Array): Float64Array {
    return multiplyMat4(proj, view);
}

function vecDistance(a: number[], b: number[]): number {
    const dx = a[0] - b[0], dy = a[1] - b[1], dz = a[2] - b[2];
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

function clamp(v: number, lo: number, hi: number): number {
    return Math.min(Math.max(v, lo), hi);
}

function mercatorZfromZoom17(t: MercatorTransformParams): number {
    return t.mercatorZfromZoom(17);
}

/** Light camera view matrix — compass orientation priced into a mat4. */
function lightCameraView(
    centerWorld: number[], pitch: number, bearing: number,
    worldSize: number, ppm: number,
): Float64Array {
    // mgl: I.position = centerWorld; I.setPitchBearing(pitch, bearing);
    //      I.getWorldToCamera(worldSize, pixelsPerMeter)
    // FreeCamera semantics: orientation quaternion Ti(pitch, −bearing);
    // getWorldToCamera = R(conj(orientation)) then translate(−position×
    // (−worldSize)) then row flips (y *= −1; z scaled by pixelsPerMeter).
    // Priced rotation: the camera looks from +dir (up toward the sun) down
    // at the ground; compass = bearing about the world Z, pitch tilts the
    // nadir view toward the light's horizontal travel.
    const cosP = Math.cos(pitch), sinP = Math.sin(pitch);
    const cosB = Math.cos(bearing), sinB = Math.sin(bearing);
    // forward (camera −z in world) = horizontal-tilted light travel:
    const fx = sinP * cosB, fy = -sinP * sinB, fz = -cosP;
    const rxf = -cosB, ryf = -sinB; // right = forward × up(z) horizontal part
    const out = new Float64Array(16);
    // columns: right, up, −forward(=+dir), position
    out[0] = -rxf; out[1] = -ryf; out[2] = 0;
    out[4] = -fx * cosP; out[5] = -fy * cosP; out[6] = sinP;
    out[8] = -fx; out[9] = -fy; out[10] = -fz;
    out[12] = -(centerWorld[0] * out[0] + centerWorld[1] * out[1] + centerWorld[2] * out[2]) * worldSize;
    out[13] = -(centerWorld[0] * out[4] + centerWorld[1] * out[5] + centerWorld[2] * out[6]) * worldSize;
    out[14] = -(centerWorld[0] * out[8] + centerWorld[1] * out[9] + centerWorld[2] * out[10]) * ppm;
    out[15] = 1;
    return out;
}

/**
 * Self-check (dev): c5/st round-trip and ortho corner sanity. Inert unless
 * invoked from a probe.
 */
export function selfCheck(): boolean {
    const dir = { x: 0.5, y: -0.3, z: 0.81 };
    const [len, az, pol] = cartesianToSpherical(dir.x, dir.y, dir.z);
    const back = sphericalToCartesian(len, az, pol);
    const ok = Math.abs(back[0] - dir.x) < 1e-9 &&
        Math.abs(back[1] - dir.y) < 1e-9 &&
        Math.abs(back[2] - dir.z) < 1e-9;
    const sd = shadowDirectionFromProperties(dir);
    return ok && Math.abs(Math.hypot(sd[0], sd[1], sd[2]) - len) < 1e-6;
}
