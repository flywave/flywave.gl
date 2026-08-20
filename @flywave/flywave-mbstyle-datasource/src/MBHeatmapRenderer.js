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
exports.MBHeatmapRenderer = void 0;
const THREE = __importStar(require("three"));
const flywave_geoutils_1 = require("@flywave/flywave-geoutils");
const MBExpressionEngine_1 = require("./MBExpressionEngine");
const MBMaterialPatchManager_1 = require("./MBMaterialPatchManager");
class MBHeatmapRenderer {
    constructor(m_mapView, m_dataSource) {
        this.m_mapView = m_mapView;
        this.m_dataSource = m_dataSource;
        this.m_rt = null;
        this.m_rtW = 0;
        this.m_rtH = 0;
        this.m_rtScale = 0.25;
        this.m_rtHalfFloat = false;
        this.m_kernelGeo = null;
        this.m_kernelMat = null;
        this.m_kernelMesh = null;
        this.m_compMat = null;
        this.m_compMesh = null;
        this.m_rampCache = new Map();
        this.m_kernelAllocated = 0;
        this.m_tileKernels = new Map();
        this.m_v3 = new THREE.Vector3();
        this.m_scene = new THREE.Scene();
        this.m_camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
        this.m_compScene = new THREE.Scene();
    }
    run() {
        var _a, _b, _c;
        const renderer = this.m_mapView.renderer;
        const canvas = this.m_mapView.canvas;
        if (!renderer || !canvas)
            return;
        const w = canvas.width;
        const h = canvas.height;
        if (w === 0 || h === 0)
            return;
        const camera = this.m_mapView.camera;
        if (!camera)
            return;
        const tiles = this.m_dataSource.getDecodedTiles();
        for (const tile of tiles) {
            if (this.m_tileKernels.has(tile))
                continue;
            const decoded = tile === null || tile === void 0 ? void 0 : tile.decodedTile;
            const pts = decoded === null || decoded === void 0 ? void 0 : decoded.heatmapPoints;
            if (pts && pts.length > 0) {
                this.m_tileKernels.set(tile, {
                    kernels: [...pts],
                    techniques: (_a = decoded.techniques) !== null && _a !== void 0 ? _a : [],
                });
            }
        }
        const live = new Set(tiles);
        for (const [tile] of [...this.m_tileKernels]) {
            if (!live.has(tile))
                this.m_tileKernels.delete(tile);
        }
        const kernels = [...this.m_tileKernels.values()];
        const groups = MBHeatmapRenderer.buildGroups(kernels, (stops) => {
            const key = JSON.stringify(stops !== null && stops !== void 0 ? stops : null);
            let tex = this.m_rampCache.get(key);
            if (!tex) {
                tex = MBMaterialPatchManager_1.MBMaterialPatchManager.buildGradientTexture(stops);
                this.m_rampCache.set(key, tex);
            }
            return { texture: tex, key };
        });
        if (groups.size === 0)
            return;
        const referenced = new Set();
        for (const g of groups.values())
            referenced.add(g.rampKey);
        for (const [key, tex] of [...this.m_rampCache]) {
            if (!referenced.has(key)) {
                tex.dispose();
                this.m_rampCache.delete(key);
            }
        }
        const ordered = [...groups.values()].sort((a, b) => a.renderOrder - b.renderOrder);
        const pixelRatio = (_b = this.m_mapView.pixelRatio) !== null && _b !== void 0 ? _b : 1;
        const exprZoom = this.m_mapView.zoomLevel - 1;
        const GAUSS_COEF = 0.398942;
        const ZERO = 1 / 255 / 16;
        let maxCount = 0;
        const worldRepeatX = flywave_geoutils_1.EarthConstants.EQUATORIAL_CIRCUMFERENCE;
        for (const g of ordered) {
            for (const k of g.raw) {
                let radiusCssPx = k.radius;
                if (k.radiusExpr !== undefined) {
                    const r = MBExpressionEngine_1.MBExpressionEngine.evaluate(k.radiusExpr, {
                        zoom: exprZoom,
                        feature: { type: 'Point', properties: (_c = k.properties) !== null && _c !== void 0 ? _c : {} },
                    });
                    if (typeof r === 'number' && isFinite(r))
                        radiusCssPx = r;
                }
                const rPx = Math.max(radiusCssPx * pixelRatio, 1);
                const weight = Math.max(k.weight, 0);
                const ratio = ZERO / (weight * g.intensity * GAUSS_COEF);
                let S = 0;
                if (isFinite(ratio) && ratio < 1) {
                    S = Math.min(Math.sqrt(-2 * Math.log(ratio)) / 3, 32);
                }
                const half = Math.max(S * rPx, 1);
                const emitKernel = (sx, sy, bx, by) => {
                    if (sx < -half || sx > w + half || sy < -half || sy > h + half)
                        return;
                    const s = this.m_rtScale;
                    g.px.push(sx * s);
                    g.py.push(sy * s);
                    g.half.push(half * s);
                    g.radiusPx.push(rPx * s);
                    g.weight.push(k.weight);
                    g.bx.push(bx[0], bx[1]);
                    g.by.push(by[0], by[1]);
                    g.s.push(S);
                };
                const projectToPx = (x, y, z) => {
                    this.m_v3.set(x, y, z).project(camera);
                    if (this.m_v3.z > 1)
                        return null;
                    const sx = (this.m_v3.x * 0.5 + 0.5) * w;
                    const sy = (1 - (this.m_v3.y * 0.5 + 0.5)) * h;
                    return [sx, sy];
                };
                const base = projectToPx(k.x, k.y, k.z);
                if (!base)
                    continue;
                const camDist = Math.hypot(camera.position.x - k.x, camera.position.y - k.y, camera.position.z - k.z);
                const eps = Math.max(camDist * 0.02, 1e-6);
                const sc = this.m_rtScale;
                const basisAt = (cx, cy, cbase) => {
                    const axPt = projectToPx(cx + eps, cy, k.z);
                    const ayPt = projectToPx(cx, cy + eps, k.z);
                    if (!axPt || !ayPt)
                        return { bx: [half * sc, 0], by: [0, half * sc] };
                    const exv = [axPt[0] - cbase[0], axPt[1] - cbase[1]];
                    const eyv = [ayPt[0] - cbase[0], ayPt[1] - cbase[1]];
                    const lx = Math.hypot(exv[0], exv[1]) / eps;
                    const ly = Math.hypot(eyv[0], eyv[1]) / eps;
                    if (!isFinite(lx) || !isFinite(ly) || lx <= 0 || ly <= 0) {
                        return { bx: [half * sc, 0], by: [0, half * sc] };
                    }
                    const f = half / (Math.sqrt(lx * ly) * eps);
                    return {
                        bx: [exv[0] * f * sc, exv[1] * f * sc],
                        by: [eyv[0] * f * sc, eyv[1] * f * sc],
                    };
                };
                const { bx: bxAbs, by: byAbs } = basisAt(k.x, k.y, base);
                emitKernel(base[0], base[1], bxAbs, byAbs);
                const west = projectToPx(k.x - worldRepeatX, k.y, k.z);
                if (west) {
                    const b = basisAt(k.x - worldRepeatX, k.y, west);
                    emitKernel(west[0], west[1], b.bx, b.by);
                }
                const east = projectToPx(k.x + worldRepeatX, k.y, k.z);
                if (east) {
                    const b = basisAt(k.x + worldRepeatX, k.y, east);
                    emitKernel(east[0], east[1], b.bx, b.by);
                }
            }
            if (g.px.length > maxCount)
                maxCount = g.px.length;
        }
        if (maxCount === 0)
            return;
        this.ensureRenderTarget(renderer, w, h);
        this.ensureKernelGeometry(maxCount);
        this.ensureCompositeMesh();
        const prevAutoClear = renderer.autoClear;
        const prevRT = renderer.getRenderTarget();
        const prevClearColor = new THREE.Color();
        const prevClearAlpha = renderer.getClearAlpha();
        renderer.getClearColor(prevClearColor);
        try {
            renderer.autoClear = false;
            renderer.setScissorTest(false);
            for (const g of ordered) {
                if (g.px.length === 0)
                    continue;
                renderer.setRenderTarget(this.m_rt);
                renderer.setClearColor(0x000000, 0);
                renderer.clear();
                if (this.m_kernelMat) {
                    this.m_kernelMat.uniforms.uIntensity.value = g.intensity;
                }
                if (this.m_kernelGeo && this.m_kernelMat && this.m_kernelMesh) {
                    this.updateKernelGeometry(g.px.length, g.px, g.py, g.half, g.radiusPx, g.weight, g.bx, g.by, g.s);
                    const mesh = this.m_kernelMesh;
                    this.m_scene.add(mesh);
                    renderer.render(this.m_scene, this.m_camera);
                    this.m_scene.remove(mesh);
                }
                renderer.setRenderTarget(null);
                if (this.m_compMat && this.m_compMesh) {
                    this.m_compMat.uniforms.uDensity.value = this.m_rt.texture;
                    this.m_compMat.uniforms.uRamp.value = g.ramp;
                    this.m_compMat.uniforms.uOpacity.value = g.opacity;
                    renderer.render(this.m_compScene, this.m_camera);
                }
            }
        }
        finally {
            renderer.setRenderTarget(prevRT);
            renderer.setClearColor(prevClearColor, prevClearAlpha);
            renderer.autoClear = prevAutoClear;
        }
    }
    dispose() {
        var _a, _b, _c, _d, _e;
        (_a = this.m_rt) === null || _a === void 0 ? void 0 : _a.dispose();
        this.m_rt = null;
        (_b = this.m_kernelGeo) === null || _b === void 0 ? void 0 : _b.dispose();
        this.m_kernelGeo = null;
        (_c = this.m_kernelMat) === null || _c === void 0 ? void 0 : _c.dispose();
        this.m_kernelMat = null;
        this.m_kernelMesh = null;
        (_d = this.m_compMat) === null || _d === void 0 ? void 0 : _d.dispose();
        this.m_compMat = null;
        (_e = this.m_compMesh) === null || _e === void 0 ? void 0 : _e.geometry.dispose();
        this.m_compMesh = null;
        for (const tex of this.m_rampCache.values())
            tex.dispose();
        this.m_rampCache.clear();
        this.m_tileKernels.clear();
    }
    static buildGroups(tileKernels, getRamp) {
        var _a, _b, _c, _d, _e;
        const groups = new Map();
        for (const entry of tileKernels) {
            const techs = entry.techniques;
            const pts = entry.kernels;
            if (!pts || pts.length === 0 || !techs)
                continue;
            for (const p of pts) {
                const tech = techs[p.technique];
                if (!(tech === null || tech === void 0 ? void 0 : tech._isHeatmap))
                    continue;
                const layerId = (_a = tech._layerId) !== null && _a !== void 0 ? _a : `tile-${p.technique}`;
                let g = groups.get(layerId);
                if (!g) {
                    const { texture, key } = getRamp(tech._heatmapColorStops);
                    g = {
                        layerId,
                        renderOrder: Number((_c = (_b = tech.renderOrder) !== null && _b !== void 0 ? _b : tech._renderOrder) !== null && _c !== void 0 ? _c : 0),
                        intensity: Number((_d = tech._heatmapIntensity) !== null && _d !== void 0 ? _d : 1),
                        opacity: Number((_e = tech.opacity) !== null && _e !== void 0 ? _e : 1),
                        rampKey: key,
                        ramp: texture,
                        raw: [],
                        px: [], py: [], half: [], radiusPx: [], weight: [],
                        bx: [], by: [], s: [],
                    };
                    groups.set(layerId, g);
                }
                g.raw.push(p);
            }
        }
        return groups;
    }
    ensureRenderTarget(renderer, w, h) {
        var _a, _b;
        const rtW = Math.max(Math.ceil(w * this.m_rtScale), 1);
        const rtH = Math.max(Math.ceil(h * this.m_rtScale), 1);
        if (this.m_rt && this.m_rtW === rtW && this.m_rtH === rtH)
            return;
        (_a = this.m_rt) === null || _a === void 0 ? void 0 : _a.dispose();
        const webgl2 = (_b = renderer.capabilities) === null || _b === void 0 ? void 0 : _b.isWebGL2;
        const type = webgl2 ? THREE.HalfFloatType : THREE.UnsignedByteType;
        this.m_rt = new THREE.WebGLRenderTarget(rtW, rtH, {
            minFilter: THREE.LinearFilter,
            magFilter: THREE.LinearFilter,
            format: THREE.RGBAFormat,
            type,
        });
        this.m_rtHalfFloat = type === THREE.HalfFloatType;
        this.m_rtW = rtW;
        this.m_rtH = rtH;
    }
    ensureKernelGeometry(count) {
        var _a, _b;
        if (this.m_kernelGeo && this.m_kernelMat && this.m_kernelMesh && count <= this.m_kernelAllocated)
            return;
        (_a = this.m_kernelGeo) === null || _a === void 0 ? void 0 : _a.dispose();
        (_b = this.m_kernelMat) === null || _b === void 0 ? void 0 : _b.dispose();
        this.m_kernelAllocated = count;
        const geo = new THREE.BufferGeometry();
        const positions = new Float32Array(count * 3 * 4);
        const centers = new Float32Array(count * 2 * 4);
        const weights = new Float32Array(count * 4);
        const basisX = new Float32Array(count * 2 * 4);
        const basisY = new Float32Array(count * 2 * 4);
        const scales = new Float32Array(count * 4);
        geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geo.setAttribute('aCenter', new THREE.BufferAttribute(centers, 2));
        geo.setAttribute('aWeight', new THREE.BufferAttribute(weights, 1));
        geo.setAttribute('aBasisX', new THREE.BufferAttribute(basisX, 2));
        geo.setAttribute('aBasisY', new THREE.BufferAttribute(basisY, 2));
        geo.setAttribute('aS', new THREE.BufferAttribute(scales, 1));
        const indices = new Uint32Array(count * 6);
        for (let i = 0; i < count; i++) {
            const b = i * 4;
            const base = i * 6;
            indices[base + 0] = b;
            indices[base + 1] = b + 1;
            indices[base + 2] = b + 2;
            indices[base + 3] = b + 2;
            indices[base + 4] = b + 1;
            indices[base + 5] = b + 3;
        }
        geo.setIndex(new THREE.BufferAttribute(indices, 1));
        const mat = new THREE.ShaderMaterial({
            transparent: true,
            depthTest: false,
            depthWrite: false,
            blending: THREE.CustomBlending,
            blendEquation: THREE.AddEquation,
            blendSrc: THREE.OneFactor,
            blendDst: THREE.OneFactor,
            side: THREE.DoubleSide,
            uniforms: {
                uViewport: { value: new THREE.Vector2(this.m_rtW, this.m_rtH) },
                uIntensity: { value: 1 },
            },
            vertexShader: `
                attribute vec2 aCenter;
                attribute float aWeight;
                attribute vec2 aBasisX;
                attribute vec2 aBasisY;
                attribute float aS;
                uniform vec2 uViewport;
                varying vec2 vParam;
                varying float vWeight;
                void main() {
                    vec2 corner = position.xy;
                    vec2 px = aCenter + corner.x * aBasisX + corner.y * aBasisY;
                    vec2 ndc = (px / uViewport) * 2.0 - 1.0;
                    ndc.y = -ndc.y;
                    gl_Position = vec4(ndc, 0.0, 1.0);
                    // Parameter space is isotropic in GROUND units: the
                    // projected ellipse comes from the basis, the Gaussian
                    // radial falloff stays circular in (u, v).
                    vParam = corner * aS;
                    vWeight = aWeight;
                }
            `,
            fragmentShader: `
                // mapbox heatmap kernel: val = weight * intensity * GAUSS_COEF
                // * exp(-0.5 * 3^2 * r^2), r in heatmap-radius units.
                // GAUSS_COEF = 1/sqrt(2*PI) (mapbox constants).
                uniform float uIntensity;
                varying vec2 vParam;
                varying float vWeight;
                void main() {
                    float r = length(vParam);
                    float val = vWeight * uIntensity * 0.398942 * exp(-0.5 * 9.0 * r * r);
                    // mapbox heatmap pass 1: density in the RED channel, alpha
                    // constant 1 (the composite pass reads the .r channel).
                    gl_FragColor = vec4(val, 1.0, 1.0, 1.0);
                }
            `,
        });
        this.m_kernelGeo = geo;
        this.m_kernelMat = mat;
        this.m_kernelMesh = new THREE.Mesh(geo, mat);
        this.m_kernelMesh.frustumCulled = false;
    }
    updateKernelGeometry(count, px, py, halfs, radiusPxs, pw, bxs, bys, ss) {
        const geo = this.m_kernelGeo;
        const positions = geo.getAttribute('position');
        const centers = geo.getAttribute('aCenter');
        const weights = geo.getAttribute('aWeight');
        const aBasisX = geo.getAttribute('aBasisX');
        const aBasisY = geo.getAttribute('aBasisY');
        const aS = geo.getAttribute('aS');
        const corners = [[-1, -1], [1, -1], [-1, 1], [1, 1]];
        for (let i = 0; i < count; i++) {
            for (let c = 0; c < 4; c++) {
                const vi = i * 4 + c;
                positions.setXYZ(vi, corners[c][0], corners[c][1], 0);
                centers.setXY(vi, px[i], py[i]);
                weights.setX(vi, pw[i]);
                aBasisX.setXY(vi, bxs[i * 2], bxs[i * 2 + 1]);
                aBasisY.setXY(vi, bys[i * 2], bys[i * 2 + 1]);
                aS.setX(vi, ss[i]);
            }
        }
        positions.needsUpdate = true;
        centers.needsUpdate = true;
        weights.needsUpdate = true;
        aBasisX.needsUpdate = true;
        aBasisY.needsUpdate = true;
        aS.needsUpdate = true;
        geo.setDrawRange(0, count * 6);
        if (this.m_kernelMat) {
            this.m_kernelMat.uniforms.uViewport.value.set(this.m_rtW, this.m_rtH);
        }
    }
    ensureCompositeMesh() {
        if (this.m_compMesh && this.m_compMat)
            return;
        const geo = new THREE.BufferGeometry();
        const positions = new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]);
        geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        this.m_compMat = new THREE.ShaderMaterial({
            transparent: true,
            depthTest: false,
            depthWrite: false,
            blending: THREE.CustomBlending,
            blendEquation: THREE.AddEquation,
            blendSrc: THREE.OneFactor,
            blendDst: THREE.OneMinusSrcAlphaFactor,
            uniforms: {
                uDensity: { value: null },
                uRamp: { value: null },
                uOpacity: { value: 1 },
            },
            vertexShader: `
                varying vec2 vUv;
                void main() {
                    vUv = position.xy * 0.5 + 0.5;
                    gl_Position = vec4(position.xy, 0.0, 1.0);
                }
            `,
            fragmentShader: `
                uniform sampler2D uDensity;
                uniform sampler2D uRamp;
                uniform float uOpacity;
                varying vec2 vUv;
                void main() {
                    // mapbox heatmap composite reads the RED density channel.
                    float d = texture2D(uDensity, vUv).r;
                    vec4 col = texture2D(uRamp, vec2(d, 0.5));
                    // mapbox: gl_FragColor = color * u_opacity (all channels).
                    gl_FragColor = vec4(col.rgb * uOpacity, col.a * uOpacity);
                }
            `,
        });
        const mesh = new THREE.Mesh(geo, this.m_compMat);
        mesh.frustumCulled = false;
        mesh.renderOrder = 100000;
        this.m_compMesh = mesh;
        this.m_compScene.add(mesh);
    }
}
exports.MBHeatmapRenderer = MBHeatmapRenderer;
//# sourceMappingURL=MBHeatmapRenderer.js.map