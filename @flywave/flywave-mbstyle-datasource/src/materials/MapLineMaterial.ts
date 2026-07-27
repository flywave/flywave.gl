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
    'line-translate'?: [number, number];
    'line-miter-limit'?: number;
}

const DEFAULTS: MapLineMaterialParams = {
    'line-color': '#000000',
    'line-opacity': 1,
    'line-width': 1,
};

const JOIN_MODE: Record<string, number> = {
    miter: 0,
    bevel: 1,
    round: 2,
    none: 3,
};

export class MapLineMaterial extends SolidLineMaterial {
    private m_paint: MapLineMaterialParams;

    constructor(paint: Partial<MapLineMaterialParams> = {}, capabilities?: any) {
        super({
            color: '#000000',
            opacity: 1,
            lineWidth: 1,
            rendererCapabilities: capabilities ?? { isWebGL2: true, maxTextures: 16, maxVertexTextures: 16, maxTextureSize: 4096, maxVertexUniforms: 1024 },
        } as any);

        const self = this;
        const origOnBeforeCompile = this.onBeforeCompile;
        this.onBeforeCompile = (shader: any, renderer: any) => {
            if (origOnBeforeCompile) {
                origOnBeforeCompile.call(self, shader, renderer);
            }
            shader.uniforms.uJoinMode = { value: self.getJoinMode() };
            shader.uniforms.uMiterLimit = { value: self.getMiterLimit() };

            // Inject join mode into vertex shader extrude logic
            shader.vertexShader = shader.vertexShader.replace(
                'float tanHalfAngle = tan(biTangent.w / 2.0);',
                `
                uniform float uJoinMode;
                uniform float uMiterLimit;
                float tanHalfAngle = tan(biTangent.w / 2.0);
                // Clamp for bevel/round
                if (uJoinMode > 0.5) {
                    tanHalfAngle = min(tanHalfAngle, uMiterLimit);
                }
                `
            );

            shader.fragmentShader = shader.fragmentShader.replace(
                'vec3 outputDiffuse = diffuseColor;',
                `
                vec3 outputDiffuse = diffuseColor;
                #ifdef USE_COLOR
                    outputDiffuse = vColor;
                #endif
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

    setPaint(paint: Partial<MapLineMaterialParams>) {
        Object.assign(this.m_paint, paint);
        this.applyPaint();
    }

    getPaint(): Readonly<MapLineMaterialParams> {
        return this.m_paint;
    }

    setJoinType(join: string) {
        const mode = JOIN_MODE[join] ?? JOIN_MODE.miter;
        (this as any).setDefine?.('JOIN_MODE', mode);
        (this as any).setShaderMaterialDefine?.('JOIN_MODE', mode);
    }

    private applyPaint() {
        const p = this.m_paint;

        if (this.color && this.color.set) {
            this.color.set(p['line-color']);
        }
        this.opacity = p['line-opacity'];
        this.lineWidth = p['line-width'] ?? 1;
        this.offset = p['line-offset'] ?? 0;

        if (p['line-gap-width']) {
            (this as any).secondaryWidth = p['line-gap-width'];
        }

        const dash = p['line-dasharray'];
        if (dash && dash.length >= 2) {
            this.dashSize = dash[0];
            this.gapSize = dash[1];
            this.dashes = 'Square' as LineDashes;
        }

        if (p['line-join']) {
            this.setJoinType(p['line-join']);
        }

        this.transparent = this.opacity < 1;
        this.needsUpdate = true;
    }

    dispose(): void {
        super.dispose();
    }
}
