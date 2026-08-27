import * as THREE from 'three';
export interface MapHillshadeMaterialParams {
    'hillshade-illumination-direction': number;
    'hillshade-illumination-anchor': 'map' | 'viewport';
    'hillshade-exaggeration': number;
    'hillshade-highlight-color': string;
    'hillshade-shadow-color': string;
    'hillshade-accent-color': string;
}
export declare class MapHillshadeMaterial extends THREE.ShaderMaterial {
    private m_paint;
    private m_demTexture;
    constructor(paint?: Partial<MapHillshadeMaterialParams>);
    setDemTexture(texture: THREE.Texture | null): void;
    setDemMatrix(matrix: THREE.Matrix4): void;
    setPaint(paint: Partial<MapHillshadeMaterialParams>): void;
    getPaint(): Readonly<MapHillshadeMaterialParams>;
    private applyPaint;
    dispose(): void;
}
//# sourceMappingURL=MapHillshadeMaterial.d.ts.map