import {
    DecodedTile,
    Geometry,
    IndexedTechnique,
    BufferAttribute,
    BufferElementType,
    Group,
    GeometryType,
    AttributeMap,
    InterleavedBufferAttribute,
} from '@flywave/flywave-datasource-protocol';
import { TileKey, webMercatorProjection } from '@flywave/flywave-geoutils';
import * as THREE from 'three';

import { EvaluatedLayer } from './MBLayerEvaluator';
import { ILineGeometry, IPolygonGeometry } from '@flywave/flywave-vectortile-datasource/IGeometryProcessor';
import { DecodeInfo } from '@flywave/flywave-vectortile-datasource/DecodeInfo';
import { webMercatorTile2TargetTile } from '@flywave/flywave-vectortile-datasource/OmvUtils';
import { createLineGeometry, LineGroup } from '@flywave/flywave-lines';

// Use earcut for proper polygon triangulation (concave + holes)
import earcut from 'earcut';

interface AccumulatedGeometry {
    positions: number[];
    indices: number[];
    groups: Array<{ start: number; count: number; materialIndex: number }>;
    featureStarts: number[];
    objInfos: AttributeMap[];
}

const tmpV3 = new THREE.Vector3();
const EXTENTS = 4096;

export class MBTileDataEmitter {
    private m_geometries: Map<string, AccumulatedGeometry> = new Map();
    private m_techniqueIndex = 0;
    private m_techniques: IndexedTechnique[] = [];
    private m_layerToTechniqueIndex: Map<string, number> = new Map();

    constructor(
        private m_tileKey: TileKey,
        private m_decodeInfo: DecodeInfo,
        private m_zoom: number,
    ) {}

    private getOrCreateGeometry(key: string): AccumulatedGeometry {
        let geo = this.m_geometries.get(key);
        if (!geo) {
            geo = { positions: [], indices: [], groups: [], featureStarts: [], objInfos: [] };
            this.m_geometries.set(key, geo);
        }
        return geo;
    }

    private project(p: THREE.Vector2 | THREE.Vector3): THREE.Vector3 {
        webMercatorTile2TargetTile(EXTENTS, this.m_decodeInfo, p, tmpV3, false);
        return tmpV3.clone();
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
                props.technique = layer.layout['line-cap'] === 'round' ? 'solid-line' : 'solid-line';
                props.color = p['line-color'] ?? '#000000';
                props.opacity = p['line-opacity'] ?? 1;
                props.lineWidth = p['line-width'] ?? 1;
                if (p['line-dasharray']) {
                    const arr = p['line-dasharray'] as number[];
                    if (arr.length >= 2) {
                        props.dashSize = arr[0];
                        props.gapSize = arr[1];
                    }
                }
                if (l.visibility === 'none') props.enabled = false;
                break;
            case 'circle':
                props.technique = 'circles';
                props.color = p['circle-color'] ?? '#000000';
                props.opacity = p['circle-opacity'] ?? 1;
                props.size = p['circle-radius'] ?? 5;
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
                _layerId: layer.id,
                _paint: layer.paint,
                _layout: layer.layout,
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
        matchedLayers: EvaluatedLayer[],
    ): void {
        for (const layer of matchedLayers) {
            const techniqueIdx = this.getOrCreateTechniqueIndex(layer);
            const key = `${layer.id}:fill`;
            const geo = this.getOrCreateGeometry(key);
            const featureStart = geo.indices.length;

            for (const polygon of geometry) {
                const rings = polygon.rings;
                if (rings.length === 0) continue;

                // Use earcut for proper polygon triangulation with hole support
                const allVerts: number[] = [];
                const holeIndices: number[] = [];

                // Exterior ring
                for (const pt of rings[0]) {
                    allVerts.push(pt.x, pt.y);
                }

                // Interior rings (holes)
                for (let r = 1; r < rings.length; r++) {
                    holeIndices.push(allVerts.length / 2);
                    for (const pt of rings[r]) {
                        allVerts.push(pt.x, pt.y);
                    }
                }

                // Triangulate with earcut
                const triIndices = earcut(allVerts, holeIndices.length > 0 ? holeIndices : null, 2);

                // Project and store vertices
                const startIdx = geo.positions.length / 3;
                const vertCount2d = allVerts.length / 2;
                for (let i = 0; i < vertCount2d; i++) {
                    const w = this.project(
                        new THREE.Vector2(allVerts[i * 2], allVerts[i * 2 + 1])
                    );
                    geo.positions.push(w.x, w.y, 0);
                }

                // Store triangulated indices
                for (let i = 0; i < triIndices.length; i++) {
                    geo.indices.push(triIndices[i] + startIdx);
                }
            }

            const count = geo.indices.length - featureStart;
            if (count > 0) {
                geo.groups.push({
                    start: featureStart,
                    count,
                    materialIndex: techniqueIdx,
                });
                geo.featureStarts.push(featureStart);
                geo.objInfos.push({ ...properties, $id: featureId ?? properties.$id ?? null });
            }
        }
    }

    // Interleaved vertex data for triangulated lines
    private m_lineInterleaved: number[] = [];
    private m_lineIndices: number[] = [];
    private m_lineGroupStarts: number[] = [];
    private m_lineAttr: string[] = [];

