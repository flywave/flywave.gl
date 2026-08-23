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
import { MBExpressionEngine } from './MBExpressionEngine';
import { MBTileDataEmitter } from './MBTileDataEmitter';
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
    private m_minZoom: number;
    private m_maxZoom: number;
    /**
     * Ideal tile level getter (flywave zoomLevel of the camera). mgl draws
     * ONE raster tile per screen cell (coveringZoomLevel = round(zoom + 1)),
     * while the engine schedules multiple levels — emitting coverage quads
     * at every level STACKS them (a 0.5-opacity raster layer then blends
     * different-resolution ancestor copies, washing the map out; observed
     * on raster-masking/overlapping-vector).
     */
    private m_idealLevel: (() => number) | undefined;

    constructor(tileUrlTemplate: string, minZoom: number = 0, maxZoom: number = 22,
        idealLevel?: () => number) {
        super();
        this.m_tileUrlTemplate = tileUrlTemplate;
        this.m_minZoom = minZoom;
        this.m_maxZoom = maxZoom;
        this.m_idealLevel = idealLevel;
    }

    ready(): boolean { return true; }

    async getTile(tileKey: TileKey): Promise<ArrayBufferLike | {}> {
        const z = tileKey.level;
        const x = tileKey.column;
        const y = tileKey.row;

        // Only the camera's ideal level produces coverage (mgl one-tile-per-
        // cell semantics). Other engine-scheduled levels return empty so
        // multi-level quads never stack on screen.
        if (this.m_idealLevel) {
            const ideal = Math.min(Math.max(this.m_idealLevel(), this.m_minZoom), this.m_maxZoom);
            if (z !== ideal) {
                return JSON.stringify({ type: 'FeatureCollection', features: [] });
            }
        }

        // mgl coveringTiles: `if (z < options.minzoom) return []` — below
        // the source minzoom NOTHING is drawn (zoomed-raster/underzoom's
        // expected is pure black). Overzoom clamps the request to maxzoom.
        if (z < this.m_minZoom) {
            return JSON.stringify({ type: 'FeatureCollection', features: [] });
        }

        const tileUrl = (zz: number, xx: number, yy: number) =>
            this.m_tileUrlTemplate
                .replace('{z}', String(zz))
                .replace('{x}', String(xx))
                .replace('{y}', String(yy));

        // mgl overzooms from the closest available ancestor when a raster
        // tile 404s (render-test satellite fixtures live at a lower level
        // than the camera zoom, e.g. z12 fixtures under a z16 camera).
        // Walk up from min(z, maxzoom) and resolve the deepest existing
        // ancestor. Returns null when nothing exists down to z0.
        const resolveAncestor = async (
            zz: number, xx: number, yy: number
        ): Promise<{ srcZ: number; srcX: number; srcY: number } | null> => {
            const top = Math.min(zz, this.m_maxZoom);
            for (let a = top; a >= 0; a--) {
                const shift = zz - a;
                const ax = Math.floor(xx / Math.pow(2, shift));
                const ay = Math.floor(yy / Math.pow(2, shift));
                // eslint-disable-next-line no-await-in-loop
                if (await RasterTileDataProvider.tileExists(tileUrl(a, ax, ay))) {
                    return { srcZ: a, srcX: ax, srcY: ay };
                }
            }
            return null;
        };

        // One quad covering tile (zz,xx,yy), textured from the ancestor
        // (sz,sx,sy) via the child's UV sub-rect in the ancestor image
        // (y top-down). Geometry UVs run (0,0)=tile north-west; with flipY
        // texture upload the sampling transform is
        // offset=(fx0, 1-fy0-fw), scale=(fw, fh).
        const buildFeature = (
            zz: number, xx: number, yy: number,
            sz: number, sx: number, sy: number
        ) => {
            const nn = Math.pow(2, zz);
            const span = Math.pow(2, zz - sz);
            const fw = 1 / span;
            const fx0 = (xx - sx * span) * fw;
            const fy0 = (yy - sy * span) * fw;
            return {
                type: 'Feature',
                geometry: {
                    type: 'Polygon',
                    coordinates: [[
                        [(xx / nn) * 360 - 180, this.tile2lat(yy, zz)],
                        [((xx + 1) / nn) * 360 - 180, this.tile2lat(yy, zz)],
                        [((xx + 1) / nn) * 360 - 180, this.tile2lat(yy + 1, zz)],
                        [(xx / nn) * 360 - 180, this.tile2lat(yy + 1, zz)],
                        [(xx / nn) * 360 - 180, this.tile2lat(yy, zz)],
                    ]],
                },
                properties: {
                    _rasterTileUrl: tileUrl(sz, sx, sy),
                    _rasterUvRect: [fx0, 1 - fy0 - fw, fw, fw],
                    _tileCol: xx,
                    _tileRow: yy,
                    _tileZoom: zz,
                },
            };
        };

        // mgl raster sources round the source zoom (`roundZoom: true`,
        // raster_tile_source.ts: coveringZoomLevel = round(zoom + 1) for a
        // tileSize-256 source) while flywave schedules tiles at
        // floor(zoomLevel). When the requested level 404s but children at
        // z+1 exist (e.g. camera 18.6: mgl requests z20, we request z19),
        // cover the quad with the four child tiles instead — per child,
        // falling back to that child's deepest ancestor exactly like mgl's
        // per-tile parent overzoom. Never descend past maxzoom.
        if (z < this.m_maxZoom && !(await RasterTileDataProvider.tileExists(tileUrl(z, x, y)))) {
            const childExists = await Promise.all([
                RasterTileDataProvider.tileExists(tileUrl(z + 1, 2 * x, 2 * y)),
                RasterTileDataProvider.tileExists(tileUrl(z + 1, 2 * x + 1, 2 * y)),
                RasterTileDataProvider.tileExists(tileUrl(z + 1, 2 * x, 2 * y + 1)),
                RasterTileDataProvider.tileExists(tileUrl(z + 1, 2 * x + 1, 2 * y + 1)),
            ]);
            if (childExists.some((e) => e)) {
                const features = [];
                for (let dy = 0; dy < 2; dy++) {
                    for (let dx = 0; dx < 2; dx++) {
                        const cz = z + 1;
                        const cx = 2 * x + dx;
                        const cy = 2 * y + dy;
                        const anc = childExists[dy * 2 + dx]
                            ? { srcZ: cz, srcX: cx, srcY: cy }
                            // eslint-disable-next-line no-await-in-loop
                            : await resolveAncestor(cz, cx, cy);
                        if (anc) {
                            features.push(buildFeature(cz, cx, cy, anc.srcZ, anc.srcX, anc.srcY));
                        }
                    }
                }
                if (features.length > 0) {
                    return JSON.stringify({ type: 'FeatureCollection', features });
                }
            }
        }

        // Single-quad path: deepest ancestor of the requested tile itself.
        // NOTE (§102): mgl's exact ascent was probed live (one parent level
        // per update cycle, gated by parentWasRequested state quirks). A
        // simplified one-level rule fixed this fixture but broke the sibling
        // masking fixtures — the deep chain stays until the full retain/
        // ascent logic is ported.
        const anc = await resolveAncestor(z, x, y);
        const srcZ = anc ? anc.srcZ : Math.min(Math.max(z, this.m_minZoom), this.m_maxZoom);
        const srcX = anc ? anc.srcX : Math.floor(x / Math.pow(2, z - srcZ));
        const srcY = anc ? anc.srcY : Math.floor(y / Math.pow(2, z - srcZ));
        return JSON.stringify({
            type: 'FeatureCollection',
            features: [buildFeature(z, x, y, srcZ, srcX, srcY)],
        });
    }

    /** HEAD-probe cache: which tile URLs exist for the current template. */
    private static readonly s_existingTiles = new Set<string>();
    private static readonly s_missingTiles = new Set<string>();
    private static async tileExists(url: string): Promise<boolean> {
        if (RasterTileDataProvider.s_existingTiles.has(url)) return true;
        if (RasterTileDataProvider.s_missingTiles.has(url)) return false;
        try {
            // GET (not HEAD): the karma static server may not answer HEAD.
            const resp = await fetch(url);
            if (resp.ok) {
                RasterTileDataProvider.s_existingTiles.add(url);
                return true;
            }
            RasterTileDataProvider.s_missingTiles.add(url);
            return false;
        } catch {
            return false;
        }
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

        // Mapbox raster-dem semantics: DEM tiles are stored one level lower for
        // 512/514px sources (tileSize 514 covers a 512px world → parent tile),
        // so request the DEM at `z - 2` for large tileSize, else `z`. The DEM
        // x/y must be recomputed at the DEM level (parent tile of this quad).
        const demOffset = this.m_tileSize > 256 ? 2 : 0;
        const demZ = Math.max(0, z - demOffset);
        const shift = z - demZ;
        const demX = Math.floor(x / Math.pow(2, shift));
        const demY = Math.floor(y / Math.pow(2, shift));

        const n = Math.pow(2, z);
        const lngW = (x / n) * 360 - 180;
        const lngE = ((x + 1) / n) * 360 - 180;
        const latN = this.tile2lat(y, z);
        const latS = this.tile2lat(y + 1, z);

        const demUrl = this.m_demUrlTemplate
            .replace('{z}', String(demZ))
            .replace('{x}', String(demX))
            .replace('{y}', String(demY));

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

/**
 * Combines multiple GeoJSON-producing tile providers into one. Styles may
 * reference several sources (e.g. a synthetic `rect` fill + a GeoJSON
 * fill-extrusion); previously only one source was wired so the others' data
 * never decoded. Each source's features are tagged with `_sourceId` so the
 * decoder can evaluate them against the correct style layers.
 */
class CompositeGeoDataProvider extends DataProvider {
    private m_entries: Array<{ sourceId: string; provider: DataProvider }> = [];

    add(sourceId: string, provider: DataProvider): void {
        this.m_entries.push({ sourceId, provider });
    }

    get size(): number {
        return this.m_entries.length;
    }

    /** The single source provider when only one source is combined. */
    getSingleProvider(): DataProvider | null {
        return this.m_entries.length === 1 ? this.m_entries[0].provider : null;
    }

    ready(): boolean {
        return this.m_entries.every(e => e.provider.ready());
    }

    async getTile(tileKey: TileKey, abortSignal?: AbortSignal): Promise<ArrayBufferLike | {}> {
        const features: any[] = [];
        for (const { sourceId, provider } of this.m_entries) {
            let data: any;
            try {
                data = await provider.getTile(tileKey, abortSignal);
            } catch {
                continue;
            }
            let fc: any = data;
            if (typeof data === 'string') {
                try {
                    fc = JSON.parse(data);
                } catch {
                    continue;
                }
            }
            // A source may hold a bare geometry (Polygon/LineString/Point)
            // instead of a FeatureCollection — wrap it so it can be merged.
            if (fc && typeof fc === 'object' && !Array.isArray(fc.features)) {
                const geometryTypes = new Set([
                    'Point', 'MultiPoint', 'LineString', 'MultiLineString',
                    'Polygon', 'MultiPolygon', 'GeometryCollection',
                ]);
                if (fc.type && geometryTypes.has(fc.type)) {
                    fc = {
                        type: 'FeatureCollection',
                        features: [{ type: 'Feature', geometry: fc, properties: {} }],
                    };
                }
            }
            if (!fc || !Array.isArray(fc.features)) {
                continue;
            }
            for (const f of fc.features) {
                features.push({
                    ...f,
                    properties: { ...(f.properties ?? {}), _sourceId: sourceId },
                });
            }
        }
        return JSON.stringify({ type: 'FeatureCollection', features });
    }

    protected async connect(): Promise<void> {
        for (const e of this.m_entries) {
            try {
                await (e.provider as any).connect();
            } catch {
                // Silently pass
            }
        }
    }

    protected dispose(): void {
        this.m_entries = [];
    }
}

export class MBStyleDataSource extends TileDataSource {
    private m_styleManager: MBStyleManager;
    private m_styleParams: MBStyleDataSourceParameters;
    private m_delegatingProvider: DelegatingDataProvider;
    private m_spriteAtlas: SpriteAtlas | null = null;
    /** Active color-theme LUT (null = identity); applied to paints, fog, and baked into sprite/pattern textures. */
    private m_colorThemeLut: import('./MBColorTheme').ColorThemeLut | null = null;
    /** Per-import-scope color-theme LUTs (mgl getLut(scope)). */
    private m_importLuts: Map<string, import('./MBColorTheme').ColorThemeLut | null> = new Map();
    /** Loaded model scenes (for re-theming when LUTs resolve after load). */
    private m_loadedModels: Array<{ model: any; layer: any }> = [];
    /** True once any applyColorTheme ran (guards the initial null race). */
    private m_themeInitialized = false;
    /** Non-SDF icon canvases registered in mapView.userImageCache (themed on LUT change). */
    private m_themedIconCanvases: HTMLCanvasElement[] = [];
    /** Pristine (pre-theme) pixels of each themed icon canvas. */
    private m_iconCanvasPristine = new WeakMap<HTMLCanvasElement, ImageData>();
    private m_runtime: MBStyleRuntime | null = null;
    private m_currentSourceId: string = '';
    private m_demTileUrl: string | null = null;
    private m_demTileSize: number = 256;
    private m_demMaxZoom: number = 22;
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
    private m_heatmapRenderer: any = null;
    /** Per-feature GLTF instantiation channel for `model` layers (mgl parity). */
    private m_modelRenderer: any = null;
    /** Standalone directional shadow pass (mgl shadow_renderer parity). */
    private m_shadowRenderer: any = null;
    /** Background fog gradient (mgl draw_background fog parity). */
    private m_backgroundFogRenderer: any = null;
    /** mgl atmosphere glow screen-space quad (pitch > 76). */
    private m_atmosphereRenderer: any = null;
    /** Set when loadModels() (async GLTF placement path) has finished. */
    private m_modelsLoaded = false;
    private m_additiveLineRenderer: any = null;
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
            // The DataSource default maxDisplayLevel (20) hides the whole
            // source above camera zoom 20 (isHidden → no tiles at all), e.g.
            // mapbox render-tests that style zoom ≥ 20 with a maxzoom-clamped
            // raster source. Allow the full mapbox zoom range (+1 flywave
            // offset) to display.
            maxDisplayLevel: 25,
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
     * True while any cached tile still has geometry loading. The render-test
     * harness polls this so multi-tile styles (e.g. gradient-vector-tile,
     * two sibling tiles decoded asynchronously) capture only after every
     * tile's ribbon/geometry made it into a frame — the single settled-frame
     * wait raced tile decoding (observed 6453..19502 mismatch variance for
     * byte-identical code).
     */
    tilesPending(): boolean {
        try {
            return this.getDecodedTiles().some(t =>
                !(t as any).disposed && !(t as any).allGeometryLoaded);
        } catch {
            return false;
        }
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
     * Wire the style's tile sources into the delegating data provider.
     *
     * A vector (MVT) source — when present — takes priority (binary tiles
     * cannot be merged with GeoJSON). Otherwise every GeoJSON-format source
     * (geojson / raster / hillshade / synthetic rect providers) is combined
     * into a single [[CompositeGeoDataProvider]] so multi-source styles (e.g.
     * a `rect` fill + a GeoJSON fill-extrusion) render all their layers.
     * Sets `m_currentSourceId` and `m_delegatingProvider.delegate`.
     */
    /**
     * Report a conservative maximum extrusion height to the engine.
     *
     * `DataSource.maxGeometryHeight` enlarges the tile bounding boxes used by
     * the frustum culling *before* tiles are decoded (FrustumIntersection).
     * Without it the boxes hug the ground plane, so at high pitch the tiles
     * nearest the camera — whose elevated content is still on screen — can be
     * culled. Per-tile precision comes from `DecodedTile.maxGeometryHeight`
     * (see MBTileDataEmitter); this scan only needs a safe upper bound.
     */
    private applyMaxGeometryHeight(style: StyleSpecification): void {
        let maxHeight = 0;
        for (const layer of style.layers ?? []) {
            const l = layer as any;
            if (l.type !== 'fill-extrusion' && l.type !== 'building' && l.type !== 'model') continue;
            maxHeight = Math.max(
                maxHeight,
                MBStyleDataSource.scanMaxNumber(l.paint?.['fill-extrusion-height'])
            );
            // Model layers: the GLTF asset height is only known after load
            // (MBModelRenderer refines this dynamically); until then use a
            // conservative bound so the near clip plane does not cut the
            // models closest to the camera (same failure mode as §F2a).
            if (l.type === 'model') maxHeight = Math.max(maxHeight, 30);
        }
        if (maxHeight > 0) {
            this.maxGeometryHeight = Math.max(this.maxGeometryHeight, maxHeight);
        }
    }

    /** Best-effort maximum numeric value reachable by a property/expression. */
    private static scanMaxNumber(value: any): number {
        if (typeof value === 'number') return value;
        if (value === null || typeof value !== 'object') return 0;
        // Legacy function {stops:[[zoom,value],...]} / property functions.
        if (Array.isArray(value.stops)) {
            let max = 0;
            for (const stop of value.stops) {
                max = Math.max(max, MBStyleDataSource.scanMaxNumber(stop?.[1] ?? stop));
            }
            return max;
        }
        if (Array.isArray(value)) {
            let max = 0;
            for (const item of value) {
                max = Math.max(max, MBStyleDataSource.scanMaxNumber(item));
            }
            return max;
        }
        return 0;
    }

    private async wireTileSources(style: StyleSpecification, sources: Map<string, ResolvedSource>): Promise<boolean> {
        this.applyMaxGeometryHeight(style);
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
            // Mapbox `tileSize: 512` semantic: a 512px tile covers the world of
            // a 256px tile one level down, so a camera zoom z loads data at
            // z-1. flywave couples the requested tile level and the decoder's
            // zoom-expression value to `storageLevelOffset`; -2 for 512px tiles
            // makes dataZoom = cameraZoom-2 (request z-1 tiles) while the
            // decoder evaluates zoom expressions at mapbox zoom (=level+1).
            const rawSpec = (style.sources as any)?.[bestVectorSourceId] as any;
            const tileSize = rawSpec?.tileSize ?? (source as any).tileSize ?? 256;
            const desiredOffset = tileSize > 256 ? -2 : -1;
            // TileDataSource.connect() later forwards storageLevelOffset to the
            // decoder (see TileDataSource.ts), which derives the zoom-expression
            // value from it — so just set the datasource offset here.
            this.storageLevelOffset = desiredOffset;
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

            return true;
        }

        // No vector source: combine every GeoJSON-format source.
        const composite = new CompositeGeoDataProvider();
        let currentSourceId = '';
        let hasRasterSource = false;

        for (const [sourceId, source] of sources) {
            if (source.type === 'geojson') {
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
                    composite.add(sourceId, new GeoJSONDataProvider(data, {
                        cluster: geoJsonSpec.cluster,
                        clusterRadius: geoJsonSpec.clusterRadius,
                        clusterMaxZoom: geoJsonSpec.clusterMaxZoom,
                        clusterProperties: (geoJsonSpec as any).clusterProperties,
                    }));
                    if (!currentSourceId) currentSourceId = sourceId;
                }
            } else if (source.type === 'raster') {
                hasRasterSource = true;
                const rasterSpec = (style.sources as any)[sourceId];
                const tiles = rasterSpec?.tiles ?? [];
                const tileUrl = tiles[0] ?? source.tileUrls[0] ?? '';
                if (tileUrl) {
                    const resolvedUrl = tileUrl.replace(/^local:\/\//, '/base/@flywave/flywave-mbstyle-datasource/test/rendering/integration/');
                    composite.add(sourceId, new RasterTileDataProvider(resolvedUrl,
                        rasterSpec?.minzoom ?? 0, rasterSpec?.maxzoom ?? 22));
                    this.m_rasterTileUrl = resolvedUrl;
                    if (!currentSourceId) currentSourceId = sourceId;
                }
            }
        }

        // Raster fixtures are stored at the CAMERA zoom level (dataZoom =
        // cameraZoom) rather than one level below like vector tiles — the
        // satellite fixtures carry the imagery a camera at zoom Z displays
        // (level Z = 256px = full viewport). flywave's default -1 offset would
        // request level cameraZoom-1 tiles (e.g. z16 for a z17 camera) that do
        // not exist, so raster-only styles need offset 0 to load the fixtures.
        if (hasRasterSource && this.m_styleParams.storageLevelOffset === undefined) {
            this.storageLevelOffset = 0;
        }

        // Hillshade: emit tile-covering polygons carrying the per-tile DEM url.
        const hasHillshade = (style.layers ?? []).some(
            (l: any) => l.type === 'hillshade' && (l.layout?.visibility ?? 'visible') === 'visible',
        );
        if (hasHillshade && this.m_demTileUrl) {
            const hillshadeLayer = (style.layers ?? []).find(
                (l: any) => l.type === 'hillshade',
            ) as any;
            const hillshadeSourceId: string = hillshadeLayer?.source ?? 'hillshade-dem';
            composite.add(hillshadeSourceId, new HillshadeTileDataProvider(this.m_demTileUrl, this.m_demTileSize));
            if (!currentSourceId) currentSourceId = hillshadeSourceId;
        }

        if (composite.size === 1) {
            // Single GeoJSON-format source: use the raw provider directly so the
            // tile data is delivered unmodified (no re-serialization).
            const only = composite.getSingleProvider();
            if (!only) return false;
            this.m_delegatingProvider.delegate = only;
        } else if (composite.size > 0) {
            this.m_delegatingProvider.delegate = composite;
        } else {
            return false;
        }

        this.m_currentSourceId = currentSourceId;

        await this.decoder.configure(undefined, {
            mbStyle: style,
            currentSourceId: currentSourceId,
            demTileUrl: this.m_demTileUrl,
            rasterTileUrl: this.m_rasterTileUrl,
        } as any);

        return true;
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
        this.pushMapboxZoom();

        // Create runtime styling API
        {
            // Mapbox color-theme LUT — propagate to the evaluator (paints)
            // and the environment (fog colors). Identity when absent.
            const { loadColorTheme } = require('./MBColorTheme');
            loadColorTheme(style).then((lut: any) => {
                // A null (no root theme) must not clobber a theme applied
                // meanwhile by a runtime setColorTheme op (async race).
                if (lut || !this.m_themeInitialized) this.applyColorTheme(lut);
                this.loadImportThemes(style);
            }).catch(() => {});
        }
        this.m_runtime = new MBStyleRuntime(style, () => {
            // On style change: reconfigure decoder and mark tiles dirty
            this.decoder.configure(undefined, {
                mbStyle: this.m_runtime!.style,
                currentSourceId: this.m_currentSourceId,
                pitch: this.m_runtime!.style.pitch ?? 0,
                brightness: this.m_environment?.brightness ?? 0,
                center: this.m_runtime!.style.center ?? [0, 0],
            } as any);
            // configure() re-created the decoder's internal evaluator —
            // the decoder re-applies the stored theme itself now.
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

        // Resolve the DEM source URL first — the hillshade provider (wired
        // inside wireTileSources) needs it.
        for (const [sourceId, source] of sources) {
            if (source.type === 'raster-dem') {
                const demSpec = (style.sources as any)[sourceId];
                const tiles = demSpec?.tiles ?? [];
                const tileUrl = tiles[0] ?? source.tileUrls[0] ?? '';
                if (tileUrl) {
                    this.m_demTileUrl = tileUrl.replace(/^local:\/\//, '/base/@flywave/flywave-mbstyle-datasource/test/rendering/integration/');
                    this.m_demTileSize = demSpec?.tileSize ?? 256;
                    this.m_demMaxZoom = demSpec?.maxzoom ?? source.maxzoom ?? 22;
                }
                break;
            }
        }

        // Load the sprite atlas BEFORE wiring tile sources: tile decoding
        // starts inside wireTileSources and the emitter reads the sprite
        // registry (image availability, pattern tile sizes) at decode time —
        // loading it after races and drops line-pattern entirely.
        if (style.sprite) {
            await this.loadSpriteAtlas(style.sprite);
            this.m_lastAppliedSprite = style.sprite;
        }

        // Wire the style's tile sources (vector priority, else a composite of
        // all GeoJSON-format sources). Sets m_currentSourceId and delegate.
        await this.wireTileSources(style, sources);

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
            // applyBackgroundColor ran before the environment existed; re-run it
            // now that lighting3DState is configured so the background clear
            // color picks up the 3D-lights ground radiance.
            this.applyBackgroundColor(style);
            this.m_environment.setStyleHasBackground(this.styleHasBackgroundLayer(style), this.styleHasContentLayers(style));
            try {
                const { MBAtmosphereRenderer } = require('./MBAtmosphereRenderer');
                // §228: stand down only when a geojson source's tiles can
                // cover the ground to the horizon (world-wide geometry);
                // raster sources have limited tile extent and still need
                // the glow quad for their sky region.
                const hasGeojsonContent = Object.values(style.sources ?? {}).some(
                    (src: any) => (src as any)?.type === 'geojson');
                MBAtmosphereRenderer.contentStandDown =
                    this.styleHasContentLayers(style) && hasGeojsonContent;
            } catch {}
            this.m_environment.applyFog(style.fog, style.zoom ?? 0);
            // A `sky` layer's paint drives the skybox (gradient/atmosphere),
            // mirroring mapbox's sky_style_layer. The top-level `style.sky`
            // (fog-driven atmosphere) takes precedence when both exist.
            this.m_environment.applySky(
                this.buildSkyFromLayers(style) ?? style.sky,
                style.fog,
            );

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
                bearing: style.bearing ?? 0,
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

            // Two-pass density→ramp heatmap renderer. `run()` early-returns when
            // no decoded tile carries heatmap kernels, so non-heatmap styles are
            // unaffected.
            try {
                const { MBHeatmapRenderer } = await import('./MBHeatmapRenderer');
                self.m_heatmapRenderer = new MBHeatmapRenderer(this.mapView, self);
            } catch {}

            try {
                const { MBAdditiveLineRenderer } = await import('./MBAdditiveLineRenderer');
                self.m_additiveLineRenderer = new MBAdditiveLineRenderer(this.mapView, self);
            } catch {}

            // Per-feature GLTF model instantiation (mgl `model` layers over
            // vector sources, resolved through the root `style.models`
            // registry). `run()` early-returns when no decoded tile carries
            // model placements, so non-model styles are unaffected.
            try {
                const { MBModelRenderer } = await import('./MBModelRenderer');
                self.m_modelRenderer = new MBModelRenderer(this.mapView, self);
                self.updateModelRegistry(style);
            } catch {}

            // Standalone shadow pass (mgl shadow_renderer): active only when
            // 3D lights carry cast-shadows + shadow-intensity > 0.
            try {
                const { MBShadowRenderer } = await import('./MBShadowRenderer');
                self.m_shadowRenderer = new MBShadowRenderer(this.mapView, self);
            } catch {}

            // Background fog gradient (mgl draw_background + fog): a far-plane
            // quad filling only un-rendered background fragments with the
            // ray∩ground fog gradient. Early-returns when fog is off.
            try {
                const { MBBackgroundFogRenderer } = await import('./MBBackgroundFogRenderer');
                // Query the CURRENT environment (self.m_environment) — a
                // captured env0 goes stale when the environment is re-created
                // on style re-application, and the quad then renders with the
                // old fog/sky state (horizon-blend family, §186).
                self.m_backgroundFogRenderer = new MBBackgroundFogRenderer(
                    this.mapView,
                    () => self.m_environment?.backgroundFogState ?? null,
                );
            } catch {}

            // mgl atmosphere glow as a screen-space quad (pitch > 76 where
            // the engine's object filtering drops the legacy dome, §182b).
            try {
                const { MBAtmosphereRenderer } = await import('./MBAtmosphereRenderer');
                // Same stale-env hazard as the background-fog quad above.
                self.m_atmosphereRenderer = new MBAtmosphereRenderer(
                    this.mapView,
                    () => self.m_environment?.atmosphereState ?? null,
                );
            } catch {}

            const placement = this.m_symbolPlacement;
            this.mapView.addEventListener(MapViewEventNames.AfterRender, () => {
                patcher.patchTileMaterials();
                if (placement) placement.run();
                if (self.m_heatmapRenderer) {
                    self.m_heatmapRenderer.run();
                }
                if (self.m_additiveLineRenderer) {
                    self.m_additiveLineRenderer.run();
                }
                if (self.m_modelRenderer) {
                    self.m_modelRenderer.run();
                }

                if (self.m_atmosphereRenderer) {
                    self.m_atmosphereRenderer.run();
                }
                if (self.m_backgroundFogRenderer) {
                    self.m_backgroundFogRenderer.run();
                }
                if (self.m_shadowRenderer) {
                    const sl = self.m_environment?.shadowLightState;
                    self.m_shadowRenderer.setLightState(!!sl, sl?.intensity ?? 0);
                    self.m_shadowRenderer.run();
                }
                if (self.m_debugTileBoundaries) self.drawTileBoundaries();
                const tc = self.m_environment?.terrainController;
                if (tc && tc.isMorphing) {
                    tc.updateMorphing(Date.now());
                }
                // Push the live mapbox camera zoom to the decoder so camera
                // functions (icon-size/text-size stops, dynamic-filter) evaluate
                // at the continuous zoom, not the floored integer tile level.
                self.pushMapboxZoom();
                // TerrainDraping has its own AfterRender listener that
                // detects mesh count changes + morphing completion + lazy
                // bake — no manual trigger needed here.
            });
        }

        this.m_modelsLoaded = false;
        await this.loadModels(style).finally(() => { this.m_modelsLoaded = true; });

        if (this.m_environment && style.terrain) {
            await this.m_environment.applyTerrain(
                style.terrain as any,
                this.m_demTileUrl,
                style.zoom ?? 8,
                style.center ?? [0, 0],
                this.m_demMaxZoom,
                this.m_demTileSize,
            );
            // Terrain elevation must reach the engine's clip-plane evaluation
            // (the terrain mesh is not a Tile, so tile geoBoxes never carry
            // it). Without it the far plane hugs the 0-elevation horizon and
            // mid-range terrain at high pitch is clipped away (sky where the
            // map should be) — mgl uses terrain elevation in the transform's
            // horizon/far-plane math.
            const terrainMax = (this.m_environment as any).terrainController?.maxElevation ?? 0;
            // The terrain meshes only exist now — re-run applyBackgroundColor
            // so their base color picks up the (themed, lit) background.
            try { this.applyBackgroundColor(style); } catch {}
            if (terrainMax > 0) {
                this.maxGeometryHeight = Math.max(this.maxGeometryHeight, terrainMax);
                // MapView-level clip-plane elevation (the VisibleTileSet reads
                // MapView.maxGeometryHeight, not per-datasource values).
                const mv: any = this.mapView;
                const prev = (mv as any).m_maxGeometryHeight ?? 0;
                mv.maxGeometryHeight = Math.max(prev, terrainMax);
            }
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

    /**
     * Publish the modelId → url registry (root-level `style.models`, mgl v8
     * semantic: `models: { oak: "local://models/oak1.glb", ... }`) plus any
     * `models` maps on `type: "model"` sources, resolved and rewritten, to the
     * MBModelRenderer — the per-feature instantiation channel for model
     * layers over vector sources.
     */
    private updateModelRegistry(style: StyleSpecification): void {
        if (!this.m_modelRenderer) return;
        const LOCAL = '/base/@flywave/flywave-mbstyle-datasource/test/rendering/integration/';
        const resolveUrl = (u: string) => u?.replace(/^local:\/\//, LOCAL) ?? '';
        const registry = new Map<string, string>();
        const addEntry = (id: string, def: any) => {
            const uri = typeof def === 'string' ? def : def?.uri;
            if (typeof uri === 'string' && uri) registry.set(id, resolveUrl(uri));
        };
        const rootModels = (style as any).models;
        if (rootModels && typeof rootModels === 'object') {
            for (const [id, def] of Object.entries(rootModels)) addEntry(id, def);
        }
        for (const source of Object.values((style.sources as any) ?? {})) {
            const models = (source as any)?.models;
            if (models && typeof models === 'object') {
                for (const [id, def] of Object.entries(models)) addEntry(id, def);
            }
        }
        this.m_modelRenderer.setModelRegistry(registry);
        this.m_modelRenderer.setLayers?.((style.layers ?? []) as any[]);
        // Placements only come from model layers over vector/geojson sources.
        const expectPlacements = (style.layers ?? []).some((l: any) =>
            l.type === 'model' && (style.sources as any)?.[l.source]?.type !== 'model');
        this.m_modelRenderer.setExpectPlacements?.(expectPlacements);
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

            // Collect model definitions: inline `models` map in the layer, a
            // `type: "model"` source's `models` registry, or from the
            // referenced source's data/url.
            const modelDefs: Array<{
                url: string;
                position: number[];
                orientation?: number[];
                scale?: number | number[];
            }> = [];

            // Inline models (mapbox HD: layer.models = { id: { uri, position } })
            const inlineModels = (layer as any).models;
            if (inlineModels && typeof inlineModels === 'object') {
                for (const m of Object.values(inlineModels) as any[]) {
                    if (m.uri) {
                        modelDefs.push({ url: resolveUrl(m.uri), position: m.position ?? [] });
                    }
                }
            }

            // `type: "model"` source registry (mgl v8):
            // sources.model.models = { id: { uri, position, orientation, scale } }
            // — each entry is instantiated once at its own position.
            if (modelDefs.length === 0) {
                const sourceId = (layer as any).source;
                const source = sourceId ? (style.sources as any)[sourceId] : null;
                const sourceModels = source?.models;
                if (sourceModels && typeof sourceModels === 'object') {
                    for (const m of Object.values(sourceModels) as any[]) {
                        if (m?.uri) {
                            modelDefs.push({
                                url: resolveUrl(m.uri),
                                position: m.position ?? [],
                                orientation: m.orientation,
                                scale: m.scale,
                            });
                        }
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
                const { GeoCoordinates } = await import('@flywave/flywave-geoutils');
                const projection = (this.mapView as any).projection;

                for (const def of modelDefs) {
                    if (!def.url) continue;
                    let gltf: any;
                    try { gltf = await loader.loadAsync(def.url); } catch { continue; }

                    const model = gltf.scene.clone(true);
                    // Float32 frustum culling at world-scale coordinates is
                    // meters-off and flips between frames (see
                    // MBModelRenderer.instantiate) — rely on GPU clipping.
                    model.traverse((o: any) => { o.frustumCulled = false; });
                    // mgl themes models on the GPU over the whole glTF
                    // (draw_model.ts APPLY_LUT_ON_GPU); we bake CPU-side into
                    // material colors + texture maps (model-color-use-theme
                    // opt-out honored).
                    try {
                        // Theme from a PRISTINE snapshot so this is
                        // idempotent and can be re-run when the (async)
                        // import-scoped LUTs resolve after model load.
                        this.m_loadedModels.push({ model, layer: layer as any });
                        this.applyThemeToModel(model, layer as any);
                    } catch {}
                    const lng = def.position[0] ?? 0;
                    const lat = def.position[1] ?? 0;
                    const z = def.position[2] ?? 0;

                    if (projection) {
                        const geoCoord = new GeoCoordinates(lat, lng);
                        const worldPos = projection.projectPoint(geoCoord);
                        model.position.set(worldPos.x, worldPos.y, (worldPos as any).z ?? z);
                    }

                    // Scale: scalar or [x,y,z] — layout `model-scale` or the
                    // source registry entry's own `scale`.
                    const effScale = def.scale ?? modelScale;
                    if (Array.isArray(effScale)) {
                        model.scale.set(effScale[0] ?? 1, effScale[1] ?? 1, effScale[2] ?? 1);
                    } else if (effScale !== undefined) {
                        model.scale.setScalar(effScale);
                    }

                    // Rotation: [x,y,z] Euler angles in degrees — layout
                    // `model-rotation` or the registry entry's `orientation`.
                    const effRotation = def.orientation ?? modelRotation;
                    if (Array.isArray(effRotation)) {
                        model.rotation.set(
                            (effRotation[0] ?? 0) * Math.PI / 180,
                            (effRotation[1] ?? 0) * Math.PI / 180,
                            (effRotation[2] ?? 0) * Math.PI / 180,
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
    /**
     * True while MBModelRenderer still has unplaced model features (async
     * GLTF/Draco loads) — the render-test harness polls this before capture.
     */
    modelsPending(): boolean {
        const r = this.m_modelRenderer;
        if (!r) return !this.m_modelsLoaded;
        if (r.isLoading()) return true;
        // Vector model layers deliver placements through the transient
        // decoded-tile stash — run() may observe them only after the engine
        // reports tiles settled, so wait for the first observation too.
        if (r.expectPlacements && !r.sawPlacements?.()) return true;
        return !this.m_modelsLoaded;
    }

    get runtime(): MBStyleRuntime | null {
        return this.m_runtime;
    }

    /**
     * Apply a Mapbox color-theme at runtime (test operation `setColorTheme`,
     * equivalent of mgl map.setColorTheme). The theme is `{ data: <base64
     * PNG> }` or `{ data: null }` to remove. Decodes asynchronously, then
     * propagates the LUT to the evaluator (paints) and environment (fog
     * colors) and re-renders.
     */
    setColorTheme(theme: { data?: string | null } | null): void {
        const { loadColorTheme } = require('./MBColorTheme');
        if (!theme || theme.data === undefined || theme.data === null) {
            // Explicit removal clears the theme.
            (this.m_runtime as any).m_runtimeThemeOverride = true;
            this.applyColorTheme(null);
            return;
        }
        (this.m_runtime as any).m_runtimeThemeOverride = true;
        // Returns a promise settling once the theme has (or has failed to)
        // propagate, so callers can deterministically await before capture.
        return loadColorTheme({ 'color-theme': theme }).then((lut: any) => {
            // mgl keeps the previous LUT when decoding a broken theme
            // (style.ts:1592-1600 correlation guard).
            if (lut) this.applyColorTheme(lut);
        }).catch(() => {});
    }

    /**
     * Per-import theme override (mgl map.setImportColorTheme /
     * style.ts:4351-4356). theme=null falls back to the imported
     * stylesheet's own color-theme; theme={data:null} clears it.
     */
    setImportColorTheme(importId: string, theme: { data?: string | any[] | null } | null): Promise<void> {
        const { loadColorTheme } = require('./MBColorTheme');
        const style = this.m_runtime?.style as any;
        // mgl: override=null falls back to the imported STYLESHEET's own
        // color-theme (data['color-theme']) — NOT the import spec's, which is
        // itself an override channel.
        if (!theme || theme.data === undefined || theme.data === null) {
            const own = (style?.imports ?? []).find((i: any) => i.id === importId)?.data?.['color-theme'] ?? null;
            if (own && own.data) {
                return loadColorTheme({ 'color-theme': own, _config: style?._config }).then((lut: any) => {
                    this.m_importLuts.set(importId, lut);
                    this.propagateScopedThemes();
                });
            }
            this.m_importLuts.set(importId, null);
            this.propagateScopedThemes();
            return Promise.resolve();
        }
        return loadColorTheme({ 'color-theme': theme, _config: style?._config }).then((lut: any) => {
            this.m_importLuts.set(importId, lut ?? null);
            this.propagateScopedThemes();
        });
    }

    /** Theme a loaded glTF from its pristine snapshot (idempotent). */
    private applyThemeToModel(model: any, layer: any): void {
        try {
            const useTheme = layer?.paint?.['model-color-use-theme'] ?? 'default';
            const modelLut = (layer?._importScope && this.m_importLuts.has(layer._importScope))
                ? this.m_importLuts.get(layer._importScope)
                : this.m_colorThemeLut;
            if (!modelLut || useTheme === 'none') return;
            const { applyColorTheme, applyColorThemeToPixels } = require('./MBColorTheme');
            model.traverse((o: any) => {
                const mat = o.material;
                if (!mat) return;
                for (const mk of ['color', 'emissive']) {
                    if (!mat[mk] || !mat[mk].isColor) continue;
                    if (!mat.userData?._mbPristine?.[mk]) {
                        mat.userData = mat.userData ?? {};
                        mat.userData._mbPristine = mat.userData._mbPristine ?? {};
                        mat.userData._mbPristine[mk] = mat[mk].clone();
                    }
                    const css = mat.userData._mbPristine[mk].getStyle(THREE.SRGBColorSpace);
                    mat[mk].setStyle(applyColorTheme(modelLut, css), THREE.SRGBColorSpace);
                }
                for (const tk of ['map', 'emissiveMap']) {
                    const tex = mat[tk];
                    const img: any = tex?.image;
                    if (!tex || !img) continue;
                    if (!tex.userData?._mbPristineCanvas) {
                        try {
                            const cv = document.createElement('canvas');
                            cv.width = img.width ?? img.videoWidth ?? 1;
                            cv.height = img.height ?? img.videoHeight ?? 1;
                            const cx = cv.getContext('2d')!;
                            cx.drawImage(img, 0, 0);
                            tex.userData = tex.userData ?? {};
                            tex.userData._mbPristineCanvas = cv;
                        } catch { continue; }
                    }
                    const pristine: HTMLCanvasElement = tex.userData._mbPristineCanvas;
                    const cv = document.createElement('canvas');
                    cv.width = pristine.width;
                    cv.height = pristine.height;
                    const cx = cv.getContext('2d')!;
                    cx.drawImage(pristine, 0, 0);
                    const id = cx.getImageData(0, 0, cv.width, cv.height);
                    applyColorThemeToPixels(modelLut, id.data);
                    cx.putImageData(id, 0, 0);
                    const nt = new THREE.Texture(cv);
                    nt.needsUpdate = true;
                    nt.flipY = tex.flipY;
                    (nt as any).colorSpace = (tex as any).colorSpace;
                    (nt as any).wrapS = tex.wrapS;
                    (nt as any).wrapT = tex.wrapT;
                    (nt as any).userData = { _mbPristineCanvas: pristine };
                    mat[tk] = nt;
                }
            });
        } catch {}
    }

    /** Load every per-import theme recorded by mergeImports. */
    private loadImportThemes(style: any): void {
        const { loadColorTheme } = require('./MBColorTheme');
        const themes = style?._importThemes ?? {};
        let pending = 0;
        for (const [id, theme] of Object.entries(themes)) {
            if (!theme || !(theme as any).data) {
                this.m_importLuts.set(id, null);
                continue;
            }
            pending++;
            loadColorTheme({ 'color-theme': theme, _config: style?._config })
                .then((lut: any) => this.m_importLuts.set(id, lut))
                .catch(() => this.m_importLuts.set(id, null))
                .finally(() => {
                    if (--pending === 0) this.propagateScopedThemes();
                });
        }
        if (pending === 0) this.propagateScopedThemes();
    }

    /** Push scoped LUTs to the evaluator + environment (fog/lights scopes). */
    private propagateScopedThemes(): void {
        const style: any = this.m_runtime?.style ?? (this.m_styleManager as any).m_style;
        const evaluator: any = this.m_runtime?.evaluator;
        if (evaluator) {
            for (const [id, lut] of this.m_importLuts) {
                evaluator.setColorThemeScope?.(id, lut);
            }
        }
        (this.decoder as any).setColorTheme?.(this.m_colorThemeLut, this.m_importLuts);
        // Fog/lights resolve their theme from their OWN import scope when the
        // merged fog/lights came from an import (mgl fog.scope / light.scope).
        const fogScope = style?._fogImportScope;
        const fogLut = (fogScope && this.m_importLuts.has(fogScope))
            ? this.m_importLuts.get(fogScope)
            : this.m_colorThemeLut;
        this.m_environment?.setColorTheme(fogLut ?? null);
        const lightsScope = style?._lightsImportScope;
        const lightsLut = (lightsScope && this.m_importLuts.has(lightsScope))
            ? this.m_importLuts.get(lightsScope)
            : this.m_colorThemeLut;
        this.m_environment?.setLightsColorTheme(lightsLut ?? null);
        if (this.m_environment) {
            try {
                this.m_environment.applyLights(style?.lights, style?.light);
                this.m_environment.setStyleHasBackground(this.styleHasBackgroundLayer(style), this.styleHasContentLayers(style));
                this.m_environment.applyFog(style?.fog, style?.zoom ?? 0);
                // Re-run applySky ONLY when a scoped theme actually exists —
                // re-applying an (absent) sky on every theme propagation
                // replaces the fog-driven atmosphere dome and regressed the
                // whole fog domain (fog/2d/basic 22.7k→45.5k).
                const anyScopedLut = [...this.m_importLuts.values()].some(Boolean);
                if (anyScopedLut || this.m_colorThemeLut) {
                    this.m_environment.applySky(
                        this.buildSkyFromLayers(style) ?? style?.sky, style?.fog);
                }
            } catch {}
        }
        // Background clear color picks up the (scoped) LUT as well.
        try {
            const st: any = style;
            if (st && this.m_environment) this.applyBackgroundColor(st);
        } catch {}
        // Re-bake sprites: an import-supplied sprite must pick up the import
        // LUT even when the root has no theme.
        this.bakeThemeIntoSprites(undefined);
        // Re-theme models with the (now-resolved) scoped LUTs.
        for (const { model, layer } of this.m_loadedModels) {
            this.applyThemeToModel(model, layer);
        }
        // …including the per-feature MBModelRenderer instances.
        try {
            this.m_modelRenderer?.retheme?.();
        } catch {}
        this.mapView?.markTilesDirty?.(this as any);
        this.mapView?.update?.();
    }

    /**
     * Propagate a (possibly null) color-theme LUT everywhere it matters:
     * evaluator (paint colors), environment (fog), and baked into the sprite
     * atlas + registered icon canvases (mgl themes sprite/pattern images via
     * the GPU LUT on sample; we bake CPU-side). Bumping the theme generation
     * invalidates pattern-texture extractions keyed on it.
     */
    private applyColorTheme(lut: import('./MBColorTheme').ColorThemeLut | null): void {
        this.m_colorThemeLut = lut;
        this.m_themeInitialized = true;
        const { bumpThemeGeneration } = require('./MBColorTheme');
        this.m_runtime?.evaluator.setColorTheme(lut);
        // The decoder owns its OWN internal MBLayerEvaluator (created per
        // configure) — background/fill techniques come from it. The decoder
        // stores the theme itself and re-applies it across configure() calls.
        (this.decoder as any).setColorTheme?.(lut, this.m_importLuts);
        this.m_environment?.setColorTheme(lut);
        // The background renders as the clear color (not a layer material),
        // so it must be re-resolved whenever the theme changes.
        try {
            const st: any = this.m_runtime?.style ?? (this.m_styleManager as any).m_style;
            if (st && this.m_environment) this.applyBackgroundColor(st);
        } catch {}
        this.bakeThemeIntoSprites(lut);
        this.mapView?.markTilesDirty?.(this as any);
        this.mapView?.update?.();
    }

    /**
     * Bake the theme into the sprite atlas + icon canvases (mgl themes
     * sprite/pattern images on the GPU at sample time; we bake CPU-side).
     * With no ROOT theme but a themed import supplying the sprite, the
     * import's LUT themes the shared atlas.
     */
    private bakeThemeIntoSprites(lut: import('./MBColorTheme').ColorThemeLut | null | undefined): void {
        let bakeLut = lut === undefined ? this.m_colorThemeLut : lut;
        if (!bakeLut) {
            for (const l of this.m_importLuts.values()) {
                if (l) { bakeLut = l; break; }
            }
        }
        const { bumpThemeGeneration, applyColorThemeToPixels } = require('./MBColorTheme');
        try {
            this.m_spriteAtlas?.applyColorTheme(bakeLut ?? null);
            for (const cv of this.m_themedIconCanvases) {
                const ctx = cv.getContext('2d');
                if (!ctx) continue;
                let pristine = this.m_iconCanvasPristine.get(cv);
                if (!pristine) {
                    pristine = ctx.getImageData(0, 0, cv.width, cv.height);
                    this.m_iconCanvasPristine.set(cv, pristine);
                }
                const img = ctx.createImageData(pristine.width, pristine.height);
                img.data.set(pristine.data);
                if (bakeLut) applyColorThemeToPixels(bakeLut, img.data);
                ctx.putImageData(img, 0, 0);
            }
            bumpThemeGeneration();
        } catch {}
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
        MBExpressionEngine.addAvailableImage(name);
        const w = (image as any).width ?? 0;
        const h = (image as any).height ?? 0;
        if (w > 0 && h > 0) {
            // Keep the pattern-size registry in sync for runtime-added images.
            const cur = (MBTileDataEmitter as any).s_spriteInfos as Map<string, any> | null;
            cur?.set(name, { width: w, height: h });
        }
        // PoiRenderer looks icons up in mapView.userImageCache (theme+user
        // caches) by technique imageTextureName — runtime addImage must
        // register there too (the setStyle path does this at line ~1950),
        // otherwise the icon geometry renders but never paints.
        try {
            const userImageCache = (this.mapView as any)?.userImageCache;
            if (userImageCache && typeof userImageCache.addImage === 'function') {
                userImageCache.addImage(name, image as any);
            }
        } catch {}
        return this.m_spriteAtlas?.addIcon(name, image as any) ?? false;
    }

    /** Runtime removeImage: remove an icon from the sprite atlas. */
    removeImage(name: string): boolean {
        MBExpressionEngine.removeAvailableImage(name);
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
                color: 0xff0000, transparent: true, depthTest: false, depthWrite: false,
            });
            this.m_debugLines = new THREE.LineSegments(geom, mat);
            this.m_debugLines.frustumCulled = false;
            this.m_debugLines.renderOrder = 9998;
            // RTE: m_sceneRoot carries the negative world anchor — absolute
            // world-space positions render camera-relative through it (§204).
            const sceneRoot = (this.mapView as any).m_sceneRoot;
            (sceneRoot ?? scene).add(this.m_debugLines);
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
            // World is z-up (x east, y north) — boundary rects on z=0.
            positions.push(x0, y0, 0, x1, y0, 0, x1, y0, 0, x1, y1, 0, x1, y1, 0, x0, y1, 0, x0, y1, 0, x0, y0, 0);
        }

        const geo = this.m_debugLines.geometry;
        geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        geo.attributes.position.needsUpdate = true;
    }

    /**
     * mgl tile-level fog culling (painter._updateFog + transform.ts:1644):
     * full-opacity fog with horizon-blend >= 0.03 culls tiles whose farthest
     * AABB point lies beyond start + (end-start)*0.78 (FOV-shifted fog
     * units). Applied through the engine's opt-in tileVisibilityFilter —
     * the renderedTiles Map only exists DURING the render pass (§206), so
     * an AfterRender-time toggle can never reach it.
     */
    private applyFogTileCulling(): void {
        // DISABLED (§206): the engine hook works (equal-range's tiles were
        // culled through it) but the culling fixtures' content bypasses the
        // renderedTiles loop entirely — activating this only regressed
        // equal-range. Re-enable after locating those fixtures' render path.
        return;
        const state = (this.m_environment as any)?.backgroundFogState as any;
        const mv: any = this.mapView as any;
        if (!state || !mv) return;
        if (!state.enabled || state.alpha < 0.999 || state.hbRaw < 0.03) {
            mv.tileVisibilityFilter = undefined;
            return;
        }
        const shift = state.shift as number;
        const start = state.r0 + shift;
        const end = state.r1 + shift;
        const cullFogUnits = start + (end - start) * 0.78;
        // Raw fog-matrix semantics (NO kFog — that folds the CONTENT fog
        // calibration only): depth = shift * metricDist / distCam.
        const cullMetric = cullFogUnits * state.distCam / shift;
        const camPos = mv.camera?.position as { x: number; y: number; z: number } | undefined;
        const sceneRoot = mv.m_sceneRoot?.position as { x: number; y: number } | undefined;
        if (!camPos) return;
        const cam = sceneRoot
            ? { x: camPos.x - sceneRoot.x, y: camPos.y - sceneRoot.y, z: camPos.z }
            : { x: camPos.x, y: camPos.y, z: camPos.z };
        const EarthConstants = require('@flywave/flywave-geoutils').EarthConstants;
        const C = EarthConstants.EQUATORIAL_CIRCUMFERENCE;
        mv.tileVisibilityFilter = (tile: any): boolean => {
            const tk = tile?.tileKey;
            if (!tk) return true;
            const n = Math.pow(2, tk.level);
            const ts = C / n;
            const fx = Math.max(Math.abs(tk.column * ts - cam.x), Math.abs((tk.column + 1) * ts - cam.x));
            const fy = Math.max(Math.abs(C - (tk.row + 1) * ts - cam.y), Math.abs(C - tk.row * ts - cam.y));
            const d = Math.sqrt(fx * fx + fy * fy + cam.z * cam.z);
            return d <= cullMetric;
        };
    }

    private async loadSpriteAtlas(spriteUrl: string): Promise<void> {
        const spriteData = await this.m_styleManager.loadSprite(spriteUrl);
        this.m_themedIconCanvases = [];
        if (spriteData) {
            const icons = new Map<string, any>();
            for (const [name, info] of Object.entries(spriteData.json)) {
                icons.set(name, info);
            }
            // Publish the icon names to the expression engine so `["image", …]`
            // can resolve availability (coalesce fallback chains), and the
            // sprite pixel sizes to the emitter for line-pattern tiling.
            MBExpressionEngine.setAvailableImages(new Set(icons.keys()));
            const spriteInfos = new Map<string,
                { width: number; height: number; pixelRatio?: number }>();
            for (const [name, info] of icons) {
                spriteInfos.set(name, {
                    width: info.width,
                    height: info.height,
                    pixelRatio: (info as any).pixelRatio,
                });
            }
            MBTileDataEmitter.setSpriteInfos(spriteInfos);
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
                                if (info.sdf === true) {
                                    // SDF icons store the distance field in
                                    // the alpha channel (edge at 0.75≈192).
                                    // Keep the raw field (RGB → white for
                                    // vertex-color tinting) so the POI renderer
                                    // can reconstruct the glyph + halo from it;
                                    // the ImageItem is flagged as sdf.
                                    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                                    const d = imgData.data;
                                    for (let p = 0; p < d.length; p += 4) {
                                        d[p] = 255;
                                        d[p + 1] = 255;
                                        d[p + 2] = 255;
                                    }
                                    ctx.putImageData(imgData, 0, 0);
                                    const item = userImageCache.addImage(name, canvas);
                                    if (item && typeof (item as any).then !== 'function') {
                                        (item as any).sdf = true;
                                    }
                                    continue;
                                }
                                userImageCache.addImage(name, canvas);
                                // Non-SDF icons are themeable (mgl applies
                                // the LUT to the sampled sprite texel).
                                this.m_themedIconCanvases.push(canvas);
                            }
                        } catch {}
                    }
                }
            }
        }

        // The color-theme may have decoded before the sprite atlas finished
        // loading — bake it now so late atlases are themed too.
        if (this.m_colorThemeLut && this.m_spriteAtlas) {
            try {
                this.m_spriteAtlas.applyColorTheme(this.m_colorThemeLut);
                const { applyColorThemeToPixels, bumpThemeGeneration } = require('./MBColorTheme');
                for (const cv of this.m_themedIconCanvases) {
                    const ctx = cv.getContext('2d');
                    if (!ctx) continue;
                    this.m_iconCanvasPristine.set(cv, ctx.getImageData(0, 0, cv.width, cv.height));
                    const img = ctx.createImageData(cv.width, cv.height);
                    img.data.set(this.m_iconCanvasPristine.get(cv)!.data);
                    applyColorThemeToPixels(this.m_colorThemeLut, img.data);
                    ctx.putImageData(img, 0, 0);
                }
                bumpThemeGeneration();
                this.mapView?.markTilesDirty?.(this as any);
                this.mapView?.update?.();
            } catch {}
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
            this.applyBackgroundColor(style);
            this.m_environment.setStyleHasBackground(this.styleHasBackgroundLayer(style), this.styleHasContentLayers(style));
            this.m_environment.applyFog(style.fog, style.zoom ?? 0);
            this.m_environment.applySky(
                this.buildSkyFromLayers(style) ?? style.sky,
                style.fog,
            );
        }

        // Terrain: re-apply if terrain spec changed.
        if (this.m_environment && style.terrain) {
            try {
                await this.m_environment.applyTerrain(
                    style.terrain as any,
                    this.m_demTileUrl,
                    style.zoom ?? 8,
                    style.center ?? [0, 0],
                    this.m_demMaxZoom,
                    this.m_demTileSize,
                );
            } catch {}
        }

        // Models: re-load + refresh the per-feature renderer registry.
        try {
            this.updateModelRegistry(style);
        } catch {}
        this.m_modelsLoaded = false;
        try {
            await this.loadModels(style);
        } catch {}
        this.m_modelsLoaded = true;

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

    /**
     * Release GPU resources held by the heatmap renderer (density render
     * target, ramp textures) before the base class tears down providers.
     */
    override dispose(): void {
        this.m_heatmapRenderer?.dispose?.();
        this.m_additiveLineRenderer?.dispose?.();
        this.m_heatmapRenderer = null;
        super.dispose();
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
            bearing: style.bearing ?? 0,
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
     * Extract the skybox spec from `sky` layers (mapbox sky_style_layer paint),
     * mirroring how mapbox renders a sky layer. Returns the merged spec or
     * `undefined` when no sky layer exists.
     */

    /** A visible background layer acts as mgl's opaque below-horizon cover. */
    private styleHasBackgroundLayer(style: any): boolean {
        return (style?.layers ?? []).some((l: any) =>
            l?.type === 'background' && (l?.layout?.visibility ?? 'visible') !== 'none');
    }

    /** Any visible layer besides `background` — content tiles carry their
     * own fog then (mgl semantics); the background-fog quad stands down. */
    private styleHasContentLayers(style: any): boolean {
        return (style?.layers ?? []).some((l: any) =>
            l?.type !== 'background' && (l?.layout?.visibility ?? 'visible') !== 'none');
    }

    private buildSkyFromLayers(style: StyleSpecification): any {
        const skyLayers = (style.layers ?? []).filter((l: any) => l.type === 'sky');
        if (skyLayers.length === 0) return undefined;
        // Mapbox renders sky layers in order; the last sky layer's paint wins
        // for properties not overridden by earlier layers. All paints share the
        // same property keys, so a simple last-wins merge matches the common
        // case (tests use a single sky layer).
        const paint: any = {};
        for (const layer of skyLayers) {
            Object.assign(paint, (layer as any).paint ?? {});
        }
        // Defaults from style-spec v8 paint_sky: sky-type atmosphere,
        // sun-intensity 10, atmosphere/halo colors white; sky-atmosphere-sun
        // defaults to the style light position (environment fallback), so it
        // is only forwarded when the paint sets it.
        const out: any = {
            'sky-type': paint['sky-type'] ?? 'atmosphere',
            'sky-gradient': paint['sky-gradient'] ?? 'interpolate',
            'sky-gradient-center': paint['sky-gradient-center'] ?? [0, 0],
            'sky-gradient-radius': paint['sky-gradient-radius'] ?? 90,
            'sky-opacity': paint['sky-opacity'] ?? 1,
            'sky-atmosphere-sun-intensity': paint['sky-atmosphere-sun-intensity'] ?? 10,
            'sky-atmosphere-color': paint['sky-atmosphere-color'] ?? '#ffffff',
            'sky-atmosphere-halo-color': paint['sky-atmosphere-halo-color'] ?? '#ffffff',
        };
        if (paint['sky-atmosphere-sun'] !== undefined) {
            out['sky-atmosphere-sun'] = paint['sky-atmosphere-sun'];
        }
        return out;
    }

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
                // Color-theme: the background goes through the same LUT as
                // every other `-color` paint (mgl themes the background
                // layer's clear color too); honor the layer's import scope.
                if (paint['background-color-use-theme'] !== 'none') {
                    const scope = (layer as any)._importScope;
                    const lut = (scope && this.m_importLuts.has(scope))
                        ? this.m_importLuts.get(scope)
                        : this.m_colorThemeLut;
                    if (lut) {
                        try {
                            const { applyColorTheme } = require('./MBColorTheme');
                            color = applyColorTheme(lut, color);
                        } catch {}
                    }
                }
                if (this.mapView) {
                    const c = new THREE.Color(color);
                    // Mapbox 3D `lights` (lighting-3d-mode): the background is a
                    // ground layer → `color * u_ground_radiance` (mix toward
                    // `color` by background-emissive-strength), matching the
                    // shader injection applied to other ground layers.
                    const ls = this.m_environment?.lighting3DState;
                    if (ls) {
                        const rad = ls.groundRadiance;
                        // `c` is linear (ColorManagement) and `getHex()`
                        // converts back to sRGB, so multiplying by the LINEAR
                        // radiance (rad^2.2) yields the mapbox sRGB result
                        // `color_srgb · groundRadiance` (see linearProduct).
                        const radLin = [
                            Math.pow(rad[0], 2.2),
                            Math.pow(rad[1], 2.2),
                            Math.pow(rad[2], 2.2),
                        ];
                        const lit = new THREE.Color(
                            c.r * radLin[0], c.g * radLin[1], c.b * radLin[2]
                        );
                        const emissive = Number(paint['background-emissive-strength'] ?? 0);
                        if (emissive > 0) lit.lerp(c, Math.min(emissive, 1));
                        (this.mapView as any).clearColor = lit.getHex();
                    } else {
                        (this.mapView as any).clearColor = c.getHex();
                    }
                    (this.mapView as any).clearAlpha = opacity;
                    // The terrain surface shows the (themed, lit) background
                    // color where no drape content exists — mgl renders the
                    // background beneath the whole map, and the terrain mesh
                    // composites over it (import-override high-pitch family:
                    // un-lit white base → grey expected).
                    try {
                        this.m_environment?.terrainController?.setBaseColor(
                            (this.mapView as any).clearColor as number);
                    } catch {}
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
        // No pitch compensation: setCameraGeolocationAndZoom now orbits the
        // target (lookAt semantics), so the reported zoom is pitch-independent.
        const pitch = style.pitch ?? 0;
        const zoom = (typeof style.zoom === 'number' ? style.zoom : 0) + 1;
        // Mapbox `bearing` is clockwise (bearing 90 → up faces east). flywave's
        // setCameraGeolocationAndZoom takes a counter-clockwise yawDeg
        // (MapView.ts:2378/2405 "yaw is counter-clockwise"). Passing bearing
        // directly yaws the camera by the wrong sign — the whole view is rotated
        // by 2·bearing (180° for a bearing-90 test). Negate to match.
        const bearing = -(style.bearing ?? 0);

        try {
            // Import GeoCoordinates dynamically to avoid circular dependency issues
            const { GeoCoordinates } = require('@flywave/flywave-geoutils');
            const geoCoord = new GeoCoordinates(center[1], center[0]);
            this.mapView.setCameraGeolocationAndZoom(geoCoord, zoom, bearing, pitch);
        } catch {}
    }

    /**
     * Push the live mapbox camera zoom (flywave zoom − 1) to the decoder so
     * camera functions (icon-size/text-size stops, dynamic-filter distance)
     * evaluate at the continuous mapbox zoom instead of the floored integer
     * tile level. Called after applyCameraSettings and on every AfterRender.
     */
    private pushMapboxZoom(): void {
        try {
            const camZoom = (this.mapView as any)?.zoomLevel;
            if (typeof camZoom === 'number') {
                (this.decoder as any).configure?.(undefined, {
                    mapboxZoom: Math.max(0, camZoom - 1),
                } as any);
            }
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
