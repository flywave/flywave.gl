import * as THREE from 'three';
export interface MapRasterMaterialParams {
    'raster-opacity': number;
    'raster-hue-rotate': number;
    'raster-brightness-min': number;
    'raster-brightness-max': number;
    'raster-saturation': number;
    'raster-contrast': number;
    'raster-resampling': 'linear' | 'nearest';
    'raster-fade-duration': number;
}
export declare class MapRasterMaterial extends THREE.MeshBasicMaterial {
    private m_paint;
    private m_rasterTexture;
    constructor(paint?: Partial<MapRasterMaterialParams>);
    setRasterTexture(texture: THREE.Texture | null): void;
    setPaint(paint: Partial<MapRasterMaterialParams>): void;
    getPaint(): Readonly<MapRasterMaterialParams>;
    private applyPaint;
    dispose(): void;
}
//# sourceMappingURL=MapRasterMaterial.d.ts.map