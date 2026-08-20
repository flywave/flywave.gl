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
exports.MapFillMaterial = void 0;
const THREE = __importStar(require("three"));
const DEFAULTS = {
    'fill-color': '#000000',
    'fill-opacity': 1,
};
const PATTERN_FRAG = `
uniform sampler2D uPatternMap;
uniform vec2 uPatternSize;
uniform vec2 uPatternOffset;
varying vec2 vPatternUv;
void main() {
    vec4 baseColor = gl_FragColor;
    vec2 uv = mod(vPatternUv / uPatternSize + uPatternOffset, vec2(1.0));
    vec4 pattern = texture2D(uPatternMap, uv);
    gl_FragColor = mix(baseColor, pattern, pattern.a);
}
`;
class MapFillMaterial extends THREE.MeshBasicMaterial {
    constructor(paint = {}) {
        super({ side: THREE.DoubleSide, depthWrite: true });
        this.m_outlineColor = new THREE.Color();
        this.m_translation = new THREE.Vector3();
        this.m_translateAnchor = 'map';
        this.m_bearing = 0;
        this.m_patternTexture = null;
        this.m_patternSize = new THREE.Vector2(256, 256);
        this.m_patternOffset = new THREE.Vector2(0, 0);
        this.m_patternEnabled = false;
        this.m_paint = Object.assign(Object.assign({}, DEFAULTS), paint);
        this.applyPaint();
        this.patchShader();
        const self = this;
        this.onBeforeCompile = (shader) => {
            shader.uniforms.uPatternMap = { value: self.m_patternTexture };
            shader.uniforms.uPatternSize = { value: self.m_patternSize };
            shader.uniforms.uPatternOffset = { value: self.m_patternOffset };
            shader.uniforms.uFillTranslate = { value: new THREE.Vector2(self.m_translation.x, self.m_translation.y) };
            shader.uniforms.uTranslateAnchor = { value: self.m_translateAnchor === 'viewport' ? 1 : 0 };
            shader.uniforms.uBearing = { value: self.m_bearing };
            shader.vertexShader = shader.vertexShader.replace('#include <common>', `#include <common>\n` +
                `uniform vec2 uFillTranslate;\n` +
                `uniform float uTranslateAnchor;\n` +
                `uniform float uBearing;\n` +
                `varying vec2 vPatternUv;\n` +
                `vec2 rotateTranslate(vec2 t, float anchor, float bearing) {\n` +
                `  if (anchor > 0.5) {\n` +
                `    float c = cos(bearing);\n` +
                `    float s = sin(bearing);\n` +
                `    return vec2(t.x * c - t.y * s, t.x * s + t.y * c);\n` +
                `  }\n` +
                `  return t;\n` +
                `}\n`);
            shader.vertexShader = shader.vertexShader.replace('vec3 transformed = vec3( position );', `vec3 transformed = vec3( position.xy + rotateTranslate(uFillTranslate, uTranslateAnchor, uBearing), position.z );`);
            shader.vertexShader = shader.vertexShader.replace('#include <project_vertex>', `#include <project_vertex>\n    vPatternUv = position.xy;`);
            shader.fragmentShader = shader.fragmentShader.replace('void main() {', `uniform sampler2D uPatternMap;\n` +
                `uniform vec2 uPatternSize;\n` +
                `uniform vec2 uPatternOffset;\n` +
                `uniform float uFillOpacity;\n` +
                `varying vec2 vPatternUv;\n` +
                `void main() {`);
            if (self.m_patternEnabled) {
                shader.fragmentShader = shader.fragmentShader.replace('#include <colorspace_fragment>', `
                    #include <colorspace_fragment>
                    vec2 uv = mod(vPatternUv / uPatternSize + uPatternOffset, vec2(1.0));
                    vec4 pattern = texture2D(uPatternMap, uv);
                    gl_FragColor = mix(gl_FragColor, pattern, pattern.a);
                    `);
            }
            if (self._zOffset) {
                const zOff = Number(self._zOffset);
                shader.uniforms.uZOffset = { value: zOff };
                shader.vertexShader = shader.vertexShader.replace('vec3 transformed = vec3( position );', 'uniform float uZOffset;\nvec3 transformed = vec3( position.xy, position.z + uZOffset );');
            }
            if (self.m_paint['fill-antialias'] === false) {
                self.polygonOffset = true;
                self.polygonOffsetFactor = -1;
                self.polygonOffsetUnits = -1;
            }
            else {
                self.polygonOffset = false;
            }
        };
    }
    setPatternTexture(texture, size, offset) {
        this.m_patternTexture = texture;
        if (size)
            this.m_patternSize.set(size[0], size[1]);
        if (offset)
            this.m_patternOffset.set(offset[0], offset[1]);
        this.m_patternEnabled = texture !== null;
        this.needsUpdate = true;
    }
    setPaint(paint) {
        Object.assign(this.m_paint, paint);
        this.applyPaint();
    }
    getPaint() {
        return this.m_paint;
    }
    get hasOutline() {
        return !!this.m_paint['fill-outline-color'];
    }
    get outlineColor() {
        return this.m_outlineColor;
    }
    applyPaint() {
        var _a;
        const p = this.m_paint;
        this.color.set(p['fill-color']);
        this.opacity = p['fill-opacity'];
        this.transparent = p['fill-opacity'] < 1;
        this.depthWrite = !this.transparent;
        if (p['fill-outline-color'])
            this.m_outlineColor.set(p['fill-outline-color']);
        if (p['fill-pattern']) {
            this.m_patternEnabled = true;
        }
        else {
            this.m_patternEnabled = false;
        }
        const translate = p['fill-translate'];
        if (translate && (translate[0] || translate[1])) {
            this.m_translation.set(translate[0], translate[1], 0);
        }
        else {
            this.m_translation.set(0, 0, 0);
        }
        this.m_translateAnchor = (_a = p['fill-translate-anchor']) !== null && _a !== void 0 ? _a : 'map';
        const emissive = p['fill-emissive-strength'];
        if (emissive !== undefined && 'emissive' in this && 'emissiveIntensity' in this) {
            this.emissiveIntensity = emissive;
        }
        const zOffset = p['fill-z-offset'];
        if (zOffset !== undefined) {
            this._zOffset = zOffset;
        }
    }
    get translation() {
        return this.m_translation;
    }
    setBearing(bearing) {
        this.m_bearing = bearing;
        this.needsUpdate = true;
    }
    patchShader() {
    }
    dispose() {
        if (this.m_patternTexture) {
            this.m_patternTexture.dispose();
            this.m_patternTexture = null;
        }
        super.dispose();
    }
}
exports.MapFillMaterial = MapFillMaterial;
//# sourceMappingURL=MapFillMaterial.js.map