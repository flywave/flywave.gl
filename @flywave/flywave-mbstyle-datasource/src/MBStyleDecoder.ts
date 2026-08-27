import {
    DecodedTile,
    DecoderOptions,
    OptionsMap,
} from '@flywave/flywave-datasource-protocol';
import { Projection, TileKey } from '@flywave/flywave-geoutils';
import { ThemedTileDecoder } from '@flywave/flywave-mapview-decoder/index-worker';
import { OmvDataAdapter } from '@flywave/flywave-vectortile-datasource/adapters/omv/OmvDataAdapter';
import { GeoJsonDataAdapter } from '@flywave/flywave-vectortile-datasource/adapters/geojson/GeoJsonDataAdapter';
import { DecodeInfo } from '@flywave/flywave-vectortile-datasource/DecodeInfo';
import { IGeometryProcessor, ILineGeometry, IPolygonGeometry } from '@flywave/flywave-vectortile-datasource/IGeometryProcessor';
import { lat2tile } from '@flywave/flywave-vectortile-datasource/OmvUtils';
import * as THREE from 'three';
import { MBLayerEvaluator } from './MBLayerEvaluator';
import { MBTileDataEmitter } from './MBTileDataEmitter';
import { StyleSpecification } from './MBStyleSpec';
import { findPoleOfInaccessibility } from './PoleOfInaccessibility';
import {
    HD_ELEVATION_SOURCE_LAYER,
} from './3d-style/elevation/MBElevationConstants';
import {
    MBElevatedStructures,
} from './3d-style/elevation/MBElevatedStructures';

/**
 * §511: mgl-level four-children fallback registry. The data provider (main
 * thread) stashes fetched child tiles here under the CELL key when the cell
 * tile 404s; `decodeThemedTile` picks them up, decodes each against its own
 * tileKey (whose geoBox matches a child's 512px extent exactly 1:1 — the
 * cell key's does NOT, which is why the direct mgl-level request frame
 * explodes) and merges the rebased geometry into the cell's DecodedTile.
 * In-process only: the worker path never sees pending entries and keeps
 * today's empty-tile behavior.
 */
export interface MBPendingChildTile {
    z: number;
    x: number;
    y: number;
    bytes: ArrayBufferLike | {};
}

const s_pendingChildTiles = new Map<string, MBPendingChildTile[]>();
/** True while decodeTileWithChildren decodes a child — suppresses the
 * [MBNorm] probe for the nested calls. */
let s_inChildMerge = false;

export function mbPendingChildrenPut(key: string, children: MBPendingChildTile[]): void {
    // Bound the registry: entries only clear when the engine decodes the
    // cell — a cancelled tile would leak one array of byte references.
    if (s_pendingChildTiles.size > 64) {
        const oldest = s_pendingChildTiles.keys().next().value;
        if (oldest !== undefined) s_pendingChildTiles.delete(oldest);
    }
    s_pendingChildTiles.set(key, children);
}

export function mbPendingChildrenTake(key: string): MBPendingChildTile[] | undefined {
    const v = s_pendingChildTiles.get(key);
    if (v) s_pendingChildTiles.delete(key);
    return v;
}

export function mbCellTileKeyString(k: { level: number; column: number; row: number }): string {
    return `${k.level}-${k.column}-${k.row}`;
}

class MBStyleDataProcessor implements IGeometryProcessor {
    private m_emitter: MBTileDataEmitter | undefined;
    private m_featureStates: Map<string | number, Record<string, any>> = new Map();
    /**
     * Y-offset applied to raw MVT (y-down) tile coordinates so they land in
     * the same world2tile convention the GeoJSON adapter produces. The MapView
     * world is the base `mercatorProjection` (y grows north, `tile.center` and
     * the camera are bottom-origin), while `tile2world` expects the GeoJSON
     * convention — raw OMV pixels must be flipped: py' = scale - 2*top - py.
     */
    private m_mvtYOffset: number | null = null;

    /** §511: y-flip reference frame — the tile's north edge (row fraction)
     * and level; the flip offset is computed PER LAYER EXTENT (the MVT
     * extent varies per fixture family — 4096/8192/… — and a mismatch with
     * the adapter's cookie grid blows the y frame up by ±R/2). */
    private m_mvtFlip: { north: number; level: number } | null = null;

    /** Set the MVT y-flip constant (null = GeoJSON source, no transform). */
    setMvtYOffset(offset: number | null): void {
        this.m_mvtYOffset = offset;
    }

    setMvtFlip(north: number, level: number): void {
        this.m_mvtFlip = { north, level };
    }

    private mvtFlipOffset(extents: number): number {
        const N = Math.log2(extents);
        const scale = Math.pow(2, this.m_tileKey.level + N);
        return scale - 2 * lat2tile(this.m_mvtFlip!.north, this.m_tileKey.level + N);
    }

    private mvtTransform(p: THREE.Vector2, extents: number): THREE.Vector2 {
        if (this.m_mvtFlip) {
            return new THREE.Vector2(p.x, this.mvtFlipOffset(extents) - p.y);
        }
        if (this.m_mvtYOffset === null) return p;
        return new THREE.Vector2(p.x, this.m_mvtYOffset - p.y);
    }
    private transformLineGeometry(geometry: ILineGeometry[], extents: number): ILineGeometry[] {
        if (this.m_mvtFlip === null && this.m_mvtYOffset === null) return geometry;
        return geometry.map(g => ({
            ...g,
            positions: g.positions.map(p => this.mvtTransform(p, extents)),
        }));
    }

