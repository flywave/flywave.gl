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
exports.MapSDFIconMaterial = void 0;
const THREE = __importStar(require("three"));
const SDF_VERT = `
uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;
attribute vec3 position;
varying vec2 vUv;
void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;
const SDF_FRAG = `
uniform sampler2D uAtlas;
uniform vec4 uUvRect; // x=umin, y=vmin, z=umax, w=vmax
uniform vec3 uColor;
uniform float uOpacity;
uniform vec3 uHaloColor;
uniform float uHaloWidth;
uniform float uHaloBlur;
uniform float uGamma;

varying vec2 vUv;

void main() {
    vec2 uv = mix(uUvRect.xy, uUvRect.zw, vUv);
    float dist = texture2D(uAtlas, uv).a;

    // SDF antialiasing
    float gamma = uGamma;
    float alpha = smoothstep(0.5 - gamma, 0.5 + gamma, dist);

    // Halo
    float haloInner = 0.5 - uHaloWidth - uHaloBlur;
    float haloOuter = 0.5 + uHaloWidth + uHaloBlur;
    float haloAlpha = smoothstep(haloInner, 0.5 + uHaloBlur, dist);

    vec3 color = mix(uHaloColor, uColor, alpha);
    float finalAlpha = max(alpha, haloAlpha * (1.0 - alpha)) * uOpacity;
    gl_FragColor = vec4(color, finalAlpha);
}
`;
class MapSDFIconMaterial extends THREE.RawShaderMaterial {
    constructor(params = {}) {
        const defaultTex = new THREE.DataTexture(new Uint8Array([255]), 1, 1, THREE.AlphaFormat);
        defaultTex.needsUpdate = true;
        super({
            uniforms: {
                uAtlas: { value: defaultTex },
                uUvRect: { value: new THREE.Vector4(0, 0, 1, 1) },
                uColor: { value: new THREE.Color('#ffffff') },
                uOpacity: { value: 1.0 },
                uHaloColor: { value: new THREE.Color('rgba(0,0,0,0)') },
                uHaloWidth: { value: 0.0 },
                uHaloBlur: { value: 0.0 },
                uGamma: { value: 0.05 },
            },
            vertexShader: SDF_VERT,
            fragmentShader: SDF_FRAG,
            transparent: true,
            depthWrite: false,
        });
        this.m_params = Object.assign({ 'icon-image': '', 'icon-size': 1, 'icon-color': '#ffffff', 'icon-opacity': 1, 'icon-rotate': 0, 'icon-halo-color': 'rgba(0,0,0,0)', 'icon-halo-width': 0, 'icon-halo-blur': 0 }, params);
        this.applyParams();
    }
    setSpriteAtlas(atlas, iconName) {
        var _a;
        if (!atlas)
            return;
        const uv = (_a = atlas.getIconUv) === null || _a === void 0 ? void 0 : _a.call(atlas, iconName);
        if (uv) {
            this.uniforms.uUvRect.value.set(uv.uvMin[0], uv.uvMin[1], uv.uvMax[0], uv.uvMax[1]);
        }
        this.uniforms.uAtlas.value = atlas.texture;
    }
    applyParams() {
        var _a, _b, _c;
        const p = this.m_params;
        this.uniforms.uColor.value.set(p['icon-color']).convertLinearToSRGB();
        this.uniforms.uOpacity.value = p['icon-opacity'];
        this.uniforms.uHaloColor.value.set((_a = p['icon-halo-color']) !== null && _a !== void 0 ? _a : 'rgba(0,0,0,0)').convertLinearToSRGB();
        this.uniforms.uHaloWidth.value = (_b = p['icon-halo-width']) !== null && _b !== void 0 ? _b : 0;
        this.uniforms.uHaloBlur.value = (_c = p['icon-halo-blur']) !== null && _c !== void 0 ? _c : 0;
        this.needsUpdate = true;
    }
}
exports.MapSDFIconMaterial = MapSDFIconMaterial;
//# sourceMappingURL=MapSDFIconMaterial.js.map