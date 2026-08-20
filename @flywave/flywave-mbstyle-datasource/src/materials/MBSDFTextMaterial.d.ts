import * as THREE from 'three';
export interface MapTextMaterialParams {
    'text-field': string;
    'text-font': string[];
    'text-size': number;
    'text-color': string;
    'text-opacity': number;
    'text-halo-color': string;
    'text-halo-width': number;
    'text-halo-blur': number;
    'text-rotate': number;
    'text-offset': [number, number];
    'text-anchor': 'center' | 'left' | 'right' | 'top' | 'bottom' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
    'text-max-width': number;
    'text-line-height': number;
    'text-letter-spacing': number;
    'text-justify': 'auto' | 'left' | 'center' | 'right';
    'text-transform': 'none' | 'uppercase' | 'lowercase';
    'text-padding': number;
}
export declare class MBSDFTextMaterial extends THREE.RawShaderMaterial {
    private m_paint;
    constructor(paint?: Partial<MapTextMaterialParams>);
    setGlyphAtlas(texture: THREE.Texture, size: [number, number]): void;
    setPaint(paint: Partial<MapTextMaterialParams>): void;
    getPaint(): Readonly<MapTextMaterialParams>;
    private applyPaint;
}
//# sourceMappingURL=MBSDFTextMaterial.d.ts.map