    private transformPolygonGeometry(geometry: IPolygonGeometry[], extents: number): IPolygonGeometry[] {
        if (this.m_mvtFlip === null && this.m_mvtYOffset === null) return geometry;
        return geometry.map(g => ({
            ...g,
            rings: g.rings.map(ring => ring.map(p => this.mvtTransform(p, extents))),
        }));
    }

    private transformPoints(points: THREE.Vector3[], extents: number): THREE.Vector3[] {
        if (this.m_mvtFlip === null && this.m_mvtYOffset === null) return points;
        return points.map(p => {
            const t = this.mvtTransform(p, extents);
            return new THREE.Vector3(t.x, t.y, p.z);
        });
    }

    constructor(
        private m_tileKey: TileKey,
        private m_decodeInfo: DecodeInfo,
        private m_layerEvaluator: MBLayerEvaluator,
        private m_sourceId: string,
        private m_zoom: number,
        private m_pitch: number = 0,
        private m_brightness: number = 0,
        private m_clipMask: Record<string, number[][][]> = {},
        private m_worldview: string = '',
        private m_center: [number, number] = [0, 0],
    ) {}

    setEmitter(emitter: MBTileDataEmitter) {
        this.m_emitter = emitter;
    }

    setFeatureStates(states: Map<string | number, Record<string, any>>) {
        this.m_featureStates = states;
    }

    /** Check if a feature at lng/lat should be clipped by a clip-layer. */
    private isClipped(layerType: string, lng: number, lat: number): boolean {
        const rings = this.m_clipMask[layerType];
        if (!rings || rings.length === 0) return false;
        // Inside the exterior ring AND not inside any hole.
        const exterior = rings[0];
        if (!exterior) return false;
        if (!MBStyleDataProcessor.pointInPolygonRing(lng, lat, exterior)) return true; // outside
        for (let h = 1; h < rings.length; h++) {
            if (MBStyleDataProcessor.pointInPolygonRing(lng, lat, rings[h])) return true; // in hole
        }
        return false;
    }

