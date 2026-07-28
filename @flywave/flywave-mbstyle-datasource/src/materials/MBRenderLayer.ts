import * as THREE from 'three';

import { DecodedTile, IndexedTechnique, Geometry } from '@flywave/flywave-datasource-protocol';
import { Tile } from '@flywave/flywave-mapview';

import { LayerType } from '../MBStyleSpec';
import { createMBMaterial, updateMBMaterial } from './index';
import { MapFillMaterial } from './MapFillMaterial';
import { MapLineMaterial } from './MapLineMaterial';
import { MapIconMaterial } from './MapIconMaterial';
import { MBSDFTextMaterial } from './MBSDFTextMaterial';

interface RenderableObject {
    object: THREE.Object3D;
    layerId: string;
    renderOrder: number;
    technique: IndexedTechnique;
}

/**
 * Bridges the Mapbox material system with the flywave rendering pipeline.
 *
 * This class is called by the MBStyleDataSource during tile rendering.
 * It takes decoded tile data and creates Three.js objects with Mapbox-compatible materials,
 * bypassing flywave's own DecodedTileHelpers / TileGeometryCreator.
 */
export class MBRenderLayer {
    private m_materialCache = new Map<string, THREE.Material>();

    /**
     * Convert a DecodedTile into Three.js objects with Mapbox materials.
     * Called during tile geometry creation.
     */
    buildObjects(
        tile: Tile,
        decodedTile: DecodedTile,
    ): RenderableObject[] {
        const result: RenderableObject[] = [];

        for (const geometry of decodedTile.geometries) {
            if (!geometry.vertexAttributes) continue;

            const objects = this.buildFromGeometry(tile, geometry, decodedTile.techniques);
            result.push(...objects);
        }

        return result;
    }

    private buildFromGeometry(
        tile: Tile,
        geometry: Geometry,
        techniques: IndexedTechnique[],
    ): RenderableObject[] {
        const result: RenderableObject[] = [];
        const bufferGeometry = new THREE.BufferGeometry();

        // Handle interleaved vertex attributes (used by SolidLine geometry)
        // Protocol uses element-level stride and offset (not bytes)
        if (geometry.interleavedVertexAttributes) {
            for (const interleaved of geometry.interleavedVertexAttributes) {
                const array = this.bufferToTypedArray(interleaved);
                if (!array) continue;
                const buffer = new THREE.InterleavedBuffer(array, interleaved.stride);
                for (const attr of interleaved.attributes) {
                    const attrib = new THREE.InterleavedBufferAttribute(
                        buffer, attr.itemSize, attr.offset,
                    );
                    bufferGeometry.setAttribute(attr.name, attrib);
                }
            }
        }

        for (const attr of geometry.vertexAttributes ?? []) {
            if (!attr.buffer) continue;
            const array = this.bufferToTypedArray(attr);
            if (!array) continue;
            bufferGeometry.setAttribute(attr.name, new THREE.BufferAttribute(array, attr.itemCount));
        }

        if (geometry.index?.buffer) {
            const idxArray = this.bufferToTypedArray(geometry.index);
            if (idxArray) {
                bufferGeometry.setIndex(new THREE.BufferAttribute(idxArray, 1));
            }
        }

        const renderOrders: number[] = [];

        for (const group of geometry.groups) {
            const technique = techniques[group.technique];
            if (!technique) continue;

            const layerId = (technique as any)._layerId ?? technique.name;
            const paint = (technique as any)._paint ?? {};
            const layerType = technique.name as LayerType;
            const renderOrder = (technique as any)._renderOrder ?? 0;

            const matKey = this.getMaterialKey(technique, paint);
            let material = this.m_materialCache.get(matKey);

            if (!material) {
                material = createMBMaterial(layerType, paint);
                this.m_materialCache.set(matKey, material);
            } else {
                updateMBMaterial(material, layerType, paint);
            }

            const subGeometry = bufferGeometry.clone();
            subGeometry.addGroup(group.start, group.count, 0);

            const geomType = geometry.type;

            let object: THREE.Object3D;

            if (geomType === 'SolidLine' as any) {
                object = new THREE.Mesh(subGeometry, material);
            } else if (layerType === 'symbol') {
                // Icon/Text symbols: create Sprites or quads
                if (material instanceof MapIconMaterial) {
                    const sprite = new THREE.Sprite(material);

                    // icon-text-fit: scale icon to fit text bounding box
                    const textFit = paint['icon-text-fit'] as string | undefined;
                    if (textFit && textFit !== 'none') {
                        const textSize = paint['text-size'] as number ?? 16;
                        const textWidth = (technique as any)._textWidth ?? 5;
                        const textHeight = (technique as any)._textHeight ?? 1.2;
                        const padding = paint['icon-text-fit-padding'] as number[] ?? [0, 0, 0, 0];

                        const fitW = textWidth * textSize + padding[0] + padding[2];
                        const fitH = textHeight * textSize + padding[1] + padding[3];

                        if (textFit === 'width' || textFit === 'both') {
                            sprite.scale.x = fitW;
                        }
                        if (textFit === 'height' || textFit === 'both') {
                            sprite.scale.y = fitH;
                        }
                    }

                    // Apply icon-offset
                    const offset = paint['icon-offset'] as [number, number] | undefined;
                    if (offset && (offset[0] || offset[1])) {
                        sprite.position.set(offset[0], offset[1], 0);
                    }

                    // Apply icon-anchor
                    const anchor = paint['icon-anchor'] as string | undefined;
                    if (anchor && anchor !== 'center') {
                        this.applyAnchor(sprite, anchor);
                    }

                    // Apply icon-size scaling
                    const iconSize = paint['icon-size'] as number ?? 1;
                    if (iconSize !== 1 && !textFit) {
                        sprite.scale.set(iconSize * 32, iconSize * 32, 1);
                    }

                    object = sprite;
                } else if (material instanceof MBSDFTextMaterial) {
                    // SDF text rendered as Mesh with glyph quads
                    const text = paint['text-field'] as string || '';
                    const size = paint['text-size'] as number || 16;
                    const mesh = this.buildTextMesh(text, size, paint, material);
                    object = mesh;
                } else {
                    object = new THREE.Points(subGeometry, material);
                }
            } else switch (layerType) {
                case 'line':
                    object = new THREE.LineSegments(subGeometry, material);
                    break;
                case 'circle':
                    object = new THREE.Points(subGeometry, material);
                    break;
                case 'fill-extrusion':
                    object = new THREE.Mesh(subGeometry, material);
                    break;
                case 'fill':
                case 'background':
                default: {
                    const mesh = new THREE.Mesh(subGeometry, material);
                    if (material instanceof MapFillMaterial && material.hasOutline) {
                        const edges = new THREE.EdgesGeometry(subGeometry);
                        const outlineMat = new THREE.LineBasicMaterial({
                            color: material.outlineColor,
                            depthTest: true,
                        });
                        const outline = new THREE.LineSegments(edges, outlineMat);
                        outline.renderOrder = renderOrder + 0.001;
                        mesh.add(outline);
                    }
                    object = mesh;
                    break;
                }
            }

            object.renderOrder = renderOrder;
            object.userData.technique = technique;
            object.userData.layerId = layerId;
            object.frustumCulled = false;

            result.push({
                object,
                layerId,
                renderOrder,
                technique,
            });
        }

        return result;
    }

