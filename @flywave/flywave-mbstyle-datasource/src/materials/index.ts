import * as THREE from 'three';

import { LayerType } from '../MBStyleSpec';
import { MapFillMaterial, MapFillMaterialParams } from './MapFillMaterial';
import { MapLineMaterial, MapLineMaterialParams } from './MapLineMaterial';
import { MapCircleMaterial, MapCircleMaterialParams } from './MapCircleMaterial';
import { MapExtrusionMaterial, MapExtrusionMaterialParams } from './MapExtrusionMaterial';
import { MapIconMaterial, MapIconMaterialParams } from './MapIconMaterial';
import { MapHeatmapMaterial, MapHeatmapMaterialParams } from './MapHeatmapMaterial';
import { MapHillshadeMaterial, MapHillshadeMaterialParams } from './MapHillshadeMaterial';
import { MBSDFTextMaterial, MapTextMaterialParams } from './MBSDFTextMaterial';

export { MapFillMaterial, MapFillMaterialParams };
export { MapLineMaterial, MapLineMaterialParams };
export { MapCircleMaterial, MapCircleMaterialParams };
export { MapExtrusionMaterial, MapExtrusionMaterialParams };
export { MapIconMaterial, MapIconMaterialParams, SpriteAtlas, SpriteIconInfo } from './MapIconMaterial';
export { MapHeatmapMaterial, MapHeatmapMaterialParams } from './MapHeatmapMaterial';
export { MapHillshadeMaterial, MapHillshadeMaterialParams } from './MapHillshadeMaterial';
export { MBSDFTextMaterial, MapTextMaterialParams } from './MBSDFTextMaterial';
export { MBRenderLayer } from './MBRenderLayer';

const FALLBACK = new THREE.MeshBasicMaterial({ color: '#ff00ff' });

export interface CreateMaterialOptions {
    capabilities?: any;
    spriteAtlas?: any;
}

export function createMBMaterial(
    layerType: LayerType,
    paint: Record<string, any>,
    options?: CreateMaterialOptions,
): THREE.Material {
    const capabilities = options?.capabilities;
    const atlas = options?.spriteAtlas;

    switch (layerType) {
        case 'background': {
            const fillPaint: any = {
                'fill-color': paint['background-color'] ?? '#000000',
                'fill-opacity': paint['background-opacity'] ?? 1,
            };
            if (paint['background-pattern']) fillPaint['fill-pattern'] = paint['background-pattern'];
            const mat = new MapFillMaterial(fillPaint);
            if (paint['background-pattern'] && atlas) {
                applyPatternTexture(mat, paint['background-pattern'], atlas);
            }
            return mat;
        }
        case 'fill': {
            const mat = new MapFillMaterial(paint as any);
            if (paint['fill-pattern'] && atlas) {
                applyPatternTexture(mat, paint['fill-pattern'], atlas);
            }
            return mat;
        }
        case 'line': {
            const mat = new MapLineMaterial(paint as any, capabilities);
            if (paint['line-pattern'] && atlas) {
                mat.setPatternTexture(atlas.texture);
            }
            return mat;
        }
        case 'circle':
            return new MapCircleMaterial(paint as any);
        case 'symbol': {
            if (paint['text-field'] || (paint as any)['text-field']) {
                return new MBSDFTextMaterial(paint as any);
            }
            const mat = new MapIconMaterial(paint as any);
            if (atlas) mat.setSpriteAtlas(atlas);
            return mat;
        }
        case 'fill-extrusion':
            return new MapExtrusionMaterial(paint as any);
        case 'heatmap':
            return new MapHeatmapMaterial(paint as any);
        case 'hillshade':
            return new MapHillshadeMaterial(paint as any);
        default:
            return FALLBACK;
    }
}

function applyPatternTexture(mat: MapFillMaterial, patternName: string, atlas: any) {
    if (!atlas?.icons) return;
    const info = atlas.icons.get?.(patternName);
    if (info) {
        mat.setPatternTexture(atlas.texture, [info.width, info.height]);
    }
}

export function updateMBMaterial(
    material: THREE.Material,
    layerType: LayerType,
    paint: Record<string, any>,
): void {
    switch (layerType) {
        case 'background': {
            const fillPaint: any = {
                'fill-color': paint['background-color'] ?? '#000000',
                'fill-opacity': paint['background-opacity'] ?? 1,
            };
            if (paint['background-pattern']) fillPaint['fill-pattern'] = paint['background-pattern'];
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
        case 'symbol':
            (material as unknown as MapIconMaterial).setPaint(paint as any);
            break;
        case 'fill-extrusion':
            (material as unknown as MapExtrusionMaterial).setPaint(paint as any);
            break;
        case 'heatmap':
            (material as unknown as MapHeatmapMaterial).setPaint(paint as any);
            break;
        case 'hillshade':
            (material as unknown as MapHillshadeMaterial).setPaint(paint as any);
            break;
    }
}
