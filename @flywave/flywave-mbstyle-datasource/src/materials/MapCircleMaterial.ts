import * as THREE from 'three';

export interface MapCircleMaterialParams {
    'circle-color': string;
    'circle-radius': number;
    'circle-opacity': number;
    'circle-blur'?: number;
    'circle-stroke-width'?: number;
    'circle-stroke-color'?: string;
    'circle-stroke-opacity'?: number;
    'circle-pitch-scale'?: 'map' | 'viewport';
    'circle-translate'?: [number, number];
}

const DEFAULTS: MapCircleMaterialParams = {
    'circle-color': '#000000',
    'circle-radius': 5,
    'circle-opacity': 1,
};

export class MapCircleMaterial extends THREE.PointsMaterial {
    private m_paint: MapCircleMaterialParams;

    constructor(paint: Partial<MapCircleMaterialParams> = {}) {
        super({
            size: 10,
            sizeAttenuation: false,
            transparent: true,
            depthWrite: false,
        });
        this.m_paint = { ...DEFAULTS, ...paint };
        this.applyPaint();
    }

    setPaint(paint: Partial<MapCircleMaterialParams>) {
        Object.assign(this.m_paint, paint);
        this.applyPaint();
    }

    getPaint(): Readonly<MapCircleMaterialParams> {
        return this.m_paint;
    }

    private applyPaint() {
        const p = this.m_paint;
        this.color.set(p['circle-color']);
        this.opacity = p['circle-opacity'];
        this.size = (p['circle-radius'] ?? 5) * 2;
        this.sizeAttenuation = (p['circle-pitch-scale'] ?? 'viewport') === 'map';
    }
}
