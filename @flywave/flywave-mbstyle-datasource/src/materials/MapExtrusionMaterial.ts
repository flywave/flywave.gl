import * as THREE from 'three';

export interface MapExtrusionMaterialParams {
    'fill-extrusion-color': string;
    'fill-extrusion-opacity': number;
    'fill-extrusion-height': number;
    'fill-extrusion-base'?: number;
    'fill-extrusion-vertical-gradient'?: boolean;
    'fill-extrusion-pattern'?: string;
    'fill-extrusion-translate'?: [number, number];
    'fill-extrusion-flood-light-color'?: string;
    'fill-extrusion-flood-light-intensity'?: number;
    'isGlobe'?: boolean;
}

const DEFAULTS: MapExtrusionMaterialParams = {
    'fill-extrusion-color': '#000000',
    'fill-extrusion-opacity': 1,
    'fill-extrusion-height': 0,
};

export class MapExtrusionMaterial extends THREE.MeshLambertMaterial {
    private m_paint: MapExtrusionMaterialParams;
    private m_patternTexture: THREE.Texture | null = null;
    private m_shaderUniforms: { [name: string]: THREE.IUniform } | null = null;

    constructor(paint: Partial<MapExtrusionMaterialParams> = {}) {
        super({
            flatShading: true,
            side: THREE.DoubleSide,
        });
        this.m_paint = { ...DEFAULTS, ...paint };

        const self = this;
        this.onBeforeCompile = (shader: THREE.WebGLProgramParametersWithUniforms) => {
            shader.uniforms.uHeightBase = { value: self.m_paint['fill-extrusion-base'] ?? 0 };
            shader.uniforms.uHeightTop = { value: self.m_paint['fill-extrusion-height'] ?? 0 };
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

            // Apply translate in vertex shader
            shader.vertexShader = shader.vertexShader.replace(
                '#include <begin_vertex>',
                'vec3 translatedPos = position + uTranslate;\n#include <begin_vertex>'
            );
            shader.vertexShader = shader.vertexShader.replace(
                'vec3 transformed = vec3(position)',
                'vec3 transformed = vec3(translatedPos)'
            );

            shader.vertexShader = shader.vertexShader.replace(
                '#include <begin_vertex>',
                `
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
                `
            );

            if (this.m_paint['fill-extrusion-vertical-gradient']) {
                shader.fragmentShader = shader.fragmentShader.replace(
                    'vec4 diffuseColor = vec4( diffuse, opacity );',
                    `
                    float shade = mix(0.6, 1.0, vNormalizedHeight);
                    vec3 gradientColor = diffuse * shade;
                    vec4 diffuseColor = vec4(mix(diffuse, gradientColor, uVerticalGradient), opacity);
                    `
                );
            }

            // Pattern texture uniforms
            shader.fragmentShader = `
                uniform sampler2D uPatternTex;
                uniform vec2 uPatternUvScale;
            ` + shader.fragmentShader;

            shader.fragmentShader = shader.fragmentShader.replace(
                '#include <lights_fragment_begin>',
                `
                // simple AO
                float ao = 1.0 - uAoIntensity * (1.0 - vNormalizedHeight);
                // flood light
                vec3 flood = uFloodColor * uFloodIntensity;
                vec3 litColor = ao * (gl_FragColor.rgb + flood);
                // pattern
                vec4 pat = texture2D(uPatternTex, vUv * uPatternUvScale);
                litColor = mix(litColor, pat.rgb, pat.a);
                #include <lights_fragment_begin>
                `
            );
        };

        this.applyPaint();
    }

    setPatternTexture(texture: THREE.Texture | null) {
        this.m_patternTexture = texture;
        this.needsUpdate = true;
    }

    setPaint(paint: Partial<MapExtrusionMaterialParams>) {
        Object.assign(this.m_paint, paint);
        this.applyPaint();
    }

    getPaint(): Readonly<MapExtrusionMaterialParams> {
        return this.m_paint;
    }

    private applyPaint() {
        const p = this.m_paint;
        this.color.set(p['fill-extrusion-color']);
        this.opacity = p['fill-extrusion-opacity'];
        this.transparent = p['fill-extrusion-opacity'] < 1;

        const base = Number(p['fill-extrusion-base'] ?? 0);
        const top = Number(p['fill-extrusion-height'] ?? 0);
        const translate = p['fill-extrusion-translate'] ?? [0, 0];

        if (this.m_shaderUniforms) {
            this.m_shaderUniforms.uHeightBase.value = base;
            this.m_shaderUniforms.uHeightTop.value = top;
            this.m_shaderUniforms.uVerticalGradient.value =
                p['fill-extrusion-vertical-gradient'] === false ? 0 : 1;
            (this.m_shaderUniforms.uTranslate.value as THREE.Vector3).set(
                translate[0], translate[1], 0,
            );
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
