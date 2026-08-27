import * as THREE from 'three';
import { LayerType } from '../MBStyleSpec';
import { MapFillMaterial, MapFillMaterialParams } from './MapFillMaterial';
import { MapLineMaterial, MapLineMaterialParams } from './MapLineMaterial';
import { MapCircleMaterial, MapCircleMaterialParams } from './MapCircleMaterial';
import { MapExtrusionMaterial, MapExtrusionMaterialParams } from './MapExtrusionMaterial';
export { MapFillMaterial, MapFillMaterialParams };
export { MapLineMaterial, MapLineMaterialParams };
export { MapCircleMaterial, MapCircleMaterialParams };
export { MapExtrusionMaterial, MapExtrusionMaterialParams };
export { MapIconMaterial, MapIconMaterialParams, SpriteAtlas, SpriteIconInfo } from './MapIconMaterial';
export { MapHeatmapMaterial, MapHeatmapMaterialParams } from './MapHeatmapMaterial';
export { MapHillshadeMaterial, MapHillshadeMaterialParams } from './MapHillshadeMaterial';
export { MapRasterMaterial, MapRasterMaterialParams } from './MapRasterMaterial';
export { MapBuildingMaterial, MapBuildingMaterialParams } from './MapBuildingMaterial';
export { MBSDFTextMaterial, MapTextMaterialParams } from './MBSDFTextMaterial';
export { MapSDFIconMaterial } from './MapSDFIconMaterial';
export { MBRenderLayer } from './MBRenderLayer';
export interface CreateMaterialOptions {
    capabilities?: any;
    spriteAtlas?: any;
}
export declare function createMBMaterial(layerType: LayerType, paint: Record<string, any>, options?: CreateMaterialOptions): THREE.Material;
export declare function updateMBMaterial(material: THREE.Material, layerType: LayerType, paint: Record<string, any>): void;
//# sourceMappingURL=index.d.ts.map