    /**
     * Clear the material cache when style changes.
     */
    clearCache() {
        for (const mat of this.m_materialCache.values()) {
            mat.dispose();
        }
        this.m_materialCache.clear();
    }

    private applyAnchor(sprite: THREE.Sprite, anchor: string) {
        // Mapbox anchor types map to sprite center offsets
        const map: Record<string, [number, number]> = {
            'center': [0, 0], 'left': [-0.5, 0], 'right': [0.5, 0],
            'top': [0, 0.5], 'bottom': [0, -0.5],
            'top-left': [-0.5, 0.5], 'top-right': [0.5, 0.5],
            'bottom-left': [-0.5, -0.5], 'bottom-right': [0.5, -0.5],
        };
        const offset = map[anchor] ?? [0, 0];
        sprite.center.set(0.5 + offset[0], 0.5 + offset[1]);
    }

    private buildTextMesh(
        text: string, size: number,
        _paint: Record<string, any>,
        _material: MBSDFTextMaterial,
    ): THREE.Mesh {
        // Simplified text rendering: create a planar quad for SDF text
        const textLen = text.length;
        const charWidth = size * 0.6;
        const width = textLen * charWidth;
        const height = size * 1.2;

        const geom = new THREE.PlaneGeometry(width, height);
        return new THREE.Mesh(geom, _material);
    }

    private getMaterialKey(technique: IndexedTechnique, paint: Record<string, any>): string {
        return `${technique.name}:${JSON.stringify(paint)}`;
    }

    private bufferToTypedArray(attr: any): Float32Array | Uint32Array | null {
        if (!attr || !attr.buffer) return null;

        let array: Float32Array | Uint32Array;
        const buffer = attr.buffer as ArrayBufferLike;
        const byteOffset = attr.byteOffset ?? 0;

        switch (attr.type) {
            case 'float':
            case 'float32':
                array = new Float32Array(buffer, byteOffset);
                break;
            case 'uint32':
                array = new Uint32Array(buffer, byteOffset);
                break;
            default:
                if (buffer instanceof ArrayBuffer || (typeof SharedArrayBuffer !== 'undefined' && buffer instanceof SharedArrayBuffer)) {
                    array = new Float32Array(buffer, byteOffset);
                } else {
                    return null;
                }
        }
        return array;
    }
}
