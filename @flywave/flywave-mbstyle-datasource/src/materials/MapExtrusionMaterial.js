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
exports.MapExtrusionMaterial = void 0;
const THREE = __importStar(require("three"));
const DEFAULTS = {
    'fill-extrusion-color': '#000000',
    'fill-extrusion-opacity': 1,
    'fill-extrusion-height': 0,
};
class MapExtrusionMaterial extends THREE.MeshLambertMaterial {
    constructor(paint = {}) {
        super({
            flatShading: true,
            side: THREE.DoubleSide,
        });
        this.m_patternTexture = null;
        this.m_shaderUniforms = null;
        this.m_paint = Object.assign(Object.assign({}, DEFAULTS), paint);
        const self = this;
        this.onBeforeCompile = (shader) => {
            var _a, _b;
            shader.uniforms.uHeightBase = { value: (_a = self.m_paint['fill-extrusion-base']) !== null && _a !== void 0 ? _a : 0 };
            shader.uniforms.uHeightTop = { value: (_b = self.m_paint['fill-extrusion-height']) !== null && _b !== void 0 ? _b : 0 };
            shader.uniforms.uVerticalGradient = { value: self.m_paint['fill-extrusion-vertical-gradient'] === false ? 0 : 1 };
            shader.uniforms.uAoIntensity = { value: 0.2 };
            shader.uniforms.uAoRadius = { value: 0.5 };
            shader.uniforms.uFloodColor = { value: new THREE.Color('#ffffff') };
            shader.uniforms.uFloodIntensity = { value: 0.0 };
            shader.uniforms.uTranslate = { value: new THREE.Vector3() };
            shader.uniforms.uPatternTex = { value: self.m_patternTexture };
            shader.uniforms.uPatternUvScale = { value: new THREE.Vector2(1, 1) };
            shader.uniforms.uExtrusionScale = { value: 1.0 };
            self.m_shaderUniforms = shader.uniforms;
            const varyingDef = 'varying float vNormalizedHeight;';
            shader.vertexShader = varyingDef + shader.vertexShader;
            shader.fragmentShader = `
                uniform float uVerticalGradient;
                uniform float uAoIntensity;
                uniform float uAoRadius;
                uniform vec3 uFloodColor;
                uniform float uFloodIntensity;
                uniform vec3 uTranslate;
                ${varyingDef}
            ` + shader.fragmentShader;
            shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', 'vec3 translatedPos = position + uTranslate;\n#include <begin_vertex>');
            shader.vertexShader = shader.vertexShader.replace('vec3 transformed = vec3(position)', 'vec3 transformed = vec3(translatedPos)');
            shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', `
                float hBase = uHeightBase;
                float hTop = uHeightTop;
                vec3 extrusionPos = position;
                ${self.m_paint['isGlobe'] ? `
                vec3 radialDir = normalize(position + vec3(0.001));
                float normalizedHeight = (dot(extrusionPos, radialDir) - hBase) / (hTop - hBase + 0.001);
                vNormalizedHeight = normalizedHeight;
                vec3 transformed = extrusionPos + radialDir * uExtrusionScale * (uHeightTop - uHeightBase);
                ` : `
                float normalizedHeight = (extrusionPos.z - hBase) / (hTop - hBase + 0.001);
                vNormalizedHeight = normalizedHeight;
                #include <begin_vertex>
                `}
                `);
            if (this.m_paint['fill-extrusion-vertical-gradient']) {
                shader.fragmentShader = shader.fragmentShader.replace('vec4 diffuseColor = vec4( diffuse, opacity );', `
                    float shade = mix(0.6, 1.0, vNormalizedHeight);
                    vec3 gradientColor = diffuse * shade;
                    vec4 diffuseColor = vec4(mix(diffuse, gradientColor, uVerticalGradient), opacity);
                    `);
            }
            shader.fragmentShader = `
                uniform sampler2D uPatternTex;
                uniform vec2 uPatternUvScale;
            ` + shader.fragmentShader;
            shader.fragmentShader = shader.fragmentShader.replace('#include <lights_fragment_begin>', `
                // simple AO
                float ao = 1.0 - uAoIntensity * (1.0 - vNormalizedHeight);
                // flood light
                vec3 flood = uFloodColor * uFloodIntensity;
                vec3 litColor = ao * (gl_FragColor.rgb + flood);
                // pattern
                vec4 pat = texture2D(uPatternTex, vUv * uPatternUvScale);
                litColor = mix(litColor, pat.rgb, pat.a);
                #include <lights_fragment_begin>
                `);
        };
        this.applyPaint();
    }
    setPatternTexture(texture) {
        this.m_patternTexture = texture;
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
        var _a, _b, _c;
        const p = this.m_paint;
        this.color.set(p['fill-extrusion-color']);
        this.opacity = p['fill-extrusion-opacity'];
        this.transparent = p['fill-extrusion-opacity'] < 1;
        const base = Number((_a = p['fill-extrusion-base']) !== null && _a !== void 0 ? _a : 0);
        const top = Number((_b = p['fill-extrusion-height']) !== null && _b !== void 0 ? _b : 0);
        const translate = (_c = p['fill-extrusion-translate']) !== null && _c !== void 0 ? _c : [0, 0];
        if (this.m_shaderUniforms) {
            this.m_shaderUniforms.uHeightBase.value = base;
            this.m_shaderUniforms.uHeightTop.value = top;
            this.m_shaderUniforms.uVerticalGradient.value =
                p['fill-extrusion-vertical-gradient'] === false ? 0 : 1;
            this.m_shaderUniforms.uTranslate.value.set(translate[0], translate[1], 0);
        }
        if (p['fill-extrusion-flood-light-color']) {
            this.userData.floodColor = p['fill-extrusion-flood-light-color'];
        }
        if (p['fill-extrusion-flood-light-intensity'] !== undefined) {
            this.userData.floodIntensity = p['fill-extrusion-flood-light-intensity'];
        }
        this.needsUpdate = true;
    }
}
exports.MapExtrusionMaterial = MapExtrusionMaterial;
//# sourceMappingURL=MapExtrusionMaterial.js.map