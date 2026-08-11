import {
    FlatTheme,
    ITileDecoder,
    Theme,
} from '@flywave/flywave-datasource-protocol';
import { TileKey, webMercatorTilingScheme, sphereProjection, mercatorProjection, ProjectionType } from '@flywave/flywave-geoutils';
import { Tile } from '@flywave/flywave-mapview';
import { MapViewEventNames } from '@flywave/flywave-mapview';
import {
    DataProvider,
    TileDataSource,
    TileDataSourceOptions,
    TileFactory,
} from '@flywave/flywave-mapview-decoder';
import {
    APIFormat,
    OmvRestClient,
    OmvRestClientParameters,
} from '@flywave/flywave-vectortile-datasource/OmvRestClient';
import * as THREE from 'three';

import { MBStyleManager, ResolvedSource } from './MBStyleManager';
import { GeoJSONSourceSpec, StyleSpecification } from './MBStyleSpec';
import { SpriteAtlas } from './materials/MapIconMaterial';
import { MBStyleRuntime } from './MBStyleRuntime';
import { MBEnvironmentManager } from './MBEnvironmentManager';
import { MBMaterialPatchManager } from './MBMaterialPatchManager';

export interface MBStyleDataSourceParameters {
    style: StyleSpecification | string;
    accessToken?: string;
    decoderScriptUrl?: string;
    concurrentDecoderServiceName?: string;
    storageLevelOffset?: number;
    minDisplayLevel?: number;
    maxDisplayLevel?: number;
    /** In-process decoder (e.g. `new MBStyleDecoder()`) to bypass the worker
     *  facade. Useful for karma/unit environments where the worker bundle is
     *  not served. */
    decoder?: ITileDecoder;
}

const MBSTYLE_DECODER_SERVICE_TYPE = 'mbstyle-vector-tile-decoder';

/**
 * DataProvider that generates synthetic GeoJSON polygon features for each tile,
 * carrying the raster tile image URL. The emitter creates a fill technique,
 * and the MaterialPatchManager loads the raster texture per-tile.
 */
class RasterTileDataProvider extends DataProvider {
    private m_tileUrlTemplate: string;

    constructor(tileUrlTemplate: string) {
        super();
        this.m_tileUrlTemplate = tileUrlTemplate;
    }

    ready(): boolean { return true; }

    async getTile(tileKey: TileKey): Promise<ArrayBufferLike | {}> {
        const z = tileKey.level;
        const x = tileKey.column;
        const y = tileKey.row;

        const n = Math.pow(2, z);
        const lngW = (x / n) * 360 - 180;
        const lngE = ((x + 1) / n) * 360 - 180;
        const latN = this.tile2lat(y, z);
        const latS = this.tile2lat(y + 1, z);

        const rasterUrl = this.m_tileUrlTemplate
            .replace('{z}', String(z))
            .replace('{x}', String(x))
            .replace('{y}', String(y));

        const geojson = {
            type: 'FeatureCollection',
            features: [{
                type: 'Feature',
                geometry: {
                    type: 'Polygon',
                    coordinates: [[
                        [lngW, latN],
                        [lngE, latN],
                        [lngE, latS],
                        [lngW, latS],
                        [lngW, latN],
                    ]],
                },
                properties: {
                    _rasterTileUrl: rasterUrl,
                    _tileCol: x,
                    _tileRow: y,
                    _tileZoom: z,
                },
            }],
        };

        return JSON.stringify(geojson);
    }

    private tile2lat(y: number, z: number): number {
        const n = Math.PI - (2 * Math.PI * y) / Math.pow(2, z);
        return (180 / Math.PI) * Math.atan(Math.sinh(n));
    }

    protected async connect(): Promise<void> {}
    protected dispose(): void {}
}

/**
 * TMS scheme wrapper: flips the y (row) coordinate before delegating.
 * TMS uses y from bottom; flywave uses XYZ (y from top).
 * yTms = 2^z - 1 - yXyz
 */
class TMSDataProvider extends DataProvider {
    private m_inner: DataProvider;
    constructor(inner: DataProvider) { super(); this.m_inner = inner; }
    ready(): boolean { return this.m_inner.ready(); }
    async getTile(tileKey: TileKey, abortSignal?: AbortSignal): Promise<ArrayBufferLike | {}> {
        const n = Math.pow(2, tileKey.level);
        const flippedRow = n - 1 - tileKey.row;
        const flippedKey = TileKey.fromRowColumnLevel(flippedRow, tileKey.column, tileKey.level);
        return this.m_inner.getTile(flippedKey, abortSignal);
    }
    protected async connect(): Promise<void> {}
    protected dispose(): void {}
}

/**
 * Bounds-filtering wrapper: skips tiles outside a source's `bounds`
 * rectangle [minLng, minLat, maxLng, maxLat]. Returns empty data for
 * out-of-bounds tiles so the decoder renders nothing for them.
 */
class BoundsFilteredDataProvider extends DataProvider {
    private m_inner: DataProvider;
    private m_bounds: [number, number, number, number];
    constructor(inner: DataProvider, bounds: [number, number, number, number]) {
        super();
        this.m_inner = inner;
        this.m_bounds = bounds;
    }
    ready(): boolean { return this.m_inner.ready(); }
    async getTile(tileKey: TileKey, abortSignal?: AbortSignal): Promise<ArrayBufferLike | {}> {
        // Compute tile geographic bounds.
        const z = tileKey.level;
        const x = tileKey.column;
        const y = tileKey.row;
        const n = Math.pow(2, z);
        const tileW = (x / n) * 360 - 180;
        const tileE = ((x + 1) / n) * 360 - 180;
        const tileN = (180 / Math.PI) * Math.atan(Math.sinh(Math.PI * (1 - 2 * y / n)));
        const tileS = (180 / Math.PI) * Math.atan(Math.sinh(Math.PI * (1 - 2 * (y + 1) / n)));
        const [minLng, minLat, maxLng, maxLat] = this.m_bounds;
        // Skip if tile is entirely outside the bounds rectangle.
        if (tileE < minLng || tileW > maxLng || tileS > maxLat || tileN < minLat) {
            return JSON.stringify({ type: 'FeatureCollection', features: [] });
        }
        return this.m_inner.getTile(tileKey, abortSignal);
    }
    protected async connect(): Promise<void> {}
    protected dispose(): void {}
}

/**
 * DataProvider for hillshade layers. Generates a tile-covering polygon per tile
 * carrying the resolved raster-DEM tile url, so the emitter can emit a fill
 * technique flagged as hillshade and the MaterialPatchManager can load the DEM
 * and apply the hillshade shader.
 */
class HillshadeTileDataProvider extends DataProvider {
    private m_demUrlTemplate: string;
    private m_tileSize: number;

    constructor(demUrlTemplate: string, tileSize: number = 256) {
        super();
        this.m_demUrlTemplate = demUrlTemplate;
        this.m_tileSize = tileSize;
    }

    ready(): boolean { return true; }

