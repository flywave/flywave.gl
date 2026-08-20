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
exports.TerrainDraping = void 0;
const THREE = __importStar(require("three"));
const flywave_mapview_1 = require("@flywave/flywave-mapview");
const TerrainDrapingUtils_1 = require("./TerrainDrapingUtils");
class TerrainDraping {
    constructor(mapView, terrain, bakeSize = 512) {
        this.m_renderTargets = new Map();
        this.m_needsBake = false;
        this.m_active = false;
        this.m_wasMorphing = false;
        this.m_extraBakeFrames = 0;
        this.onAfterRender = () => {
            if (!this.m_active)
                return;
            const proj = this.m_mapView.projection;
            if ((proj === null || proj === void 0 ? void 0 : proj.type) === 1)
                return;
            const meshCount = this.m_terrain.meshes.length;
            if (meshCount !== this.m_lastMeshCount) {
                for (const [idx, rt] of this.m_renderTargets) {
                    if (idx >= meshCount) {
                        rt.dispose();
                        this.m_renderTargets.delete(idx);
                    }
                }
                this.m_lastMeshCount = meshCount;
                this.m_needsBake = true;
                this.m_extraBakeFrames = TerrainDraping.MAX_EXTRA_BAKES;
            }
            const morphing = this.m_terrain.isMorphing;
            if (this.m_wasMorphing && !morphing) {
                this.m_needsBake = true;
                this.m_extraBakeFrames = TerrainDraping.MAX_EXTRA_BAKES;
            }
            this.m_wasMorphing = morphing;
            if (this.m_extraBakeFrames > 0) {
                this.m_extraBakeFrames--;
                this.m_needsBake = true;
            }
            if (!this.m_needsBake)
                return;
            if (morphing)
                return;
            this.m_needsBake = false;
            try {
                this.bakeAll();
            }
            catch (_a) {
                this.m_needsBake = true;
            }
        };
        this.m_lastMeshCount = 0;
        this.m_mapView = mapView;
        this.m_terrain = terrain;
        this.m_bakeSize = bakeSize;
    }
    requestBake() {
        this.m_needsBake = true;
    }
    start() {
        if (this.m_active)
            return;
        this.m_active = true;
        this.m_mapView.addEventListener(flywave_mapview_1.MapViewEventNames.AfterRender, this.onAfterRender);
        this.requestBake();
    }
    stop() {
        var _a;
        if (!this.m_active)
            return;
        this.m_active = false;
        this.m_mapView.removeEventListener(flywave_mapview_1.MapViewEventNames.AfterRender, this.onAfterRender);
        for (const mesh of this.m_terrain.meshes) {
            const mat = mesh.material;
            if ((_a = mat === null || mat === void 0 ? void 0 : mat.defines) === null || _a === void 0 ? void 0 : _a.USE_DRAPE) {
                delete mat.defines.USE_DRAPE;
                mat.needsUpdate = true;
            }
        }
    }
    dispose() {
        this.stop();
        for (const [, rt] of this.m_renderTargets) {
            rt.dispose();
        }
        this.m_renderTargets.clear();
    }
    get isActive() { return this.m_active; }
    get bakeSize() { return this.m_bakeSize; }
    bakeAll() {
        const renderer = this.m_mapView.renderer;
        if (!renderer)
            return;
        const scene = this.m_mapView.scene;
        const terrainMeshes = new Set(this.m_terrain.meshes);
        if (terrainMeshes.size === 0)
            return;
        const tiles = this.m_terrain.allDemTiles;
        const meshes = this.m_terrain.meshes;
        const hidden = [];
        let hasDrapableContent = false;
        scene.traverse((obj) => {
            if (!obj.visible)
                return;
            if (terrainMeshes.has(obj)) {
                obj.visible = false;
                hidden.push(obj);
            }
            else if (this.isEnvironmentObject(obj)) {
                obj.visible = false;
                hidden.push(obj);
            }
            else if (obj.isMesh || obj.isSprite || obj.isPoints) {
                hasDrapableContent = true;
            }
        });
        if (!hasDrapableContent) {
            for (const obj of hidden)
                obj.visible = true;
            return;
        }
        const prevTarget = renderer.getRenderTarget();
        const prevClearColor = renderer.getClearColor(new THREE.Color());
        const prevClearAlpha = renderer.getClearAlpha();
        try {
            for (let i = 0; i < meshes.length && i < tiles.length; i++) {
                const mesh = meshes[i];
                const tile = tiles[i];
                if (!mesh || !tile)
                    continue;
                let rt = this.m_renderTargets.get(i);
                if (!rt) {
                    rt = new THREE.WebGLRenderTarget(this.m_bakeSize, this.m_bakeSize, {
                        depthBuffer: false,
                        stencilBuffer: false,
                    });
                    rt.texture.minFilter = THREE.LinearFilter;
                    rt.texture.magFilter = THREE.LinearFilter;
                    this.m_renderTargets.set(i, rt);
                }
                const camera = (0, TerrainDrapingUtils_1.buildTileCamera)(tile);
                if (!camera)
                    continue;
                renderer.setRenderTarget(rt);
                renderer.setClearColor(TerrainDraping.CLEAR_COLOR, 1.0);
                renderer.clear();
                renderer.render(scene, camera);
                const mat = mesh.material;
                if (mat && typeof mat.setDrapeTexture === 'function') {
                    mat.setDrapeTexture(rt.texture);
                    if (!mat.defines)
                        mat.defines = {};
                    if (!mat.defines.USE_DRAPE) {
                        mat.defines.USE_DRAPE = '';
                        mat.needsUpdate = true;
                    }
                }
            }
        }
        finally {
            renderer.setRenderTarget(prevTarget);
            renderer.setClearColor(prevClearColor, prevClearAlpha);
            for (const obj of hidden)
                obj.visible = true;
        }
    }
    isEnvironmentObject(obj) {
        return (0, TerrainDrapingUtils_1.isEnvironmentObject)(obj);
    }
}
exports.TerrainDraping = TerrainDraping;
TerrainDraping.CLEAR_COLOR = new THREE.Color(1, 1, 1);
TerrainDraping.MAX_EXTRA_BAKES = 5;
//# sourceMappingURL=TerrainDraping.js.map