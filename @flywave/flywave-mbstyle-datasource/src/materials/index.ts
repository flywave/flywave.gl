import * as THREE from 'three';

import { LayerType } from '../MBStyleSpec';
import { MapFillMaterial, MapFillMaterialParams } from './MapFillMaterial';
import { MapLineMaterial, MapLineMaterialParams } from './MapLineMaterial';
import { MapCircleMaterial, MapCircleMaterialParams } from './MapCircleMaterial';
import { MapExtrusionMaterial, MapExtrusionMaterialParams } from './MapExtrusionMaterial';
import { MapIconMaterial, MapIconMaterialParams } from './MapIconMaterial';
import { MapHeatmapMaterial, MapHeatmapMaterialParams } from './MapHeatmapMaterial';
import { MapHillshadeMaterial, MapHillshadeMaterialParams } from './MapHillshadeMaterial';
import { MapRasterMaterial, MapRasterMaterialParams } from './MapRasterMaterial';
import { MapBuildingMaterial, MapBuildingMaterialParams } from './MapBuildingMaterial';
import { MBSDFTextMaterial, MapTextMaterialParams } from './MBSDFTextMaterial';
import { MapSDFIconMaterial } from './MapSDFIconMaterial';

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
                applyLinePatternTexture(mat, paint['line-pattern'], atlas);
            }
            return mat;
        }
        case 'circle':
            return new MapCircleMaterial(paint as any);
        case 'symbol': {
            if (paint['text-field'] || (paint as any)['text-field']) {
                return new MBSDFTextMaterial(paint as any);
            }
            // Use SDF icon material when halo properties are set
            const hasHalo = paint['icon-halo-width'] !== undefined && paint['icon-halo-width'] > 0;
            if (hasHalo) {
                const mat = new MapSDFIconMaterial(paint as any);
                if (atlas) mat.setSpriteAtlas(atlas, paint['icon-image'] ?? '');
                return mat;
            }
            const mat = new MapIconMaterial(paint as any);
            if (atlas) mat.setSpriteAtlas(atlas);
            return mat;
        }
        case 'fill-extrusion': {
            const mat = new MapExtrusionMaterial(paint as any);
            if (paint['fill-extrusion-pattern'] && atlas) {
                applyExtrusionPatternTexture(mat, paint['fill-extrusion-pattern'], atlas);
            }
            return mat;
        }
        case 'heatmap':
            return new MapHeatmapMaterial(paint as any);
        case 'hillshade':
            return new MapHillshadeMaterial(paint as any);
        case 'raster':
            return new MapRasterMaterial(paint as any);
        case 'building':
            return new MapBuildingMaterial(paint as any);
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

function applyExtrusionPatternTexture(mat: MapExtrusionMaterial, patternName: string, atlas: any) {
    if (!atlas?.icons) return;
    const info = atlas.icons.get?.(patternName);
    if (info && atlas.texture) {
        mat.setPatternTexture(atlas.texture);
    }
}

function applyLinePatternTexture(mat: MapLineMaterial, patternName: string, atlas: any) {
    if (!atlas?.icons || !atlas.texture) return;
    const info = atlas.icons.get?.(patternName);
    if (!info) {
        mat.setPatternTexture(atlas.texture);
        return;
    }
    const texW = atlas.texture.image?.width ?? 1;
    const texH = atlas.texture.image?.height ?? 1;
    const uvOffset: [number, number] = [info.x / texW, info.y / texH];
    const uvScale: [number, number] = [info.width / texW, info.height / texH];
    const repeat = 1.0 / (info.width * 2);
    mat.setPatternTexture(atlas.texture, uvOffset, uvScale, repeat);
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
            if (material instanceof MapIconMaterial) {
                (material as unknown as MapIconMaterial).setPaint(paint as any);
            } else if (material instanceof MapSDFIconMaterial) {
                (material as unknown as any).m_params = { ...(material as any).m_params, ...paint };
                (material as any).applyParams?.();
            }
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
        case 'raster':
            (material as unknown as MapRasterMaterial).setPaint(paint as any);
            break;
        case 'building':
            (material as unknown as MapBuildingMaterial).setPaint(paint as any);
            break;
    }
}
