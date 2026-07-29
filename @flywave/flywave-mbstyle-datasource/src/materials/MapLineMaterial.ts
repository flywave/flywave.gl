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
    'line-join'?: 'bevel' | 'round' | 'miter' | 'none';
    'line-gradient'?: Array<[number, string]>;
    'line-pattern'?: string;
    'line-translate'?: [number, number];
    'line-miter-limit'?: number;
    'line-round-limit'?: number;
    'line-emissive-strength'?: number;
    'line-blend-mode'?: 'default' | 'multiply' | 'additive';
}

const DEFAULTS: MapLineMaterialParams = {
    'line-color': '#000000',
    'line-opacity': 1,
    'line-width': 1,
};

const JOIN_MODE: Record<string, number> = {
    miter: 0, bevel: 1, round: 2, none: 3,
};

export class MapLineMaterial extends SolidLineMaterial {
    private m_paint: MapLineMaterialParams;
    private m_gradientTexture: THREE.DataTexture | null = null;
    private m_patternTexture: THREE.Texture | null = null;
    private m_patternUVOffset = new THREE.Vector2(0, 0);
    private m_patternUVScale = new THREE.Vector2(1, 1);
    private m_patternRepeat = 0.01;
    private m_blur = 0;
    private m_translateX = 0;
    private m_translateY = 0;
    private m_emissiveStrength = 0;

    constructor(paint: Partial<MapLineMaterialParams> = {}, capabilities?: any) {
        super({
            color: '#000000', opacity: 1, lineWidth: 1,
            rendererCapabilities: capabilities ?? { isWebGL2: true, maxTextures: 16, maxVertexTextures: 16, maxTextureSize: 4096, maxVertexUniforms: 1024 },
        } as any);

        const self = this;
        const origOnBeforeCompile = this.onBeforeCompile;
        this.onBeforeCompile = (shader: any, renderer: any) => {
            if (origOnBeforeCompile) origOnBeforeCompile.call(self, shader, renderer);

            // ----- Join + round limit uniforms -----
            shader.uniforms.uJoinMode = { value: self.getJoinMode() };
            shader.uniforms.uMiterLimit = { value: self.getMiterLimit() };
            shader.uniforms.uRoundLimit = { value: self.getRoundLimit() };
            shader.vertexShader = shader.vertexShader.replace(
                'float tanHalfAngle = tan(biTangent.w / 2.0);',
                `
                uniform float uJoinMode;
                uniform float uMiterLimit;
                uniform float uRoundLimit;
                float tanHalfAngle = tan(biTangent.w / 2.0);
                if (uJoinMode > 0.5) { tanHalfAngle = min(tanHalfAngle, uMiterLimit); }
                // round-limit: clamp for round joins to avoid extreme extrusions
                if (uJoinMode > 1.5) { tanHalfAngle = min(tanHalfAngle, uRoundLimit); }
                `
            );

            // ----- Translate uniform -----
            shader.uniforms.uTransX = { value: self.m_translateX };
            shader.uniforms.uTransY = { value: self.m_translateY };
            shader.uniforms.uTranslateAnchor = { value: (self.m_paint['line-translate-anchor'] === 'viewport') ? 1 : 0 };
            shader.uniforms.uBearing = { value: 0 };
            shader.vertexShader = shader.vertexShader.replace(
                'vec3 pos = biTangent.xyz',
                (match) => `uniform float uTransX; uniform float uTransY; ${match}`
            );
            shader.vertexShader = shader.vertexShader.replace(
                'pos += biTangent.xyz * offset',
                `uniform float uTranslateAnchor; uniform float uBearing;
                 vec2 trans = vec2(uTransX, uTransY);
                 if (uTranslateAnchor > 0.5) {
                   float c = cos(uBearing); float s = sin(uBearing);
                   trans = vec2(trans.x * c - trans.y * s, trans.x * s + trans.y * c);
                 }
                 pos += biTangent.xyz * offset + vec3(trans, 0.0)`
            );

            // ----- Blur + Gradient + Emissive in fragment shader -----
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

            // Inject blur into alpha computation
            const blurCode = `
                // line-blur
                float blurAmount = uBlur;
                if (blurAmount > 0.001) {
                    float blurEdge = smoothstep(1.0 - blurAmount, 1.0 + blurAmount, distToCenter / (extrusionWidth + outlineWidth));
                    alpha *= 1.0 - blurEdge;
                }
            `;
            shader.fragmentShader = shader.fragmentShader.replace(
                'alpha = min(alpha, 1.0);',
                `alpha = min(alpha, 1.0); ${blurCode}`
            );

            // Inject gradient color
            shader.fragmentShader = shader.fragmentShader.replace(
                'vec3 outputDiffuse = diffuseColor;',
                `
                vec3 outputDiffuse = diffuseColor;
                // line-gradient
                float gradT = vCoords.x / uLineLength;
                vec4 gradColor = texture2D(uGradientTex, vec2(gradT, 0.5));
                outputDiffuse = mix(outputDiffuse, gradColor.rgb, gradColor.a);
                `
            );

            shader.fragmentShader = shader.fragmentShader.replace(
                'gl_FragColor = vec4(outputDiffuse, alpha);',
                `
                vec3 emissiveOut = outputDiffuse + vec3(uEmissive);
                if (uPatternRepeat > 0.0) {
                    float patT = fract(vCoords.x * uPatternRepeat);
                    vec2 patUv = uPatternUVOffset + vec2(patT, 0.5) * uPatternUVScale;
                    vec4 patColor = texture2D(uPatternTex, patUv);
                    emissiveOut = mix(emissiveOut, patColor.rgb, patColor.a);
                }
                gl_FragColor = vec4(emissiveOut, alpha);
                `
            );
        };

        this.m_paint = { ...DEFAULTS, ...paint };
        this.applyPaint();
    }

