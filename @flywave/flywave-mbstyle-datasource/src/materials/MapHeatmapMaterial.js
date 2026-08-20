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
exports.MapHeatmapMaterial = void 0;
const THREE = __importStar(require("three"));
const DEFAULTS = {
    'heatmap-radius': 30,
    'heatmap-opacity': 1,
    'heatmap-intensity': 1,
    'heatmap-weight': 1,
    'heatmap-color': [[0, 'rgba(0,0,255,0)'], [0.5, 'blue'], [1, 'red']],
};
const HEATMAP_VERT = `
uniform float uRadius;
uniform float uIntensity;
uniform float uWeight;

varying float vWeight;

void main() {
    #include <begin_vertex>
    #include <project_vertex>
    gl_PointSize = uRadius * (300.0 / -mvPosition.z);
    vWeight = uWeight;
}
`;
const HEATMAP_FRAG = `
uniform sampler2D uColorRamp;
uniform float uOpacity;
uniform float uRadius;

varying float vWeight;

void main() {
    float dist = length(gl_PointCoord - vec2(0.5)) * 2.0;
    if (dist > 1.0) discard;

    // Gaussian falloff
    float intensity = exp(-dist * dist * 4.0) * vWeight;

    // Sample color ramp
    vec4 color = texture2D(uColorRamp, vec2(intensity, 0.5));
    gl_FragColor = vec4(color.rgb, color.a * uOpacity);
}
`;
class MapHeatmapMaterial extends THREE.ShaderMaterial {
    constructor(paint = {}) {
        const rampSize = 256;
        const rampData = new Uint8Array(rampSize * 4);
        const rampTexture = new THREE.DataTexture(rampData, rampSize, 1, THREE.RGBAFormat);
        rampTexture.needsUpdate = true;
        rampTexture.wrapS = THREE.ClampToEdgeWrapping;
        rampTexture.wrapT = THREE.ClampToEdgeWrapping;
        rampTexture.minFilter = THREE.LinearFilter;
        rampTexture.magFilter = THREE.LinearFilter;
        super({
            transparent: true,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            depthTest: true,
            vertexShader: HEATMAP_VERT,
            fragmentShader: HEATMAP_FRAG,
            uniforms: {
                uRadius: { value: 30 },
                uOpacity: { value: 1 },
                uIntensity: { value: 1 },
                uWeight: { value: 1 },
                uColorRamp: { value: rampTexture },
            },
        });
        this.m_paint = Object.assign(Object.assign({}, DEFAULTS), paint);
        this.applyPaint();
    }
    setPaint(paint) {
        Object.assign(this.m_paint, paint);
        this.applyPaint();
    }
    getPaint() {
        return this.m_paint;
    }
    applyPaint() {
        var _a, _b, _c, _d;
        const p = this.m_paint;
        this.uniforms.uRadius.value = (_a = p['heatmap-radius']) !== null && _a !== void 0 ? _a : 30;
        this.uniforms.uOpacity.value = (_b = p['heatmap-opacity']) !== null && _b !== void 0 ? _b : 1;
        this.uniforms.uIntensity.value = (_c = p['heatmap-intensity']) !== null && _c !== void 0 ? _c : 1;
        this.uniforms.uWeight.value = (_d = p['heatmap-weight']) !== null && _d !== void 0 ? _d : 1;
        const stops = p['heatmap-color'];
        if (stops && stops.length >= 2) {
            this.buildColorRamp(stops);
        }
    }
    buildColorRamp(stops) {
        const texture = this.uniforms.uColorRamp.value;
        const size = texture.image.width;
        const data = texture.image.data;
        const color = new THREE.Color();
        for (let i = 0; i < size; i++) {
            const t = i / (size - 1);
            for (let j = 0; j < stops.length - 1; j++) {
                const [s0, c0] = stops[j];
                const [s1, c1] = stops[j + 1];
                if (t >= s0 && t <= s1) {
                    const lt = (t - s0) / (s1 - s0);
                    color.set(c0).convertLinearToSRGB().lerp(new THREE.Color(c1).convertLinearToSRGB(), lt);
                    const idx = i * 4;
                    data[idx] = Math.round(color.r * 255);
                    data[idx + 1] = Math.round(color.g * 255);
                    data[idx + 2] = Math.round(color.b * 255);
                    data[idx + 3] = 255;
                    break;
                }
            }
        }
        texture.needsUpdate = true;
    }
    dispose() {
        const tex = this.uniforms.uColorRamp.value;
        if (tex)
            tex.dispose();
        super.dispose();
    }
}
exports.MapHeatmapMaterial = MapHeatmapMaterial;
//# sourceMappingURL=MapHeatmapMaterial.js.map