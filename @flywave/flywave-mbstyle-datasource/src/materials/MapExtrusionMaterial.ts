import * as THREE from 'three';

export interface MapExtrusionMaterialParams {
    'fill-extrusion-color': string;
    'fill-extrusion-opacity': number;
    'fill-extrusion-height': number;
    'fill-extrusion-base'?: number;
    'fill-extrusion-vertical-gradient'?: boolean;
    'fill-extrusion-translate'?: [number, number];
}

const DEFAULTS: MapExtrusionMaterialParams = {
    'fill-extrusion-color': '#000000',
    'fill-extrusion-opacity': 1,
    'fill-extrusion-height': 0,
};

export class MapExtrusionMaterial extends THREE.MeshLambertMaterial {
    private m_paint: MapExtrusionMaterialParams;

    constructor(paint: Partial<MapExtrusionMaterialParams> = {}) {
        super({
            flatShading: true,
            side: THREE.DoubleSide,
        });
        this.m_paint = { ...DEFAULTS, ...paint };
        this.applyPaint();
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
        this.needsUpdate = true;
    }
}
