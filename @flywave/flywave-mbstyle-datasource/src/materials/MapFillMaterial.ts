import * as THREE from 'three';

export interface MapFillMaterialParams {
    'fill-color': string;
    'fill-opacity': number;
    'fill-outline-color'?: string;
    'fill-pattern'?: string;
    'fill-translate'?: [number, number];
    'fill-antialias'?: boolean;
}

const DEFAULTS: MapFillMaterialParams = {
    'fill-color': '#000000',
    'fill-opacity': 1,
};

const PATTERN_VERT = `
#include <common>
varying vec2 vPatternUv;
void main() {
    #include <begin_vertex>
    #include <project_vertex>
    vPatternUv = position.xy;
}
`;

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
            shader.vertexShader = shader.vertexShader.replace(
                '#include <begin_vertex>',
                PATTERN_VERT
            );
            shader.fragmentShader = shader.fragmentShader.replace(
                'void main() {',
                `
                uniform sampler2D uPatternMap;
                uniform vec2 uPatternSize;
                uniform vec2 uPatternOffset;
                varying vec2 vPatternUv;
                void main() {
                `
            );
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

        };
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

        if (p['fill-outline-color']) {
            this.m_outlineColor.set(p['fill-outline-color']);
        }

        if (p['fill-pattern']) {
            this.m_patternEnabled = true;
        } else {
            this.m_patternEnabled = false;
        }

        this.needsUpdate = true;
    }

    setPatternTexture(texture: THREE.Texture, size: [number, number], offset: [number, number]) {
        this.m_patternTexture = texture;
        this.m_patternSize.set(size[0], size[1]);
        this.m_patternOffset.set(offset[0], offset[1]);
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
