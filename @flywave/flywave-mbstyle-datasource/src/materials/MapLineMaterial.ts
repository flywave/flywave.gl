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

    constructor(paint: Partial<MapLineMaterialParams> = {}) {
        super({} as any);
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

        (this as any).diffuseColor.set(p['line-color']);
        this.opacity = p['line-opacity'];
        this.lineWidth = p['line-width'] ?? 1;
        this.offset = p['line-offset'] ?? 0;

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

        this.transparent = (this as any).opacity < 1;
        this.needsUpdate = true;
    }

    get opacity(): number {
        return (this as any).m_opacity ?? 1;
    }

    set opacity(value: number) {
        (this as any).m_opacity = value;
    }

    dispose(): void {
        if (this.m_gradientTexture) {
            this.m_gradientTexture.dispose();
            this.m_gradientTexture = null;
        }
        super.dispose();
    }
}
