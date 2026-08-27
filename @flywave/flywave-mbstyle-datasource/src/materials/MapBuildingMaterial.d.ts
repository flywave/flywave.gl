import * as THREE from 'three';
export interface MapBuildingMaterialParams {
    'building-color': string;
    'building-height': number;
    'building-base': number;
    'building-roof-color': string;
    'building-facade-floors': number;
    'building-facade-unit-width': number;
    'building-emissive-strength': number;
}
export declare class MapBuildingMaterial extends THREE.MeshStandardMaterial {
    private m_paint;
    constructor(paint?: Partial<MapBuildingMaterialParams>);
    setPaint(paint: Partial<MapBuildingMaterialParams>): void;
    private applyPaint;
}
export declare function extrudeBuilding(footprint: THREE.Vector2[], height: number, base?: number): THREE.BufferGeometry;
//# sourceMappingURL=MapBuildingMaterial.d.ts.map