    async getTile(tileKey: TileKey): Promise<ArrayBufferLike | {}> {
        const z = tileKey.level;
        const x = tileKey.column;
        const y = tileKey.row;

        const n = Math.pow(2, z);
        const lngW = (x / n) * 360 - 180;
        const lngE = ((x + 1) / n) * 360 - 180;
        const latN = this.tile2lat(y, z);
        const latS = this.tile2lat(y + 1, z);

        const demUrl = this.m_demUrlTemplate
            .replace('{z}', String(z))
            .replace('{x}', String(x))
            .replace('{y}', String(y));

        const geojson = {
            type: 'FeatureCollection',
            features: [{
                type: 'Feature',
                geometry: {
                    type: 'Polygon',
                    coordinates: [[
                        [lngW, latN],
                        [lngE, latN],
                        [lngE, latS],
                        [lngW, latS],
                        [lngW, latN],
                    ]],
                },
                properties: {
                    _hillshadeDemUrl: demUrl,
                    _tileSize: this.m_tileSize,
                    _tileCol: x,
                    _tileRow: y,
                    _tileZoom: z,
                },
            }],
        };

        return JSON.stringify(geojson);
    }

    private tile2lat(y: number, z: number): number {
        const n = Math.PI - (2 * Math.PI * y) / Math.pow(2, z);
        return (180 / Math.PI) * Math.atan(Math.sinh(n));
    }

    protected async connect(): Promise<void> {}
    protected dispose(): void {}
}
class GeoJSONDataProvider extends DataProvider {
    private m_geoJsonData: string;
    private m_cluster: boolean = false;
    private m_clusterRadius: number = 50;
    private m_clusterMaxZoom: number = 16;
    private m_clusteredCache: Map<number, string> = new Map();
    /**
     * clusterProperties spec — e.g. `{ total: ['+', ['get', 'value']] }`.
     * Each entry maps a cluster-property name to a `[aggregator, mapExpr]`
     * pair. The map expression is evaluated per source point feature; the
     * aggregator (`['+']`, `['max']`, `['min']`, etc.) combines the values.
     */
    private m_clusterProperties: Record<string, any> = {};

    constructor(data: any, clusterOpts?: {
        cluster?: boolean;
        clusterRadius?: number;
        clusterMaxZoom?: number;
        clusterProperties?: Record<string, any>;
    }) {
        super();
        this.m_geoJsonData = typeof data === 'string' ? data : JSON.stringify(data);
        if (clusterOpts) {
            this.m_cluster = clusterOpts.cluster ?? false;
            this.m_clusterRadius = clusterOpts.clusterRadius ?? 50;
            this.m_clusterMaxZoom = clusterOpts.clusterMaxZoom ?? 16;
            this.m_clusterProperties = clusterOpts.clusterProperties ?? {};
        }
    }

    ready(): boolean { return true; }

    async getTile(tileKey: TileKey): Promise<ArrayBufferLike | {}> {
        if (!this.m_cluster) return this.m_geoJsonData;
        const zoom = tileKey.level;
        if (zoom >= this.m_clusterMaxZoom) return this.m_geoJsonData;
        const roundedZoom = Math.floor(zoom / 2) * 2;
        if (!this.m_clusteredCache.has(roundedZoom)) {
            const clustered = this.clusterAtZoom(roundedZoom);
            this.m_clusteredCache.set(roundedZoom, clustered);
        }
        return this.m_clusteredCache.get(roundedZoom)!;
    }

    private clusterAtZoom(zoom: number): string {
        try {
            const geo = JSON.parse(this.m_geoJsonData);
            const features = geo.features ?? [];
            const points = features.filter((f: any) => f.geometry?.type === 'Point');
            const nonPoints = features.filter((f: any) => f.geometry?.type !== 'Point');
            if (points.length === 0) return this.m_geoJsonData;

            const gridSize = this.m_clusterRadius * 2;
            const grid = new Map<string, any[]>();
            for (const pt of points) {
                const [lng, lat] = pt.geometry.coordinates;
                const cx = Math.floor(((lng + 180) / 360) * gridSize * Math.pow(2, zoom));
                const cy = Math.floor(((1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2) * gridSize * Math.pow(2, zoom));
                const key = `${cx}:${cy}`;
                if (!grid.has(key)) grid.set(key, []);
                grid.get(key)!.push(pt);
            }

            const clusteredFeatures: any[] = [];
            for (const [, group] of grid) {
                if (group.length === 1) {
                    clusteredFeatures.push(group[0]);
                } else {
                    let sumLng = 0, sumLat = 0;
                    for (const f of group) {
                        sumLng += f.geometry.coordinates[0];
                        sumLat += f.geometry.coordinates[1];
                    }
                    const props: Record<string, any> = {
                        cluster: true,
                        cluster_id: `${zoom}:${group.length}`,
                        point_count: group.length,
                    };
                    // Compute each declared clusterProperty by mapping every
                    // source feature through the property's expression and
                    // aggregating the resulting values.
                    for (const [name, spec] of Object.entries(this.m_clusterProperties)) {
                        props[name] = aggregateClusterProperty(spec, group);
                    }
                    clusteredFeatures.push({
                        type: 'Feature',
                        geometry: { type: 'Point', coordinates: [sumLng / group.length, sumLat / group.length] },
                        properties: props,
                    });
                }
            }

            return JSON.stringify({
                ...geo,
                features: [...nonPoints, ...clusteredFeatures],
            });
        } catch {
            return this.m_geoJsonData;
        }
    }

    updateData(data: any): void {
        this.m_geoJsonData = typeof data === 'string' ? data : JSON.stringify(data);
        this.m_clusteredCache.clear();
    }

    protected async connect(): Promise<void> {}
    protected dispose(): void {}
}

/**
 * Aggregate one clusterProperty across a group of source features.
 *
 * The mapbox spec form is `clusterProperties: { name: [aggregator, mapExpr] }`
 * where `aggregator` is an expression like `['+']` / `['max']` / `['min']`
 * applied to the per-feature mapped values. We support the most common
 * aggregators natively without needing the full expression engine.
 */
function aggregateClusterProperty(
    spec: any,
    group: any[],
): number | any[] {
    if (!Array.isArray(spec) || spec.length < 2) return 0;
    const agg = spec[0];
    const mapExpr = spec[1];
    // Lazy import to avoid cycle when this file is loaded by the engine.
    const { MBExpressionEngine } = require('./MBExpressionEngine');
    const mapped = group.map((f) => {
        return MBExpressionEngine.evaluate(mapExpr, {
            zoom: 0,
            feature: { type: 'Point', properties: f.properties ?? {}, id: f.id },
        });
    });
    // Aggregator operator (a single-element expression like ['+']).
    const op = Array.isArray(agg) ? agg[0] : agg;
    switch (op) {
        case '+': {
            let s = 0;
            for (const v of mapped) s += Number(v) || 0;
            return s;
        }
        case 'max': {
            let m = -Infinity;
            for (const v of mapped) if (Number(v) > m) m = Number(v);
            return m === -Infinity ? 0 : m;
        }
        case 'min': {
            let m = Infinity;
            for (const v of mapped) if (Number(v) < m) m = Number(v);
            return m === Infinity ? 0 : m;
        }
        case '*': {
            let p = 1;
            for (const v of mapped) p *= Number(v) || 1;
            return p;
        }
        default:
            return mapped;
    }
}

class DelegatingDataProvider extends DataProvider {
    delegate: DataProvider | null = null;

