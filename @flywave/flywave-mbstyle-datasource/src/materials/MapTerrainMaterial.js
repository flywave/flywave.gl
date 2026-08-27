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
exports.MapTerrainMaterial = void 0;
exports.decodeTerrainElevation = decodeTerrainElevation;
exports.createTerrainGrid = createTerrainGrid;
const THREE = __importStar(require("three"));
class MapTerrainMaterial extends THREE.MeshStandardMaterial {
    constructor() {
        var _a;
        super({
            side: THREE.DoubleSide,
            roughness: 0.9,
            metalness: 0.0,
        });
        this.m_demTexture = null;
        this.m_demPrevTexture = null;
        this.m_demLerp = 1.0;
        this.m_demIsFloat = false;
        this.m_exaggeration = 1.0;
        this.m_drapeTexture = null;
        this.m_uDrape = { value: null };
        this.m_uDem = { value: null };
        this.m_uDemPrev = { value: null };
        this.m_uDemLerp = { value: 1 };
        this.m_uDemIsFloat = { value: 0 };
        this.m_uExaggeration = { value: 1 };
        this.m_uMBZSecLat = { value: 1 };
        this.m_zSecLat = 1;
        const self = this;
        this.customProgramCacheKey = () => (self.m_drapeTexture ? 'mbDrape' : 'mbNoDrape');
        if (globalThis.__mbOccDbg) {
            const origCompile = (_a = this.onBeforeCompile) === null || _a === void 0 ? void 0 : _a.bind(this);
            console.log('[MBMat] terrain material created');
            this.onBeforeCompile = (shader, rs) => {
                console.log('[MBMat] compile drape=' + !!self.m_drapeTexture);
                if (origCompile)
                    origCompile(shader, rs);
            };
        }
        this.onBeforeCompile = (shader) => {
            const uvtdbg = !!globalThis.__mbUvTerrainDbg;
            if (self.m_drapeTexture) {
                shader.vertexShader = '#define USE_DRAPE\n' + shader.vertexShader;
                shader.fragmentShader = '#define USE_DRAPE\n'
                    + 'uniform sampler2D uDrape;\nvarying vec2 vMapUv;\n'
                    + shader.fragmentShader;
            }
            shader.uniforms.uDem = self.m_uDem;
            shader.uniforms.uDemPrev = self.m_uDemPrev;
            shader.uniforms.uDemLerp = self.m_uDemLerp;
            shader.uniforms.uDemIsFloat = self.m_uDemIsFloat;
            shader.uniforms.uExaggeration = self.m_uExaggeration;
            shader.uniforms.uMBZSecLat = self.m_uMBZSecLat;
            shader.uniforms.uDrape = self.m_uDrape;
            shader.vertexShader = shader.vertexShader.replace('#include <common>', `
                #include <common>
                uniform sampler2D uDem;
                uniform sampler2D uDemPrev;
                uniform float uDemLerp;
                uniform float uDemIsFloat;
                uniform float uExaggeration;
                uniform float uMBZSecLat;
                uniform sampler2D uDrape;

                float mbSampleElevation(sampler2D dem, vec2 uv) {
                    vec4 s = texture2D(dem, uv);
                    if (uDemIsFloat > 0.5) {
                        // R32F: red channel already holds height in meters.
                        return s.r;
                    }
                    // RGB-encoded Mapbox terrain-rgb.
                    return (s.r * 65536.0 + s.g * 256.0 + s.b) * 0.1 - 10000.0;
                }
                #ifdef USE_DRAPE
                varying vec2 vMapUv;
                #endif
                `);
            shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', `
                vec2 demUv = vec2(uv.x, 1.0 - uv.y);
                float elevation = mbSampleElevation(uDem, demUv);
                // Vertex morphing: blend from previous DEM toward current over
                // uDemLerp [0,1] (1 = fully current). Avoids popping on tile change.
                if (uDemLerp < 1.0) {
                    float prevElev = mbSampleElevation(uDemPrev, demUv);
                    elevation = mix(prevElev, elevation, uDemLerp);
                }
                elevation *= uExaggeration * uMBZSecLat;
                vec3 transformed = vec3(position.x, position.y, elevation);
                #ifdef USE_DRAPE
                vMapUv = uv;
                #endif
                `);
            if (uvtdbg) {
                shader.fragmentShader = '#define USE_DRAPE\n' + shader.fragmentShader;
                shader.vertexShader = '#define USE_DRAPE\n' + shader.vertexShader;
            }
            shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', `
                #include <map_fragment>
                #ifdef USE_DRAPE
                    ${uvtdbg ? 'diffuseColor.rgb = vec4(vMapUv.x, vMapUv.y, 0.5);' : ''}
                    // Flip V: terrain mesh UV V=0 is at the far edge (originY+size)
                    // but the FBO texture V=0 is at the near edge (originY), so a
                    // 1.0 - v.y flip is needed to align drape content with the
                    // underlying world position. Same convention as the DEM
                    // sampling above (which also does 1.0 - uv.y).
                    vec4 drapeColor = texture2D(uDrape, vec2(vMapUv.x, 1.0 - vMapUv.y));
                    diffuseColor.rgb = mix(diffuseColor.rgb, drapeColor.rgb, drapeColor.a);
                    vec4 mbDrapeSamp = drapeColor;
                #endif
                `);
            shader.fragmentShader = shader.fragmentShader.replace('#include <opaque_fragment>', `
                #include <opaque_fragment>
                #ifdef USE_DRAPE
                    // mgl semantics (§499): the drape FBO carries the painted
                    // raster/vector colors UNLIT — PBR/scene lighting must not
                    // multiply the draped part (it darkened the satellite to
                    // ~0.65×; expected shows the pale source colors). Lighting
                    // keeps applying to the terrain's own base color only.
                    gl_FragColor.rgb = mix(gl_FragColor.rgb, mbDrapeSamp.rgb, mbDrapeSamp.a);
                #endif
                `);
        };
    }
    setDemTexture(texture) {
        this.m_demTexture = texture;
        this.m_uDem.value = texture;
        this.needsUpdate = true;
    }
    setDemPrevTexture(texture) {
        this.m_demPrevTexture = texture;
        this.m_uDemPrev.value = texture;
        this.needsUpdate = true;
    }
    setDemLerp(lerp) {
        this.m_demLerp = lerp;
        this.m_uDemLerp.value = lerp;
    }
    setDemIsFloat(isFloat) {
        this.m_demIsFloat = isFloat;
        this.m_uDemIsFloat.value = isFloat ? 1.0 : 0.0;
        this.needsUpdate = true;
    }
    setDrapeTexture(texture) {
        this.m_drapeTexture = texture;
        this.m_uDrape.value = texture;
        if (texture) {
            texture.minFilter = THREE.LinearFilter;
            texture.magFilter = THREE.LinearFilter;
            texture.generateMipmaps = false;
            texture.wrapS = THREE.ClampToEdgeWrapping;
            texture.wrapT = THREE.ClampToEdgeWrapping;
            texture.needsUpdate = true;
        }
        this.needsUpdate = true;
    }
    setExaggeration(exaggeration) {
        this.m_exaggeration = exaggeration;
        this.m_uExaggeration.value = exaggeration;
        this.needsUpdate = true;
    }
    setZSecLat(secLat) {
        this.m_zSecLat = secLat > 0.2 && Number.isFinite(secLat) ? secLat : 1;
        this.m_uMBZSecLat.value = this.m_zSecLat;
        this.needsUpdate = true;
    }
    dispose() {
        if (this.m_demTexture)
            this.m_demTexture.dispose();
        super.dispose();
    }
}
exports.MapTerrainMaterial = MapTerrainMaterial;
function decodeTerrainElevation(r, g, b) {
    return (r * 256 * 256 + g * 256 + b) * 0.1 - 10000;
}
function createTerrainGrid(width = 1, height = 1, segments = 128) {
    const geom = new THREE.PlaneGeometry(width, height, segments, segments);
    return geom;
}
//# sourceMappingURL=MapTerrainMaterial.js.map