import * as THREE from 'three';
import { SolidLineMaterial } from '@flywave/flywave-materials';
import { LineCaps, LineDashes } from '@flywave/flywave-datasource-protocol';

export interface MapLineMaterialParams {
    'line-color': string;
    'line-opacity': number;
    'line-width': number;
    'line-gap-width'?: number;
    'line-offset'?: number;
    'line-blur'?: number;
    'line-dasharray'?: number[];
    'line-cap'?: 'butt' | 'round' | 'square';
    'line-gradient'?: Array<[number, string]>;
    'line-pattern'?: string;
    'line-translate'?: [number, number];
}

const DEFAULTS: MapLineMaterialParams = {
    'line-color': '#000000',
    'line-opacity': 1,
    'line-width': 1,
};

const CAPS_MAP: Record<string, LineCaps> = {
    butt: 'None' as LineCaps,
    square: 'Square' as LineCaps,
    round: 'Round' as LineCaps,
};

export class MapLineMaterial extends SolidLineMaterial {
    private m_paint: MapLineMaterialParams;
    private m_gradientTexture: THREE.DataTexture | null = null;
    private m_blur = 0;

    constructor(paint: Partial<MapLineMaterialParams> = {}, capabilities?: any) {
        super({ rendererCapabilities: capabilities ?? { isWebGL2: true, maxTextures: 16, maxVertexTextures: 16, maxTextureSize: 4096, maxVertexUniforms: 1024 } } as any);
        this.m_paint = { ...DEFAULTS, ...paint };
        this.applyPaint();
        this.setupShaderPatches();
    }

    setPaint(paint: Partial<MapLineMaterialParams>) {
        Object.assign(this.m_paint, paint);
        this.applyPaint();
    }

    getPaint(): Readonly<MapLineMaterialParams> {
        return this.m_paint;
    }

    private setupShaderPatches() {
        const self = this;
        const origOnBeforeCompile = this.onBeforeCompile;
        this.onBeforeCompile = (shader: THREE.WebGLProgramParametersWithUniforms, renderer: any) => {
            if (origOnBeforeCompile) {
                origOnBeforeCompile.call(self, shader, renderer);
            }

            shader.uniforms.uBlur = { value: self.m_blur };
            shader.uniforms.uGradientTex = { value: self.m_gradientTexture };
            shader.uniforms.uLineLength = { value: 1.0 };

            const hasGradient = self.m_gradientTexture !== null;
            const hasBlur = self.m_blur > 0.001;

            if (hasBlur) {
                shader.fragmentShader = shader.fragmentShader.replace(
                    'float s = opacity < 0.98',
                    `
                    float blur = uBlur / extrusionWidth;
                    float s = opacity < 0.98
                    `
                );
                shader.fragmentShader = shader.fragmentShader.replace(
                    'alpha = min(alpha, 1.0)',
                    `
                    alpha = min(alpha, 1.0);
                    // apply blur
                    float blurDist = smoothstep(1.0 - blur, 1.0 + blur, distToCenter);
                    alpha *= 1.0 - blurDist;
                    `
                );
            }

            if (hasGradient) {
                shader.fragmentShader = shader.fragmentShader.replace(
                    'vec3 outputDiffuse = diffuseColor;',
                    `
                    vec3 outputDiffuse = diffuseColor;
                    float lineProgress = vCoords.x / uLineLength;
                    vec4 gradColor = texture2D(uGradientTex, vec2(lineProgress, 0.5));
                    outputDiffuse = mix(outputDiffuse, gradColor.rgb, gradColor.a);
                    `
                );
            }
        };
    }

    private applyPaint() {
        const p = this.m_paint;

        if (this.color && this.color.set) {
            this.color.set(p['line-color']);
        } else {
            this.color = new THREE.Color(p['line-color']) as any;
        }
        this.opacity = p['line-opacity'];
        this.lineWidth = p['line-width'] ?? 1;
        this.offset = p['line-offset'] ?? 0;
        this.m_blur = p['line-blur'] ?? 0;

        if (p['line-gap-width']) {
            (this as any).secondaryWidth = p['line-gap-width'];
        }

        const cap = p['line-cap'] ?? 'butt';
        this.caps = CAPS_MAP[cap] ?? ('None' as LineCaps);

        const dash = p['line-dasharray'];
        if (dash && dash.length >= 2) {
            this.dashSize = dash[0];
            this.gapSize = dash[1];
            this.dashes = 'Square' as LineDashes;
        }

        const grad = p['line-gradient'];
        if (grad && grad.length >= 2) {
            this.buildGradientTexture(grad);
        }

        this.transparent = (this as any).opacity < 1 || this.m_blur > 0;
        this.needsUpdate = true;
    }

    private buildGradientTexture(stops: Array<[number, string]>) {
        if (this.m_gradientTexture) {
            this.m_gradientTexture.dispose();
        }

        const size = 256;
        const data = new Uint8Array(size * 4);
        const color = new THREE.Color();

        for (let i = 0; i < size; i++) {
            const t = i / (size - 1);
            let r = 0, g = 0, b = 0, a = 0;

            for (let j = 0; j < stops.length - 1; j++) {
                const [s0, c0] = stops[j];
                const [s1, c1] = stops[j + 1];
                if (t >= s0 && t <= s1) {
                    const lt = (t - s0) / (s1 - s0);
                    color.set(c0).lerp(new THREE.Color(c1), lt);
                    r = Math.round(color.r * 255);
                    g = Math.round(color.g * 255);
                    b = Math.round(color.b * 255);
                    a = 255;
                    break;
                }
            }

            if (t >= stops[stops.length - 1][0]) {
                color.set(stops[stops.length - 1][1]);
                r = Math.round(color.r * 255);
                g = Math.round(color.g * 255);
                b = Math.round(color.b * 255);
                a = 255;
            }

            const idx = i * 4;
            data[idx] = r;
            data[idx + 1] = g;
            data[idx + 2] = b;
            data[idx + 3] = a;
        }

        this.m_gradientTexture = new THREE.DataTexture(data, size, 1, THREE.RGBAFormat);
        this.m_gradientTexture.wrapS = THREE.ClampToEdgeWrapping;
        this.m_gradientTexture.wrapT = THREE.ClampToEdgeWrapping;
        this.m_gradientTexture.minFilter = THREE.LinearFilter;
        this.m_gradientTexture.magFilter = THREE.LinearFilter;
        this.m_gradientTexture.needsUpdate = true;
    }

    dispose(): void {
        if (this.m_gradientTexture) {
            this.m_gradientTexture.dispose();
            this.m_gradientTexture = null;
        }
        super.dispose();
    }
}