    ready(): boolean {
        return this.delegate?.ready() ?? true;
    }

    async getTile(tileKey: TileKey, abortSignal?: AbortSignal): Promise<ArrayBufferLike | {}> {
        if (!this.delegate) return new ArrayBuffer(0);
        try {
            return await this.delegate.getTile(tileKey, abortSignal);
        } catch {
            // Sparse tilesets / 404s: return empty data instead of crashing
            // the decode pipeline. The decoder handles empty FeatureCollections
            // gracefully (no features → no geometry).
            return JSON.stringify({ type: 'FeatureCollection', features: [] });
        }
    }

    protected async connect(): Promise<void> {
        if (this.delegate) {
            try {
                await (this.delegate as any).connect();
            } catch (e) {
                // Silently pass
            }
        }
    }

    protected dispose(): void {
        this.delegate = null;
    }
}

export class MBStyleDataSource extends TileDataSource {
    private m_styleManager: MBStyleManager;
    private m_styleParams: MBStyleDataSourceParameters;
    private m_delegatingProvider: DelegatingDataProvider;
    private m_spriteAtlas: SpriteAtlas | null = null;
    private m_runtime: MBStyleRuntime | null = null;
    private m_currentSourceId: string = '';
    private m_demTileUrl: string | null = null;
    private m_demTileSize: number = 256;
    private m_rasterTileUrl: string | null = null;
    /**
     * Cached mapbox glyph metrics (font→char→metrics), shared with the worker
     * decoder so text shaping uses accurate advance widths. Filled lazily by
     * `loadGlyphMetrics()` on first connect.
     */
    private m_glyphMetrics: Map<string, any> = new Map();
    private m_environment: MBEnvironmentManager | null = null;
    private m_materialPatcher: MBMaterialPatchManager | null = null;
    private m_depthOcclusion: any = null;
    /** FBO-based texture draping for terrain (per-tile lazy bake). */
    private m_terrainDraping: any = null;
    private m_symbolPlacement: any = null;
    private m_debugTileBoundaries = false;
    private m_debugLines: any = null;
    /** Clip polygons keyed by layer type: Map<layerType, polygonRing[]> */
    private m_clipMask: Map<string, number[][][]> = new Map();

    constructor(params: MBStyleDataSourceParameters) {
        const delegatingProvider = new DelegatingDataProvider();

        const options: TileDataSourceOptions = {
            tilingScheme: webMercatorTilingScheme,
            dataProvider: delegatingProvider,
            decoder: params.decoder,
            concurrentDecoderServiceName:
                params.decoder ? undefined : (params.concurrentDecoderServiceName ?? MBSTYLE_DECODER_SERVICE_TYPE),
            concurrentDecoderScriptUrl: params.decoder ? undefined : params.decoderScriptUrl,
            minDataLevel: 0,
            maxDataLevel: 22,
            storageLevelOffset: params.storageLevelOffset ?? -1,
        };

        super(new TileFactory(Tile), options);

        this.m_delegatingProvider = delegatingProvider;
        this.m_styleManager = new MBStyleManager();
        this.m_styleParams = params;
        this.cacheable = true;
        this.addGroundPlane = false;
    }

    get styleManager(): MBStyleManager {
        return this.m_styleManager;
    }

    /**
     * Iterate all tiles currently cached by this data source.
     *
     * The mapview stores decoded tiles in `MapView.m_visibleTiles.m_dataSourceCache`
     * (a `DataSourceCache` keyed by mortonCode+offset+dataSource). Historically the
     * patcher/placement code read a non-existent `m_tiles` property, which made the
     * material patcher and symbol placement iterate nothing.
     */
    getDecodedTiles(): Tile[] {
        const tiles: Tile[] = [];
        const mapView = (this as any).m_mapView as any;
        const cache = mapView?.m_visibleTiles?.m_dataSourceCache as any;
        if (cache?.m_tileCache?.forEach) {
            cache.m_tileCache.forEach((tile: Tile) => {
                if (tile.dataSource === this) tiles.push(tile);
            });
        }
        return tiles;
    }

    /**
     * Re-run source resolution + provider wiring after runtime `addSource` /
     * `removeSource`, so newly added sources' tiles actually load.
     */
    async reloadSources(): Promise<void> {
        const style = this.m_styleManager.getStyle();
        if (!style) return;
        await this.m_styleManager.reloadSources();
        const sources = this.m_styleManager.getResolvedSources();
        await this.wireTileSources(style, sources);
        // Re-derive maxDataLevel from the (possibly new) sources.
        const maxSourceZoom = Math.max(
            1,
            ...[...sources.values()].map(s => s.maxzoom ?? 22),
        );
        this.maxDataLevel = Math.min(22, maxSourceZoom);
        if (this.mapView) {
            this.mapView.markTilesDirty(this);
            this.mapView.update();
        }
    }

