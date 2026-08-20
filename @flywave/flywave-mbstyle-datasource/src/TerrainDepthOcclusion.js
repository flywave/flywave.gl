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
exports.TerrainDepthOcclusion = void 0;
const THREE = __importStar(require("three"));
const flywave_mapview_1 = require("@flywave/flywave-mapview");
class TerrainDepthOcclusion {
    constructor(mapView, terrain, uniformName = 'u_terrainDepth') {
        this.m_depthTarget = null;
        this.m_depthTexture = null;
        this.m_active = false;
        this.m_width = 0;
        this.m_height = 0;
        this.m_consumerMaterials = new Set();
        this.onResize = () => {
            this.m_width = 0;
            this.m_height = 0;
        };
        this.onWillRender = () => {
            if (!this.m_active)
                return;
            const renderer = this.m_mapView.renderer;
            if (!renderer || !this.m_depthTarget)
                return;
            this.ensureTarget();
            const scene = this.m_mapView.scene;
            const camera = this.m_mapView.camera;
            const terrainSet = new Set(this.m_terrain.meshes);
            const hidden = [];
            scene.traverse((obj) => {
                if (obj.isMesh && !terrainSet.has(obj) && obj.visible) {
                    let isTileObject = false;
                    let p = obj;
                    while (p) {
                        if (terrainSet.has(p)) {
                            isTileObject = false;
                            break;
                        }
                        p = p.parent;
                        if (p === scene) {
                            isTileObject = true;
                            break;
                        }
                    }
                    if (isTileObject) {
                        obj.visible = false;
                        hidden.push(obj);
                    }
                }
            });
            try {
                const prevTarget = renderer.getRenderTarget();
                renderer.setRenderTarget(this.m_depthTarget);
                renderer.clearDepth();
                renderer.render(scene, camera);
                renderer.setRenderTarget(prevTarget);
            }
            catch (_a) {
            }
            finally {
                for (const obj of hidden)
                    obj.visible = true;
            }
        };
        this.m_mapView = mapView;
        this.m_terrain = terrain;
        this.m_uniformName = uniformName;
    }
    get depthTexture() {
        return this.m_depthTexture;
    }
    addConsumer(material) {
        this.m_consumerMaterials.add(material);
    }
    start() {
        if (this.m_active)
            return;
        this.m_active = true;
        this.m_mapView.addEventListener(flywave_mapview_1.MapViewEventNames.WillRender, this.onWillRender);
        this.m_mapView.addEventListener(flywave_mapview_1.MapViewEventNames.Resize, this.onResize);
        this.ensureTarget();
    }
    stop() {
        if (!this.m_active)
            return;
        this.m_active = false;
        this.m_mapView.removeEventListener(flywave_mapview_1.MapViewEventNames.WillRender, this.onWillRender);
        this.m_mapView.removeEventListener(flywave_mapview_1.MapViewEventNames.Resize, this.onResize);
    }
    dispose() {
        this.stop();
        if (this.m_depthTarget) {
            this.m_depthTarget.dispose();
            this.m_depthTarget = null;
        }
        if (this.m_depthTexture) {
            this.m_depthTexture.dispose();
            this.m_depthTexture = null;
        }
        this.m_consumerMaterials.clear();
    }
    ensureTarget() {
        const canvas = this.m_mapView.canvas;
        const w = canvas.width;
        const h = canvas.height;
        if (this.m_depthTarget && this.m_width === w && this.m_height === h)
            return;
        if (this.m_depthTarget) {
            this.m_depthTarget.dispose();
        }
        this.m_depthTexture = new THREE.DepthTexture(w, h);
        this.m_depthTexture.type = THREE.UnsignedIntType;
        this.m_depthTexture.minFilter = THREE.NearestFilter;
        this.m_depthTexture.magFilter = THREE.NearestFilter;
        this.m_depthTarget = new THREE.WebGLRenderTarget(w, h, {
            depthTexture: this.m_depthTexture,
            depthBuffer: true,
            stencilBuffer: false,
        });
        this.m_width = w;
        this.m_height = h;
        for (const mat of this.m_consumerMaterials) {
            this.injectUniform(mat);
        }
    }
    injectUniform(material) {
        const orig = material.onBeforeCompile;
        const tex = this.m_depthTexture;
        const name = this.m_uniformName;
        const w = this.m_width;
        const h = this.m_height;
        material.onBeforeCompile = (shader) => {
            if (orig)
                orig.call(material, shader);
            shader.uniforms[name] = { value: tex };
            shader.uniforms.u_terrainDepthSize = { value: new THREE.Vector2(1 / w, 1 / h) };
            shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>\nuniform sampler2D ${name};\nuniform vec2 u_terrainDepthSize;`);
            shader.fragmentShader = shader.fragmentShader.replace('#include <colorspace_fragment>', `#include <colorspace_fragment>
                 {
                     vec2 mbDScreen = gl_FragCoord.xy * u_terrainDepthSize;
                     float mbTerrainZ = texture2D(${name}, mbDScreen).r;
                     float mbMyZ = gl_FragCoord.z;
                     // Fade out when this fragment is behind the terrain.
                     float mbOcclude = smoothstep(-0.002, 0.002, mbMyZ - mbTerrainZ);
                     gl_FragColor.a *= (1.0 - mbOcclude);
                 }`);
        };
        material.needsUpdate = true;
    }
}
exports.TerrainDepthOcclusion = TerrainDepthOcclusion;
//# sourceMappingURL=TerrainDepthOcclusion.js.map