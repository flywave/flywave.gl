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
import { ILineGeometry, IPolygonGeometry } from '@flywave/flywave-vectortile-datasource/IGeometryProcessor';

interface AccumulatedGeometry {
    positions: number[];
    indices: number[];
    groups: Array<{ start: number; count: number; materialIndex: number }>;
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
            geo = { positions: [], indices: [], groups: [] };
            this.m_geometries.set(key, geo);
        }
        return geo;
    }

    private paintToTechniqueProps(layer: EvaluatedLayer): Record<string, any> {
        const p = layer.paint;
        const l = layer.layout;
        const props: Record<string, any> = {};

        switch (layer.type) {
            case 'background':
                props.technique = 'fill';
                props.color = p['background-color'] ?? '#000000';
                props.opacity = p['background-opacity'] ?? 1;
                props.renderOrder = -Infinity;
                break;
            case 'fill':
                props.technique = 'fill';
                props.color = p['fill-color'] ?? '#000000';
                props.opacity = p['fill-opacity'] ?? 1;
                props.outlineColor = p['fill-outline-color'];
                if (l.visibility === 'none') props.enabled = false;
                break;
            case 'line':
                props.technique = 'solid-line';
                props.color = p['line-color'] ?? '#000000';
                props.opacity = p['line-opacity'] ?? 1;
                props.lineWidth = p['line-width'] ?? 1;
                if (p['line-dasharray']) {
                    const arr = p['line-dasharray'] as number[];
                    if (arr.length >= 2) {
                        props.dashSize = arr[0];
                        props.gapSize = arr[1];
                        props.technique = 'dashed-line';
                    }
                }
                if (l.visibility === 'none') props.enabled = false;
                break;
            case 'circle':
                props.technique = 'circles';
                props.color = p['circle-color'] ?? '#000000';
                props.opacity = p['circle-opacity'] ?? 1;
                props.radius = p['circle-radius'] ?? 5;
                if (l.visibility === 'none') props.enabled = false;
                break;
            case 'symbol':
                if (l['icon-image']) {
                    props.technique = 'labeled-icon';
                    props.imageTexture = l['icon-image'];
                    props.color = p['icon-color'] ?? '#000000';
                    props.opacity = p['icon-opacity'] ?? 1;
                    props.iconScale = l['icon-size'] ?? 1;
                } else if (l['text-field']) {
                    props.technique = 'text';
                    props.text = l['text-field'];
                    props.color = p['text-color'] ?? '#000000';
                    props.opacity = p['text-opacity'] ?? 1;
                    props.size = l['text-size'] ?? 16;
                    props.fontName = l['text-font']?.[0];
                }
                if (l.visibility === 'none') props.enabled = false;
                break;
            case 'fill-extrusion':
                props.technique = 'extruded-polygon';
                props.color = p['fill-extrusion-color'] ?? '#000000';
                props.opacity = p['fill-extrusion-opacity'] ?? 1;
                props.height = p['fill-extrusion-height'] ?? 0;
                props.floorHeight = p['fill-extrusion-base'] ?? 0;
                if (l.visibility === 'none') props.enabled = false;
                break;
        }
        return props;
    }

    private getOrCreateTechniqueIndex(layer: EvaluatedLayer): number {
        let idx = this.m_layerToTechniqueIndex.get(layer.id);
        if (idx === undefined) {
            idx = this.m_techniqueIndex++;
            this.m_layerToTechniqueIndex.set(layer.id, idx);
            const props = this.paintToTechniqueProps(layer);
            const technique: any = {
                name: props.technique,
                _index: idx,
                _renderOrder: layer.renderOrder,
                ...props,
            };
            this.m_techniques.push(technique as IndexedTechnique);
        }
        return idx;
    }

    processFillFeature(
        layerName: string,
        extents: number,
        geometry: IPolygonGeometry[],
        properties: Record<string, any>,
        featureId: string | number | undefined,
        matchedLayers: EvaluatedLayer[]
    ): void {
        for (const layer of matchedLayers) {
            const techniqueIdx = this.getOrCreateTechniqueIndex(layer);
            const geo = this.getOrCreateGeometry(layer.id, 'fill');

            for (const polygon of geometry) {
                for (const ring2d of polygon.rings) {
                    const startIdx = geo.positions.length / 3;
                    for (const pt of ring2d) {
                        geo.positions.push(pt.x, pt.y, 0);
                    }
                    for (let i = 2; i < ring2d.length; i++) {
                        geo.indices.push(startIdx, startIdx + i - 1, startIdx + i);
                    }
                }
            }
        }
    }

    processLineFeature(
        layerName: string,
        extents: number,
        geometry: ILineGeometry[],
        properties: Record<string, any>,
        featureId: string | number | undefined,
        matchedLayers: EvaluatedLayer[]
    ): void {
        for (const layer of matchedLayers) {
            const techniqueIdx = this.getOrCreateTechniqueIndex(layer);
            const geo = this.getOrCreateGeometry(layer.id, 'line');

            for (const lineGeo of geometry) {
                const positions = lineGeo.positions;
                for (let i = 0; i < positions.length; i++) {
                    const pt = positions[i];
                    geo.positions.push(pt.x, pt.y, 0);
                    if (i < positions.length - 1) {
                        geo.indices.push(geo.positions.length / 3 - 1, geo.positions.length / 3);
                    }
                }
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

            for (const pt of points) {
                geo.positions.push(pt.x, pt.y, pt.z ?? 0);
            }
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

            geometries.push({
                type: GeometryType.Polygon,
                vertexAttributes: [positionAttr],
                index: indexAttr,
                groups,
                featureStarts: [],
                objInfos: [],
                attachments: [],
            });
        }

        return { techniques: this.m_techniques, geometries };
    }
}
