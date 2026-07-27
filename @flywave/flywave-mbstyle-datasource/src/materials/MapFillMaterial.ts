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

export class MapFillMaterial extends THREE.MeshBasicMaterial {
    private m_paint: MapFillMaterialParams;

    constructor(paint: Partial<MapFillMaterialParams> = {}) {
        super({
            side: THREE.DoubleSide,
            depthWrite: true,
        });
        this.m_paint = { ...DEFAULTS, ...paint };
        this.applyPaint();
    }

    setPaint(paint: Partial<MapFillMaterialParams>) {
        Object.assign(this.m_paint, paint);
        this.applyPaint();
    }

    getPaint(): Readonly<MapFillMaterialParams> {
        return this.m_paint;
    }

    private applyPaint() {
        const p = this.m_paint;
        this.color.set(p['fill-color']);
        this.opacity = p['fill-opacity'];
        this.transparent = p['fill-opacity'] < 1;
        this.depthWrite = !this.transparent;
    }
}
