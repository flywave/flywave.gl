import * as THREE from 'three';

export interface MapFillMaterialParams {
    'fill-color': string;
    'fill-opacity': number;
    'fill-outline-color'?: string;
    'fill-pattern'?: string;
    'fill-translate'?: [number, number];
    'fill-antialias'?: boolean;
    'fill-emissive-strength'?: number;
    'fill-z-offset'?: number;
}

const DEFAULTS: MapFillMaterialParams = {
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


export class MapFillMaterial extends THREE.MeshBasicMaterial {
    private m_paint: MapFillMaterialParams;
    private m_outlineColor: THREE.Color = new THREE.Color();
    private m_translation: THREE.Vector3 = new THREE.Vector3();
    private m_translateAnchor: 'map' | 'viewport' = 'map';
    private m_bearing: number = 0;

    // Pattern uniforms
    private m_patternTexture: THREE.Texture | null = null;
    private m_patternSize: THREE.Vector2 = new THREE.Vector2(256, 256);
    private m_patternOffset: THREE.Vector2 = new THREE.Vector2(0, 0);
    private m_patternEnabled = false;

    constructor(paint: Partial<MapFillMaterialParams> = {}) {
        super({ side: THREE.DoubleSide, depthWrite: true });
        this.m_paint = { ...DEFAULTS, ...paint };
        this.applyPaint();
        this.patchShader();

        const self = this;
        this.onBeforeCompile = (shader: THREE.WebGLProgramParametersWithUniforms) => {
            shader.uniforms.uPatternMap = { value: self.m_patternTexture };
            shader.uniforms.uPatternSize = { value: self.m_patternSize };
            shader.uniforms.uPatternOffset = { value: self.m_patternOffset };
            shader.uniforms.uFillTranslate = { value: new THREE.Vector2(self.m_translation.x, self.m_translation.y) };
            shader.uniforms.uTranslateAnchor = { value: self.m_translateAnchor === 'viewport' ? 1 : 0 };
            shader.uniforms.uBearing = { value: self.m_bearing };

            // Inject global-scope declarations (uniforms + helper fn + varying)
            // WITHOUT duplicating `void main()` — three.js resolves the
            // #include directives AFTER onBeforeCompile.
            shader.vertexShader = shader.vertexShader.replace(
                '#include <common>',
                `#include <common>\n` +
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
                `}\n`
            );
            shader.vertexShader = shader.vertexShader.replace(
                'vec3 transformed = vec3( position );',
                `vec3 transformed = vec3( position.xy + rotateTranslate(uFillTranslate, uTranslateAnchor, uBearing), position.z );`
            );
            shader.vertexShader = shader.vertexShader.replace(
                '#include <project_vertex>',
                `#include <project_vertex>\n    vPatternUv = position.xy;`
            );

            // Pattern uniforms at global scope (no nested main).
            shader.fragmentShader = shader.fragmentShader.replace(
                'void main() {',
                `uniform sampler2D uPatternMap;\n` +
                `uniform vec2 uPatternSize;\n` +
                `uniform vec2 uPatternOffset;\n` +
                `uniform float uFillOpacity;\n` +
                `varying vec2 vPatternUv;\n` +
                `void main() {`
            );

            // Pattern
            if (self.m_patternEnabled) {
                shader.fragmentShader = shader.fragmentShader.replace(
                    '#include <colorspace_fragment>',
                    `
                    #include <colorspace_fragment>
                    vec2 uv = mod(vPatternUv / uPatternSize + uPatternOffset, vec2(1.0));
                    vec4 pattern = texture2D(uPatternMap, uv);
                    gl_FragColor = mix(gl_FragColor, pattern, pattern.a);
                    `
                );
            }

            // Z-offset: shift vertices in z direction
            if ((self as any)._zOffset) {
                const zOff = Number((self as any)._zOffset);
                shader.uniforms.uZOffset = { value: zOff };
                shader.vertexShader = shader.vertexShader.replace(
                    'vec3 transformed = vec3( position );',
                    'uniform float uZOffset;\nvec3 transformed = vec3( position.xy, position.z + uZOffset );'
                );
            }

            // Antialias: when disabled, render polygon with hard edges via polygonOffset
            if (self.m_paint['fill-antialias'] === false) {
                self.polygonOffset = true;
                self.polygonOffsetFactor = -1;
                self.polygonOffsetUnits = -1;
            } else {
                self.polygonOffset = false;
            }
        };
    }

    setPatternTexture(texture: THREE.Texture | null, size?: [number, number], offset?: [number, number]) {
        this.m_patternTexture = texture;
        if (size) this.m_patternSize.set(size[0], size[1]);
        if (offset) this.m_patternOffset.set(offset[0], offset[1]);
        this.m_patternEnabled = texture !== null;
        this.needsUpdate = true;
    }

    setPaint(paint: Partial<MapFillMaterialParams>) {
        Object.assign(this.m_paint, paint);
        this.applyPaint();
    }

    getPaint(): Readonly<MapFillMaterialParams> {
        return this.m_paint;
    }

    get hasOutline(): boolean {
        return !!this.m_paint['fill-outline-color'];
    }

    get outlineColor(): THREE.Color {
        return this.m_outlineColor;
    }

    private applyPaint() {
        const p = this.m_paint;
        this.color.set(p['fill-color']);
        this.opacity = p['fill-opacity'];
        this.transparent = p['fill-opacity'] < 1;
        this.depthWrite = !this.transparent;

        if (p['fill-outline-color']) this.m_outlineColor.set(p['fill-outline-color']);

        if (p['fill-pattern']) {
            this.m_patternEnabled = true;
        } else {
            this.m_patternEnabled = false;
        }

        const translate = p['fill-translate'] as [number, number] | undefined;
        if (translate && (translate[0] || translate[1])) {
            this.m_translation.set(translate[0], translate[1], 0);
        } else {
            this.m_translation.set(0, 0, 0);
        }
        this.m_translateAnchor = (p as any)['fill-translate-anchor'] ?? 'map';

        // emissive
        const emissive = p['fill-emissive-strength'];
        if (emissive !== undefined && 'emissive' in this && 'emissiveIntensity' in this) {
            (this as any).emissiveIntensity = emissive;
        }

        // z-offset (stored for onBeforeCompile use)
        const zOffset = p['fill-z-offset'];
        if (zOffset !== undefined) {
            (this as any)._zOffset = zOffset;
        }
    }

    get translation(): THREE.Vector3 {
        return this.m_translation;
    }

    setBearing(bearing: number): void {
        this.m_bearing = bearing;
        this.needsUpdate = true;
    }

    private patchShader() {
        // placeholder — actual patching happens in onBeforeCompile
    }

    dispose(): void {
        if (this.m_patternTexture) {
            this.m_patternTexture.dispose();
            this.m_patternTexture = null;
        }
        super.dispose();
    }
}
