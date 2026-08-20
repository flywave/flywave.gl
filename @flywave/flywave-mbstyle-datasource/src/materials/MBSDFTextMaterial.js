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
exports.MBSDFTextMaterial = void 0;
const THREE = __importStar(require("three"));
const DEFAULTS = {
    'text-field': '',
    'text-font': ['Open Sans Regular'],
    'text-size': 16,
    'text-color': '#000000',
    'text-opacity': 1,
    'text-halo-color': '#ffffff',
    'text-halo-width': 1,
    'text-halo-blur': 0,
    'text-rotate': 0,
    'text-offset': [0, 0],
    'text-anchor': 'center',
    'text-max-width': 10,
    'text-line-height': 1.2,
    'text-letter-spacing': 0,
    'text-justify': 'center',
    'text-transform': 'none',
    'text-padding': 2,
};
const SDF_VERT = `
attribute vec2 aUv;
attribute vec4 aGlyphData; // x=charWidth, y=charHeight, z=padding, w=layer
uniform vec2 uAtlasSize;
varying vec2 vUv;
varying float vLayer;

void main() {
    vUv = aUv;
    vLayer = aGlyphData.w;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mvPosition;
}
`;
const SDF_FRAG = `
uniform sampler2D uGlyphAtlas;
uniform vec3 uColor;
uniform vec3 uHaloColor;
uniform float uHaloWidth;
uniform float uHaloBlur;
uniform float uOpacity;
uniform float uGamma;

varying vec2 vUv;
varying float vLayer;

void main() {
    float dist = texture2D(uGlyphAtlas, vUv).a;

    // SDF antialiasing
    float gamma = uGamma;
    float alpha = smoothstep(0.5 - gamma, 0.5 + gamma, dist);

    // Halo
    float haloAlpha = smoothstep(
        0.5 - uHaloBlur - uHaloWidth,
        0.5 + uHaloBlur - uHaloWidth,
        dist
    );

    vec3 color = mix(uHaloColor, uColor, alpha);
    float finalAlpha = max(alpha, haloAlpha) * uOpacity;
    gl_FragColor = vec4(color, finalAlpha);
}
`;
class MBSDFTextMaterial extends THREE.RawShaderMaterial {
    constructor(paint = {}) {
        const atlasSize = new THREE.Vector2(512, 512);
        const dummyTex = new THREE.DataTexture(new Uint8Array(512 * 512), 512, 512, THREE.AlphaFormat);
        dummyTex.needsUpdate = true;
        super({
            uniforms: {
                uGlyphAtlas: { value: dummyTex },
                uAtlasSize: { value: atlasSize },
                uColor: { value: new THREE.Color('#000000') },
                uHaloColor: { value: new THREE.Color('#ffffff') },
                uHaloWidth: { value: 1.0 },
                uHaloBlur: { value: 0.0 },
                uOpacity: { value: 1.0 },
                uGamma: { value: 0.05 },
            },
            vertexShader: SDF_VERT,
            fragmentShader: SDF_FRAG,
            transparent: true,
            depthWrite: false,
        });
        this.m_paint = Object.assign(Object.assign({}, DEFAULTS), paint);
        this.applyPaint();
    }
    setGlyphAtlas(texture, size) {
        this.uniforms.uGlyphAtlas.value = texture;
        this.uniforms.uAtlasSize.value.set(size[0], size[1]);
    }
    setPaint(paint) {
        Object.assign(this.m_paint, paint);
        this.applyPaint();
    }
    getPaint() {
        return this.m_paint;
    }
    applyPaint() {
        var _a, _b;
        const p = this.m_paint;
        this.uniforms.uColor.value.set(p['text-color']).convertLinearToSRGB();
        this.uniforms.uHaloColor.value.set(p['text-halo-color']).convertLinearToSRGB();
        this.uniforms.uHaloWidth.value = (_a = p['text-halo-width']) !== null && _a !== void 0 ? _a : 1;
        this.uniforms.uHaloBlur.value = (_b = p['text-halo-blur']) !== null && _b !== void 0 ? _b : 0;
        this.uniforms.uOpacity.value = p['text-opacity'];
        this.needsUpdate = true;
    }
}
exports.MBSDFTextMaterial = MBSDFTextMaterial;
//# sourceMappingURL=MBSDFTextMaterial.js.map