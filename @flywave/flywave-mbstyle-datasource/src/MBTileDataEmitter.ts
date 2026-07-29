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
import { createLineGeometry, LineGroup } from '@flywave/flywave-lines';
import { resolveTextField, applyTextTransform, shapeText } from './TextShaping';
import { EarthConstants } from '@flywave/flywave-geoutils';

// Use earcut for proper polygon triangulation (concave + holes)
import earcut from 'earcut';

interface AccumulatedGeometry {
    positions: number[];
    indices: number[];
    groups: Array<{ start: number; count: number; materialIndex: number; sortKey?: number }>;
    featureStarts: number[];
    objInfos: AttributeMap[];
}

const tmpV3 = new THREE.Vector3();
const EXTENTS = 4096;

/**
 * Convert tile-local coordinates to world coordinates.
 * Inlined from OmvUtils to avoid exports field resolution issues.
 */
function lat2tile(lat: number, zoom: number): number {
    return Math.round(
        ((1 - Math.log(Math.tan((lat * Math.PI) / 180) + 1 / Math.cos((lat * Math.PI) / 180)) / Math.PI) / 2) * Math.pow(2, zoom)
    );
}

function tile2world(
    extents: number,
    decodeInfo: DecodeInfo,
    px: number, py: number,
    target: THREE.Vector3,
): void {
    const { north, west } = decodeInfo.geoBox;
    const N = Math.log2(extents);
    const scale = Math.pow(2, decodeInfo.tileKey.level + N);
    const top = lat2tile(north, decodeInfo.tileKey.level + N);
    const left = Math.round(((west + 180) / 360) * scale);
    const R = EarthConstants.EQUATORIAL_CIRCUMFERENCE;

    target.x = ((left + px) / scale) * R;
    target.y = ((top + py) / scale) * R;
    target.z = 0;
    target.sub(decodeInfo.center);
}

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
        tile2world(EXTENTS, this.m_decodeInfo, p.x, p.y, tmpV3);
        // Apply line-z-offset if set (for elevated lines)
        if (this.m_currentZOffset !== 0) {
            tmpV3.z += this.m_currentZOffset;
        }
        return tmpV3.clone();
    }

    private m_currentZOffset: number = 0;

    private extractSortKey(layer: EvaluatedLayer): number | undefined {
        const layout = layer.layout ?? {};
        const sk = layout['fill-sort-key']
            ?? layout['line-sort-key']
            ?? layout['circle-sort-key']
            ?? layout['symbol-sort-key'];
        return typeof sk === 'number' ? sk : undefined;
    }

    private paintToTechniqueProps(layer: EvaluatedLayer, properties?: Record<string, any>): Record<string, any> {
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
                props._translate = p['fill-translate'] ?? [0, 0];
                props._translateAnchor = p['fill-translate-anchor'] ?? 'map';
                if (l.visibility === 'none') props.enabled = false;
                break;
            case 'line':
                props.technique = 'solid-line';
                props.color = p['line-color'] ?? '#000000';
                props.opacity = p['line-opacity'] ?? 1;
                props.lineWidth = p['line-width'] ?? 1;
                props._translate = p['line-translate'] ?? [0, 0];
                props._translateAnchor = p['line-translate-anchor'] ?? 'map';
                if (p['line-dasharray']) {
                    const arr = p['line-dasharray'] as number[];
                    if (arr.length >= 2) {
                        props.dashSize = arr[0];
                        props.gapSize = arr[1];
                        if (arr.length > 2) {
                            props.dashArray = arr;
                            let sum = 0;
                            for (const v of arr) sum += v;
                            props.dashTotalLength = sum;
                        }
                    }
                }
                if (l.visibility === 'none') props.enabled = false;
                break;
            case 'circle':
                props.technique = 'circles';
                props.color = p['circle-color'] ?? '#000000';
                props.opacity = p['circle-opacity'] ?? 1;
                props.size = p['circle-radius'] ?? 5;
                props._translate = p['circle-translate'] ?? [0, 0];
                props._translateAnchor = p['circle-translate-anchor'] ?? 'map';
                if (l.visibility === 'none') props.enabled = false;
                break;
            case 'symbol':
                if (l['icon-image']) {
                    props.technique = 'labeled-icon';
                    props.imageTexture = l['icon-image'];
                    props.color = p['icon-color'] ?? '#000000';
                    props.opacity = p['icon-opacity'] ?? 1;
                    props.iconScale = l['icon-size'] ?? 1;
                    if (l.visibility === 'none') props.enabled = false;
                } else if (l['text-field']) {
                    props.technique = 'text';
                    // Resolve text field with token replacement using feature properties
                    const rawText = typeof l['text-field'] === 'string'
                        ? l['text-field']
                        : String(l['text-field'] ?? '');
                    const resolvedText = resolveTextField(rawText, properties ?? {});

                    // Apply text transform
                    const transform = l['text-transform'] ?? 'none';
                    const transformedText = applyTextTransform(resolvedText, transform);

                    props.text = transformedText;
                    props.color = p['text-color'] ?? '#000000';
                    props.opacity = p['text-opacity'] ?? 1;
                    props.size = l['text-size'] ?? 16;
                    props.fontName = l['text-font']?.[0];

                    // Pre-compute shaped text for layout
                    const shaped = shapeText(transformedText, {
                        fontSize: l['text-size'] ?? 16,
                        maxWidth: l['text-max-width'] ?? 10,
                        lineHeight: l['text-line-height'] ?? 1.2,
                        letterSpacing: l['text-letter-spacing'] ?? 0,
                        justify: l['text-justify'] ?? 'center',
                        anchor: l['text-anchor'] ?? 'center',
                        transform: 'none', // already applied above
                        writingMode: l['text-writing-mode'] as ('horizontal' | 'vertical')[],
                    });
                    props._shaped = shaped;
                    props._textWidth = shaped.right - shaped.left;
                    props._textHeight = shaped.bottom - shaped.top;

                    if (l.visibility === 'none') props.enabled = false;
                }
                break;
            case 'fill-extrusion':
                props.technique = 'extruded-polygon';
                props.color = p['fill-extrusion-color'] ?? '#000000';
                props.opacity = p['fill-extrusion-opacity'] ?? 1;
                props.height = p['fill-extrusion-height'] ?? 0;
                props.floorHeight = p['fill-extrusion-base'] ?? 0;
                if (l.visibility === 'none') props.enabled = false;
                break;
            case 'heatmap':
                props.technique = 'heatmap';
                props.color = p['heatmap-color'] ?? [[0, 'rgba(0,0,255,0)'], [0.5, 'blue'], [1, 'red']];
                props.opacity = p['heatmap-opacity'] ?? 1;
                props.size = p['heatmap-radius'] ?? 30;
                props.intensity = p['heatmap-intensity'] ?? 1;
                props.weight = p['heatmap-weight'] ?? 1;
                if (l.visibility === 'none') props.enabled = false;
                break;
            case 'hillshade':
                props.technique = 'hillshade';
                props.color = p['hillshade-shadow-color'] ?? '#000000';
                props.opacity = 1;
                props.intensity = p['hillshade-exaggeration'] ?? 0.5;
                if (l.visibility === 'none') props.enabled = false;
                break;
            case 'raster':
                props.technique = 'fill';
                props.color = '#ffffff';
                props.opacity = p['raster-opacity'] ?? 1;
                props._rasterTileUrl = properties?._rasterTileUrl ?? '';
                props._isRaster = true;
                if (l.visibility === 'none') props.enabled = false;
                break;
            case 'model':
                props.technique = 'model';
                props.modelId = l['model-id'] ?? properties?.['model-id'] ?? '';
                props.opacity = 1;
                if (l.visibility === 'none') props.enabled = false;
                break;
            case 'building':
                props.technique = 'extruded-polygon';
                props.color = p['building-color'] ?? '#cccccc';
                props.opacity = 1;
                props.height = p['building-height'] ?? properties?.height ?? properties?.['building-height'] ?? properties?.['height'] ?? 10;
                props.floorHeight = p['building-base'] ?? properties?.base ?? properties?.['building-base'] ?? 0;
                props._roofColor = p['building-roof-color'] ?? '#aaaaaa';
                if (l.visibility === 'none') props.enabled = false;
                break;
        }
        return props;
    }

    private getOrCreateTechniqueIndex(layer: EvaluatedLayer, properties?: Record<string, any>): number {
        // For text layers, technique key includes resolved text to allow per-feature text
        const textKey = layer.type === 'symbol' && layer.layout['text-field']
            ? resolveTextField(
                typeof layer.layout['text-field'] === 'string' ? layer.layout['text-field'] : '',
                properties ?? {},
            )
            : '';

        const cacheKey = textKey ? `${layer.id}:${textKey}` : layer.id;
        let idx = this.m_layerToTechniqueIndex.get(cacheKey);
        if (idx === undefined) {
            idx = this.m_techniqueIndex++;
            this.m_layerToTechniqueIndex.set(cacheKey, idx);
            const props = this.paintToTechniqueProps(layer, properties);
            const technique: any = {
                name: props.technique,
                _index: idx,
                _renderOrder: layer.renderOrder,
                renderOrder: layer.renderOrder, // Standard flywave property read by TileGeometryCreator
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
            const techniqueIdx = this.getOrCreateTechniqueIndex(layer, properties);
            this.m_currentZOffset = layer.layout['line-z-offset'] ?? 0;
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
                    sortKey: this.extractSortKey(layer),
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
    private m_lineSortKeys: number[] = [];
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
            const techniqueIdx = this.getOrCreateTechniqueIndex(layer, properties);
            this.m_currentZOffset = layer.layout['line-z-offset'] ?? 0;

            for (const lineGeo of geometry) {
                // Convert tile-local to world
                const worldPts: number[] = [];
                for (const pt of lineGeo.positions) {
                    const w = this.project(pt);
                    worldPts.push(w.x, w.y, w.z);
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
                this.m_lineSortKeys.push(this.extractSortKey(layer) ?? 0);
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
        const numGroups = this.m_lineGroupStarts.length / 2;
        const order = Array.from({ length: numGroups }, (_, i) => i);
        if (numGroups > 1 && this.m_lineSortKeys.some(k => k !== 0)) {
            order.sort((a, b) => this.m_lineSortKeys[a] - this.m_lineSortKeys[b]);
        }
        const sortedAttrs: AttributeMap[] = [];
        for (const i of order) {
            const start = this.m_lineGroupStarts[i * 2];
            const nextIdx = order.indexOf(i + 1);
            const nextStart = (i + 1) < numGroups
                ? this.m_lineGroupStarts[(i + 1) * 2] : end;
            groups.push({
                start,
                count: nextStart - start,
                technique: this.m_lineGroupStarts[i * 2 + 1],
            });
            sortedAttrs.push(JSON.parse(this.m_lineAttr[i]));
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
            objInfos: sortedAttrs,
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
            const techniqueIdx = this.getOrCreateTechniqueIndex(layer, properties);
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
                sortKey: this.extractSortKey(layer),
            });
            geo.featureStarts.push(featureStart);
            geo.objInfos.push({ ...properties, $id: featureId ?? properties.$id ?? null });
        }
    }

    getDecodedTile(): DecodedTile {
        const geometries: Geometry[] = [];

        for (const [, geo] of this.m_geometries) {
            if (geo.positions.length === 0) continue;

            if (geo.groups.length > 1 && geo.groups.some(g => g.sortKey !== undefined)) {
                geo.groups.sort((a, b) => (a.sortKey ?? 0) - (b.sortKey ?? 0));
            }

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