    processLineFeature(
        layerName: string,
        extents: number,
        geometry: ILineGeometry[],
        properties: Record<string, any>,
        featureId: string | number | undefined,
        matchedLayers: EvaluatedLayer[],
    ): void {
        for (const layer of matchedLayers) {
            const techniqueIdx = this.getOrCreateTechniqueIndex(layer);

            for (const lineGeo of geometry) {
                // Convert tile-local to world
                const worldPts: number[] = [];
                for (const pt of lineGeo.positions) {
                    const w = this.project(pt);
                    worldPts.push(w.x, w.y, 0);
                }

                const center = this.m_decodeInfo.center;
                const lineGeom = createLineGeometry(center, worldPts, webMercatorProjection);

                // Store interleaved vertex data + remapped indices
                const stride = 13; // extrusionCoord(3)+position(3)+tangent(3)+biTangent(4)
                const baseVert = this.m_lineInterleaved.length / stride;
                this.m_lineInterleaved.push(...lineGeom.vertices);

                for (const idx of lineGeom.indices) {
                    this.m_lineIndices.push(idx + baseVert);
                }

                const start = this.m_lineIndices.length - lineGeom.indices.length;
                const fid = featureId ?? properties.$id ?? null;
                this.m_lineGroupStarts.push(start, techniqueIdx);
                this.m_lineAttr.push(JSON.stringify({ ...properties, $id: fid }));
            }
        }
    }

    /** Get stored triangulated line data for building the DecodedTile */
    private getLineGeometries(): Geometry[] {
        if (this.m_lineInterleaved.length === 0 || this.m_lineIndices.length === 0) return [];

        const data = new Float32Array(this.m_lineInterleaved);
        const indices = new Uint32Array(this.m_lineIndices);

        const interleavedAttr: InterleavedBufferAttribute = {
            buffer: data.buffer,
            stride: 13,
            type: 'float' as BufferElementType,
            attributes: [
                { name: 'extrusionCoord', offset: 0, itemSize: 3 },
                { name: 'position', offset: 3, itemSize: 3 },
                { name: 'tangent', offset: 6, itemSize: 3 },
                { name: 'biTangent', offset: 9, itemSize: 4 },
            ],
        };

        const groups: Group[] = [];
        const end = this.m_lineIndices.length;
        for (let i = 0; i < this.m_lineGroupStarts.length; i += 2) {
            const start = this.m_lineGroupStarts[i];
            const nextStart = i + 2 < this.m_lineGroupStarts.length
                ? this.m_lineGroupStarts[i + 2] : end;
            groups.push({
                start,
                count: nextStart - start,
                technique: this.m_lineGroupStarts[i + 1],
            });
        }

        return [{
            type: GeometryType.SolidLine,
            interleavedVertexAttributes: [interleavedAttr],
            index: {
                name: 'index',
                buffer: indices.buffer,
                type: 'uint32' as BufferElementType,
                itemCount: 1,
            },
            groups,
            featureStarts: groups.map(g => g.start),
            objInfos: this.m_lineAttr.map(a => JSON.parse(a)),
            attachments: [],
        }];
    }

    processPointFeature(
        layerName: string,
        extents: number,
        points: THREE.Vector3[],
        properties: Record<string, any>,
        featureId: string | number | undefined,
        matchedLayers: EvaluatedLayer[],
    ): void {
        for (const layer of matchedLayers) {
            const techniqueIdx = this.getOrCreateTechniqueIndex(layer);
            const key = `${layer.id}:point`;
            const geo = this.getOrCreateGeometry(key);
            const featureStart = geo.indices.length;

            for (const pt of points) {
                const w = this.project(pt);
                geo.positions.push(w.x, w.y, w.z);
            }

            const count = points.length;
            geo.groups.push({
                start: featureStart,
                count,
                materialIndex: techniqueIdx,
            });
            geo.featureStarts.push(featureStart);
            geo.objInfos.push({ ...properties, $id: featureId ?? properties.$id ?? null });
        }
    }

    getDecodedTile(): DecodedTile {
        const geometries: Geometry[] = [];

        for (const [, geo] of this.m_geometries) {
            if (geo.positions.length === 0) continue;

            const positionArray = new Float32Array(geo.positions);
            const indexArray = geo.indices.length > 0 ? new Uint32Array(geo.indices) : undefined;

            const positionAttr: BufferAttribute = {
                name: 'position',
                buffer: positionArray.buffer,
                type: 'float' as BufferElementType,
                itemCount: 3,
            };

            const groups: Group[] = geo.groups.map(g => ({
                start: g.start,
                count: g.count,
                technique: g.materialIndex,
            }));

            const geom: Geometry = {
                type: GeometryType.Polygon,
                vertexAttributes: [positionAttr],
                groups,
                featureStarts: geo.featureStarts,
                objInfos: geo.objInfos,
                attachments: [],
            };

            if (indexArray) {
                geom.index = {
                    name: 'index',
                    buffer: indexArray.buffer,
                    type: 'uint32' as BufferElementType,
                    itemCount: 1,
                };
            }

            geometries.push(geom);
        }

        const lineGeoms = this.getLineGeometries();
        return { techniques: this.m_techniques, geometries: [...geometries, ...lineGeoms] };
    }
}
