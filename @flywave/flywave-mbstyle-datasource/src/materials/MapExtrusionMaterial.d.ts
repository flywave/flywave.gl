import * as THREE from 'three';
export interface MapExtrusionMaterialParams {
    'fill-extrusion-color': string;
    'fill-extrusion-opacity': number;
    'fill-extrusion-height': number;
    'fill-extrusion-base'?: number;
    'fill-extrusion-vertical-gradient'?: boolean;
    'fill-extrusion-pattern'?: string;
    'fill-extrusion-translate'?: [number, number];
    'fill-extrusion-flood-light-color'?: string;
    'fill-extrusion-flood-light-intensity'?: number;
    'isGlobe'?: boolean;
}
export declare class MapExtrusionMaterial extends THREE.MeshLambertMaterial {
    private m_paint;
    private m_patternTexture;
    private m_shaderUniforms;
    constructor(paint?: Partial<MapExtrusionMaterialParams>);
    setPatternTexture(texture: THREE.Texture | null): void;
    setPaint(paint: Partial<MapExtrusionMaterialParams>): void;
    getPaint(): Readonly<MapExtrusionMaterialParams>;
    private applyPaint;
}
//# sourceMappingURL=MapExtrusionMaterial.d.ts.map