    private static pointInPolygonRing(lng: number, lat: number, ring: number[][]): boolean {
        let inside = false;
        for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
            const xi = ring[i][0], yi = ring[i][1];
            const xj = ring[j][0], yj = ring[j][1];
            const intersect = ((yi > lat) !== (yj > lat)) &&
                (lng < (xj - xi) * (lat - yi) / (yj - yi + 1e-15) + xi);
            if (intersect) inside = !inside;
        }
        return inside;
    }

    private getFeatureState(featureId: string | number | undefined): Record<string, any> | undefined {
        if (featureId === undefined) return undefined;
        const direct = this.m_featureStates.get(featureId);
        if (direct) return direct;
        // Feature ids are stored both as numbers and strings across the
        // pipeline; try the other representation before giving up.
        const alt = typeof featureId === 'number' ? String(featureId) : Number(featureId);
        return this.m_featureStates.get(alt);
    }

    private tileToLocalLngLat(px: number, py: number, extent: number = 4096): [number, number] {
        const tCol = this.m_tileKey.column;
        const tRow = this.m_tileKey.row;
        const n = Math.pow(2, this.m_tileKey.level);
        const lng = ((tCol + px / extent) / n) * 360 - 180;
        const latRad = Math.atan(Math.sinh(Math.PI * (1 - 2 * (tRow + py / extent) / n)));
        const lat = latRad * 180 / Math.PI;
        return [lng, lat];
    }

    private m_lastExtents: number = 4096;

    /**
     * Override processPointFeature to capture the tile extent from the adapter
     * and propagate it to the emitter before processing begins.
     */
    processPointFeature(
        layer: string,
        extents: number,
        geometry: THREE.Vector3[],
        properties: Record<string, any>,
        featureId: string | number | undefined,
    ): void {
        if (extents > 0 && extents !== this.m_lastExtents) {
            this.m_lastExtents = extents;
            this.m_emitter?.setExtents(extents);
        }
        // §511 3d-style port: hd_road_elevation curve points feed the
        // elevated-structures state instead of the emit pipeline.
        if (layer === HD_ELEVATION_SOURCE_LAYER) {
            this.m_elevationStructures?.addRawFeature({
                type: 'Point',
                properties,
                x: geometry.length > 0 ? geometry[0].x : 0,
                y: geometry.length > 0 ? geometry[0].y : 0,
                bounds: [0, 0, extents, extents],
                layerExtent: extents,
            });
            return;
        }
        const coords = geometry.length > 0
            ? this.tileToLocalLngLat(geometry[0].x, geometry[0].y, extents)
            : [0, 0];
        // Multi-source styles: each feature is tagged with its source id by the
        // CompositeGeoDataProvider; evaluate against that source's layers.
        const effectiveSourceId = (properties?._sourceId as string) || this.m_sourceId;
        const matched = this.m_layerEvaluator.evaluate(
            effectiveSourceId, layer,
            { type: 'Point', properties, id: featureId, _geom: { type: 'Point', coordinates: coords } },
            this.m_zoom, 'point', this.getFeatureState(featureId), this.m_pitch, this.m_brightness,
            this.m_worldview, this.m_center,
        );
        if (matched.length === 0 || !this.m_emitter) return;
        const visible = matched.filter(l => !this.isClipped(l.type, coords[0], coords[1]));
        if (visible.length === 0) return;
        this.m_emitter.processPointFeature(layer, extents, this.transformPoints(geometry, extents), properties, featureId, visible);
    }

    processLineFeature(
        layer: string,
        extents: number,
        geometry: ILineGeometry[],
        properties: Record<string, any>,
        featureId: string | number | undefined,
    ): void {
        if (extents > 0 && extents !== this.m_lastExtents) {
            this.m_lastExtents = extents;
            this.m_emitter?.setExtents(extents);
        }
        const coords = geometry.length > 0 && geometry[0].positions.length > 0
            ? this.tileToLocalLngLat(geometry[0].positions[0].x, geometry[0].positions[0].y, extents)
            : [0, 0];
        // Collect lng/lat vertices for the line so the `within` filter can do
        // vertex-containment checks against Polygon/MultiPolygon filter
        // geometries (not just the first-vertex representative point).
        let lineVertices: number[][] | undefined;
        if (geometry.length > 0 && geometry[0].positions.length > 1) {
            const positions = geometry[0].positions;
            const step = Math.max(1, Math.floor(positions.length / 20));
            lineVertices = [];
            for (let i = 0; i < positions.length; i += step) {
                lineVertices.push(this.tileToLocalLngLat(positions[i].x, positions[i].y, extents));
            }
        }
        const feat: any = {
            type: 'LineString',
            properties,
            id: featureId,
            _geom: { type: 'Point', coordinates: coords },
        };
        if (lineVertices) feat._lineGeom = lineVertices;
        const effectiveSourceId = (properties?._sourceId as string) || this.m_sourceId;
        const matched = this.m_layerEvaluator.evaluate(
            effectiveSourceId, layer,
            feat,
            this.m_zoom, 'line', this.getFeatureState(featureId), this.m_pitch, this.m_brightness,
            this.m_worldview, this.m_center,
        );
        if (matched.length === 0 || !this.m_emitter) return;

        const symbolLayers = matched.filter(l => l.type === 'symbol' && !this.isClipped('symbol', coords[0], coords[1]));
        const nonSymbolLayers = matched.filter(l => l.type !== 'symbol' && l.type !== 'circle' && !this.isClipped(l.type, coords[0], coords[1]));
        // Circle layers render one circle per line vertex.
        const circleLayers = matched.filter(l => l.type === 'circle' && !this.isClipped('circle', coords[0], coords[1]));

        if (nonSymbolLayers.length > 0) {
            this.m_emitter.processLineFeature(layer, extents, this.transformLineGeometry(geometry, extents), properties, featureId, nonSymbolLayers);
        }

        if (circleLayers.length > 0 && geometry.length > 0 && geometry[0].positions.length > 0) {
            const pts: THREE.Vector3[] = this.transformPoints(geometry[0].positions.map(
                (p) => new THREE.Vector3(p.x, p.y, 0),
            ), extents);
            this.m_emitter.processPointFeature(layer, extents, pts, properties, featureId, circleLayers);
        }

        if (symbolLayers.length > 0) {
            // mgl symbol_layout.ts: POINT placement on a LineString anchors
            // ONE symbol per line at its FIRST vertex (issue #3808) — not
            // the midpoint; MultiLineString gets one anchor per line.
            // 'line'/'line-center' placements consume the sampled path
            // (_linePath → TextPathGeometry) for text, but an accompanying
            // ICON still uses the anchor point and mgl keeps it along the
            // line (iconAlongLine) — so those keep the midpoint anchor.
            const pointOnly = symbolLayers.every(
                (l) => (l.layout['symbol-placement'] ?? 'point') === 'point',
            );
            for (const lg of geometry) {
                const positions = lg.positions;
                if (!positions || positions.length === 0) continue;
                const linePts: THREE.Vector3[] = [];
                const step = Math.max(1, Math.floor(positions.length / 20));
                for (let i = 0; i < positions.length; i += step) {
                    linePts.push(new THREE.Vector3(positions[i].x, positions[i].y, 0));
                }
                const transformedPts = this.transformPoints(linePts, extents);
                const anchorPt = pointOnly
                    ? new THREE.Vector3(positions[0].x, positions[0].y, 0)
                    : linePts[Math.floor(linePts.length / 2)];
                this.m_emitter.processPointFeature(
                    layer, extents,
                    this.transformPoints([anchorPt], extents),
                    { ...properties, _linePath: transformedPts.map(p => [p.x, p.y]) },
                    featureId, symbolLayers,
                );
            }
        }
    }

    processPolygonFeature(
        layer: string,
        extents: number,
        geometry: IPolygonGeometry[],
        properties: Record<string, any>,
        featureId: string | number | undefined,
    ): void {
        // §511 3d-style port: hd_road_elevation curve_meta polygons feed the
        // elevated-structures state instead of the emit pipeline.
        if (layer === HD_ELEVATION_SOURCE_LAYER) {
            let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
            for (const poly of geometry) {
                for (const ring of poly.rings) {
                    for (const pt of ring) {
                        minX = Math.min(minX, pt.x); minY = Math.min(minY, pt.y);
                        maxX = Math.max(maxX, pt.x); maxY = Math.max(maxY, pt.y);
                    }
                }
            }
            this.m_elevationStructures?.addRawFeature({
                type: 'Polygon',
                properties,
                x: geometry[0]?.rings[0]?.[0]?.x ?? 0,
                y: geometry[0]?.rings[0]?.[0]?.y ?? 0,
                bounds: [minX, minY, maxX, maxY],
                layerExtent: extents,
            });
            return;
        }
        const coords = geometry.length > 0 && geometry[0].rings.length > 0 && geometry[0].rings[0].length > 0
            ? this.tileToLocalLngLat(geometry[0].rings[0][0].x, geometry[0].rings[0][0].y, extents)
            : [0, 0];
        // Collect lng/lat ring vertices for the polygon so the `within`
        // filter can do vertex-containment checks (not just the first-vertex
        // representative point). Only the exterior ring is needed.
        let polyRings: number[][][] | undefined;
        if (geometry.length > 0 && geometry[0].rings.length > 0) {
            polyRings = geometry[0].rings.map((ring) => {
                const step = Math.max(1, Math.floor(ring.length / 20));
                const out: number[][] = [];
                for (let i = 0; i < ring.length; i += step) {
                    out.push(this.tileToLocalLngLat(ring[i].x, ring[i].y, extents));
                }
                return out;
            });
        }
        const feat: any = {
            type: 'Polygon',
            properties,
            id: featureId,
            _geom: { type: 'Point', coordinates: coords },
        };
        if (polyRings) feat._polyGeom = polyRings;
        const effectiveSourceId = (properties?._sourceId as string) || this.m_sourceId;
        const matched = this.m_layerEvaluator.evaluate(
            effectiveSourceId, layer,
            feat,
            this.m_zoom, 'polygon', this.getFeatureState(featureId), this.m_pitch, this.m_brightness,
            this.m_worldview, this.m_center,
        );
        if (matched.length === 0 || !this.m_emitter) return;
        const visible = matched.filter(l => !this.isClipped(l.type, coords[0], coords[1]));
        if (visible.length === 0) return;

        // Circle layers render one circle per polygon ring vertex.
        const circleLayers = visible.filter(l => l.type === 'circle');
        if (circleLayers.length > 0) {
            const ring = geometry.length > 0 && geometry[0].rings.length > 0
                ? geometry[0].rings[0]
                : [];
            const pts = this.transformPoints(ring.map((pt) => new THREE.Vector3(pt.x, pt.y, 0)), extents);
            if (pts.length > 0) {
                this.m_emitter.processPointFeature(layer, extents, pts, properties, featureId, circleLayers);
            }
        }

        const fillLayers = visible.filter(l => l.type !== 'circle' && l.type !== 'symbol');
        if (fillLayers.length > 0) {
            this.m_emitter.processFillFeature(layer, extents, this.transformPolygonGeometry(geometry, extents), properties, featureId, fillLayers);
        }

        // Symbol layers on polygon features: mgl places one point-placement
        // symbol per polygon at its pole of inaccessibility
        // (symbol_layout.ts: classifyRings → findPoleOfInaccessibility(
        // polygon, 16) — 16 tile units = 2 px at extent 8192).
        const symbolLayers = visible.filter(l => l.type === 'symbol');
        if (symbolLayers.length > 0) {
            const precision = 16 * extents / 8192;
            for (const polygon of geometry) {
                const rings = polygon.rings;
                if (!rings || rings.length === 0 || rings[0].length < 3) continue;
                const poi = findPoleOfInaccessibility(
                    rings.map((ring) => ring.map((pt) => ({ x: pt.x, y: pt.y }))),
                    precision,
                );
                const pts = this.transformPoints([new THREE.Vector3(poi.x, poi.y, 0)], extents);
                this.m_emitter.processPointFeature(layer, extents, pts, properties, featureId, symbolLayers);
            }
        }
    }
}

