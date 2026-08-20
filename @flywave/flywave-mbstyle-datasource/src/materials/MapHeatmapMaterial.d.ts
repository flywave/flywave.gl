import * as THREE from 'three';
export interface MapHeatmapMaterialParams {
    'heatmap-radius': number;
    'heatmap-opacity': number;
    'heatmap-intensity': number;
    'heatmap-weight': number;
    'heatmap-color': Array<[number, string]>;
}
export declare class MapHeatmapMaterial extends THREE.ShaderMaterial {
    private m_paint;
    constructor(paint?: Partial<MapHeatmapMaterialParams>);
    setPaint(paint: Partial<MapHeatmapMaterialParams>): void;
    getPaint(): Readonly<MapHeatmapMaterialParams>;
    private applyPaint;
    private buildColorRamp;
    dispose(): void;
}
//# sourceMappingURL=MapHeatmapMaterial.d.ts.map