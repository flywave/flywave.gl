"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.TerrainController = void 0;
exports.decodeDemImage = decodeDemImage;
exports.createSkirtedGrid = createSkirtedGrid;
const THREE = __importStar(require("three"));
const flywave_geoutils_1 = require("@flywave/flywave-geoutils");
const MapTerrainMaterial_1 = require("./materials/MapTerrainMaterial");
const GRID_SEGMENTS = 128;
function degToRad(d) {
    return (d * Math.PI) / 180;
}
function tile2lat(y, z) {
    const n = Math.PI - (2 * Math.PI * y) / Math.pow(2, z);
    return (180 / Math.PI) * Math.atan(Math.sinh(n));
}
function decodeDemImage(image, encoding = 'mapbox') {
    var _a, _b, _c, _d;
    const canvas = typeof document !== 'undefined'
        ? document.createElement('canvas') : null;
    if (!canvas) {
        return new THREE.DataTexture(new Float32Array([0]), 1, 1, THREE.RedFormat, THREE.FloatType);
    }
    const w = (_b = (_a = image.naturalWidth) !== null && _a !== void 0 ? _a : image.width) !== null && _b !== void 0 ? _b : image.width;
    const h = (_d = (_c = image.naturalHeight) !== null && _c !== void 0 ? _c : image.height) !== null && _d !== void 0 ? _d : image.height;
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(image, 0, 0);
    const { data } = ctx.getImageData(0, 0, w, h);
    const heights = new Float32Array(w * h);
    for (let i = 0; i < w * h; i++) {
        const r = data[i * 4];
        const g = data[i * 4 + 1];
        const b = data[i * 4 + 2];
        heights[i] = encoding === 'mapbox'
            ? (0, MapTerrainMaterial_1.decodeTerrainElevation)(r, g, b)
            : r * 256 + g + b / 256 - 32768;
    }
    const tex = new THREE.DataTexture(heights, w, h, THREE.RedFormat, THREE.FloatType);
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.needsUpdate = true;
    return tex;
}
function createSkirtedGrid(size, segments, skirtHeight) {
    var _a, _b;
    const geo = new THREE.PlaneGeometry(size, size, segments, segments);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    const count = pos.count;
    const borderIndices = [];
    for (let i = 0; i < count; i++) {
        const x = pos.getX(i);
        const z = pos.getZ(i);
        const half = size / 2;
        const isBorder = Math.abs(x - (-half)) < 1e-6 || Math.abs(x - half) < 1e-6 ||
            Math.abs(z - (-half)) < 1e-6 || Math.abs(z - half) < 1e-6;
        if (isBorder)
            borderIndices.push(i);
    }
    const skirtVerts = [];
    const skirtIdx = [];
    const uv = geo.attributes.uv;
    for (const bi of borderIndices) {
        const base = pos.getX(bi) !== undefined ? count + skirtVerts.length / 3 : 0;
        const sx = pos.getX(bi);
        const sy = pos.getY(bi) - skirtHeight;
        const sz = pos.getZ(bi);
        skirtVerts.push(sx, sy, sz);
        const su = uv.getX(bi);
        const sv = uv.getY(bi);
        uv.setXY(count + skirtVerts.length / 3 - 1, su, sv);
        skirtIdx.push(bi, count + skirtVerts.length / 3 - 1);
    }
    const newPos = new Float32Array(pos.array.length + skirtVerts.length);
    newPos.set(pos.array, 0);
    newPos.set(skirtVerts, pos.array.length);
    geo.setAttribute('position', new THREE.BufferAttribute(newPos, 3));
    const idxArr = geo.index ? Array.from(geo.index.array) : [];
    for (let k = 0; k + 1 < skirtIdx.length; k += 2) {
        const a = skirtIdx[k], aS = skirtIdx[k + 1];
        const b = (_a = skirtIdx[k + 2]) !== null && _a !== void 0 ? _a : skirtIdx[0];
        const bS = (_b = skirtIdx[k + 3]) !== null && _b !== void 0 ? _b : skirtIdx[1];
        idxArr.push(a, aS, b);
        idxArr.push(aS, bS, b);
    }
    geo.setIndex(idxArr);
    geo.computeVertexNormals();
    return geo;
}
class TerrainController {
    constructor(scene) {
        this.m_meshes = [];
        this.m_demTextures = [];
        this.m_centerDem = null;
        this.m_morphActive = false;
        this.m_morphStart = 0;
        this.m_prevDemTextures = [];
        this.m_scene = scene;
        this.m_gridGeometry = createSkirtedGrid(flywave_geoutils_1.EarthConstants.EQUATORIAL_CIRCUMFERENCE / 4, GRID_SEGMENTS, 0);
    }
    get meshCount() { return this.m_meshes.length; }
    get meshes() { return this.m_meshes; }
    get centerDem() {
        return this.m_centerDem;
    }
    get allDemTiles() {
        const out = [];
        for (let i = 0; i < this.m_meshes.length; i++) {
            const mesh = this.m_meshes[i];
            const demTex = this.m_demTextures[i];
            if (!demTex || !mesh)
                continue;
            const tileWorldSize = mesh.scale.x * (flywave_geoutils_1.EarthConstants.EQUATORIAL_CIRCUMFERENCE / 4);
            const cx = mesh.position.x;
            const cz = mesh.position.z;
            out.push({
                texture: demTex,
                originX: cx - tileWorldSize / 2,
                originY: cz - tileWorldSize / 2,
                size: tileWorldSize,
            });
        }
        return out;
    }
    updateMorphing(now) {
        if (!this.m_morphActive)
            return false;
        const elapsed = now - this.m_morphStart;
        const t = Math.min(1, elapsed / TerrainController.MORPH_DURATION);
        const eased = t * t * (3 - 2 * t);
        for (const mesh of this.m_meshes) {
            const mat = mesh.material;
            if (typeof mat.setDemLerp === 'function') {
                mat.setDemLerp(eased);
            }
        }
        if (t >= 1) {
            this.m_morphActive = false;
            for (const tex of this.m_prevDemTextures)
                tex.dispose();
            this.m_prevDemTextures = [];
        }
        return this.m_morphActive;
    }
    get isMorphing() { return this.m_morphActive; }
    setWireframe(enabled) {
        for (const mesh of this.m_meshes) {
            const mat = mesh.material;
            mat.wireframe = enabled;
        }
    }
    async build(demTileUrl, zoom, center, exaggeration, radius = 1) {
        var _a;
        const prevDemTextures = [...this.m_demTextures];
        this.m_demTextures = [];
        this.dispose();
        if (radius < 0)
            radius = 0;
        const lat = degToRad(center[1]);
        const n = Math.pow(2, zoom);
        const cxTile = Math.floor(((center[0] + 180) / 360) * n);
        const cyTile = Math.floor(((1 - Math.log(Math.tan(lat) + 1 / Math.cos(lat)) / Math.PI) / 2) * n);
        const C = flywave_geoutils_1.EarthConstants.EQUATORIAL_CIRCUMFERENCE;
        const tileSizeWorld = C / n;
        const loader = new THREE.TextureLoader();
        const tasks = [];
        for (let dy = -radius; dy <= radius; dy++) {
            for (let dx = -radius; dx <= radius; dx++) {
                const xTile = ((cxTile + dx) % n + n) % n;
                const yTile = Math.max(0, Math.min(n - 1, cyTile + dy));
                const url = demTileUrl
                    .replace('{z}', String(zoom))
                    .replace('{x}', String(xTile))
                    .replace('{y}', String(yTile));
                tasks.push(this.loadAndAddTile(url, loader, dx, dy, cxTile, cyTile, tileSizeWorld, C, exaggeration, zoom));
            }
        }
        await Promise.all(tasks);
        if (prevDemTextures.length > 0 && this.m_meshes.length === prevDemTextures.length) {
            for (let i = 0; i < this.m_meshes.length; i++) {
                const mat = this.m_meshes[i].material;
                mat.setDemPrevTexture((_a = prevDemTextures[i]) !== null && _a !== void 0 ? _a : null);
                mat.setDemLerp(0);
            }
            this.m_prevDemTextures = prevDemTextures;
            this.m_morphStart = Date.now();
            this.m_morphActive = true;
        }
        else {
            for (const t of prevDemTextures)
                t.dispose();
        }
    }
    async loadAndAddTile(url, loader, dx, dy, cxTile, cyTile, tileSizeWorld, C, exaggeration, zoom) {
        try {
            const pngTexture = await loader.loadAsync(url);
            const demTex = decodeDemImage(pngTexture.image, 'mapbox');
            this.m_demTextures.push(demTex);
            const material = new MapTerrainMaterial_1.MapTerrainMaterial();
            material.setDemTexture(demTex);
            material.setDemIsFloat(true);
            material.setExaggeration(exaggeration);
            const geo = this.m_gridGeometry.clone();
            const worldX = (cxTile + dx) * tileSizeWorld + tileSizeWorld / 2;
            const worldY = C - (cyTile + dy) * tileSizeWorld - tileSizeWorld / 2;
            if (dx === 0 && dy === 0) {
                this.m_centerDem = {
                    texture: demTex,
                    originX: (cxTile) * tileSizeWorld,
                    originY: C - (cyTile + 1) * tileSizeWorld,
                    size: tileSizeWorld,
                };
            }
            const mesh = new THREE.Mesh(geo, material);
            mesh.position.set(worldX, 0, worldY);
            mesh.scale.set(tileSizeWorld / (C / 4), 1, tileSizeWorld / (C / 4));
            mesh.renderOrder = -100;
            this.m_meshes.push(mesh);
            this.m_scene.add(mesh);
        }
        catch (_a) {
        }
    }
    dispose() {
        for (const m of this.m_meshes) {
            this.m_scene.remove(m);
            m.material.dispose();
        }
        this.m_meshes = [];
        for (const t of this.m_demTextures)
            t.dispose();
        this.m_demTextures = [];
    }
}
exports.TerrainController = TerrainController;
TerrainController.MORPH_DURATION = 250;
//# sourceMappingURL=TerrainController.js.map