export class MBStyleDecoder extends ThemedTileDecoder {
    private m_omvAdapter: OmvDataAdapter;
    private m_geoJsonAdapter: GeoJsonDataAdapter;
    private m_layerEvaluator: MBLayerEvaluator | undefined;
    private m_currentSourceId: string = '';
    private m_featureStates: Map<string | number, Record<string, any>> = new Map();
    private m_pitch: number = 0;
    private m_brightness: number = 0;
    private m_clipMask: Record<string, number[][][]> = {};
    /** §511 3d-style port: per-tile hd_road_elevation curves. */
    private m_elevationStructures: MBElevatedStructures | null = null;
    private m_worldview: string = '';
    private m_center: [number, number] = [0, 0];
    /**
     * Mapbox camera bearing in degrees. Needed to resolve `*-translate-anchor:
     * viewport` — mapbox rotates the viewport-anchored translate by -bearing in
     * the map frame (painter.translatePosMatrix). Shipped from the data source
     * at configure time (sufficient for static render tests).
     */
    private m_bearing: number = 0;
    /** Terrain elevation sampler (world x/y -> meters, exaggeration applied). */
    private m_terrainSampler: ((x: number, y: number) => number) | null = null;
    private m_terrainHeightScale = 1;
    private m_iconDepthTest = false;
    private m_heightScaleScaleFromTerrainFlag = false;
    private get m_heightScaleFromTerrain(): boolean { return this.m_heightScaleScaleFromTerrainFlag; }
    private set m_heightScaleFromTerrain(v: boolean) { this.m_heightScaleScaleFromTerrainFlag = v; }
    /**
     * Mapbox camera zoom (fractional, without the flywave +1 offset). Set by
     * the data source from the live camera so zoom/camera expressions
     * (icon-size camera functions, dynamic-filter, …) evaluate at the actual
     * mapbox zoom instead of the floored integer tile level.
     */
    private m_mapboxZoom: number | undefined;
    /**
     * Real mapbox PBF glyph metrics (font→char→metrics) loaded by the main
     * thread and shipped to the worker. Used by the emitter as a `glyphLookup`
     * when shaping text, so layout/line-breaking matches the actual font's
     * advance values instead of falling back to Latin-character estimates.
     */
    private m_glyphMetrics: Map<string, any> = new Map();

    constructor() {
        super();
        this.m_omvAdapter = new OmvDataAdapter();
        this.m_geoJsonAdapter = new GeoJsonDataAdapter({ mglCompat: true });
    }

    connect(): Promise<void> {
        return Promise.resolve();
    }

    /** Active color-theme LUTs; re-applied whenever configure() rebuilds
     * the internal evaluator so a style/config re-configure can never drop
     * a runtime-applied theme (mgl keeps layer.lut across updates). */
    private m_themeLut: any = null;
    private m_scopedThemeLuts: Map<string, any> = new Map();

