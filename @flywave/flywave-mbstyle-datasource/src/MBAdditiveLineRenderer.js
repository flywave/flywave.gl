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
exports.MBAdditiveLineRenderer = exports.additiveRibbons = void 0;
const THREE = __importStar(require("three"));
exports.additiveRibbons = [];
const COMP_VERT = `
varying vec2 vUv;
void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;
const COMP_FRAG = `
uniform sampler2D uDensity;
uniform float uMaxDensity;
varying vec2 vUv;
void main() {
    vec4 c = texture2D(uDensity, vUv);
    if (c.a <= 0.0) {
        discard;
    }
    float density = c.a;
    vec3 avg = c.rgb / max(density, 0.001);
    float n = density / max(uMaxDensity, 0.001);
    float t = sqrt(n / (n + 1.0));
    gl_FragColor = vec4(avg * t, t);
}
`;
class MBAdditiveLineRenderer {
    constructor(m_mapView, m_dataSource) {
        this.m_mapView = m_mapView;
        this.m_dataSource = m_dataSource;
        this.m_rt = null;
        this.m_rtW = 0;
        this.m_rtH = 0;
        this.m_rtHalfFloat = false;
        this.m_scene = new THREE.Scene();
        this.m_compScene = new THREE.Scene();
        this.m_camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
        this.m_compMat = null;
        this.m_tmpMeshes = [];
        this.m_cloneSet = new Set();
        this.m_autoDensity = new Map();
        this.m_framesSinceReadback = 0;
    }
    run() {
        var _a, _b, _c;
        const renderer = this.m_mapView.renderer;
        const canvas = this.m_mapView.canvas;
        if (!renderer || !canvas || exports.additiveRibbons.length === 0)
            return;
        const w = canvas.width;
        const h = canvas.height;
        if (w === 0 || h === 0)
            return;
        const camera = (_b = (_a = this.m_mapView).getRteCamera) === null || _b === void 0 ? void 0 : _b.call(_a);
        if (!camera)
            return;
        for (let i = exports.additiveRibbons.length - 1; i >= 0; i--) {
            if (!exports.additiveRibbons[i].mesh.parent)
                exports.additiveRibbons.splice(i, 1);
        }
        if (exports.additiveRibbons.length === 0)
            return;
        const groups = this.groupRibbons();
        if (groups.length === 0)
            return;
        this.ensureRenderTarget(renderer, w, h);
        this.ensureCompositeMesh();
        const prevAutoClear = renderer.autoClear;
        const prevRT = renderer.getRenderTarget();
        const prevClearColor = new THREE.Color();
        const prevClearAlpha = renderer.getClearAlpha();
        renderer.getClearColor(prevClearColor);
        try {
            renderer.autoClear = false;
            renderer.setScissorTest(false);
            for (const g of groups) {
                renderer.setRenderTarget(this.m_rt);
                renderer.setClearColor(0x000000, 0);
                renderer.clear();
                const savedNear = camera.near;
                const savedFar = camera.far;
                camera.near = Math.max(savedNear * 0.01, 1);
                camera.far = Math.max(savedFar * 10, 1e8);
                camera.updateProjectionMatrix();
                for (const src of g.meshes) {
                    const mat = this.getAccumMaterial(src);
                    const mesh = new THREE.Mesh(src.geometry, mat);
                    mesh.matrixAutoUpdate = false;
                    mesh.matrix.copy(src.matrixWorld);
                    mesh.matrixWorldNeedsUpdate = true;
                    mesh.frustumCulled = false;
                    this.m_tmpMeshes.push(mesh);
                    this.m_scene.add(mesh);
                }
                renderer.render(this.m_scene, camera);
                for (const m of this.m_tmpMeshes)
                    this.m_scene.remove(m);
                this.m_tmpMeshes.length = 0;
                camera.near = savedNear;
                camera.far = savedFar;
                camera.updateProjectionMatrix();
                let maxDensity = g.clamp;
                if (maxDensity <= 0) {
                    if (!this.m_rtHalfFloat) {
                        maxDensity = 1;
                    }
                    else {
                        const cached = this.m_autoDensity.get(g.layerId);
                        if (cached === undefined ||
                            ++this.m_framesSinceReadback >= 2) {
                            const mean = this.readbackMeanDensity(renderer);
                            if (mean > 0)
                                this.m_autoDensity.set(g.layerId, mean);
                            this.m_framesSinceReadback = 0;
                        }
                        maxDensity = (_c = this.m_autoDensity.get(g.layerId)) !== null && _c !== void 0 ? _c : 0;
                    }
                }
                if (maxDensity <= 0)
                    continue;
                renderer.setRenderTarget(null);
                if (this.m_compMat) {
                    this.m_compMat.uniforms.uDensity.value = this.m_rt.texture;
                    this.m_compMat.uniforms.uMaxDensity.value = maxDensity;
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
        var _a, _b;
        (_a = this.m_rt) === null || _a === void 0 ? void 0 : _a.dispose();
        this.m_rt = null;
        for (const m of this.m_cloneSet)
            m.dispose();
        this.m_cloneSet.clear();
        (_b = this.m_compMat) === null || _b === void 0 ? void 0 : _b.dispose();
        this.m_compMat = null;
        exports.additiveRibbons.length = 0;
        this.m_autoDensity.clear();
    }
    groupRibbons() {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j;
        const byLayer = new Map();
        for (const entry of exports.additiveRibbons) {
            const paint = (_b = (_a = entry.technique) === null || _a === void 0 ? void 0 : _a._paint) !== null && _b !== void 0 ? _b : {};
            const layerId = String((_d = (_c = entry.technique) === null || _c === void 0 ? void 0 : _c._layerId) !== null && _d !== void 0 ? _d : 'unknown');
            let g = byLayer.get(layerId);
            if (!g) {
                g = {
                    layerId,
                    renderOrder: Number((_h = (_f = (_e = entry.technique) === null || _e === void 0 ? void 0 : _e.renderOrder) !== null && _f !== void 0 ? _f : (_g = entry.technique) === null || _g === void 0 ? void 0 : _g._renderOrder) !== null && _h !== void 0 ? _h : 0),
                    clamp: Number((_j = paint['line-blend-additive-clamp']) !== null && _j !== void 0 ? _j : 0) || 0,
                    meshes: [],
                };
                byLayer.set(layerId, g);
            }
            g.meshes.push(entry.mesh);
        }
        return [...byLayer.values()].sort((a, b) => a.renderOrder - b.renderOrder);
    }
    getAccumMaterial(srcMesh) {
        var _a, _b, _c, _d, _e, _f, _g, _h;
        const src = srcMesh.material;
        const cached = src === null || src === void 0 ? void 0 : src.__mbAddAccumMat;
        if (cached)
            return cached;
        const technique = (_d = (_b = (_a = srcMesh.userData) === null || _a === void 0 ? void 0 : _a.technique) !== null && _b !== void 0 ? _b : (_c = exports.additiveRibbons.find(r => r.mesh === srcMesh)) === null || _c === void 0 ? void 0 : _c.technique) !== null && _d !== void 0 ? _d : {};
        const clone = src.clone();
        clone.transparent = true;
        clone.depthTest = false;
        clone.depthWrite = false;
        clone.side = THREE.DoubleSide;
        clone.blending = THREE.CustomBlending;
        clone.blendEquation = THREE.AddEquation;
        clone.blendEquationAlpha = THREE.AddEquation;
        clone.blendSrc = THREE.SrcAlphaFactor;
        clone.blendDst = THREE.OneFactor;
        clone.blendSrcAlpha = this.m_rtHalfFloat
            ? THREE.OneFactor
            : THREE.OneMinusDstAlphaFactor;
        clone.blendDstAlpha = THREE.OneFactor;
        const colorRaw = String((_g = (_e = technique.color) !== null && _e !== void 0 ? _e : (_f = technique._paint) === null || _f === void 0 ? void 0 : _f['line-color']) !== null && _g !== void 0 ? _g : '#000000');
        const [r, g, b, a] = MBAdditiveLineRenderer.parseColor(colorRaw);
        const covMul = Number((_h = technique.opacity) !== null && _h !== void 0 ? _h : 1);
        const addColor = new THREE.Vector4(r, g, b, a);
        const ribbonAA = Boolean(src.__mbRibbonAA);
        const orig = src.onBeforeCompile;
        clone.onBeforeCompile = (shader) => {
            if (orig)
                orig.call(src, shader);
            shader.uniforms.uMBAddColor = { value: addColor };
            shader.uniforms.uMBAddCov = { value: covMul };
            const idx = shader.fragmentShader.lastIndexOf('}');
            shader.fragmentShader =
                'uniform vec4 uMBAddColor;\nuniform float uMBAddCov;\n' +
                    shader.fragmentShader.slice(0, idx) +
                    (ribbonAA
                        ? `
    {
        float mbHW = uMBRibbonWidth * 0.5;
        float mbDist = abs(vMBRibbonEdge) * mbHW;
        float mbAA = 1.0 - smoothstep(mbHW - 1.0, mbHW + 1.0, mbDist);
        gl_FragColor = vec4(uMBAddColor.rgb * uMBAddColor.a, mbAA * uMBAddCov);
    }
