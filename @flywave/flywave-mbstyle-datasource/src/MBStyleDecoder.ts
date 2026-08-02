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
import * as THREE from 'three';
import { MBLayerEvaluator } from './MBLayerEvaluator';
import { MBTileDataEmitter } from './MBTileDataEmitter';
import { StyleSpecification } from './MBStyleSpec';

class MBStyleDataProcessor implements IGeometryProcessor {
    private m_emitter: MBTileDataEmitter | undefined;
    private m_featureStates: Map<string | number, Record<string, any>> = new Map();

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
        return this.m_featureStates.get(featureId);
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
        const matched = this.m_layerEvaluator.evaluate(
            this.m_sourceId, layer,
            { type: 'Point', properties, id: featureId, _geom: { type: 'Point', coordinates: coords } },
            this.m_zoom, 'point', this.getFeatureState(featureId), this.m_pitch, this.m_brightness,
        );
        if (matched.length === 0 || !this.m_emitter) return;
        const visible = matched.filter(l => !this.isClipped(l.type, coords[0], coords[1]));
        if (visible.length === 0) return;
        this.m_emitter.processPointFeature(layer, extents, geometry, properties, featureId, visible);
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
        const matched = this.m_layerEvaluator.evaluate(
            this.m_sourceId, layer,
            feat,
            this.m_zoom, 'line', this.getFeatureState(featureId), this.m_pitch, this.m_brightness,
        );
        if (matched.length === 0 || !this.m_emitter) return;

        const symbolLayers = matched.filter(l => l.type === 'symbol' && !this.isClipped('symbol', coords[0], coords[1]));
        const nonSymbolLayers = matched.filter(l => l.type !== 'symbol' && !this.isClipped(l.type, coords[0], coords[1]));

        if (nonSymbolLayers.length > 0) {
            this.m_emitter.processLineFeature(layer, extents, geometry, properties, featureId, nonSymbolLayers);
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
                this.m_emitter.processPointFeature(
                    layer, extents, [midPt],
                    { ...properties, _linePath: linePts.map(p => [p.x, p.y]) },
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
        const matched = this.m_layerEvaluator.evaluate(
            this.m_sourceId, layer,
            feat,
            this.m_zoom, 'polygon', this.getFeatureState(featureId), this.m_pitch, this.m_brightness,
        );
        if (matched.length === 0 || !this.m_emitter) return;
        const visible = matched.filter(l => !this.isClipped(l.type, coords[0], coords[1]));
        if (visible.length === 0) return;
        this.m_emitter.processFillFeature(layer, extents, geometry, properties, featureId, visible);
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
        this.m_geoJsonAdapter = new GeoJsonDataAdapter();
    }

    connect(): Promise<void> {
        return Promise.resolve();
    }

    configure(options?: DecoderOptions, customOptions?: OptionsMap): void {
        super.configure(options, customOptions);
        if (customOptions?.mbStyle) {
            this.m_layerEvaluator = new MBLayerEvaluator(customOptions.mbStyle as StyleSpecification);
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
        if (customOptions?.glyphMetrics !== undefined) {
            this.m_glyphMetrics = customOptions.glyphMetrics as Map<string, any>;
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

        const zoom = Math.max(0, tileKey.level - this.m_storageLevelOffset);
        const decodeInfo = new DecodeInfo(projection, tileKey, this.m_storageLevelOffset);
        const emitter = new MBTileDataEmitter(tileKey, decodeInfo, zoom);
        // Hand the cached real-font metrics to the emitter so text shaping
        // (line breaking, anchor placement) uses accurate advance widths.
        if (this.m_glyphMetrics.size > 0) {
            emitter.setGlyphLookup(this.buildGlyphLookup());
        }

        const processor = new MBStyleDataProcessor(
            tileKey, decodeInfo,
            this.m_layerEvaluator,
            this.m_currentSourceId,
            zoom,
            this.m_pitch,
            this.m_brightness,
            this.m_clipMask, this.m_worldview,
        );
        processor.setEmitter(emitter);
        processor.setFeatureStates(this.m_featureStates);

        try {
            // Determine data format and use appropriate adapter
            if (typeof data === 'string') {
                // GeoJSON string from GeoJSONDataProvider
                const geoJson = JSON.parse(data);
                if (this.m_geoJsonAdapter.canProcess(geoJson)) {
                    this.m_geoJsonAdapter.process(geoJson, decodeInfo, processor);
                }
            } else if (typeof data === 'object' && data !== null && !Array.isArray(data)) {
                // GeoJSON object directly
                if (this.m_geoJsonAdapter.canProcess(data)) {
                    this.m_geoJsonAdapter.process(data, decodeInfo, processor);
                }
            } else if (data instanceof ArrayBuffer || data instanceof Uint8Array) {
                // MVT binary data
                const buffer = data instanceof Uint8Array ? data.buffer : data;
                this.m_omvAdapter.process(buffer as ArrayBuffer, decodeInfo, processor);
            }
        } catch (e) {
            return { techniques: [], geometries: [] };
        }

        return emitter.getDecodedTile();
    }
}