    /** Root color-theme LUT for techniques emitted by this decoder. */
    setColorTheme(lut: any, scoped?: Map<string, any>): void {
        this.m_themeLut = lut ?? null;
        if (scoped) this.m_scopedThemeLuts = scoped;
        this.applyThemeToEvaluator();
    }

    private applyThemeToEvaluator(): void {
        const ev: any = this.m_layerEvaluator;
        if (!ev?.setColorTheme) return;
        ev.setColorTheme(this.m_themeLut);
        if (ev.setColorThemeScope) {
            for (const [scope, lut] of this.m_scopedThemeLuts) {
                ev.setColorThemeScope(scope, lut);
            }
        }
    }

    private m_emitBackgroundTiles = false;

    configure(options?: DecoderOptions, customOptions?: OptionsMap): void {
        super.configure(options, customOptions);
        if (customOptions?.mbStyle) {
            const style = customOptions.mbStyle as StyleSpecification;
            this.m_layerEvaluator = new MBLayerEvaluator(style);
            this.applyThemeToEvaluator();
            // §236: emit the per-tile background fill only for geojson
            // content styles (the coverage tiles then carry the fogged
            // background like mgl's draw_background; raster styles keep the
            // calibrated clearColor+quad pipeline).
            const hasBg = (style.layers ?? []).some((l: any) =>
                l.type === 'background' && (l.layout?.visibility ?? 'visible') !== 'none');
            const hasGeo = Object.values(style.sources ?? {}).some(
                (src: any) => (src as any)?.type === 'geojson');
            // §252: globe bg-only styles — the tiles are the ONLY background
            // carrier there (no clearColor+quad alternative on the sphere).
            const isGlobe = (style as any).projection?.name === 'globe'
                || (style as any).projection?.type === 'globe';
            this.m_emitBackgroundTiles = hasBg && (hasGeo || isGlobe);
        }
        if (customOptions?.currentSourceId) {
            this.m_currentSourceId = customOptions.currentSourceId as string;
        }
        if (customOptions?.featureStates) {
            this.m_featureStates = customOptions.featureStates as Map<string | number, Record<string, any>>;
        }
        if (customOptions?.pitch !== undefined) {
            this.m_pitch = customOptions.pitch as number;
        }
        if (customOptions?.brightness !== undefined) {
            this.m_brightness = customOptions.brightness as number;
        }
        if (customOptions?.clipMask !== undefined) {
            this.m_clipMask = customOptions.clipMask as Record<string, number[][][]>;
        }
        if (customOptions?.worldview !== undefined) {
            this.m_worldview = customOptions.worldview as string;
        }
        if (customOptions?.center !== undefined) {
            const c = customOptions.center as number[];
            if (Array.isArray(c) && c.length >= 2) {
                this.m_center = [c[0], c[1]];
            }
        }
        if (customOptions?.bearing !== undefined) {
            this.m_bearing = customOptions.bearing as number;
        }
        if (customOptions?.glyphMetrics !== undefined) {
            this.m_glyphMetrics = customOptions.glyphMetrics as Map<string, any>;
        }
        // §279: terrain elevation sampler (worldX, worldY) -> meters — lifts
        // fill-extrusion vertices onto the DEM surface (mgl samples terrain
        // height in fill_extrusion.vertex.glsl).
        if ('terrainElevationSampler' in (customOptions ?? {})) {
            this.m_terrainSampler =
                customOptions!.terrainElevationSampler as
                ((x: number, y: number) => number) | null;
        }
        // §289: sec(lat) factor for style meters → world-z (same scale the
        // sampler bakes into ground elevations).
        if (customOptions?.iconDepthTest !== undefined) {
            this.m_iconDepthTest = customOptions.iconDepthTest === true;
        }
        if (customOptions?.terrainHeightScale !== undefined) {
            this.m_terrainHeightScale = customOptions.terrainHeightScale as number;
            this.m_heightScaleFromTerrain = customOptions.terrainHeightScaleFromTerrain === true;
        }
        if (customOptions?.mapboxZoom !== undefined) {
            this.m_mapboxZoom = customOptions.mapboxZoom as number;
        }
    }

    /**
     * Build a GlyphLookup wrapper around the cached metrics map. The wrapper
     * resolves `text-font` style fallbacks (try each font in the stack until
     * a metric is found) so consumers don't need to know which exact font in
     * a stack a glyph came from.
     */
    private buildGlyphLookup(): { getMetrics: (font: string, char: string) => any } {
        const metrics = this.m_glyphMetrics;
        return {
            getMetrics(font: string, char: string) {
                // Direct hit.
                const direct = metrics.get(`${font}:${char}`);
                if (direct) return direct;
                // Font-stack fallback: "Open Sans Regular,Arial Unicode MS Regular"
                // → try each comma-separated entry.
                if (font && font.includes(',')) {
                    for (const f of font.split(',').map(s => s.trim())) {
                        const m = metrics.get(`${f}:${char}`);
                        if (m) return m;
                    }
                }
                // Try without the weight/style suffix (e.g. "Open Sans" → "Open Sans Regular").
                if (font) {
                    const base = font.split(' ').slice(0, -1).join(' ');
                    if (base) {
                        const m = metrics.get(`${base}:${char}`);
                        if (m) return m;
                    }
                }
                return undefined;
            },
        };
    }

    /**
     * Override decodeTile to bypass m_styleSetEvaluator check.
     */
    decodeTile(
        data: ArrayBufferLike | {},
        tileKey: TileKey,
        projection: Projection
    ): Promise<DecodedTile | undefined> {
        if (!this.m_layerEvaluator) {
            return Promise.resolve(undefined);
        }
        return this.decodeThemedTile(data, tileKey, undefined as any, projection);
    }

