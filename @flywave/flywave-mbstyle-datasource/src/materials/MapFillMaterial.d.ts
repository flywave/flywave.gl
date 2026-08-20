import * as THREE from 'three';
export interface MapFillMaterialParams {
    'fill-color': string;
    'fill-opacity': number;
    'fill-outline-color'?: string;
    'fill-pattern'?: string;
    'fill-translate'?: [number, number];
    'fill-antialias'?: boolean;
    'fill-emissive-strength'?: number;
    'fill-z-offset'?: number;
}
export declare class MapFillMaterial extends THREE.MeshBasicMaterial {
    private m_paint;
    private m_outlineColor;
    private m_translation;
    private m_translateAnchor;
    private m_bearing;
    private m_patternTexture;
    private m_patternSize;
    private m_patternOffset;
    private m_patternEnabled;
    constructor(paint?: Partial<MapFillMaterialParams>);
    setPatternTexture(texture: THREE.Texture | null, size?: [number, number], offset?: [number, number]): void;
    setPaint(paint: Partial<MapFillMaterialParams>): void;
    getPaint(): Readonly<MapFillMaterialParams>;
    get hasOutline(): boolean;
    get outlineColor(): THREE.Color;
    private applyPaint;
    get translation(): THREE.Vector3;
    setBearing(bearing: number): void;
    private patchShader;
    dispose(): void;
}
//# sourceMappingURL=MapFillMaterial.d.ts.map