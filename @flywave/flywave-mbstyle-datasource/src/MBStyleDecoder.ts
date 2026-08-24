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

    /** Set the MVT y-flip constant (null = GeoJSON source, no transform). */
    setMvtYOffset(offset: number | null): void {
        this.m_mvtYOffset = offset;
    }

    private mvtTransform(p: THREE.Vector2): THREE.Vector2 {
        if (this.m_mvtYOffset === null) return p;
        return new THREE.Vector2(p.x, this.m_mvtYOffset - p.y);
    }

    private transformLineGeometry(geometry: ILineGeometry[]): ILineGeometry[] {
        if (this.m_mvtYOffset === null) return geometry;
        return geometry.map(g => ({
            ...g,
            positions: g.positions.map(p => this.mvtTransform(p)),
        }));
    }

    private transformPolygonGeometry(geometry: IPolygonGeometry[]): IPolygonGeometry[] {
        if (this.m_mvtYOffset === null) return geometry;
        return geometry.map(g => ({
            ...g,
            rings: g.rings.map(ring => ring.map(p => this.mvtTransform(p))),
        }));
    }

    private transformPoints(points: THREE.Vector3[]): THREE.Vector3[] {
        if (this.m_mvtYOffset === null) return points;
        return points.map(p => new THREE.Vector3(p.x, this.m_mvtYOffset! - p.y, p.z));
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
        this.m_emitter.processPointFeature(layer, extents, this.transformPoints(geometry), properties, featureId, visible);
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
            this.m_emitter.processLineFeature(layer, extents, this.transformLineGeometry(geometry), properties, featureId, nonSymbolLayers);
        }

        if (circleLayers.length > 0 && geometry.length > 0 && geometry[0].positions.length > 0) {
            const pts: THREE.Vector3[] = this.transformPoints(geometry[0].positions.map(
                (p) => new THREE.Vector3(p.x, p.y, 0),
            ));
            this.m_emitter.processPointFeature(layer, extents, pts, properties, featureId, circleLayers);
        }

        if (symbolLayers.length > 0 && geometry.length > 0 && geometry[0].positions.length > 1) {
            const linePts: THREE.Vector3[] = [];
            const positions = geometry[0].positions;
            const step = Math.max(1, Math.floor(positions.length / 20));
            for (let i = 0; i < positions.length; i += step) {
                linePts.push(new THREE.Vector3(positions[i].x, positions[i].y, 0));
            }
            if (linePts.length >= 2) {
                const midIdx = Math.floor(linePts.length / 2);
                const midPt = linePts[midIdx];
                const transformedPts = this.transformPoints(linePts);
                this.m_emitter.processPointFeature(
                    layer, extents, this.transformPoints([midPt]),
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
            const pts = this.transformPoints(ring.map((pt) => new THREE.Vector3(pt.x, pt.y, 0)));
            if (pts.length > 0) {
                this.m_emitter.processPointFeature(layer, extents, pts, properties, featureId, circleLayers);
            }
        }

        const fillLayers = visible.filter(l => l.type !== 'circle');
        if (fillLayers.length > 0) {
            this.m_emitter.processFillFeature(layer, extents, this.transformPolygonGeometry(geometry), properties, featureId, fillLayers);
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
        projection: Projection
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
            this.m_mapboxZoom !== undefined
                ? this.m_mapboxZoom
                : tileKey.level - this.m_storageLevelOffset - 1);
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
                processor.setMvtYOffset(scale - 2 * top);
                this.m_omvAdapter.process(buffer as ArrayBuffer, decodeInfo, processor);
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
        return emitter.getDecodedTile();
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
            return {
                type: 'FeatureCollection',
                features: [{ type: 'Feature', geometry: data, properties: {} }],
            };
        }
        return data;
    }
}
