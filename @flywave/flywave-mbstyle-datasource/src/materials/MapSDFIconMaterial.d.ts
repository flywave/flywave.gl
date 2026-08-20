import * as THREE from 'three';
export interface MapSDFIconMaterialParams {
    'icon-image': string;
    'icon-size': number;
    'icon-color': string;
    'icon-opacity': number;
    'icon-rotate': number;
    'icon-halo-color': string;
    'icon-halo-width': number;
    'icon-halo-blur': number;
}
export declare class MapSDFIconMaterial extends THREE.RawShaderMaterial {
    private m_params;
    constructor(params?: Partial<MapSDFIconMaterialParams>);
    setSpriteAtlas(atlas: any, iconName: string): void;
    private applyParams;
}
//# sourceMappingURL=MapSDFIconMaterial.d.ts.map