    /**
     * Wire the "best" tile source (most layers referencing it: vector first,
     * then geojson) into the delegating data provider. Sets `m_currentSourceId`
     * and `m_delegatingProvider.delegate`.
     */
    private async wireTileSources(style: StyleSpecification, sources: Map<string, ResolvedSource>): Promise<boolean> {
        let found = false;
        const layerCounts = new Map<string, number>();
        for (const layer of style.layers ?? []) {
            const src = (layer as any).source as string;
            if (src) layerCounts.set(src, (layerCounts.get(src) ?? 0) + 1);
        }

        // Priority 1: best vector tile source.
        let bestVectorSourceId: string | null = null;
        let bestVectorCount = 0;
        for (const [sourceId, source] of sources) {
            if (source.type === 'vector') {
                const count = layerCounts.get(sourceId) ?? 0;
                if (count > bestVectorCount || bestVectorSourceId === null) {
                    bestVectorSourceId = sourceId;
                    bestVectorCount = count;
                }
            }
        }

        if (bestVectorSourceId) {
            const source = sources.get(bestVectorSourceId)!;
            const restClient = this.createOmvRestClient(
                source,
                this.m_styleParams.accessToken
            );
            // TMS scheme: wrap the rest client to flip y coordinate.
            const scheme = (source as any).scheme ?? 'xyz';
            let delegate: DataProvider = restClient;
            if (scheme === 'tms') {
                delegate = new TMSDataProvider(restClient);
            }
            // Source bounds: wrap to filter out-of-bounds tiles (TileJSON).
            const bounds = (source as any).bounds;
            if (Array.isArray(bounds) && bounds.length === 4) {
                delegate = new BoundsFilteredDataProvider(delegate, bounds as [number, number, number, number]);
            }
            this.m_delegatingProvider.delegate = delegate;
            this.m_currentSourceId = bestVectorSourceId;

            await this.decoder.configure(undefined, {
                mbStyle: style,
                currentSourceId: bestVectorSourceId,
            } as any);

            found = true;
        }

        // Priority 2: best GeoJSON source.
        if (!found) {
            let bestGeoSourceId: string | null = null;
            let bestGeoCount = 0;
            for (const [sourceId, source] of sources) {
                if (source.type === 'geojson') {
                    const count = layerCounts.get(sourceId) ?? 0;
                    if (count > bestGeoCount || bestGeoSourceId === null) {
                        bestGeoSourceId = sourceId;
                        bestGeoCount = count;
                    }
                }
            }

            if (bestGeoSourceId) {
                const sourceId = bestGeoSourceId;
                const geoJsonSpec = (style.sources as any)[sourceId] as GeoJSONSourceSpec;
                let data: any = geoJsonSpec.data;
                if (typeof data === 'string' && data.trim() !== '') {
                    try {
                        const url = data.replace(/^local:\/\//, '/base/@flywave/flywave-mbstyle-datasource/test/rendering/integration/');
                        const resp = await fetch(url);
                        data = await resp.json();
                    } catch (e) {
                    }
                }
                if (data) {
                    this.m_delegatingProvider.delegate = new GeoJSONDataProvider(data, {
                        cluster: geoJsonSpec.cluster,
                        clusterRadius: geoJsonSpec.clusterRadius,
                        clusterMaxZoom: geoJsonSpec.clusterMaxZoom,
                        clusterProperties: (geoJsonSpec as any).clusterProperties,
                    });
                    this.m_currentSourceId = sourceId;

                    await this.decoder.configure(undefined, {
                        mbStyle: style,
                        currentSourceId: sourceId,
                    } as any);

                    found = true;
                }
            }
        }

        return found;
    }

    private createOmvRestClient(
        source: ResolvedSource,
        accessToken?: string
    ): OmvRestClient {
        const url = source.tileUrls[0] ?? '';
        const params: OmvRestClientParameters = {
            url,
            apiFormat: APIFormat.XYZMVT,
        };
        if (accessToken) {
            params.authenticationCode = accessToken;
        }
        return new OmvRestClient(params);
    }

    async connect(): Promise<void> {
        await this.m_styleManager.loadStyle(this.m_styleParams.style, this.m_styleParams.accessToken);
        const style = this.m_styleManager.getStyle();
        if (!style) {
            throw new Error('Failed to load Mapbox Style');
        }

        // Detect clip layers and build clip mask (clip-layer-types → polygon rings).
        this.buildClipMask(style);

        // Apply background color from background layers
        this.applyBackgroundColor(style);

        // Apply projection (globe/mercator/etc.)
        this.applyProjection(style);

        // Apply camera settings from style
        this.applyCameraSettings(style);

        // Create runtime styling API
        this.m_runtime = new MBStyleRuntime(style, () => {
            // On style change: reconfigure decoder and mark tiles dirty
            this.decoder.configure(undefined, {
                mbStyle: this.m_runtime!.style,
                currentSourceId: this.m_currentSourceId,
                pitch: this.m_runtime!.style.pitch ?? 0,
                brightness: this.m_environment?.brightness ?? 0,
                center: this.m_runtime!.style.center ?? [0, 0],
            } as any);
            if (this.mapView) {
                this.mapView.markTilesDirty(this);
            }
        });

        const sources = this.m_styleManager.getResolvedSources();

        // Set maxDataLevel from the style's tile sources so flywave overzooms
        // (loads the highest-available parent tile and scales it up) when the
        // map zoom exceeds a source's `maxzoom`. Without this, a source with
        // maxzoom=14 viewed at z16 would request missing z16 tiles and render
        // nothing instead of the scaled z14 parent.
        const maxSourceZoom = Math.max(
            1,
            ...[...sources.values()].map(s => s.maxzoom ?? 22),
        );
        this.maxDataLevel = Math.min(22, maxSourceZoom);

        // Wire the "best" tile source (vector, then geojson) to the delegating
        // provider. Sets m_currentSourceId and the provider delegate.
        let found = await this.wireTileSources(style, sources);

        for (const [sourceId, source] of sources) {
            if (source.type === 'raster-dem') {
                const demSpec = (style.sources as any)[sourceId];
                const tiles = demSpec?.tiles ?? [];
                const tileUrl = tiles[0] ?? source.tileUrls[0] ?? '';
                if (tileUrl) {
                    this.m_demTileUrl = tileUrl.replace(/^local:\/\//, '/base/@flywave/flywave-mbstyle-datasource/test/rendering/integration/');
                    this.m_demTileSize = demSpec?.tileSize ?? 256;
                }
                break;
            }
        }

        for (const [sourceId, source] of sources) {
            if (source.type === 'raster' && !found) {
                const rasterSpec = (style.sources as any)[sourceId];
                const tiles = rasterSpec?.tiles ?? [];
                const tileUrl = tiles[0] ?? source.tileUrls[0] ?? '';
                if (tileUrl) {
                    const resolvedUrl = tileUrl.replace(/^local:\/\//, '/base/@flywave/flywave-mbstyle-datasource/test/rendering/integration/');
                    this.m_delegatingProvider.delegate = new RasterTileDataProvider(resolvedUrl);
                    this.m_currentSourceId = sourceId;
                    this.m_rasterTileUrl = resolvedUrl;
                    await this.decoder.configure(undefined, {
                        mbStyle: style,
                        currentSourceId: sourceId,
                        demTileUrl: this.m_demTileUrl,
                        rasterTileUrl: resolvedUrl,
                    } as any);
                    found = true;
                    break;
                }
            }
        }

        // Hillshade: if the style has a hillshade layer referencing a raster-dem
        // source, set up a tile provider that emits tile-covering polygons carrying
        // the per-tile DEM url. The emitter turns these into fill+_isHillshade
        // techniques; the MaterialPatchManager loads the DEM and applies the shader.
        if (!found) {
            const hasHillshade = (style.layers ?? []).some(
                (l: any) => l.type === 'hillshade' && (l.layout?.visibility ?? 'visible') === 'visible',
            );
            if (hasHillshade && this.m_demTileUrl) {
                this.m_delegatingProvider.delegate = new HillshadeTileDataProvider(this.m_demTileUrl, this.m_demTileSize);
                const hillshadeLayer = (style.layers ?? []).find(
                    (l: any) => l.type === 'hillshade',
                ) as any;
                const hillshadeSourceId: string = hillshadeLayer?.source ?? 'hillshade-dem';
                this.m_currentSourceId = hillshadeSourceId;
                await this.decoder.configure(undefined, {
                    mbStyle: style,
                    currentSourceId: hillshadeSourceId,
                    demTileUrl: this.m_demTileUrl,
                } as any);
                found = true;
            }
        }

        // Load sprite atlas if style has a sprite URL
        if (style.sprite) {
            await this.loadSpriteAtlas(style.sprite);
            this.m_lastAppliedSprite = style.sprite;
        }

        // Preload real mapbox glyph metrics for the style's font stacks so
        // the worker-based decoder can shape text accurately (line breaking
        // and anchor placement match the actual font advances). The atlas
        // bitmap itself still goes through flywave's FontCatalog; only the
        // metrics are wired through here.
        if (style.glyphs) {
            await this.loadGlyphMetrics(style);
            this.m_lastAppliedGlyphs = style.glyphs;
        }

        if (this.mapView) {
            this.m_environment = new MBEnvironmentManager(this.mapView);
            this.m_environment.applyLights(
                (style as any).lights as any,
                style.light,
            );
            this.m_environment.applyFog(style.fog);
            this.m_environment.applySky(style.sky, style.fog);

            const bgLayer = (style.layers ?? []).find((l: any) => l.type === 'background');
            if (bgLayer) {
                const bgPaint = (bgLayer as any).paint ?? {};
                const pattern = bgPaint['background-pattern'];
                const pitchAlign = bgPaint['background-pitch-alignment'] ?? 'map';
                if (pattern && this.m_spriteAtlas) {
                    await this.m_environment.applyBackgroundPattern(
                        pattern,
                        this.m_spriteAtlas,
                        bgPaint['background-color'] ?? '#000000',
                        bgPaint['background-opacity'] ?? 1,
                        pitchAlign,
                    );
                }
            }

            // Configure the decoder with the environment's computed brightness
            // (for `measure-light` expressions) now that lights are applied.
            await this.decoder.configure(undefined, {
                mbStyle: style,
                currentSourceId: this.m_currentSourceId,
                demTileUrl: this.m_demTileUrl,
                pitch: style.pitch ?? 0,
                brightness: this.m_environment.brightness,
                clipMask: Object.fromEntries(this.m_clipMask),
                worldview: (style as any).metadata?.test?.worldview ?? '',
                center: style.center ?? [0, 0],
            } as any);

            this.m_materialPatcher = new MBMaterialPatchManager(this);
            this.m_materialPatcher.invalidate();
            const patcher = this.m_materialPatcher;
            const self = this;

            // Instantiate the symbol placement controller (collision detection,
            // crossTileID, offsets, rotation alignment, opacity fade).
            try {
                const { MBStyleSymbolPlacement } = await import('./MBStyleSymbolPlacement');
                self.m_symbolPlacement = new MBStyleSymbolPlacement(this.mapView, self);
            } catch {}

            const placement = this.m_symbolPlacement;
            this.mapView.addEventListener(MapViewEventNames.AfterRender, () => {
                patcher.patchTileMaterials();
                if (placement) placement.run();
                if (self.m_debugTileBoundaries) self.drawTileBoundaries();
                const tc = self.m_environment?.terrainController;
                if (tc && tc.isMorphing) {
                    tc.updateMorphing(Date.now());
                }
                // TerrainDraping has its own AfterRender listener that
                // detects mesh count changes + morphing completion + lazy
                // bake — no manual trigger needed here.
            });
        }

        await this.loadModels(style);

        if (this.m_environment && style.terrain) {
            await this.m_environment.applyTerrain(
                style.terrain as any,
                this.m_demTileUrl,
                style.zoom ?? 8,
                style.center ?? [0, 0],
            );
            // Enable depth occlusion so circles/symbols behind terrain are hidden.
            if (this.m_materialPatcher) {
                this.m_materialPatcher.setDepthOcclusion(true);
                this.m_materialPatcher.invalidate();
            }
            // Start soft depth occlusion (Scheme A): render terrain depth to a
            // DepthTexture each frame (WillRender) and inject it into circle
            // materials for smooth fade. Best-effort; falls back to Scheme C
            // (hardware depthTest) if unavailable.
            if (this.mapView && this.m_environment.terrainController) {
                try {
                    const { TerrainDepthOcclusion } = await import('./TerrainDepthOcclusion');
                    this.m_depthOcclusion?.dispose();
                    this.m_depthOcclusion = new TerrainDepthOcclusion(
                        this.mapView, this.m_environment.terrainController);
                    this.m_depthOcclusion.start();
                    if (this.m_materialPatcher && this.m_depthOcclusion.depthTexture) {
                        this.m_materialPatcher.setDepthTexture(this.m_depthOcclusion.depthTexture);
                    }
                } catch {}
            }

            // Start FBO texture draping: bake non-terrain layers (raster
            // satellite, fill patterns, etc.) into per-tile textures and
            // feed them to the terrain material's uDrape uniform.
            // Activated alongside depth occlusion — the two are complementary
            // (depth occlusion hides labels behind hills; draping paints
            // raster content on the DEM surface).
            if (this.mapView && this.m_environment.terrainController) {
                try {
                    const { TerrainDraping } = await import('./TerrainDraping');
                    this.m_terrainDraping?.dispose();
                    this.m_terrainDraping = new TerrainDraping(
                        this.mapView, this.m_environment.terrainController);
                    this.m_terrainDraping.start();
                } catch {}
            }
        }

        if (this.m_environment && this.m_rasterTileUrl) {
            const rasterLayer = (style.layers ?? []).find((l: any) => l.type === 'raster');
            const rasterPaint = (rasterLayer as any)?.paint ?? {};
            await this.m_environment.applyRasterSource(
                this.m_rasterTileUrl,
                Math.min(Math.max(Math.floor(style.zoom ?? 0), 0), 12),
                style.center ?? [0, 0],
                rasterPaint,
                rasterLayer as any,
            );
        }

        if (this.m_environment) {
            await this.m_environment.applyImageSources(style);
        }

        await super.connect();
    }

    get spriteAtlas(): SpriteAtlas | null {
        return this.m_spriteAtlas;
    }

    get demTileUrl(): string | null {
        return this.m_demTileUrl;
    }

    get rasterTileUrl(): string | null {
        return this.m_rasterTileUrl;
    }

    private async loadModels(style: StyleSpecification): Promise<void> {
        const modelLayers = (style.layers ?? []).filter(
            (l: any) => l.type === 'model' && (l.layout?.visibility ?? 'visible') === 'visible',
        );
        if (modelLayers.length === 0) return;

        const scene = (this.mapView as any)?.m_scene as THREE.Scene | undefined;
        if (!scene) return;

        const LOCAL = '/base/@flywave/flywave-mbstyle-datasource/test/rendering/integration/';
        const resolveUrl = (u: string) => u?.replace(/^local:\/\//, LOCAL) ?? '';

        for (const layer of modelLayers) {
            const layout = (layer as any).layout ?? {};
            const modelScale = layout['model-scale'] ?? 1;
            const modelRotation = layout['model-rotation'];

            // Collect model definitions: inline `models` map in the layer, or
            // from the referenced source.
            const modelDefs: Array<{ url: string; position: number[] }> = [];

            // Inline models (mapbox HD: layer.models = { id: { uri, position } })
            const inlineModels = (layer as any).models;
            if (inlineModels && typeof inlineModels === 'object') {
                for (const m of Object.values(inlineModels) as any[]) {
                    if (m.uri) {
                        modelDefs.push({ url: resolveUrl(m.uri), position: m.position ?? [] });
                    }
                }
            }

            // Source-based models (source.type with data/url)
            if (modelDefs.length === 0) {
                const sourceId = (layer as any).source;
                const source = sourceId ? (style.sources as any)[sourceId] : null;
                if (source) {
                    const url = typeof source.data === 'string'
                        ? resolveUrl(source.data)
                        : resolveUrl(source.url);
                    const positions = layout['model-position'];
                    const positionList = Array.isArray(positions) && positions.length > 0 && Array.isArray(positions[0])
                        ? positions
                        : (style.center ? [style.center] : [[0, 0]]);
                    for (const pos of positionList) {
                        modelDefs.push({ url, position: pos });
                    }
                }
            }

            if (modelDefs.length === 0) continue;

            try {
                const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
                const loader = new GLTFLoader();
                const { GeoCoordinates } = require('@flywave/flywave-geoutils');
                const projection = (this.mapView as any).projection;

                for (const def of modelDefs) {
                    if (!def.url) continue;
                    let gltf: any;
                    try { gltf = await loader.loadAsync(def.url); } catch { continue; }

                    const model = gltf.scene.clone(true);
                    const lng = def.position[0] ?? 0;
                    const lat = def.position[1] ?? 0;
                    const z = def.position[2] ?? 0;

                    if (projection) {
                        const geoCoord = new GeoCoordinates(lat, lng);
                        const worldPos = projection.projectPoint(geoCoord);
                        model.position.set(worldPos.x, worldPos.y, (worldPos as any).z ?? z);
                    }

                    // Scale: scalar or [x,y,z].
                    if (Array.isArray(modelScale)) {
                        model.scale.set(modelScale[0] ?? 1, modelScale[1] ?? 1, modelScale[2] ?? 1);
                    } else {
                        model.scale.setScalar(modelScale);
                    }

                    // Rotation: [x,y,z] Euler angles in degrees.
                    if (Array.isArray(modelRotation)) {
                        model.rotation.set(
                            (modelRotation[0] ?? 0) * Math.PI / 180,
                            (modelRotation[1] ?? 0) * Math.PI / 180,
                            (modelRotation[2] ?? 0) * Math.PI / 180,
                        );
                    }

                    scene.add(model);
                }
            } catch {}
        }
    }

    /**
     * Runtime styling API for dynamic style manipulation.
     * Usage: dataSource.runtime.setPaintProperty('water', 'fill-color', '#0000ff')
     */
    get runtime(): MBStyleRuntime | null {
        return this.m_runtime;
    }

    /** Enable collision-box debug overlay (metadata.test.collisionDebug). */
    setCollisionDebug(enabled: boolean): void {
        if (this.m_symbolPlacement) {
            this.m_symbolPlacement.setCollisionDebug(enabled);
        }
    }

    /** Toggle terrain wireframe overlay (metadata.test.showTerrainWireframe). */
    setTerrainWireframe(enabled: boolean): void {
        this.m_environment?.terrainController?.setWireframe(enabled);
    }

    /** Toggle 3D layer wireframe overlay (metadata.test.showLayers3DWireframe). */
    setLayers3DWireframe(enabled: boolean): void {
        if (!this.mapView) return;
        const scene = (this.mapView as any).m_scene as THREE.Scene;
        if (!scene) return;
        scene.traverse((obj: any) => {
            if (obj.isMesh && obj.material && obj.userData?.technique) {
                const tech = obj.userData.technique;
                if (tech.name === 'extruded-polygon' || tech.name === 'fill' || tech.name === 'solid-line') {
                    obj.material.wireframe = enabled;
                }
            }
        });
    }

    /** Toggle 2D layer wireframe overlay (metadata.test.showLayers2DWireframe). */
    setLayers2DWireframe(enabled: boolean): void {
        if (!this.mapView) return;
        const scene = (this.mapView as any).m_scene as THREE.Scene;
        if (!scene) return;
        scene.traverse((obj: any) => {
            if (obj.isMesh && obj.material && obj.userData?.technique) {
                const tech = obj.userData.technique;
                if (tech.name === 'circles' || tech.name === 'text' || tech.name === 'labeled-icon') {
                    obj.material.wireframe = enabled;
                }
            }
        });
    }

    /** Runtime setFov: delegate to MapView.setFovCalculation. */
    setFov(fov: number): void {
        (this.mapView as any)?.setFovCalculation?.({ type: 'fixed', fov });
    }

    /** Runtime addImage: inject an icon into the sprite atlas. */
    addImage(name: string, image: HTMLImageElement | HTMLCanvasElement | ImageBitmap): boolean {
        return this.m_spriteAtlas?.addIcon(name, image as any) ?? false;
    }

    /** Runtime removeImage: remove an icon from the sprite atlas. */
    removeImage(name: string): boolean {
        return this.m_spriteAtlas?.removeIcon(name) ?? false;
    }

    /** Toggle tile-boundary debug overlay (metadata.test.debug). */
    setDebugTileBoundaries(enabled: boolean): void {
        this.m_debugTileBoundaries = enabled;
        if (!enabled && this.m_debugLines) {
            this.m_debugLines.visible = false;
        }
    }

    /**
     * Draw tile boundary rectangles in world space (debug visualization).
     * Called each frame from AfterRender when debug mode is on.
     */
    private drawTileBoundaries(): void {
        if (!this.m_debugTileBoundaries || !this.mapView) return;
        const THREE = require('three');
        const scene = (this.mapView as any).m_scene;
        if (!scene) return;

        if (!this.m_debugLines) {
            const geom = new THREE.BufferGeometry();
            const mat = new THREE.LineBasicMaterial({
                color: 0xff00ff, transparent: true, depthTest: false, depthWrite: false,
            });
            this.m_debugLines = new THREE.LineSegments(geom, mat);
            this.m_debugLines.frustumCulled = false;
            this.m_debugLines.renderOrder = 9998;
            scene.add(this.m_debugLines);
        }
        this.m_debugLines.visible = true;

        const positions: number[] = [];
        const EarthConstants = require('@flywave/flywave-geoutils').EarthConstants;
        const C = EarthConstants.EQUATORIAL_CIRCUMFERENCE;

        // Iterate visible tiles and draw their world-space boundaries.
        const tiles = this.getDecodedTiles();
        for (const tile of tiles) {
            const tk = tile.tileKey;
            if (!tk) continue;
            const n = Math.pow(2, tk.level);
            const ts = C / n;
            const x0 = tk.column * ts;
            const x1 = (tk.column + 1) * ts;
            const y0 = C - (tk.row + 1) * ts;
            const y1 = C - tk.row * ts;
            // 4 edges
            positions.push(x0, 0, y0, x1, 0, y0, x1, 0, y0, x1, 0, y1, x1, 0, y1, x0, 0, y1, x0, 0, y1, x0, 0, y0);
        }

        const geo = this.m_debugLines.geometry;
        geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        geo.attributes.position.needsUpdate = true;
    }

    private async loadSpriteAtlas(spriteUrl: string): Promise<void> {
        const spriteData = await this.m_styleManager.loadSprite(spriteUrl);
        if (spriteData) {
            const icons = new Map<string, any>();
            for (const [name, info] of Object.entries(spriteData.json)) {
                icons.set(name, info);
            }
            this.m_spriteAtlas = new SpriteAtlas(spriteData.image, icons);

            // Register individual icons in MapView's userImageCache so that
            // PoiRenderer can find them by name. PoiRenderer uses imageCaches
            // (theme + user) to look up icons by their technique imageTextureName.
            // Without this, icons never render because PoiRenderer can't find them.
            if (this.mapView) {
                const userImageCache = (this.mapView as any).userImageCache;
                if (userImageCache && typeof userImageCache.addImage === 'function') {
                    const atlasImage = spriteData.image;
                    for (const [name, info] of icons) {
                        try {
                            // Extract the icon sub-image from the atlas.
                            if (typeof document !== 'undefined') {
                                const canvas = document.createElement('canvas');
                                canvas.width = info.width;
                                canvas.height = info.height;
                                const ctx = canvas.getContext('2d')!;
                                ctx.drawImage(
                                    atlasImage as any,
                                    info.x, info.y, info.width, info.height,
                                    0, 0, info.width, info.height,
                                );
                                userImageCache.addImage(name, canvas);
                            }
                        } catch {}
                    }
                }
            }
        }
    }

    /**
     * Preload mapbox PBF glyph metrics for every font stack referenced by the
     * style's symbol layers. Only the basic Latin range (0-255) is fetched —
     * that's all that's needed for accurate shaping of the latin labels that
     * dominate the render-test corpus. The metrics are shipped to the worker
     * decoder on the next `decoder.configure()` call.
     */
    private async loadGlyphMetrics(style: StyleSpecification): Promise<void> {
        const glyphsUrl = style.glyphs;
        if (!glyphsUrl) return;
        // Collect unique font stacks from symbol layer layouts.
        const fontStacks = new Set<string>();
        for (const layer of style.layers ?? []) {
            const tf = (layer as any).layout?.['text-font'];
            if (Array.isArray(tf) && tf.length > 0) {
                fontStacks.add(tf.join(','));
            }
        }
        if (fontStacks.size === 0) return;

        const { loadGlyphMetrics } = await import('./MBGlyphLoader');
        // Basic Latin range covers most labels; load 0 (chars 0-255).
        const RANGES = [0, 1]; // 0-255 + 256-511 (Latin-1 supplement + Extended-A)
        for (const stack of fontStacks) {
            // The mapbox URL template uses {fontstack}; PBF fontstack names
            // are comma-separated. Pass the first font of the stack — PBF
            // ranges are typically keyed by primary font.
            const primaryFont = stack.split(',')[0];
            await loadGlyphMetrics(primaryFont, RANGES, glyphsUrl, this.m_glyphMetrics);
        }

        // Push metrics to the decoder.
        this.decoder.configure(undefined, {
            mbStyle: style,
            glyphMetrics: this.m_glyphMetrics,
        } as any);
    }

    async setTheme(_theme: Theme | FlatTheme): Promise<void> {
    }

    /**
     * Re-apply a fully-swapped style at runtime (the `setStyle` operation).
     *
     * Unlike the lightweight `runtime.setStyle()` path (which only
     * reconfigures the decoder + marks tiles dirty), this method redoes the
     * heavy parts of `connect()`: sprite atlas reload, glyph metrics reload,
     * environment (lights/fog/sky/background), camera settings, projection,
     * terrain, and models. Use it when the runtime style has been replaced
     * wholesale — typically by the `setStyle` render-test operation.
     *
     * Cheap operations (background, camera, projection) always run; expensive
     * network loads (sprite, glyphs) only run when the corresponding URL
     * changed since the last apply.
     */
    async reloadStyle(): Promise<void> {
        const style = this.m_runtime?.style ?? this.m_styleManager?.getStyle();
        if (!style || !this.mapView) return;

        // Cheap re-applies — always safe to re-run.
        this.applyBackgroundColor(style);
        this.applyCameraSettings(style);
        this.applyProjection(style);
        this.buildClipMask(style);

        // Sprite atlas: reload only if the URL changed.
        const newSprite = style.sprite;
        if (newSprite && newSprite !== this.m_lastAppliedSprite) {
            await this.loadSpriteAtlas(newSprite);
            this.m_lastAppliedSprite = newSprite;
        }

        // Glyph metrics: reload only if the URL changed.
        const newGlyphs = style.glyphs;
        if (newGlyphs && newGlyphs !== this.m_lastAppliedGlyphs) {
            this.m_glyphMetrics.clear();
            await this.loadGlyphMetrics(style);
            this.m_lastAppliedGlyphs = newGlyphs;
        }

        // Environment: lights/fog/sky/background-pattern.
        if (this.m_environment) {
            this.m_environment.applyLights((style as any).lights ?? (style as any).light ? [(style as any).light] : undefined);
            this.m_environment.applyFog(style.fog);
            this.m_environment.applySky(style.sky, style.fog);
        }

        // Terrain: re-apply if terrain spec changed.
        if (this.m_environment && style.terrain) {
            try {
                await this.m_environment.applyTerrain(
                    style.terrain as any,
                    this.m_demTileUrl,
                    style.zoom ?? 8,
                    style.center ?? [0, 0],
                );
            } catch {}
        }

        // Models: re-load.
        try {
            await this.loadModels(style);
        } catch {}

        // Re-configure the decoder with the new style + push glyph metrics.
        this.decoder.configure(undefined, {
            mbStyle: style,
            currentSourceId: this.m_currentSourceId,
            glyphMetrics: this.m_glyphMetrics.size > 0 ? this.m_glyphMetrics : undefined,
            clipMask: Object.fromEntries(this.m_clipMask),
        } as any);

        // Force a full re-decode of visible tiles.
        this.mapView.markTilesDirty(this);
        this.mapView.update();
    }

    /** Tracks the last sprite URL applied, to skip redundant reloads. */
    private m_lastAppliedSprite: string | undefined;
    /** Tracks the last glyphs URL applied, to skip redundant reloads. */
    private m_lastAppliedGlyphs: string | undefined;

    /**
     * Override setFeatureState to trigger tile re-decode when feature state changes.
     * The base class stores feature state; we additionally mark tiles dirty
     * so the decoder re-evaluates expressions with updated state.
     */
    setFeatureState(featureId: number | string, state: any): void {
        // Mapbox render-test operations pass a descriptor
        // {source, sourceLayer, id} as the feature id. The decoder resolves
        // feature state by the decoded feature's numeric/string `id`, so
        // normalize the descriptor to just its id.
        const normalizedKey = this.normalizeFeatureStateKey(featureId);
        super.setFeatureState(normalizedKey, state);
        if (this.mapView) {
            this.mapView.markTilesDirty(this);
        }
        this.requestUpdate();

        if (!(this as any).m_featureStates) {
            (this as any).m_featureStates = new Map();
        }
        (this as any).m_featureStates.set(normalizedKey, state);

        this.decoder.configure(undefined, {
            mbStyle: this.m_styleManager.getStyle(),
            currentSourceId: this.m_currentSourceId,
            featureStates: (this as any).m_featureStates,
        } as any);
    }

    override removeFeatureState(featureId: number | string): void {
        const normalizedKey = this.normalizeFeatureStateKey(featureId);
        super.removeFeatureState(normalizedKey);
        if (this.mapView) {
            this.mapView.markTilesDirty(this);
        }
        const states = (this as any).m_featureStates as Map<any, any> | undefined;
        if (states) {
            states.delete(normalizedKey);
        }
        this.decoder.configure(undefined, {
            mbStyle: this.m_styleManager.getStyle(),
            currentSourceId: this.m_currentSourceId,
            featureStates: (this as any).m_featureStates ?? new Map(),
        } as any);
    }

    /** Extract the numeric/string feature id from a mapbox feature-state descriptor. */
    private normalizeFeatureStateKey(featureId: number | string): number | string {
        if (typeof featureId === 'object' && featureId !== null) {
            const desc = featureId as any;
            const id = desc?.id ?? desc?.featureId;
            return (id === undefined || id === null) ? String(desc?.source ?? '') : id;
        }
        return featureId;
    }

    /**
     * Re-ship the environment's current brightness (for `measure-light`
     * expressions) to the decoder. Called after lights change at runtime so
     * appearance conditions re-evaluate with up-to-date brightness.
     */
    refreshDecoderBrightness(): void {
        const style = this.m_styleManager.getStyle();
        this.decoder.configure(undefined, {
            mbStyle: style,
            currentSourceId: this.m_currentSourceId,
            demTileUrl: this.m_demTileUrl,
            pitch: style.pitch ?? 0,
            brightness: this.m_environment?.brightness ?? 0,
            clipMask: Object.fromEntries(this.m_clipMask),
            worldview: (style as any).metadata?.test?.worldview ?? '',
            center: style.center ?? [0, 0],
        } as any);
        if (this.mapView) {
            this.mapView.markTilesDirty(this);
        }
    }

    shouldPreloadTiles(): boolean {
        return true;
    }

    getDataZoomLevel(zoomLevel: number): number {
        return Math.max(
            this.minDataLevel,
            Math.min(this.maxDataLevel, zoomLevel + this.storageLevelOffset)
        );
    }

    /**
     * Apply background color from style's background layers to MapView clear color.
     */
    private applyBackgroundColor(style: StyleSpecification): void {
        for (const layer of style.layers ?? []) {
            if (layer.type === 'background') {
                // background-visibility: "none" hides the background entirely.
                const vis = (layer as any).layout?.visibility ?? 'visible';
                if (vis === 'none') {
                    return;
                }
                const paint = (layer as any).paint ?? {};
                const rawColor = paint['background-color'];
                const opacity = paint['background-opacity'] ?? 1;
                // Resolve zoom functions / expressions for the background color
                // (mapbox default is black when a background layer exists).
                let color = '#000000';
                if (rawColor) {
                    try {
                        const { MBExpressionEngine } = require('./MBExpressionEngine');
                        const evaluated = MBExpressionEngine.evaluate(rawColor, {
                            zoom: style.zoom ?? 0,
                            feature: undefined,
                        } as any);
                        if (typeof evaluated === 'string') color = evaluated;
                    } catch {}
                }
                if (this.mapView) {
                    const c = new THREE.Color(color);
                    (this.mapView as any).clearColor = c.getHex();
                    (this.mapView as any).clearAlpha = opacity;
                }
                return;
            }
        }
        // NOTE: without a background layer the engine keeps its opaque white
        // clear; the render-test comparison alpha-composites the RGBA
        // reference over white (see flywave-test-utils compareImages), so the
        // transparent reference background matches the white canvas.
    }

    /**
     * Apply projection from style — switches MapView between mercator and globe.
     *
     * Uses flywave's native projection system:
     * - `mercator` (default) → `mercatorProjection` (flat planar world)
     * - `globe` → `sphereProjection` (ECEF sphere, native globe rendering)
     *
     * When switching to globe, the entire native pipeline activates automatically:
     * tiles are positioned on sphere surface, camera constraints adjust for curvature,
     * atmosphere/horizon rendering activates, label placement filters near horizon.
     *
     * For mercator↔globe transition (Mapbox zoom 5→6 smoothstep), flywave uses a
     * hard switch (no interpolation). A smooth morph would require a custom
     * interpolating Projection subclass (future enhancement).
     */
    private applyProjection(style: StyleSpecification): void {
        if (!this.mapView) return;
        const styleProj = (style as any).projection;
        const projName = typeof styleProj === 'string' ? styleProj : styleProj?.name;
        const projConfig = { name: projName ?? 'mercator', center: styleProj?.center, parallels: styleProj?.parallels };

        if (projConfig.name !== 'mercator' && projConfig.name !== 'globe') {
            try {
                const { MBMapProjection } = require('./MBMapProjection');
                const customProj = new MBMapProjection(projConfig);
                (this.mapView as any).projection = customProj;
                return;
            } catch {}
        }

        if (projConfig.name === 'globe') {
            (this.mapView as any).projection = sphereProjection;
        } else {
            const currentType = this.mapView.projection?.type;
            if (currentType === ProjectionType.Spherical) {
                (this.mapView as any).projection = mercatorProjection;
            }
        }
    }

    /**
     * Apply camera settings (center, zoom, bearing, pitch) from the style.
     */
    private applyCameraSettings(style: StyleSpecification): void {
        if (!this.mapView) return;

        // Mapbox render tests: the camera is driven by the style. Missing
        // center defaults to [0,0]; missing zoom defaults to 0 (mapbox's Map
        // default, map.ts:235). NOT "keep the current zoom" — a freshly created
        // MapView's default camera is degenerate (m_targetDistance=0 → extreme
        // zoom), which would push content off-screen for tests without a zoom.
        const center = style.center ?? [0, 0];
        // flywave's camera zoom convention shows a level-z tile at 256px while
        // mapbox shows it at 512px (calculateDistanceFromZoomLevel /256). To
        // match mapbox's world scale, offset the camera zoom by +1.
        const zoom = (typeof style.zoom === 'number' ? style.zoom : 0) + 1;
        const bearing = style.bearing ?? 0;
        const pitch = style.pitch ?? 0;

        try {
            // Import GeoCoordinates dynamically to avoid circular dependency issues
            const { GeoCoordinates } = require('@flywave/flywave-geoutils');
            const geoCoord = new GeoCoordinates(center[1], center[0]);
            this.mapView.setCameraGeolocationAndZoom(geoCoord, zoom, bearing, pitch);
        } catch {}
    }

    /**
     * Build clip mask from `clip` layers. Each clip layer references a polygon
     * source and lists `clip-layer-types`. Features of those types outside the
     * clip polygon are suppressed.
     */
    private buildClipMask(style: StyleSpecification): void {
        this.m_clipMask.clear();
        const clipLayers = (style.layers ?? []).filter((l: any) => l.type === 'clip');
        for (const clipLayer of clipLayers) {
            const layerTypes: string[] = (clipLayer as any).layout?.['clip-layer-types'] ?? [];
            const sourceId = (clipLayer as any).source as string;
            if (!sourceId) continue;
            const source = (style.sources as any)[sourceId];
            if (!source) continue;
            // Extract polygon rings from inline geojson.
            let rings: number[][][] = [];
            const data = source.data;
            if (data?.type === 'Polygon') {
                rings = data.coordinates;
            } else if (data?.type === 'MultiPolygon') {
                rings = data.coordinates.flat();
            } else if (data?.type === 'FeatureCollection') {
                for (const f of data.features ?? []) {
                    if (f.geometry?.type === 'Polygon') rings.push(...f.geometry.coordinates);
                    if (f.geometry?.type === 'MultiPolygon') rings.push(...f.geometry.coordinates.flat());
                }
            }
            for (const lt of layerTypes) {
                this.m_clipMask.set(lt, rings);
            }
        }
    }

    /** Point-in-polygon test (ray casting) for clip mask. */
    static pointInPolygonRing(lng: number, lat: number, ring: number[][]): boolean {
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
}
