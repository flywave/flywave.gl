// §323 offline cross-check: mgl shouldSplit (tile-unit semantics, the spec)
// vs the engine-side meter-space formulation drafted in FrustumIntersection.
// Runs the SAME traversal and compares per-node SPLIT/STOP decisions.
const path = '/home/aninggo/work/flywave.gl/node_modules/.pnpm/gl-matrix@3.4.3/node_modules/gl-matrix';
const { mat4, vec3, vec4, quat } = require(path);

// ---------- fixture (error-overlap) ----------
const CENTER_LNG = 0.005, CENTER_LAT = 0.01, ZOOM = 14.51, PITCH_DEG = 60, BEARING = -45;
const WIDTH = 256, HEIGHT = 1024;
const FOV = 0.6435011087932843;
const SOURCE_TILE_SIZE = 256;
const SOURCE_MAXZOOM = 17;

const EARTH_CIRC = 40075016.6855785;
const mercX = (lng) => (lng + 180) / 360;
const mercY = (lat) => {
    const cl = Math.max(-85.051129, Math.min(85.051129, lat));
    const r = cl * Math.PI / 180;
    return (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2;
};
const mercZfromAlt = (alt, lat) => alt / (EARTH_CIRC * Math.cos(lat * Math.PI / 180));

const worldSize = 512 * Math.pow(2, ZOOM);
const pixelsPerMeter = mercZfromAlt(1, CENTER_LAT) * worldSize;
const cameraToCenterDistance = 0.5 / Math.tan(FOV / 2) * HEIGHT;
const pitch = PITCH_DEG * Math.PI / 180;
const cosLat = Math.cos(CENTER_LAT * Math.PI / 180);

const orientation = quat.identity([]);
quat.rotateZ(orientation, orientation, BEARING * Math.PI / 180); // §333-corrected
quat.rotateX(orientation, orientation, -pitch);
const camForward = vec3.transformQuat([], [0, 0, -1], orientation);

const cx = mercX(CENTER_LNG), cy = mercY(CENTER_LAT);
const altitude = (0.5 / Math.tan(FOV / 2) * HEIGHT) / worldSize;
const cameraPos = [
    cx - camForward[0] * altitude,
    cy - camForward[1] * altitude,
    0 - camForward[2] * altitude,
];

// ---------- matrices (mgl frustum for culling, from the ref tool) ----------
const centerOffset = { x: 0, y: 0 };
const fovAboveCenter = FOV * (0.5 + centerOffset.y / HEIGHT);
const nearZ = HEIGHT / 50;
const worldToCamera = mat4.create();
{
    const invOrientation = quat.conjugate([], orientation);
    const invPosition = vec3.scale([], cameraPos, -worldSize);
    mat4.fromQuat(worldToCamera, invOrientation);
    mat4.translate(worldToCamera, worldToCamera, invPosition);
    worldToCamera[1] *= -1; worldToCamera[5] *= -1; worldToCamera[9] *= -1; worldToCamera[13] *= -1;
    worldToCamera[8] *= pixelsPerMeter; worldToCamera[9] *= pixelsPerMeter;
    worldToCamera[10] *= pixelsPerMeter; worldToCamera[11] *= pixelsPerMeter;
}
const horizonShift = 0.1;
let farZ;
{
    const cameraToSeaLevelDistance = (cameraPos[2] * worldSize) / Math.cos(pitch);
    const topHalfSurfaceDistance = Math.sin(fovAboveCenter) * cameraToSeaLevelDistance /
        Math.sin(Math.max(Math.PI / 2 - pitch - fovAboveCenter, 0.01));
    farZ = Math.sin(pitch) * topHalfSurfaceDistance + cameraToSeaLevelDistance;
    const horizonDistance = cameraToSeaLevelDistance * (1 / horizonShift);
    farZ = Math.min(farZ + (farZ - cameraToSeaLevelDistance) * 0.1, horizonDistance);
    farZ += cameraToSeaLevelDistance;
}
const cameraToClip = mat4.perspective([], FOV, WIDTH / HEIGHT, nearZ, farZ);
cameraToClip[8] = -centerOffset.x * 2 / WIDTH;
cameraToClip[9] = centerOffset.y * 2 / HEIGHT;
const projMatrix = mat4.mul([], cameraToClip, worldToCamera);
const invProjMatrix = mat4.invert([], projMatrix);

// ---------- engine-side mirror (flywave world, projected meters) ----------
// flywave camera (yaw = -bearing = 0, tilt = pitch):
//   pos = center + (sin(yaw)*g, -cos(yaw)*g, D*cos(pitch))   [north-up y]
//   fwd = (-sin(yaw)*sinP, cos(yaw)*sinP, -cosP)
// x/y are projected mercator meters; z true meters. The mgl z term must be
// converted to projected meters => camera true altitude / cos(lat).
const D = altitude * EARTH_CIRC; // projected meters (mercator z fraction x C)
const yaw = -BEARING * Math.PI / 180; // flywave yaw = -bearing (§12.64)
const engCam = {
    x: cx * EARTH_CIRC + Math.sin(yaw) * D * Math.sin(pitch),
    y: (1 - cy) * EARTH_CIRC - Math.cos(yaw) * D * Math.sin(pitch), // north-up
    z: D * Math.cos(pitch), // true meters
};
const engFwd = {
    x: -Math.sin(yaw) * Math.sin(pitch),
    y: Math.cos(yaw) * Math.sin(pitch),
    z: -Math.cos(pitch),
};
const engCamH = engCam.z / cosLat; // projected meters

const z = Math.round(ZOOM + Math.log2(512 / SOURCE_TILE_SIZE));
const actualZ = z;
const numTiles = Math.pow(2, z);
const zoomSplitDistance = cameraToCenterDistance / SOURCE_TILE_SIZE;
const maxZoom = Math.min(z, SOURCE_MAXZOOM);
const centerPoint = [numTiles * cx, numTiles * cy, 0];
const cameraHeight = cameraPos[2] * numTiles;

const distToSplitScale = (dz, d) => {
    const s = 0.707, stretch = 1.1;
    if (d * s < dz) return 1.0;
    const r = d / dz;
    const k = r - 1 / s;
    return r / (1 / s + (Math.pow(stretch, k + 1) - 1) / (stretch - 1) - 1);
};

const M_PER_TILE = EARTH_CIRC / numTiles; // projected meters per tile unit

class Aabb {
    constructor(min, max) {
        this.min = min; this.max = max;
        this.center = vec3.scale([], vec3.add([], min, max), 0.5);
    }
    quadrant(index) {
        const split = [(index % 2) === 0, index < 2];
        const qMin = vec3.clone(this.min), qMax = vec3.clone(this.max);
        for (let a = 0; a < 2; a++) {
            qMin[a] = split[a] ? this.min[a] : this.center[a];
            qMax[a] = split[a] ? this.center[a] : this.max[a];
        }
        qMax[2] = this.max[2];
        return new Aabb(qMin, qMax);
    }
    getCorners() {
        const mn = this.min, mx = this.max;
        return [
            [mn[0], mn[1], mn[2]], [mx[0], mn[1], mn[2]], [mx[0], mx[1], mn[2]], [mn[0], mx[1], mn[2]],
            [mn[0], mn[1], mx[2]], [mx[0], mn[1], mx[2]], [mx[0], mx[1], mx[2]], [mn[0], mx[1], mx[2]],
        ];
    }
    closestPoint(p) {
        return [Math.max(Math.min(this.max[0], p[0]), this.min[0]),
                Math.max(Math.min(this.max[1], p[1]), this.min[1]),
                Math.max(Math.min(this.max[2], p[2]), this.min[2])];
    }
}
function satFrustum(fr, pts) {
    let fullyInside = true;
    for (const plane of fr.planes) {
        let inside = 0;
        for (const p of pts) inside += +(vec3.dot(plane, p) + plane[3] >= 0);
        if (inside === 0) return 0;
        if (inside !== pts.length) fullyInside = false;
    }
    return fullyInside ? 2 : 1;
}
Aabb.prototype.intersectsFlat = function (fr) {
    if (this.min[0] > fr.bounds.max[0] || fr.bounds.min[0] > this.max[0] ||
        this.min[1] > fr.bounds.max[1] || fr.bounds.min[1] > this.max[1]) return 0;
    return satFrustum(fr, [
        [this.min[0], this.min[1], 0], [this.max[0], this.min[1], 0],
        [this.max[0], this.max[1], 0], [this.min[0], this.max[1], 0],
    ]);
};
function makeFrustum(invProj, ws, zz, zInMeters) {
    const cornersV4 = [
        [-1, 1, -1, 1], [1, 1, -1, 1], [1, -1, -1, 1], [-1, -1, -1, 1],
        [-1, 1, 1, 1], [1, 1, 1, 1], [1, -1, 1, 1], [-1, -1, 1, 1],
    ];
    const scale = Math.pow(2, zz);
    const coords = cornersV4.map((v) => {
        const s = vec4.transformMat4([], v, invProj);
        const k = 1.0 / s[3] / ws * scale;
        return vec4.mul([], s, [k, k, zInMeters ? 1.0 / s[3] : k, k]);
    });
    const planeIdx = [[0, 1, 2], [6, 5, 4], [0, 3, 7], [2, 1, 5], [3, 2, 6], [0, 4, 5]];
    const planes = planeIdx.map(([a, b, c]) => {
        const va = vec3.sub([], coords[a], coords[b]);
        const vb = vec3.sub([], coords[c], coords[b]);
        const n = vec3.normalize([], vec3.cross([], va, vb));
        const d = -vec3.dot(n, coords[b]);
        return [n[0], n[1], n[2], d];
    });
    const points = coords.map((c) => [c[0], c[1], c[2]]);
    const fr = { planes, points, bounds: {
        min: [Math.min(...points.map(p => p[0])), Math.min(...points.map(p => p[1])), Math.min(...points.map(p => p[2]))],
        max: [Math.max(...points.map(p => p[0])), Math.max(...points.map(p => p[1])), Math.max(...points.map(p => p[2]))]
    } };
    fr.bounds.max = fr.bounds.max; fr.bounds.min = fr.bounds.min;
    return fr;
}
const cameraFrustum = makeFrustum(invProjMatrix, worldSize, z, true);

// engine decision for a node: meter-space mirror of the FrustumIntersection draft
function engineShouldSplit(it) {
    if (it.zoom === maxZoom) return { split: false };
    let d = Infinity;
    for (const c of it.aabb.getCorners()) {
        const dist = (c[0] * M_PER_TILE - engCam.x) * engFwd.x +
                     ((EARTH_CIRC - c[1] * M_PER_TILE) - engCam.y) * engFwd.y +
                     engCamH * engFwd.z;
        if (dist < d) d = dist;
    }
    const thr = (EARTH_CIRC / Math.pow(2, it.zoom)) * (cameraToCenterDistance / SOURCE_TILE_SIZE);
    const scaleF = distToSplitScale(engCamH, d);
    const centerInside = centerPoint[0] >= it.aabb.min[0] && centerPoint[0] <= it.aabb.max[0] &&
                         centerPoint[1] >= it.aabb.min[1] && centerPoint[1] <= it.aabb.max[1];
    return { split: d < thr * scaleF || centerInside, d, thr: thr * scaleF };
}

function mglShouldSplit(it) {
    if (it.zoom === maxZoom) return { split: false };
    const camPt = [numTiles * cameraPos[0], numTiles * cameraPos[1]];
    let closest = Infinity, closestElev = 0;
    for (const corner of it.aabb.getCorners()) {
        const d3 = vec3.sub([], corner, [camPt[0], camPt[1], 0]);
        d3[2] = cameraHeight;
        const dist = vec3.dot(d3, camForward);
        if (dist < closest) { closest = dist; closestElev = Math.abs(d3[2]); }
    }
    let distToSplit = (1 << (maxZoom - it.zoom)) * zoomSplitDistance;
    distToSplit *= distToSplitScale(Math.max(closestElev, cameraHeight), closest);
    if (closest < distToSplit) return { split: true, d: closest, thr: distToSplit };
    const cp = it.aabb.closestPoint(centerPoint);
    return { split: cp[0] === centerPoint[0] && cp[1] === centerPoint[1], d: closest, thr: distToSplit };
}

// traverse with mgl decisions + frustum culling, compare engine decision per node
const stack = [{ aabb: new Aabb([0, 0, 0], [numTiles, numTiles, 0]), zoom: 0, x: 0, y: 0 }];
let nodes = 0, mismatches = 0, stops = 0;
const stopDist = {};
while (stack.length) {
    const it = stack.pop();
    const r = it.aabb.intersectsFlat(cameraFrustum);
    if (r === 0) continue;
    nodes++;
    const mgl = mglShouldSplit(it);
    const eng = engineShouldSplit(it);
    if (!!mgl.split !== !!eng.split) {
        mismatches++;
        if (mismatches <= 10) {
            console.log('MISMATCH', 'z' + it.zoom, it.x, it.y,
                'mgl', mgl.split ? 'SPLIT' : 'STOP', mgl.d?.toFixed(1), mgl.thr?.toFixed(1),
                '| eng', eng.split ? 'SPLIT' : 'STOP', eng.d?.toFixed(1), eng.thr?.toFixed(1));
        }
    }
    if (it.zoom === maxZoom || !mgl.split) {
        if (it.zoom !== maxZoom) { stops++; stopDist[it.zoom] = (stopDist[it.zoom] || 0) + 1; }
        continue;
    }
    for (let i = 0; i < 4; i++) {
        stack.push({
            aabb: it.aabb.quadrant(i), zoom: it.zoom + 1,
            x: (it.x << 1) + (i % 2), y: (it.y << 1) + (i >> 1),
        });
    }
}
console.log('nodes:', nodes, 'mismatches:', mismatches, 'early-stops:', stops,
    'stop-level-dist:', JSON.stringify(stopDist));
