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
}

const DEFAULTS: MapExtrusionMaterialParams = {
    'fill-extrusion-color': '#000000',
    'fill-extrusion-opacity': 1,
    'fill-extrusion-height': 0,
};

export class MapExtrusionMaterial extends THREE.MeshLambertMaterial {
    private m_paint: MapExtrusionMaterialParams;
    private m_patternTexture: THREE.Texture | null = null;

    constructor(paint: Partial<MapExtrusionMaterialParams> = {}) {
        super({
            flatShading: true,
            side: THREE.DoubleSide,
        });
        this.m_paint = { ...DEFAULTS, ...paint };

        const self = this;
        this.onBeforeCompile = (shader: THREE.WebGLProgramParametersWithUniforms) => {
            shader.uniforms.uHeightBase = { value: 0.0 };
            shader.uniforms.uHeightTop = { value: 1.0 };
            shader.uniforms.uVerticalGradient = { value: 1.0 };
            shader.uniforms.uAoIntensity = { value: 0.2 };
            shader.uniforms.uAoRadius = { value: 0.5 };
            shader.uniforms.uFloodColor = { value: new THREE.Color('#ffffff') };
            shader.uniforms.uFloodIntensity = { value: 0.0 };
            shader.uniforms.uTranslate = { value: new THREE.Vector3() };
            shader.uniforms.uPatternTex = { value: self.m_patternTexture };
            shader.uniforms.uPatternUvScale = { value: new THREE.Vector2(1, 1) };

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
                float normalizedHeight = (extrusionPos.z - hBase) / (hTop - hBase + 0.001);
                vNormalizedHeight = normalizedHeight;
                #include <begin_vertex>
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

        // These will be picked up by onBeforeCompile at render time
        if (p['fill-extrusion-flood-light-color']) {
            this.userData.floodColor = p['fill-extrusion-flood-light-color'];
        }
        if (p['fill-extrusion-flood-light-intensity'] !== undefined) {
            this.userData.floodIntensity = p['fill-extrusion-flood-light-intensity'];
        }

        this.needsUpdate = true;
    }
}
