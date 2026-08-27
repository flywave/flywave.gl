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
exports.MapLineMaterial = void 0;
const THREE = __importStar(require("three"));
const flywave_materials_1 = require("@flywave/flywave-materials");
const DEFAULTS = {
    'line-color': '#000000',
    'line-opacity': 1,
    'line-width': 1,
};
const JOIN_MODE = {
    miter: 0, bevel: 1, round: 2, none: 3,
};
class MapLineMaterial extends flywave_materials_1.SolidLineMaterial {
    constructor(paint = {}, capabilities) {
        super({
            color: '#000000', opacity: 1, lineWidth: 1,
            rendererCapabilities: capabilities !== null && capabilities !== void 0 ? capabilities : { isWebGL2: true, maxTextures: 16, maxVertexTextures: 16, maxTextureSize: 4096, maxVertexUniforms: 1024 },
        });
        this.m_gradientTexture = null;
        this.m_patternTexture = null;
        this.m_patternUVOffset = new THREE.Vector2(0, 0);
        this.m_patternUVScale = new THREE.Vector2(1, 1);
        this.m_patternRepeat = 0.01;
        this.m_blur = 0;
        this.m_translateX = 0;
        this.m_translateY = 0;
        this.m_emissiveStrength = 0;
        const self = this;
        const origOnBeforeCompile = this.onBeforeCompile;
        this.onBeforeCompile = (shader, renderer) => {
            if (origOnBeforeCompile)
                origOnBeforeCompile.call(self, shader, renderer);
            shader.uniforms.uJoinMode = { value: self.getJoinMode() };
            shader.uniforms.uMiterLimit = { value: self.getMiterLimit() };
            shader.uniforms.uRoundLimit = { value: self.getRoundLimit() };
            shader.vertexShader = shader.vertexShader.replace('float tanHalfAngle = tan(biTangent.w / 2.0);', `
                uniform float uJoinMode;
                uniform float uMiterLimit;
                uniform float uRoundLimit;
                float tanHalfAngle = tan(biTangent.w / 2.0);
                if (uJoinMode > 0.5) { tanHalfAngle = min(tanHalfAngle, uMiterLimit); }
                // round-limit: clamp for round joins to avoid extreme extrusions
                if (uJoinMode > 1.5) { tanHalfAngle = min(tanHalfAngle, uRoundLimit); }
                `);
            shader.uniforms.uTransX = { value: self.m_translateX };
            shader.uniforms.uTransY = { value: self.m_translateY };
            shader.uniforms.uTranslateAnchor = { value: (self.m_paint['line-translate-anchor'] === 'viewport') ? 1 : 0 };
            shader.uniforms.uBearing = { value: 0 };
            shader.vertexShader = shader.vertexShader.replace('vec3 pos = biTangent.xyz', (match) => `uniform float uTransX; uniform float uTransY; ${match}`);
            shader.vertexShader = shader.vertexShader.replace('pos += biTangent.xyz * offset', `uniform float uTranslateAnchor; uniform float uBearing;
                 vec2 trans = vec2(uTransX, uTransY);
                 if (uTranslateAnchor > 0.5) {
                   float c = cos(uBearing); float s = sin(uBearing);
                   trans = vec2(trans.x * c - trans.y * s, trans.x * s + trans.y * c);
                 }
                 pos += biTangent.xyz * offset + vec3(trans, 0.0)`);
            shader.uniforms.uBlur = { value: self.m_blur };
            shader.uniforms.uEmissive = { value: self.m_emissiveStrength };
            shader.uniforms.uGradientTex = { value: self.m_gradientTexture };
            shader.uniforms.uPatternTex = { value: self.m_patternTexture };
            shader.uniforms.uPatternSize = { value: new THREE.Vector2(256, 256) };
            shader.uniforms.uLineLength = { value: 1.0 };
            shader.uniforms.uPatternUVOffset = { value: self.m_patternUVOffset };
            shader.uniforms.uPatternUVScale = { value: self.m_patternUVScale };
            shader.uniforms.uPatternRepeat = { value: self.m_patternRepeat };
            shader.fragmentShader =
                'uniform float uBlur;\n' +
                    'uniform float uEmissive;\n' +
                    'uniform sampler2D uGradientTex;\n' +
                    'uniform float uLineLength;\n' +
                    'uniform vec2 uPatternUVOffset;\n' +
                    'uniform vec2 uPatternUVScale;\n' +
                    'uniform float uPatternRepeat;\n' +
                    shader.fragmentShader;
            const blurCode = `
                // line-blur
                float blurAmount = uBlur;
                if (blurAmount > 0.001) {
                    float blurEdge = smoothstep(1.0 - blurAmount, 1.0 + blurAmount, distToCenter / (extrusionWidth + outlineWidth));
                    alpha *= 1.0 - blurEdge;
                }
            `;
            shader.fragmentShader = shader.fragmentShader.replace('alpha = min(alpha, 1.0);', `alpha = min(alpha, 1.0); ${blurCode}`);
            shader.fragmentShader = shader.fragmentShader.replace('vec3 outputDiffuse = diffuseColor;', `
                vec3 outputDiffuse = diffuseColor;
                // line-gradient
                float gradT = vCoords.x / uLineLength;
                vec4 gradColor = texture2D(uGradientTex, vec2(gradT, 0.5));
                outputDiffuse = mix(outputDiffuse, gradColor.rgb, gradColor.a);
                `);
            shader.fragmentShader = shader.fragmentShader.replace('gl_FragColor = vec4(outputDiffuse, alpha);', `
                vec3 emissiveOut = outputDiffuse + vec3(uEmissive);
                if (uPatternRepeat > 0.0) {
                    float patT = fract(vCoords.x * uPatternRepeat);
                    vec2 patUv = uPatternUVOffset + vec2(patT, 0.5) * uPatternUVScale;
                    vec4 patColor = texture2D(uPatternTex, patUv);
                    emissiveOut = mix(emissiveOut, patColor.rgb, patColor.a);
                }
                gl_FragColor = vec4(emissiveOut, alpha);
                `);
        };
        this.m_paint = Object.assign(Object.assign({}, DEFAULTS), paint);
        this.applyPaint();
    }
    getJoinMode() {
        var _a, _b;
        return (_b = JOIN_MODE[(_a = this.m_paint['line-join']) !== null && _a !== void 0 ? _a : 'miter']) !== null && _b !== void 0 ? _b : 0;
    }
    getMiterLimit() {
        var _a;
        return (_a = this.m_paint['line-miter-limit']) !== null && _a !== void 0 ? _a : 2;
    }
    getRoundLimit() {
        var _a;
        return (_a = this.m_paint['line-round-limit']) !== null && _a !== void 0 ? _a : 1.05;
    }
    setJoinType(join) {
        var _a, _b, _c, _d, _e;
        const mode = (_a = JOIN_MODE[join]) !== null && _a !== void 0 ? _a : JOIN_MODE.miter;
        (_c = (_b = this).setDefine) === null || _c === void 0 ? void 0 : _c.call(_b, 'JOIN_MODE', mode);
        (_e = (_d = this).setShaderMaterialDefine) === null || _e === void 0 ? void 0 : _e.call(_d, 'JOIN_MODE', mode);
    }
    setPatternTexture(texture, uvOffset, uvScale, repeat) {
        this.m_patternTexture = texture;
        if (uvOffset)
            this.m_patternUVOffset.set(uvOffset[0], uvOffset[1]);
        if (uvScale)
            this.m_patternUVScale.set(uvScale[0], uvScale[1]);
        if (repeat !== undefined)
            this.m_patternRepeat = repeat;
        this.needsUpdate = true;
    }
    setPaint(paint) {
        Object.assign(this.m_paint, paint);
        this.applyPaint();
    }
    getPaint() { return this.m_paint; }
    applyPaint() {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k;
        const p = this.m_paint;
        if (this.color && this.color.set)
            this.color.set(p['line-color']);
        this.opacity = p['line-opacity'];
        this.lineWidth = (_a = p['line-width']) !== null && _a !== void 0 ? _a : 1;
        this.offset = (_b = p['line-offset']) !== null && _b !== void 0 ? _b : 0;
        this.m_blur = (_c = p['line-blur']) !== null && _c !== void 0 ? _c : 0;
        this.m_translateX = (_e = (_d = p['line-translate']) === null || _d === void 0 ? void 0 : _d[0]) !== null && _e !== void 0 ? _e : 0;
        this.m_translateY = (_g = (_f = p['line-translate']) === null || _f === void 0 ? void 0 : _f[1]) !== null && _g !== void 0 ? _g : 0;
        this.m_emissiveStrength = (_h = p['line-emissive-strength']) !== null && _h !== void 0 ? _h : 0;
        if (p['line-gap-width'])
            this.secondaryWidth = p['line-gap-width'];
        const dash = p['line-dasharray'];
        if (dash && dash.length >= 2) {
            this.dashSize = dash[0];
            this.gapSize = dash[1];
            this.dashes = 'Square';
        }
        if (p['line-join'])
            this.setJoinType(p['line-join']);
        const cap = p['line-cap'];
        if (cap) {
            const capMap = {
                butt: 'None',
                round: 'Round',
                square: 'Square',
            };
            this.caps = (_j = capMap[cap]) !== null && _j !== void 0 ? _j : 'Round';
        }
        const grad = p['line-gradient'];
        if (grad && grad.length >= 2)
            this.buildGradientTexture(grad);
        const blendMode = (_k = p['line-blend-mode']) !== null && _k !== void 0 ? _k : 'default';
        switch (blendMode) {
            case 'additive':
                this.blending = THREE.AdditiveBlending;
                this.depthWrite = false;
                break;
            case 'multiply':
                this.blending = THREE.MultiplyBlending;
                this.premultipliedAlpha = true;
                this.depthWrite = false;
                break;
            default:
                this.blending = THREE.NormalBlending;
                break;
        }
        this.transparent = this.opacity < 1 || this.m_blur > 0 || blendMode !== 'default';
        this.needsUpdate = true;
    }
    buildGradientTexture(stops) {
        if (this.m_gradientTexture)
            this.m_gradientTexture.dispose();
        const size = 256;
        const data = new Uint8Array(size * 4);
        const color = new THREE.Color();
        for (let i = 0; i < size; i++) {
            const t = i / (size - 1);
            for (let j = 0; j < stops.length - 1; j++) {
                const [s0, c0] = stops[j];
                const [s1, c1] = stops[j + 1];
                if (t >= s0 && t <= s1) {
                    const lt = (s1 - s0) > 0.001 ? (t - s0) / (s1 - s0) : 0;
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
        this.m_gradientTexture = new THREE.DataTexture(data, size, 1, THREE.RGBAFormat);
        this.m_gradientTexture.wrapS = THREE.ClampToEdgeWrapping;
        this.m_gradientTexture.wrapT = THREE.ClampToEdgeWrapping;
        this.m_gradientTexture.minFilter = THREE.LinearFilter;
        this.m_gradientTexture.magFilter = THREE.LinearFilter;
        this.m_gradientTexture.needsUpdate = true;
    }
    dispose() {
        if (this.m_gradientTexture) {
            this.m_gradientTexture.dispose();
            this.m_gradientTexture = null;
        }
        super.dispose();
    }
}
exports.MapLineMaterial = MapLineMaterial;
//# sourceMappingURL=MapLineMaterial.js.map