    async decodeThemedTile(
        data: any,
        tileKey: TileKey,
        _styleSetEvaluator: any,
        projection: Projection,
        zoomOverride?: number
    ): Promise<DecodedTile> {
        if (!this.m_layerEvaluator) {
            return { techniques: [], geometries: [] };
        }

        // The camera zoom is stored in mapbox+1 convention (flywave shows a
        // level-z tile at 256px vs mapbox's 512px, so applyCameraSettings
        // offsets by +1). `tileKey.level - storageLevelOffset` resolves to the
        // camera zoom; subtract 1 to evaluate zoom expressions at the mapbox
        // zoom the test style actually specifies. When the data source pushes
        // the live (fractional) mapbox camera zoom, use that instead — camera
        // functions (icon-size/text-size stops, dynamic-filter distance) must
        // evaluate at the continuous camera zoom, not the floored tile level.
        const zoom = Math.max(0,
            zoomOverride !== undefined
                ? zoomOverride
                : this.m_mapboxZoom !== undefined
                    ? this.m_mapboxZoom
                    : tileKey.level - this.m_storageLevelOffset - 1);
        // §511: the provider fetched four mgl-level children for this cell —
        // decode each against its own tileKey and merge (frame-correct).
        const pendingChildren = mbPendingChildrenTake(
            mbCellTileKeyString(tileKey));
        if (pendingChildren && pendingChildren.length > 0) {
            return this.decodeTileWithChildren(
                data, tileKey, projection, pendingChildren, zoom);
        }
        const decodeInfo = new DecodeInfo(projection, tileKey, this.m_storageLevelOffset);
        const emitter = new MBTileDataEmitter(tileKey, decodeInfo, zoom);
        // Bearing resolves `*-translate-anchor: viewport` (mapbox rotates the
        // viewport translate by -bearing in the map frame).
        emitter.setBearing(this.m_bearing);
        // Hand the cached real-font metrics to the emitter so text shaping
        // (line breaking, anchor placement) uses accurate advance widths.
        if (this.m_glyphMetrics.size > 0) {
            emitter.setGlyphLookup(this.buildGlyphLookup());
        }
        // The sec(lat) height factor applies WITHOUT terrain too (mgl
        // meters/tileToMeter) — only the DEM sampler is terrain-gated.
        emitter.setTerrainHeightScale(this.m_terrainHeightScale, this.m_heightScaleFromTerrain);
        emitter.setIconDepthTest(this.m_iconDepthTest);
        if (this.m_terrainSampler) {
            emitter.setTerrainSampler(this.m_terrainSampler);
        }

        const processor = new MBStyleDataProcessor(
            tileKey, decodeInfo,
            this.m_layerEvaluator,
            this.m_currentSourceId,
            zoom,
            this.m_pitch,
            this.m_brightness,
            this.m_clipMask, this.m_worldview,
            this.m_center,
        );
        processor.setEmitter(emitter);
        processor.setFeatureStates(this.m_featureStates);

        // §236: mgl draw_background paints a quad on EVERY tile. The adapter
        // can THROW for low-level ancestor tiles — its catch used to return
        // an empty tile, discarding this injection — so inject on BOTH the
        // normal and the catch paths (§239).
        const injectBackground = (): void => {
            if (!this.m_emitBackgroundTiles) return;
            try {
                const E = emitter.extents;
                const rect = [{
                    rings: [[new THREE.Vector2(0, 0), new THREE.Vector2(E, 0),
                        new THREE.Vector2(E, E), new THREE.Vector2(0, E)]],
                }];
                processor.processPolygonFeature(
                    '', E, rect as any, { _sourceId: '__mb_background__' }, 'mb-background-tile');
            } catch {}
        };

        try {
            // Determine data format and use appropriate adapter.
            // NOTE: `typeof (new ArrayBuffer(1)) === 'object'`, so the binary
            // check must come BEFORE the generic object (GeoJSON) branch or
            // vector tiles are silently swallowed and never decoded.
            if (data instanceof ArrayBuffer || data instanceof Uint8Array) {
                // MVT binary data. Raw OMV coordinates are y-down (mapbox MVT);
                // flip them into the world2tile convention the GeoJSON adapter
                // uses (see MBStyleDataProcessor.m_mvtYOffset).
                const buffer = data instanceof Uint8Array ? data.buffer : data;
                const N = Math.log2(emitter.extents);
                const scale = Math.pow(2, tileKey.level + N);
                const { north } = decodeInfo.geoBox;
                const top = lat2tile(north, tileKey.level + N);
                // §511: per-layer-extent flip — MVT extent varies per fixture
                // family (4096 default vs 8192 for the 3d-intersections set);
                // a constant offset computed on the default grid blows the y
                // frame up by ~R/2 for tiles with a different extent.
                processor.setMvtYOffset(scale - 2 * top);
                processor.setMvtFlip(north, tileKey.level);
                this.m_elevationStructures = new MBElevatedStructures();
                this.m_omvAdapter.process(buffer as ArrayBuffer, decodeInfo, processor);
                // §511: assemble the hd_road_elevation curves (if any) and
                // hand them to the emitter for feature elevation lookups.
                try {
                    this.m_elevationStructures.finalize(
                        EarthConstants.EQUATORIAL_CIRCUMFERENCE /
                        (256 * Math.pow(2, zoom + 1)));
                    this.m_emitter?.setElevationStructures(this.m_elevationStructures);
                } catch {}
            } else if (typeof data === 'string') {
                // GeoJSON string from GeoJSONDataProvider
                // The GeoJSON adapter projects through webMercatorProjection
                // (y-down), but the MapView/camera/tile space uses the base
                // MercatorProjection (y-up). Apply the same y-flip the MVT path
                // uses so features land in the map's y-up world (mirror around
                // R/2: py' = scale - 2*top - py).
                const N = Math.log2(emitter.extents);
                const scale = Math.pow(2, tileKey.level + N);
                const { north } = decodeInfo.geoBox;
                const top = lat2tile(north, tileKey.level + N);
                processor.setMvtYOffset(scale - 2 * top);
                const geoJson = JSON.parse(data);
                const normalized = MBStyleDecoder.normalizeGeoJson(geoJson);
                if (this.m_geoJsonAdapter.canProcess(normalized)) {
                    this.m_geoJsonAdapter.process(normalized, decodeInfo, processor);
                }
            } else if (typeof data === 'object' && data !== null && !Array.isArray(data)) {
                // GeoJSON object directly — same y-flip as above.
                const N = Math.log2(emitter.extents);
                const scale = Math.pow(2, tileKey.level + N);
                const { north } = decodeInfo.geoBox;
                const top = lat2tile(north, tileKey.level + N);
                processor.setMvtYOffset(scale - 2 * top);
                const normalized = MBStyleDecoder.normalizeGeoJson(data);
                if (this.m_geoJsonAdapter.canProcess(normalized)) {
                    this.m_geoJsonAdapter.process(normalized, decodeInfo, processor);
                }
            }
        } catch {
            injectBackground();
            return emitter.getDecodedTile();
        }

        injectBackground();
        const __result = emitter.getDecodedTile();
        if ((globalThis as any).__mbDecodeDbg && (__result?.geometries?.length ?? 0) > 0 && !s_inChildMerge) {
            const g0 = __result.geometries[0];
            const p0 = g0.vertexAttributes?.find(a => a.name === 'position');
            const f0 = p0 ? new Float32Array(p0.buffer).slice(0, 3) : null;
            // eslint-disable-next-line no-console
            console.log(`[MBNorm] L=${tileKey.level} center=(${decodeInfo.center.x.toFixed(0)},${decodeInfo.center.y.toFixed(0)}) firstV=${f0 ? f0.map(n => n.toFixed(0)).join(',') : '-'} geos=${__result.geometries.length}`);
        }
        return __result;
    }

