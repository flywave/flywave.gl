// Offline port of mgl Transform.coveringTiles (mercator, no elevation) — §314/§315.
// Computes the reference tile set for the error-overlap fixture camera.
const path = '/home/aninggo/work/flywave.gl/node_modules/.pnpm/gl-matrix@3.4.3/node_modules/gl-matrix';
const { mat4, vec3, vec4, quat } = require(path);

// ---------- fixture camera ----------
const CENTER_LNG = 0.005, CENTER_LAT = 0.01, ZOOM = 14.51, PITCH_DEG = 60, BEARING = -45;
const WIDTH = 256, HEIGHT = 1024;          // error-overlap canvas
const FOV = 0.6435011087932843;            // mgl default
const SOURCE_TILE_SIZE = 256;              // color source
const SOURCE_MAXZOOM = 17;

// ---------- mercator helpers ----------
const EARTH_CIRC = 40075016.6855785;
const mercX = (lng) => (lng + 180) / 360;
const mercY = (lat) => {
    const cl = Math.max(-85.051129, Math.min(85.051129, lat));
    const r = cl * Math.PI / 180;
    return (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2;
};
const mercZfromAlt = (alt, lat) => alt / (EARTH_CIRC * Math.cos(lat * Math.PI / 180));

// ---------- transform state ----------
const worldSize = 512 * Math.pow(2, ZOOM);
const pixelsPerMeter = mercZfromAlt(1, CENTER_LAT) * worldSize; // mercator projection
const pixelsPerMercatorPixel = 1.0; // mercator
const cameraToCenterDistance = 0.5 / Math.tan(FOV / 2) * HEIGHT * pixelsPerMercatorPixel;
const pitch = PITCH_DEG * Math.PI / 180;
const angle = -BEARING * Math.PI / 180; // tr.angle = -bearing
const centerOffset = { x: 0, y: 0 };
const fovAboveCenter = FOV * (0.5 + centerOffset.y / HEIGHT);
const nearZ = HEIGHT / 50;

// camera orientation: rotZ(-bearing) then rotX(-pitch), mgl left-handed
const orientation = quat.identity([]);
// §333: +bearing (not −) — in the mercator y-down frame the composite maps
// bearing b to compass +b with rotateZ(−b); mgl bearing b must face compass
// b, hence rotateZ(+b). (Validated numerically: −b gave mirrored sets.)
quat.rotateZ(orientation, orientation, BEARING * Math.PI / 180);
quat.rotateX(orientation, orientation, -pitch);
const camForward = vec3.transformQuat([], [0, 0, -1], orientation);

// camera position in mercator units (no elevation)
const cx = mercX(CENTER_LNG), cy = mercY(CENTER_LAT);
const altitude = (0.5 / Math.tan(FOV / 2) * HEIGHT) / worldSize; // _mercatorZfromZoom(zoom) = ccd/ws
const cameraPos = [
    cx - camForward[0] * altitude,
    cy - camForward[1] * altitude,
    0 - camForward[2] * altitude,
];

// ---------- matrices ----------
// worldToCamera (free_camera.getWorldToCamera): quat^-1 · translate(-pos*ws), y flip, z scale
const worldToCamera = mat4.create();
{
    const invOrientation = quat.conjugate([], orientation);
    const invPosition = vec3.scale([], cameraPos, -worldSize);
    mat4.fromQuat(worldToCamera, invOrientation);
    mat4.translate(worldToCamera, worldToCamera, invPosition);
    // y flip (pre-multiply 2nd row)
    worldToCamera[1] *= -1; worldToCamera[5] *= -1; worldToCamera[9] *= -1; worldToCamera[13] *= -1;
    // z scale (post-multiply 3rd column)
    worldToCamera[8] *= pixelsPerMeter; worldToCamera[9] *= pixelsPerMeter;
    worldToCamera[10] *= pixelsPerMeter; worldToCamera[11] *= pixelsPerMeter;
}

// farZ (farthestPixelDistanceOnPlane, no elevation)
const horizonShift = 0.1;
{
    const cameraToSeaLevelDistance = (cameraPos[2] * worldSize) / Math.cos(pitch);
    const topHalfSurfaceDistance = Math.sin(fovAboveCenter) * cameraToSeaLevelDistance /
        Math.sin(Math.max(Math.PI / 2 - pitch - fovAboveCenter, 0.01));
    var farZ = Math.sin(pitch) * topHalfSurfaceDistance + cameraToSeaLevelDistance;
    const horizonDistance = cameraToSeaLevelDistance * (1 / horizonShift);
    farZ = Math.min(farZ + (farZ - cameraToSeaLevelDistance) * 0.1, horizonDistance);
    farZ += cameraToSeaLevelDistance; // a bit extra
}

const cameraToClip = mat4.perspective([], FOV, WIDTH / HEIGHT, nearZ, farZ);
cameraToClip[8] = -centerOffset.x * 2 / WIDTH;
cameraToClip[9] = centerOffset.y * 2 / HEIGHT;
const projMatrix = mat4.mul([], cameraToClip, worldToCamera);
const invProjMatrix = mat4.invert([], projMatrix);

// ---------- Aabb / Frustum (ports) ----------
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
    distanceX(p) { return Math.max(Math.min(this.max[0], p[0]), this.min[0]) - p[0]; }
    distanceY(p) { return Math.max(Math.min(this.max[1], p[1]), this.min[1]) - p[1]; }
    distanceZ(p) { return Math.max(Math.min(this.max[2], p[2]), this.min[2]) - p[2]; }
    getCorners() {
        const mn = this.min, mx = this.max;
        return [
            [mn[0], mn[1], mn[2]], [mx[0], mn[1], mn[2]], [mx[0], mx[1], mn[2]], [mn[0], mx[1], mn[2]],
            [mn[0], mn[1], mx[2]], [mx[0], mn[1], mx[2]], [mx[0], mx[1], mx[2]], [mn[0], mx[1], mx[2]],
        ];
    }
    intersectsAabb(o) {
        for (let a = 0; a < 3; a++) if (this.min[a] > o.max[a] || o.min[a] > this.max[a]) return false;
        return true;
    }
    closestPoint(p) {
        return [Math.max(Math.min(this.max[0], p[0]), this.min[0]),
                Math.max(Math.min(this.max[1], p[1]), this.min[1]),
                Math.max(Math.min(this.max[2], p[2]), this.min[2])];
    }
    intersects(fr) {
        if (!this.intersectsAabb(fr.bounds)) return 0;
        return satFrustum(fr, this.getCorners());
    }
    intersectsFlat(fr) {
        if (!this.intersectsAabb(fr.bounds)) return 0;
        return satFrustum(fr, [
            [this.min[0], this.min[1], 0], [this.max[0], this.min[1], 0],
            [this.max[0], this.max[1], 0], [this.min[0], this.max[1], 0],
        ]);
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
// Frustum.fromInvProjectionMatrix
function makeFrustum(invProj, ws, z, zInMeters) {
    const cornersV4 = [
        [-1, 1, -1, 1], [1, 1, -1, 1], [1, -1, -1, 1], [-1, -1, -1, 1],
        [-1, 1, 1, 1], [1, 1, 1, 1], [1, -1, 1, 1], [-1, -1, 1, 1],
    ];
    const scale = Math.pow(2, z);
    const coords = cornersV4.map((v) => {
        const s = vec4.transformMat4([], v, invProj);
        const k = 1.0 / s[3] / ws * scale;
        return vec4.mul([], s, [k, k, zInMeters ? 1.0 / s[3] : k, k]);
    });
    const idx = [[0, 1, 2], [3, 1, 0], [0, 3, 7], [2, 1, 5], [3, 2, 6], [0, 4, 5]];
    // NEAR_TL=0? careful: mgl enum — use explicit from source:
    // near: NEAR_TL,NEAR_TR,NEAR_BR = 0,1,2 ; far: FAR_BR,FAR_TR,FAR_TL = 6,5,4
    // left: NEAR_TL,NEAR_BL,FAR_BL = 0,3,7 ; right: NEAR_BR,NEAR_TR,FAR_TR = 2,1,5
    // bottom: NEAR_BL,NEAR_BR,FAR_BR = 3,2,6 ; top: NEAR_TL,FAR_TL,FAR_TR = 0,4,5
    const planeIdx = [[0, 1, 2], [6, 5, 4], [0, 3, 7], [2, 1, 5], [3, 2, 6], [0, 4, 5]];
    const planes = planeIdx.map(([a, b, c]) => {
        const va = vec3.sub([], coords[a], coords[b]);
        const vb = vec3.sub([], coords[c], coords[b]);
        const n = vec3.normalize([], vec3.cross([], va, vb));
        const d = -vec3.dot(n, coords[b]);
        return [n[0], n[1], n[2], d];
    });
    const points = coords.map((c) => [c[0], c[1], c[2]]);
    const fr = { planes, points, bounds: new Aabb(
        [Math.min(...points.map(p => p[0])), Math.min(...points.map(p => p[1])), Math.min(...points.map(p => p[2]))],
        [Math.max(...points.map(p => p[0])), Math.max(...points.map(p => p[1])), Math.max(...points.map(p => p[2]))]) };
    fr.containsPoint = (p) => planes.every((pl) => vec3.dot(pl, p) + pl[3] >= 0);
    return fr;
}

// ---------- coveringTiles (mercator, no elevation) ----------
function coveringTiles(options) {
    let z = Math.round(ZOOM + Math.log2(512 / options.tileSize));
    const actualZ = z;
    if (options.maxzoom !== undefined && z > options.maxzoom) z = options.maxzoom;
    const numTiles = Math.pow(2, z);
    const centerCoord = { x: cx, y: cy };
    const centerPoint = [numTiles * cx, numTiles * cy, 0];
    const meterToTile = numTiles * mercZfromAlt(1, CENTER_LAT);
    const cameraAltitude = cameraPos[2] / mercZfromAlt(1, CENTER_LAT);
    const cameraPoint = [numTiles * cameraPos[0], numTiles * cameraPos[1], cameraAltitude * meterToTile];
    const cameraFrustum = makeFrustum(invProjMatrix, worldSize, z, true);
    const zoomSplitDistance = cameraToCenterDistance / options.tileSize * (options.roundZoom ? 1 : 0.502);
    const minZoom = 0, maxZoom = z, overscaledZ = actualZ;
    const cameraHeight = cameraAltitude * meterToTile;

    const distToSplitScale = (dz, d) => {
        const s = 0.707, stretch = 1.1;
        if (d * s < dz) return 1.0;
        const r = d / dz;
        const k = r - 1 / s;
        return r / (1 / s + (Math.pow(stretch, k + 1) - 1) / (stretch - 1) - 1);
    };
    const shouldSplit = (it) => {
        if (it.zoom < minZoom) return true;
        if (it.zoom === maxZoom) return false;
        const dx = it.aabb.distanceX(cameraPoint), dy = it.aabb.distanceY(cameraPoint);
        let dz = cameraHeight;
        let closest = Infinity, closestElev = 0;
        for (const corner of it.aabb.getCorners()) {
            const d3 = vec3.sub([], corner, cameraPoint);
            d3[2] = cameraHeight;
            const dist = vec3.dot(d3, camForward);
            if (dist < closest) { closest = dist; closestElev = Math.abs(d3[2]); }
        }
        let distToSplit = (1 << (maxZoom - it.zoom)) * zoomSplitDistance;
        distToSplit *= distToSplitScale(Math.max(closestElev, cameraHeight), closest);
        if (process.env.MGL_LOD_TRACE && it.zoom >= 13) {
            console.log('TRACE', it.zoom, it.x, it.y, 'd=', closest.toFixed(1),
                'thr=', distToSplit.toFixed(1), closest < distToSplit ? 'SPLIT' : 'STOP');
        }
        if (closest < distToSplit) return true;
        const cp = it.aabb.closestPoint(centerPoint);
        return cp[0] === centerPoint[0] && cp[1] === centerPoint[1];
    };
    const newRoot = () => {
        const max = 0, min = 0;
        return {
            aabb: new Aabb([0, 0, min], [numTiles, numTiles, max]),
            zoom: 0, x: 0, y: 0, wrap: 0, fullyVisible: false, shouldSplit: null,
        };
    };
    const stack = [newRoot()];
    const result = [];
    while (stack.length) {
        const it = stack.pop();
        let fullyVisible = it.fullyVisible;
        if (!fullyVisible) {
            const r = it.aabb.intersectsFlat(cameraFrustum); // no vertical (exaggeration) intersect
            if (r === 0) continue;
            fullyVisible = r === 2;
        }
        if (it.zoom === maxZoom || !shouldSplit(it)) {
            const tileZoom = it.zoom === maxZoom ? overscaledZ : it.zoom;
            result.push({ z: tileZoom, x: it.x, y: it.y });
            continue;
        }
        for (let i = 0; i < 4; i++) {
            stack.push({
                aabb: it.aabb.quadrant(i), zoom: it.zoom + 1,
                x: (it.x << 1) + (i % 2), y: (it.y << 1) + (i >> 1),
                wrap: 0, fullyVisible, shouldSplit: null,
            });
        }
    }
    return result;
}

const tiles = coveringTiles({ tileSize: SOURCE_TILE_SIZE, maxzoom: SOURCE_MAXZOOM, roundZoom: true });
console.log('mgl reference set:', tiles.length, 'tiles');
tiles.sort((a, b) => a.z - b.z || a.x - b.x || a.y - b.y).slice(0, 60).forEach((t) => console.log(t.z, t.x, t.y));
