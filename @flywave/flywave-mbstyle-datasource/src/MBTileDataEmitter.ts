import {
    DecodedTile,
    Geometry,
    IndexedTechnique,
    BufferAttribute,
    BufferElementType,
    Group,
    GeometryType,
} from '@flywave/flywave-datasource-protocol';
import { Projection, TileKey } from '@flywave/flywave-geoutils';
import * as THREE from 'three';

import { EvaluatedLayer } from './MBLayerEvaluator';

interface AccumulatedGeometry {
    positions: number[];
    indices: number[];
    groups: Array<{ start: number; count: number; materialIndex: number }>;
    layerIds: string[];
}

export class MBTileDataEmitter {
    private m_geometries: Map<string, AccumulatedGeometry> = new Map();
    private m_techniqueIndex = 0;
    private m_techniques: IndexedTechnique[] = [];
    private m_layerToTechniqueIndex: Map<string, number> = new Map();

    constructor(
        private m_tileKey: TileKey,
        private m_projection: Projection,
        private m_zoom: number
    ) {}

    private getOrCreateGeometry(layerId: string, type: string): AccumulatedGeometry {
        const key = `${layerId}:${type}`;
        let geo = this.m_geometries.get(key);
        if (!geo) {
            geo = {
                positions: [],
                indices: [],
                groups: [],
                layerIds: [],
            };
            this.m_geometries.set(key, geo);
        }
        return geo;
    }

    private getOrCreateTechniqueIndex(layer: EvaluatedLayer): number {
        let idx = this.m_layerToTechniqueIndex.get(layer.id);
        if (idx === undefined) {
            idx = this.m_techniqueIndex++;
            this.m_layerToTechniqueIndex.set(layer.id, idx);
            this.m_techniques.push({
                name: layer.type,
                _index: idx,
                _layerId: layer.id,
                _paint: layer.paint,
                _layout: layer.layout,
                _renderOrder: layer.renderOrder,
            } as any);
        }
        return idx;
    }

    processFillFeature(
        layerName: string,
        extents: number,
        geometry: THREE.Vector3[][],
        properties: Record<string, any>,
        featureId: string | number | undefined,
        matchedLayers: EvaluatedLayer[]
    ): void {
        for (const layer of matchedLayers) {
            const techniqueIdx = this.getOrCreateTechniqueIndex(layer);
            const geo = this.getOrCreateGeometry(layer.id, 'fill');

            const polygonIndices: number[] = [];

            for (const ring of geometry) {
                const startIdx = geo.positions.length / 3;
                for (const pt of ring) {
                    geo.positions.push(pt.x, pt.y, pt.z);
                }

                for (let i = 2; i < ring.length; i++) {
                    polygonIndices.push(startIdx);
                    polygonIndices.push(startIdx + i - 1);
                    polygonIndices.push(startIdx + i);
                }
            }

            const groupStart = geo.indices.length;
            for (const idx of polygonIndices) {
                geo.indices.push(idx);
            }

            geo.groups.push({
                start: groupStart,
                count: polygonIndices.length,
                materialIndex: techniqueIdx,
            });
            geo.layerIds.push(layer.id);
        }
    }

    processLineFeature(
        layerName: string,
        extents: number,
        lines: THREE.Vector3[][],
        properties: Record<string, any>,
        featureId: string | number | undefined,
        matchedLayers: EvaluatedLayer[]
    ): void {
        for (const layer of matchedLayers) {
            const techniqueIdx = this.getOrCreateTechniqueIndex(layer);
            const geo = this.getOrCreateGeometry(layer.id, 'line');

            for (const line of lines) {
                const groupStart = geo.indices.length;
                for (let i = 0; i < line.length; i++) {
                    const pt = line[i];
                    geo.positions.push(pt.x, pt.y, pt.z);
                    if (i < line.length - 1) {
                        geo.indices.push(
                            geo.positions.length / 3 - 1,
                            geo.positions.length / 3
                        );
                    }
                }

                geo.groups.push({
                    start: groupStart,
                    count: (line.length - 1) * 2,
                    materialIndex: techniqueIdx,
                });
                geo.layerIds.push(layer.id);
            }
        }
    }

    processPointFeature(
        layerName: string,
        extents: number,
        points: THREE.Vector3[],
        properties: Record<string, any>,
        featureId: string | number | undefined,
        matchedLayers: EvaluatedLayer[]
    ): void {
        for (const layer of matchedLayers) {
            const techniqueIdx = this.getOrCreateTechniqueIndex(layer);
            const geo = this.getOrCreateGeometry(layer.id, 'point');

            const groupStart = geo.indices.length;
            for (const pt of points) {
                geo.positions.push(pt.x, pt.y, pt.z);
            }

            geo.groups.push({
                start: groupStart,
                count: points.length,
                materialIndex: techniqueIdx,
            });
            geo.layerIds.push(layer.id);
        }
    }

    getDecodedTile(): DecodedTile {
        const geometries: Geometry[] = [];

        for (const [, geo] of this.m_geometries) {
            if (geo.positions.length === 0) continue;

            const positionArray = new Float32Array(geo.positions);
            const indexArray = new Uint32Array(geo.indices);

            const positionAttr: BufferAttribute = {
                name: 'position',
                buffer: positionArray.buffer,
                type: 'float' as BufferElementType,
                itemCount: 3,
            };

            const indexAttr: BufferAttribute = {
                name: 'index',
                buffer: indexArray.buffer,
                type: 'uint32' as BufferElementType,
                itemCount: 1,
            };

            const groups: Group[] = geo.groups.map(g => ({
                start: g.start,
                count: g.count,
                technique: g.materialIndex,
            }));

            const geometry: Geometry = {
                type: GeometryType.Polygon,
                vertexAttributes: [positionAttr],
                index: indexAttr,
                groups,
                featureStarts: [],
                objInfos: [],
                attachments: [],
            };

            geometries.push(geometry);
        }

        const decodedTile: DecodedTile = {
            techniques: this.m_techniques,
            geometries,
        };

        return decodedTile;
    }
}