    /**
     * §511: decode the four mgl-level children of a 404'd cell and merge
     * them into one DecodedTile for the cell. Each child decodes against
     * its own tileKey — the child's geoBox equals its 512px tile extent
     * 1:1, so the emitted frame is correct. Mesh geometry is tile-center
     * relative → rebase by (childCenter − cellCenter); text/POI geometry
     * is absolute world (projectWorld) → concatenate as-is.
     */
    private async decodeTileWithChildren(
        data: any,
        tileKey: TileKey,
        projection: Projection,
        children: MBPendingChildTile[],
        zoom: number
    ): Promise<DecodedTile> {
        const cell = await this.decodeThemedTile(
            data, tileKey, undefined as any, projection, zoom);
        const base: DecodedTile = cell ?? { techniques: [], geometries: [] };
        const out: DecodedTile = {
            techniques: [...base.techniques],
            geometries: [...base.geometries],
            pathGeometries: [...(base.pathGeometries ?? [])],
            textPathGeometries: [...(base.textPathGeometries ?? [])],
            textGeometries: [...(base.textGeometries ?? [])],
            poiGeometries: [...(base.poiGeometries ?? [])],
        };
        let maxH = base.maxGeometryHeight ?? 0;
        let minH = base.minGeometryHeight ?? 0;
        const cellInfo = new DecodeInfo(projection, tileKey, this.m_storageLevelOffset);
        s_inChildMerge = true;
        try {
        for (const ch of children) {
            try {
                const childKey = TileKey.fromRowColumnLevel(ch.y, ch.x, ch.z);
                const child = await this.decodeThemedTile(
                    ch.bytes as any, childKey, undefined as any, projection, zoom);
                if (!child) continue;
                const nTech = out.techniques.length;
                out.techniques.push(...child.techniques);
                const childInfo = new DecodeInfo(projection, childKey, this.m_storageLevelOffset);
                const dx = childInfo.center.x - cellInfo.center.x;
                // §511: with the per-layer-extent flip (setMvtFlip) the
                // child decodes in the same frame as any normal tile — the
                // merge is a plain rebase onto the cell center.
                const dy = childInfo.center.y - cellInfo.center.y;
                const dz = childInfo.center.z - cellInfo.center.z;
                if ((globalThis as any).__mbDecodeDbg) {
                    const g0 = (child.geometries ?? [])[0];
                    const p0 = g0?.vertexAttributes?.find(a => a.name === 'position');
                    const f0 = p0 ? new Float32Array(p0.buffer).slice(0, 3) : null;
                    // eslint-disable-next-line no-console
                    console.log(`[MBMergeChild] z=${ch.z} x=${ch.x} y=${ch.y} cell=(${cellInfo.center.x.toFixed(0)},${cellInfo.center.y.toFixed(0)},${cellInfo.center.z.toFixed(0)}) child=(${childInfo.center.x.toFixed(0)},${childInfo.center.y.toFixed(0)},${childInfo.center.z.toFixed(0)}) d=(${dx.toFixed(0)},${dy.toFixed(0)},${dz.toFixed(0)}) firstV=${f0 ? f0.map(n => n.toFixed(0)).join(',') : '-'}`);
                }
                if ((globalThis as any).__mbDecodeDbg) {
                    const bbs: Record<string, number[]> = {};
                    for (const g of child.geometries ?? []) {
                        const p = g.vertexAttributes.find(a => a.name === 'position');
                        if (!p) continue;
                        const arr = new Float32Array(p.buffer);
                        const key = String(g.type);
                        const bb = bbs[key] ?? (bbs[key] = [Infinity, Infinity, -Infinity, -Infinity]);
                        for (let vi = 0; vi < arr.length; vi += 3) {
                            bb[0] = Math.min(bb[0], arr[vi]); bb[1] = Math.min(bb[1], arr[vi + 1]);
                            bb[2] = Math.max(bb[2], arr[vi]); bb[3] = Math.max(bb[3], arr[vi + 1]);
                        }
                    }
                    // eslint-disable-next-line no-console
                    console.log(`[MBBBox] z=${ch.z} x=${ch.x} y=${ch.y} center=(${childInfo.center.x.toFixed(0)},${childInfo.center.y.toFixed(0)}) ` + JSON.stringify(bbs));
                }
                for (const g of child.geometries ?? []) {
                    let vertexAttributes = g.vertexAttributes;
                    let index = g.index;
                    const posIdx = vertexAttributes.findIndex(a => a.name === 'position');
                    if (posIdx >= 0) {
                        const attr = vertexAttributes[posIdx];
                        const arr = new Float32Array(attr.buffer);
                        for (let vi = 0; vi < arr.length; vi += 3) {
                            arr[vi] += dx;
                            arr[vi + 1] += dy;
                            arr[vi + 2] += dz;
                        }
                        vertexAttributes = vertexAttributes.map((a, ai) =>
                            ai === posIdx ? { ...a, buffer: arr.buffer } : a);
                        // The y mirror flips triangle winding — reverse the
                        // index triplets or backface culling eats the fills.
                        if (index) {
                            const idx = new Uint32Array(index.buffer);
                            for (let ti = 0; ti < idx.length; ti += 3) {
                                const tmp = idx[ti + 1];
                                idx[ti + 1] = idx[ti + 2];
                                idx[ti + 2] = tmp;
                            }
                            index = { ...index, buffer: idx.buffer };
                        }
                    }
                    out.geometries.push({
                        ...g,
                        vertexAttributes,
                        index,
                        groups: g.groups?.map(gr => ({
                            ...gr,
                            technique: (gr.technique ?? 0) + nTech,
                        })),
                    });
                }
                for (const k of ['pathGeometries', 'textPathGeometries', 'textGeometries', 'poiGeometries'] as const) {
                    const arr = child[k] as any[] | undefined;
                    if (arr && arr.length > 0) (out[k] as any[]).push(...arr);
                }
                maxH = Math.max(maxH, child.maxGeometryHeight ?? 0);
                minH = Math.min(minH, child.minGeometryHeight ?? 0);
            } catch {
                // A missing child quarter renders empty — same as the
                // pre-fallback behavior for the whole cell.
            }
        }
        } finally {
            s_inChildMerge = false;
        }
        if (maxH !== 0) out.maxGeometryHeight = maxH;
        if (minH !== 0) out.minGeometryHeight = minH;
        if ((globalThis as any).__mbDecodeDbg) {
            // eslint-disable-next-line no-console
            console.log(`[MBMerge] children=${children.length} cellGeos=${base.geometries.length} outGeos=${out.geometries.length} outTechs=${out.techniques.length} poi=${out.poiGeometries?.length ?? 0} textPath=${out.textPathGeometries?.length ?? 0}`);
        }
        return out;
    }