    private getJoinMode(): number {
        return JOIN_MODE[this.m_paint['line-join'] ?? 'miter'] ?? 0;
    }

    private getMiterLimit(): number {
        return this.m_paint['line-miter-limit'] ?? 2;
    }

    private getRoundLimit(): number {
        return this.m_paint['line-round-limit'] ?? 1.05;
    }

    private setJoinType(join: string) {
        const mode = JOIN_MODE[join] ?? JOIN_MODE.miter;
        (this as any).setDefine?.('JOIN_MODE', mode);
        (this as any).setShaderMaterialDefine?.('JOIN_MODE', mode);
    }

    setPatternTexture(
        texture: THREE.Texture | null,
        uvOffset?: [number, number],
        uvScale?: [number, number],
        repeat?: number,
    ) {
        this.m_patternTexture = texture;
        if (uvOffset) this.m_patternUVOffset.set(uvOffset[0], uvOffset[1]);
        if (uvScale) this.m_patternUVScale.set(uvScale[0], uvScale[1]);
        if (repeat !== undefined) this.m_patternRepeat = repeat;
        this.needsUpdate = true;
    }

    setPaint(paint: Partial<MapLineMaterialParams>) {
        Object.assign(this.m_paint, paint);
        this.applyPaint();
    }

    getPaint(): Readonly<MapLineMaterialParams> { return this.m_paint; }

    private applyPaint() {
        const p = this.m_paint;
        if (this.color && this.color.set) this.color.set(p['line-color']);
        this.opacity = p['line-opacity'];
        this.lineWidth = p['line-width'] ?? 1;
        this.offset = p['line-offset'] ?? 0;
        this.m_blur = p['line-blur'] ?? 0;
        this.m_translateX = p['line-translate']?.[0] ?? 0;
        this.m_translateY = p['line-translate']?.[1] ?? 0;
        this.m_emissiveStrength = p['line-emissive-strength'] ?? 0;

        if (p['line-gap-width']) (this as any).secondaryWidth = p['line-gap-width'];

        const dash = p['line-dasharray'];
        if (dash && dash.length >= 2) {
            this.dashSize = dash[0];
            this.gapSize = dash[1];
            this.dashes = 'Square' as LineDashes;
        }

        if (p['line-join']) this.setJoinType(p['line-join']);

        const cap = p['line-cap'];
        if (cap) {
            const capMap: Record<string, LineCaps> = {
                butt: 'None' as LineCaps,
                round: 'Round' as LineCaps,
                square: 'Square' as LineCaps,
            };
            this.caps = capMap[cap] ?? ('Round' as LineCaps);
        }

        const grad = p['line-gradient'];
        if (grad && grad.length >= 2) this.buildGradientTexture(grad);

        // line-blend-mode
        const blendMode = p['line-blend-mode'] ?? 'default';
        switch (blendMode) {
            case 'additive':
                this.blending = THREE.AdditiveBlending;
                this.depthWrite = false;
                break;
            case 'multiply':
                this.blending = THREE.MultiplyBlending;
                this.depthWrite = false;
                break;
            default:
                this.blending = THREE.NormalBlending;
                break;
        }

        this.transparent = this.opacity < 1 || this.m_blur > 0 || blendMode !== 'default';
        this.needsUpdate = true;
    }

    private buildGradientTexture(stops: Array<[number, string]>) {
        if (this.m_gradientTexture) this.m_gradientTexture.dispose();
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
                    color.set(c0).lerp(new THREE.Color(c1), lt);
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

    dispose(): void {
        if (this.m_gradientTexture) { this.m_gradientTexture.dispose(); this.m_gradientTexture = null; }
        super.dispose();
    }
}
