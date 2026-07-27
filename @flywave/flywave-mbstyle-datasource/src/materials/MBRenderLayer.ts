import * as THREE from 'three';

import { DecodedTile, IndexedTechnique, Geometry } from '@flywave/flywave-datasource-protocol';
import { Tile } from '@flywave/flywave-mapview';

import { LayerType } from '../MBStyleSpec';
import { createMBMaterial, updateMBMaterial } from './index';
import { MapFillMaterial } from './MapFillMaterial';
import { MapLineMaterial } from './MapLineMaterial';

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
        if (geometry.interleavedVertexAttributes) {
            for (const interleaved of geometry.interleavedVertexAttributes) {
                const array = this.bufferToTypedArray(interleaved);
                if (!array) continue;
                const strideFloats = interleaved.stride / 4;
                const buffer = new THREE.InterleavedBuffer(array, strideFloats);
                for (const attr of interleaved.attributes) {
                    const attrib = new THREE.InterleavedBufferAttribute(
                        buffer, attr.itemSize, attr.offset / 4,
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
                // Triangulated line via SolidLineMaterial — use Mesh
                object = new THREE.Mesh(subGeometry, material);
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
