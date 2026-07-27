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
}

const DEFAULTS: MapLineMaterialParams = {
    'line-color': '#000000',
    'line-opacity': 1,
    'line-width': 1,
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
        this.m_paint = { ...DEFAULTS, ...paint };
        this.applyPaint();
    }

    setPaint(paint: Partial<MapLineMaterialParams>) {
        Object.assign(this.m_paint, paint);
        this.applyPaint();
    }

    getPaint(): Readonly<MapLineMaterialParams> {
        return this.m_paint;
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

        this.transparent = this.opacity < 1;
        this.needsUpdate = true;
    }

    dispose(): void {
        super.dispose();
    }
}