    /**
     * Normalize bare GeoJSON geometries (LineString, Polygon, Point, ...) and
     * Feature objects into a FeatureCollection, which is what the adapters
     * accept. Mapbox-style sources commonly store a single bare geometry.
     */
    private static normalizeGeoJson(data: any): any {
        if (!data || typeof data !== 'object') return data;
        if (data.type === 'FeatureCollection' && Array.isArray(data.features)) {
            // mgl treats a missing `properties` as {} — a bare undefined
            // breaks the downstream POI icon chain (feature emits but the
            // icon never paints; verified on image/render-callback where
            // adding ANY properties object flips it to a pixel-perfect
            // render, §125).
            for (const f of data.features) {
                if (f && typeof f === 'object' && f.properties === undefined) {
                    f.properties = {};
                }
            }
            MBStyleDecoder.expandGeometryCollections(data);
            return data;
        }
        if (data.type === 'Feature') {
            return { type: 'FeatureCollection', features: [data] };
        }
        const geometryTypes = new Set([
            'Point', 'MultiPoint', 'LineString', 'MultiLineString',
            'Polygon', 'MultiPolygon', 'GeometryCollection',
        ]);
        if (geometryTypes.has(data.type)) {
            const fc = {
                type: 'FeatureCollection',
                features: [{ type: 'Feature', geometry: data, properties: {} }],
            };
            MBStyleDecoder.expandGeometryCollections(fc);
            return fc;
        }
        return data;
    }

    /**
     * GeoJSON GeometryCollection features carry their geometries in
     * `geometry.geometries` — the tile adapters only understand the plain
     * types, so a collection feature would be silently dropped (mgl expands
     * them; fixtures like appearance/icon-image-cross-fade use this form).
     * Inline expansion: each sub-geometry becomes its own feature sharing
     * the parent's properties/id.
     */
    private static expandGeometryCollections(fc: any): void {
        if (!fc || !Array.isArray(fc.features)) return;
        const out: any[] = [];
        for (const f of fc.features) {
            if (f && typeof f === 'object' && f.geometry?.type === 'GeometryCollection'
                && Array.isArray(f.geometry.geometries)) {
                for (const g of f.geometry.geometries) {
                    out.push({ ...f, geometry: g });
                }
            } else {
                out.push(f);
            }
        }
        fc.features = out;
    }
}
