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
exports.MapHillshadeMaterial = void 0;
const THREE = __importStar(require("three"));
const DEFAULTS = {
    'hillshade-illumination-direction': 335,
    'hillshade-illumination-anchor': 'viewport',
    'hillshade-exaggeration': 0.5,
    'hillshade-highlight-color': '#FFFFFF',
    'hillshade-shadow-color': '#000000',
    'hillshade-accent-color': '#000000',
};
const HILLSHADE_VERT = `
uniform mat4 uDemMatrix;
varying vec2 vDemUv;

void main() {
    #include <begin_vertex>
    #include <project_vertex>
    vDemUv = (uDemMatrix * vec4(position.xy, 0.0, 1.0)).xy;
}
`;
const HILLSHADE_FRAG = `
uniform sampler2D uDemTexture;
uniform float uExaggeration;
uniform float uIlluminationDirection;
uniform vec3 uHighlightColor;
uniform vec3 uShadowColor;
uniform vec3 uAccentColor;
uniform float uOpacity;
uniform vec2 uDemSize;

varying vec2 vDemUv;

void main() {
    vec2 px = 1.0 / uDemSize;

    // Sample elevation at 4 neighbors
    float e  = texture2D(uDemTexture, vDemUv).r;
    float eN = texture2D(uDemTexture, vDemUv + vec2(0.0, px.y)).r;
    float eS = texture2D(uDemTexture, vDemUv - vec2(0.0, px.y)).r;
    float eE = texture2D(uDemTexture, vDemUv + vec2(px.x, 0.0)).r;
    float eW = texture2D(uDemTexture, vDemUv - vec2(px.x, 0.0)).r;

    // Compute gradient
    float dzdx = (eE - eW) * 0.5 * uExaggeration;
    float dzdy = (eN - eS) * 0.5 * uExaggeration;

    // Surface normal
    vec3 normal = normalize(vec3(-dzdx, -dzdy, 1.0));

    // Light direction (from illumination-direction angle)
    float angleRad = radians(uIlluminationDirection);
    vec3 lightDir = normalize(vec3(cos(angleRad), sin(angleRad), 1.0));

    // Diffuse lighting
    float NdotL = max(dot(normal, lightDir), 0.0);
    vec3 color = mix(uShadowColor, uHighlightColor, NdotL);

    // Add accent
    float accent = abs(dzdx) + abs(dzdy);
    color = mix(color, uAccentColor, accent * 0.3);

    gl_FragColor = vec4(color, uOpacity);
}
`;
class MapHillshadeMaterial extends THREE.ShaderMaterial {
    constructor(paint = {}) {
        super({
            transparent: true,
            side: THREE.DoubleSide,
            depthWrite: false,
            vertexShader: HILLSHADE_VERT,
            fragmentShader: HILLSHADE_FRAG,
            uniforms: {
                uDemTexture: { value: null },
                uDemSize: { value: new THREE.Vector2(256, 256) },
                uExaggeration: { value: 0.5 },
                uIlluminationDirection: { value: 335.0 },
                uHighlightColor: { value: new THREE.Color('#FFFFFF') },
                uShadowColor: { value: new THREE.Color('#000000') },
                uAccentColor: { value: new THREE.Color('#000000') },
                uOpacity: { value: 1.0 },
                uDemMatrix: { value: new THREE.Matrix4() },
            },
        });
        this.m_demTexture = null;
        this.m_paint = Object.assign(Object.assign({}, DEFAULTS), paint);
        this.applyPaint();
    }
    setDemTexture(texture) {
        this.m_demTexture = texture;
        this.uniforms.uDemTexture.value = texture;
        if (texture === null || texture === void 0 ? void 0 : texture.image) {
            this.uniforms.uDemSize.value.set(texture.image.width, texture.image.height);
        }
    }
    setDemMatrix(matrix) {
        this.uniforms.uDemMatrix.value.copy(matrix);
    }
    setPaint(paint) {
        Object.assign(this.m_paint, paint);
        this.applyPaint();
    }
    getPaint() {
        return this.m_paint;
    }
    applyPaint() {
        var _a, _b, _c, _d, _e;
        const p = this.m_paint;
        this.uniforms.uExaggeration.value = (_a = p['hillshade-exaggeration']) !== null && _a !== void 0 ? _a : 0.5;
        this.uniforms.uIlluminationDirection.value = (_b = p['hillshade-illumination-direction']) !== null && _b !== void 0 ? _b : 335;
        this.uniforms.uOpacity.value = 1.0;
        this.uniforms.uHighlightColor.value.set((_c = p['hillshade-highlight-color']) !== null && _c !== void 0 ? _c : '#FFFFFF');
        this.uniforms.uShadowColor.value.set((_d = p['hillshade-shadow-color']) !== null && _d !== void 0 ? _d : '#000000');
        this.uniforms.uAccentColor.value.set((_e = p['hillshade-accent-color']) !== null && _e !== void 0 ? _e : '#000000');
    }
    dispose() {
        super.dispose();
    }
}
exports.MapHillshadeMaterial = MapHillshadeMaterial;
//# sourceMappingURL=MapHillshadeMaterial.js.map