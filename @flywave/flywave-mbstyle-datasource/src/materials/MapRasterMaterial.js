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
exports.MapRasterMaterial = void 0;
const THREE = __importStar(require("three"));
const DEFAULTS = {
    'raster-opacity': 1,
    'raster-hue-rotate': 0,
    'raster-brightness-min': 0,
    'raster-brightness-max': 1,
    'raster-saturation': 0,
    'raster-contrast': 0,
    'raster-resampling': 'linear',
    'raster-fade-duration': 300,
};
const RASTER_FRAG = `
uniform float uHueRotate;
uniform float uBrightnessMin;
uniform float uBrightnessMax;
uniform float uSaturation;
uniform float uContrast;

vec3 applyHueRotate(vec3 color, float angle) {
    const mat3 toYIQ = mat3(
        0.299, 0.587, 0.114,
        0.596, -0.274, -0.322,
        0.211, -0.523, 0.312
    );
    const mat3 toRGB = mat3(
        1.0, 0.956, 0.621,
        1.0, -0.272, -0.647,
        1.0, -1.106, 1.703
    );
    vec3 yiq = toYIQ * color;
    float h = atan(yiq.z, yiq.y) + angle;
    float r = sqrt(yiq.y * yiq.y + yiq.z * yiq.z);
    yiq = vec3(yiq.x, r * cos(h), r * sin(h));
    return toRGB * yiq;
}

vec3 applySaturation(vec3 color, float sat) {
    float luma = dot(color, vec3(0.299, 0.587, 0.114));
    return mix(vec3(luma), color, 1.0 + sat);
}

vec3 applyContrast(vec3 color, float c) {
    return (color - 0.5) * (1.0 + c) + 0.5;
}

vec3 applyBrightness(vec3 color, float bMin, float bMax) {
    return clamp((color - bMin) / (bMax - bMin + 0.001), 0.0, 1.0);
}
`;
class MapRasterMaterial extends THREE.MeshBasicMaterial {
    constructor(paint = {}) {
        super({
            side: THREE.DoubleSide,
            transparent: true,
        });
        this.m_rasterTexture = null;
        this.m_paint = Object.assign(Object.assign({}, DEFAULTS), paint);
        const self = this;
        this.onBeforeCompile = (shader) => {
            shader.uniforms.uHueRotate = { value: self.m_paint['raster-hue-rotate'] * Math.PI / 180 };
            shader.uniforms.uBrightnessMin = { value: self.m_paint['raster-brightness-min'] };
            shader.uniforms.uBrightnessMax = { value: self.m_paint['raster-brightness-max'] };
            shader.uniforms.uSaturation = { value: self.m_paint['raster-saturation'] };
            shader.uniforms.uContrast = { value: self.m_paint['raster-contrast'] };
            shader.fragmentShader = RASTER_FRAG + shader.fragmentShader;
            shader.fragmentShader = shader.fragmentShader.replace('#include <colorspace_fragment>', `
                #include <colorspace_fragment>
                vec3 rasterColor = gl_FragColor.rgb;
                rasterColor = applyHueRotate(rasterColor, uHueRotate);
                rasterColor = applySaturation(rasterColor, uSaturation);
                rasterColor = applyContrast(rasterColor, uContrast);
                rasterColor = applyBrightness(rasterColor, uBrightnessMin, uBrightnessMax);
                gl_FragColor = vec4(rasterColor, gl_FragColor.a);
                `);
        };
        this.applyPaint();
    }
    setRasterTexture(texture) {
        this.m_rasterTexture = texture;
        this.map = texture !== null && texture !== void 0 ? texture : undefined;
        this.needsUpdate = true;
    }
    setPaint(paint) {
        Object.assign(this.m_paint, paint);
        this.applyPaint();
    }
    getPaint() {
        return this.m_paint;
    }
    applyPaint() {
        const p = this.m_paint;
        this.opacity = p['raster-opacity'];
        this.transparent = p['raster-opacity'] < 1;
        this.needsUpdate = true;
    }
    dispose() {
        if (this.m_rasterTexture) {
            this.m_rasterTexture.dispose();
            this.m_rasterTexture = null;
        }
        super.dispose();
    }
}
exports.MapRasterMaterial = MapRasterMaterial;
//# sourceMappingURL=MapRasterMaterial.js.map