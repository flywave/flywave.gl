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
export { MBRenderLayer } from './MBRenderLayer';

const FALLBACK = new THREE.MeshBasicMaterial({ color: '#ff00ff' });

export function createMBMaterial(
    layerType: LayerType,
    paint: Record<string, any>,
    capabilities?: any,
): THREE.Material {
    switch (layerType) {
        case 'background': {
            const fillPaint = {
                'fill-color': paint['background-color'] ?? '#000000',
                'fill-opacity': paint['background-opacity'] ?? 1,
            };
            return new MapFillMaterial(fillPaint);
        }
        case 'fill':
            return new MapFillMaterial(paint as any);
        case 'line':
            return new MapLineMaterial(paint as any, capabilities);
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
        case 'background': {
            const fillPaint = {
                'fill-color': paint['background-color'] ?? '#000000',
                'fill-opacity': paint['background-opacity'] ?? 1,
            };
            (material as unknown as MapFillMaterial).setPaint(fillPaint);
            break;
        }
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
