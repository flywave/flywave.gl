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

const FALLBACK = new THREE.MeshBasicMaterial({ color: '#ff00ff' });

export function createMBMaterial(
    layerType: LayerType,
    paint: Record<string, any>,
): THREE.Material {
    switch (layerType) {
        case 'background':
        case 'fill':
            return new MapFillMaterial(paint as any);
        case 'line':
            return new MapLineMaterial(paint as any);
        case 'circle':
            return new MapCircleMaterial(paint as any);
        case 'fill-extrusion':
            return new MapExtrusionMaterial(paint as any);
        default:
            return FALLBACK;
    }
}

export function updateMBMaterial(
    material: THREE.Material,
    layerType: LayerType,
    paint: Record<string, any>,
): void {
    switch (layerType) {
        case 'background':
        case 'fill':
            (material as unknown as MapFillMaterial).setPaint(paint as any);
            break;
        case 'line':
            (material as unknown as MapLineMaterial).setPaint(paint as any);
            break;
        case 'circle':
            (material as unknown as MapCircleMaterial).setPaint(paint as any);
            break;
        case 'fill-extrusion':
            (material as unknown as MapExtrusionMaterial).setPaint(paint as any);
            break;
    }
}
