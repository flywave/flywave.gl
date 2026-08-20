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
export declare class MapCircleMaterial extends THREE.ShaderMaterial {
    private m_paint;
    constructor(paint?: Partial<MapCircleMaterialParams>);
    setPaint(paint: Partial<MapCircleMaterialParams>): void;
    getPaint(): Readonly<MapCircleMaterialParams>;
    private applyPaint;
}
//# sourceMappingURL=MapCircleMaterial.d.ts.map