`
                        : `
    {
        gl_FragColor = vec4(uMBAddColor.rgb * uMBAddColor.a, uMBAddCov);
    }
`) +
                    shader.fragmentShader.slice(idx);
        };
        src.__mbAddAccumMat = clone;
        this.m_cloneSet.add(clone);
        return clone;
    }
    ensureRenderTarget(renderer, w, h) {
        var _a, _b;
        if (this.m_rt && this.m_rtW === w && this.m_rtH === h)
            return;
        (_a = this.m_rt) === null || _a === void 0 ? void 0 : _a.dispose();
        const webgl2 = (_b = renderer.capabilities) === null || _b === void 0 ? void 0 : _b.isWebGL2;
        const type = webgl2 ? THREE.HalfFloatType : THREE.UnsignedByteType;
        this.m_rt = new THREE.WebGLRenderTarget(w, h, {
            type,
            format: THREE.RGBAFormat,
            minFilter: THREE.LinearFilter,
            magFilter: THREE.LinearFilter,
            depthBuffer: false,
            stencilBuffer: false,
        });
        this.m_rtHalfFloat = type === THREE.HalfFloatType;
        this.m_rtW = w;
        this.m_rtH = h;
        this.m_autoDensity.clear();
    }
    ensureCompositeMesh() {
        if (this.m_compMat)
            return;
        this.m_compMat = new THREE.ShaderMaterial({
            vertexShader: COMP_VERT,
            fragmentShader: COMP_FRAG,
            uniforms: {
                uDensity: { value: null },
                uMaxDensity: { value: 1 },
            },
            depthTest: false,
            depthWrite: false,
            blending: THREE.CustomBlending,
            blendEquation: THREE.AddEquation,
            blendEquationAlpha: THREE.AddEquation,
            blendSrc: THREE.SrcAlphaFactor,
            blendDst: THREE.OneFactor,
            blendSrcAlpha: THREE.OneFactor,
            blendDstAlpha: THREE.OneFactor,
            transparent: true,
        });
        const geo = new THREE.PlaneGeometry(2, 2);
        const mesh = new THREE.Mesh(geo, this.m_compMat);
        mesh.frustumCulled = false;
        this.m_compScene.add(mesh);
    }
    readbackMeanDensity(renderer) {
        if (!this.m_rt)
            return 0;
        const w = this.m_rt.width;
        const h = this.m_rt.height;
        const isHalf = this.m_rt.texture.type === THREE.HalfFloatType;
        const buf = isHalf ? new Uint16Array(w * h * 4) : new Uint8Array(w * h * 4);
        try {
            renderer.readRenderTargetPixels(this.m_rt, 0, 0, w, h, buf);
        }
        catch (_a) {
            return 0;
        }
        let sum = 0;
        let count = 0;
        if (isHalf) {
            for (let i = 3; i < buf.length; i += 4) {
                const half = buf[i];
                const exp = (half >> 10) & 0x1f;
                const mant = half & 0x3ff;
                let v;
                if (exp === 0)
                    v = (mant / 1024) * Math.pow(2, -14);
                else if (exp === 31)
                    v = mant === 0 ? Infinity : NaN;
                else
                    v = (1 + mant / 1024) * Math.pow(2, exp - 15);
                if (half & 0x8000)
                    v = -v;
                if (v > 0) {
                    sum += v;
                    count++;
                }
            }
        }
        else {
            for (let i = 3; i < buf.length; i += 4) {
                const v = buf[i] / 255;
                if (v > 0) {
                    sum += v;
                    count++;
                }
            }
        }
        if (count === 0)
            return 0;
        return Math.max((sum / count) * 2, 1);
    }
    static parseColor(raw) {
        let alpha = 1;
        const m = raw.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)/i);
        if (m) {
            if (m[4] !== undefined)
                alpha = Number(m[4]);
            return [
                Number(m[1]) / 255,
                Number(m[2]) / 255,
                Number(m[3]) / 255,
                Math.min(Math.max(alpha, 0), 1),
            ];
        }
        try {
            const c = new THREE.Color(raw);
            const out = { r: 0, g: 0, b: 0 };
            c.getRGB(out, THREE.SRGBColorSpace);
            return [out.r, out.g, out.b, 1];
        }
        catch (_a) {
            return [0, 0, 0, 1];
        }
    }
}
exports.MBAdditiveLineRenderer = MBAdditiveLineRenderer;
//# sourceMappingURL=MBAdditiveLineRenderer.js.map