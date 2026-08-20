"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.MBStyleDataSource = void 0;
const flywave_geoutils_1 = require("@flywave/flywave-geoutils");
const flywave_mapview_1 = require("@flywave/flywave-mapview");
const flywave_mapview_2 = require("@flywave/flywave-mapview");
const flywave_mapview_decoder_1 = require("@flywave/flywave-mapview-decoder");
const OmvRestClient_1 = require("@flywave/flywave-vectortile-datasource/OmvRestClient");
const THREE = __importStar(require("three"));
const MBStyleManager_1 = require("./MBStyleManager");
const MBExpressionEngine_1 = require("./MBExpressionEngine");
const MBTileDataEmitter_1 = require("./MBTileDataEmitter");
const MapIconMaterial_1 = require("./materials/MapIconMaterial");
const MBStyleRuntime_1 = require("./MBStyleRuntime");
const MBEnvironmentManager_1 = require("./MBEnvironmentManager");
const MBMaterialPatchManager_1 = require("./MBMaterialPatchManager");
const MBSTYLE_DECODER_SERVICE_TYPE = 'mbstyle-vector-tile-decoder';
class RasterTileDataProvider extends flywave_mapview_decoder_1.DataProvider {
    constructor(tileUrlTemplate, minZoom = 0, maxZoom = 22) {
        super();
        this.m_tileUrlTemplate = tileUrlTemplate;
        this.m_minZoom = minZoom;
        this.m_maxZoom = maxZoom;
    }
    ready() { return true; }
    async getTile(tileKey) {
        const z = tileKey.level;
        const x = tileKey.column;
        const y = tileKey.row;
        const n = Math.pow(2, z);
        const lngW = (x / n) * 360 - 180;
        const lngE = ((x + 1) / n) * 360 - 180;
        const latN = this.tile2lat(y, z);
        const latS = this.tile2lat(y + 1, z);
        if (z < this.m_minZoom) {
            return JSON.stringify({ type: 'FeatureCollection', features: [] });
        }
        let srcZ = Math.min(z, this.m_maxZoom);
        let srcX = Math.floor(x / Math.pow(2, z - srcZ));
        let srcY = Math.floor(y / Math.pow(2, z - srcZ));
        for (let zz = srcZ; zz >= 0; zz--) {
            const shift = z - zz;
            const u = this.m_tileUrlTemplate
                .replace('{z}', String(zz))
                .replace('{x}', String(Math.floor(x / Math.pow(2, shift))))
                .replace('{y}', String(Math.floor(y / Math.pow(2, shift))));
            const ok = await RasterTileDataProvider.tileExists(u);
            if (ok) {
                srcZ = zz;
                srcX = Math.floor(x / Math.pow(2, shift));
                srcY = Math.floor(y / Math.pow(2, shift));
                break;
            }
            srcZ = zz - 1;
        }
        if (srcZ < 0) {
            srcZ = Math.min(Math.max(z, this.m_minZoom), this.m_maxZoom);
        }
        const shift = z - srcZ;
        const span = Math.pow(2, shift);
        const rasterUrl = this.m_tileUrlTemplate
            .replace('{z}', String(srcZ))
            .replace('{x}', String(srcX))
            .replace('{y}', String(srcY));
        const fw = 1 / span;
        const fx0 = (x - srcX * span) * fw;
        const fy0 = (y - srcY * span) * fw;
        const uvRect = [fx0, 1 - fy0 - fw, fw, fw];
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
                        _rasterUvRect: uvRect,
                        _tileCol: x,
                        _tileRow: y,
                        _tileZoom: z,
                    },
                }],
        };
        return JSON.stringify(geojson);
    }
    static async tileExists(url) {
        if (RasterTileDataProvider.s_existingTiles.has(url))
            return true;
        if (RasterTileDataProvider.s_missingTiles.has(url))
            return false;
        try {
            const resp = await fetch(url);
            if (resp.ok) {
                RasterTileDataProvider.s_existingTiles.add(url);
                return true;
            }
            RasterTileDataProvider.s_missingTiles.add(url);
            return false;
        }
        catch (_a) {
            return false;
        }
    }
    tile2lat(y, z) {
        const n = Math.PI - (2 * Math.PI * y) / Math.pow(2, z);
        return (180 / Math.PI) * Math.atan(Math.sinh(n));
    }
    async connect() { }
    dispose() { }
}
RasterTileDataProvider.s_existingTiles = new Set();
RasterTileDataProvider.s_missingTiles = new Set();
class TMSDataProvider extends flywave_mapview_decoder_1.DataProvider {
    constructor(inner) { super(); this.m_inner = inner; }
    ready() { return this.m_inner.ready(); }
    async getTile(tileKey, abortSignal) {
        const n = Math.pow(2, tileKey.level);
        const flippedRow = n - 1 - tileKey.row;
        const flippedKey = flywave_geoutils_1.TileKey.fromRowColumnLevel(flippedRow, tileKey.column, tileKey.level);
        return this.m_inner.getTile(flippedKey, abortSignal);
    }
    async connect() { }
    dispose() { }
}
class BoundsFilteredDataProvider extends flywave_mapview_decoder_1.DataProvider {
    constructor(inner, bounds) {
        super();
        this.m_inner = inner;
        this.m_bounds = bounds;
    }
    ready() { return this.m_inner.ready(); }
    async getTile(tileKey, abortSignal) {
        const z = tileKey.level;
        const x = tileKey.column;
        const y = tileKey.row;
        const n = Math.pow(2, z);
        const tileW = (x / n) * 360 - 180;
        const tileE = ((x + 1) / n) * 360 - 180;
        const tileN = (180 / Math.PI) * Math.atan(Math.sinh(Math.PI * (1 - 2 * y / n)));
        const tileS = (180 / Math.PI) * Math.atan(Math.sinh(Math.PI * (1 - 2 * (y + 1) / n)));
        const [minLng, minLat, maxLng, maxLat] = this.m_bounds;
        if (tileE < minLng || tileW > maxLng || tileS > maxLat || tileN < minLat) {
            return JSON.stringify({ type: 'FeatureCollection', features: [] });
        }
        return this.m_inner.getTile(tileKey, abortSignal);
    }
    async connect() { }
    dispose() { }
}
class HillshadeTileDataProvider extends flywave_mapview_decoder_1.DataProvider {
    constructor(demUrlTemplate, tileSize = 256) {
        super();
        this.m_demUrlTemplate = demUrlTemplate;
        this.m_tileSize = tileSize;
    }
    ready() { return true; }
    async getTile(tileKey) {
        const z = tileKey.level;
        const x = tileKey.column;
        const y = tileKey.row;
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
    tile2lat(y, z) {
        const n = Math.PI - (2 * Math.PI * y) / Math.pow(2, z);
        return (180 / Math.PI) * Math.atan(Math.sinh(n));
    }
    async connect() { }
    dispose() { }
}
class GeoJSONDataProvider extends flywave_mapview_decoder_1.DataProvider {
    constructor(data, clusterOpts) {
        var _a, _b, _c, _d;
        super();
        this.m_cluster = false;
        this.m_clusterRadius = 50;
        this.m_clusterMaxZoom = 16;
        this.m_clusteredCache = new Map();
        this.m_clusterProperties = {};
        this.m_geoJsonData = typeof data === 'string' ? data : JSON.stringify(data);
        if (clusterOpts) {
            this.m_cluster = (_a = clusterOpts.cluster) !== null && _a !== void 0 ? _a : false;
            this.m_clusterRadius = (_b = clusterOpts.clusterRadius) !== null && _b !== void 0 ? _b : 50;
            this.m_clusterMaxZoom = (_c = clusterOpts.clusterMaxZoom) !== null && _c !== void 0 ? _c : 16;
            this.m_clusterProperties = (_d = clusterOpts.clusterProperties) !== null && _d !== void 0 ? _d : {};
        }
    }
    ready() { return true; }
    async getTile(tileKey) {
        if (!this.m_cluster)
            return this.m_geoJsonData;
        const zoom = tileKey.level;
        if (zoom >= this.m_clusterMaxZoom)
            return this.m_geoJsonData;
        const roundedZoom = Math.floor(zoom / 2) * 2;
        if (!this.m_clusteredCache.has(roundedZoom)) {
            const clustered = this.clusterAtZoom(roundedZoom);
            this.m_clusteredCache.set(roundedZoom, clustered);
        }
        return this.m_clusteredCache.get(roundedZoom);
    }
    clusterAtZoom(zoom) {
        var _a;
        try {
            const geo = JSON.parse(this.m_geoJsonData);
            const features = (_a = geo.features) !== null && _a !== void 0 ? _a : [];
            const points = features.filter((f) => { var _a; return ((_a = f.geometry) === null || _a === void 0 ? void 0 : _a.type) === 'Point'; });
            const nonPoints = features.filter((f) => { var _a; return ((_a = f.geometry) === null || _a === void 0 ? void 0 : _a.type) !== 'Point'; });
            if (points.length === 0)
                return this.m_geoJsonData;
            const gridSize = this.m_clusterRadius * 2;
            const grid = new Map();
            for (const pt of points) {
                const [lng, lat] = pt.geometry.coordinates;
                const cx = Math.floor(((lng + 180) / 360) * gridSize * Math.pow(2, zoom));
                const cy = Math.floor(((1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2) * gridSize * Math.pow(2, zoom));
                const key = `${cx}:${cy}`;
                if (!grid.has(key))
                    grid.set(key, []);
                grid.get(key).push(pt);
            }
            const clusteredFeatures = [];
            for (const [, group] of grid) {
                if (group.length === 1) {
                    clusteredFeatures.push(group[0]);
                }
                else {
                    let sumLng = 0, sumLat = 0;
                    for (const f of group) {
                        sumLng += f.geometry.coordinates[0];
                        sumLat += f.geometry.coordinates[1];
                    }
                    const props = {
                        cluster: true,
                        cluster_id: `${zoom}:${group.length}`,
                        point_count: group.length,
                    };
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
            return JSON.stringify(Object.assign(Object.assign({}, geo), { features: [...nonPoints, ...clusteredFeatures] }));
        }
        catch (_b) {
            return this.m_geoJsonData;
        }
    }
    updateData(data) {
        this.m_geoJsonData = typeof data === 'string' ? data : JSON.stringify(data);
        this.m_clusteredCache.clear();
    }
    async connect() { }
    dispose() { }
}
function aggregateClusterProperty(spec, group) {
    if (!Array.isArray(spec) || spec.length < 2)
        return 0;
    const agg = spec[0];
    const mapExpr = spec[1];
    const { MBExpressionEngine } = require('./MBExpressionEngine');
    const mapped = group.map((f) => {
        var _a;
        return MBExpressionEngine.evaluate(mapExpr, {
            zoom: 0,
            feature: { type: 'Point', properties: (_a = f.properties) !== null && _a !== void 0 ? _a : {}, id: f.id },
        });
    });
    const op = Array.isArray(agg) ? agg[0] : agg;
    switch (op) {
        case '+': {
            let s = 0;
            for (const v of mapped)
                s += Number(v) || 0;
            return s;
        }
        case 'max': {
            let m = -Infinity;
            for (const v of mapped)
                if (Number(v) > m)
                    m = Number(v);
            return m === -Infinity ? 0 : m;
        }
        case 'min': {
            let m = Infinity;
            for (const v of mapped)
                if (Number(v) < m)
                    m = Number(v);
            return m === Infinity ? 0 : m;
        }
        case '*': {
            let p = 1;
            for (const v of mapped)
                p *= Number(v) || 1;
            return p;
        }
        default:
            return mapped;
    }
}
class DelegatingDataProvider extends flywave_mapview_decoder_1.DataProvider {
    constructor() {
        super(...arguments);
        this.delegate = null;
    }
    ready() {
        var _a, _b;
        return (_b = (_a = this.delegate) === null || _a === void 0 ? void 0 : _a.ready()) !== null && _b !== void 0 ? _b : true;
    }
    async getTile(tileKey, abortSignal) {
        if (!this.delegate)
            return new ArrayBuffer(0);
        try {
            return await this.delegate.getTile(tileKey, abortSignal);
        }
        catch (_a) {
            return JSON.stringify({ type: 'FeatureCollection', features: [] });
        }
    }
    async connect() {
        if (this.delegate) {
            try {
                await this.delegate.connect();
            }
            catch (e) {
            }
        }
    }
    dispose() {
        this.delegate = null;
    }
}
class CompositeGeoDataProvider extends flywave_mapview_decoder_1.DataProvider {
    constructor() {
        super(...arguments);
        this.m_entries = [];
    }
    add(sourceId, provider) {
        this.m_entries.push({ sourceId, provider });
    }
    get size() {
        return this.m_entries.length;
    }
    getSingleProvider() {
        return this.m_entries.length === 1 ? this.m_entries[0].provider : null;
    }
    ready() {
        return this.m_entries.every(e => e.provider.ready());
    }
    async getTile(tileKey, abortSignal) {
        var _a;
        const features = [];
        for (const { sourceId, provider } of this.m_entries) {
            let data;
            try {
                data = await provider.getTile(tileKey, abortSignal);
            }
            catch (_b) {
                continue;
            }
            let fc = data;
            if (typeof data === 'string') {
                try {
                    fc = JSON.parse(data);
                }
                catch (_c) {
                    continue;
                }
            }
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
                features.push(Object.assign(Object.assign({}, f), { properties: Object.assign(Object.assign({}, ((_a = f.properties) !== null && _a !== void 0 ? _a : {})), { _sourceId: sourceId }) }));
            }
        }
        return JSON.stringify({ type: 'FeatureCollection', features });
    }
    async connect() {
        for (const e of this.m_entries) {
            try {
                await e.provider.connect();
            }
            catch (_a) {
            }
        }
    }
    dispose() {
        this.m_entries = [];
    }
}
class MBStyleDataSource extends flywave_mapview_decoder_1.TileDataSource {
    constructor(params) {
        var _a, _b;
        const delegatingProvider = new DelegatingDataProvider();
        const options = {
            tilingScheme: flywave_geoutils_1.webMercatorTilingScheme,
            dataProvider: delegatingProvider,
            decoder: params.decoder,
            concurrentDecoderServiceName: params.decoder ? undefined : ((_a = params.concurrentDecoderServiceName) !== null && _a !== void 0 ? _a : MBSTYLE_DECODER_SERVICE_TYPE),
            concurrentDecoderScriptUrl: params.decoder ? undefined : params.decoderScriptUrl,
            minDataLevel: 0,
            maxDataLevel: 22,
            storageLevelOffset: (_b = params.storageLevelOffset) !== null && _b !== void 0 ? _b : -1,
        };
        super(new flywave_mapview_decoder_1.TileFactory(flywave_mapview_1.Tile), options);
        this.m_spriteAtlas = null;
        this.m_colorThemeLut = null;
        this.m_importLuts = new Map();
        this.m_loadedModels = [];
        this.m_themedIconCanvases = [];
        this.m_iconCanvasPristine = new WeakMap();
        this.m_runtime = null;
        this.m_currentSourceId = '';
        this.m_demTileUrl = null;
        this.m_demTileSize = 256;
        this.m_demMaxZoom = 22;
        this.m_rasterTileUrl = null;
        this.m_glyphMetrics = new Map();
        this.m_environment = null;
        this.m_materialPatcher = null;
        this.m_depthOcclusion = null;
        this.m_terrainDraping = null;
        this.m_symbolPlacement = null;
        this.m_heatmapRenderer = null;
        this.m_additiveLineRenderer = null;
        this.m_debugTileBoundaries = false;
        this.m_debugLines = null;
        this.m_clipMask = new Map();
        this.m_delegatingProvider = delegatingProvider;
        this.m_styleManager = new MBStyleManager_1.MBStyleManager();
        this.m_styleParams = params;
        this.cacheable = true;
        this.addGroundPlane = false;
    }
    get styleManager() {
        return this.m_styleManager;
    }
    getDecodedTiles() {
        var _a, _b;
        const tiles = [];
        const mapView = this.m_mapView;
        const cache = (_a = mapView === null || mapView === void 0 ? void 0 : mapView.m_visibleTiles) === null || _a === void 0 ? void 0 : _a.m_dataSourceCache;
        if ((_b = cache === null || cache === void 0 ? void 0 : cache.m_tileCache) === null || _b === void 0 ? void 0 : _b.forEach) {
            cache.m_tileCache.forEach((tile) => {
                if (tile.dataSource === this)
                    tiles.push(tile);
            });
        }
        return tiles;
    }
    async reloadSources() {
        const style = this.m_styleManager.getStyle();
        if (!style)
            return;
        await this.m_styleManager.reloadSources();
        const sources = this.m_styleManager.getResolvedSources();
        await this.wireTileSources(style, sources);
        const maxSourceZoom = Math.max(1, ...[...sources.values()].map(s => { var _a; return (_a = s.maxzoom) !== null && _a !== void 0 ? _a : 22; }));
        this.maxDataLevel = Math.min(22, maxSourceZoom);
        if (this.mapView) {
            this.mapView.markTilesDirty(this);
            this.mapView.update();
        }
    }
    applyMaxGeometryHeight(style) {
        var _a, _b;
        let maxHeight = 0;
        for (const layer of (_a = style.layers) !== null && _a !== void 0 ? _a : []) {
            const l = layer;
            if (l.type !== 'fill-extrusion' && l.type !== 'building')
                continue;
            maxHeight = Math.max(maxHeight, MBStyleDataSource.scanMaxNumber((_b = l.paint) === null || _b === void 0 ? void 0 : _b['fill-extrusion-height']));
        }
        if (maxHeight > 0) {
            this.maxGeometryHeight = Math.max(this.maxGeometryHeight, maxHeight);
        }
    }
    static scanMaxNumber(value) {
        var _a;
        if (typeof value === 'number')
            return value;
        if (value === null || typeof value !== 'object')
            return 0;
        if (Array.isArray(value.stops)) {
            let max = 0;
            for (const stop of value.stops) {
                max = Math.max(max, MBStyleDataSource.scanMaxNumber((_a = stop === null || stop === void 0 ? void 0 : stop[1]) !== null && _a !== void 0 ? _a : stop));
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
    async wireTileSources(style, sources) {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q;
        this.applyMaxGeometryHeight(style);
        const layerCounts = new Map();
        for (const layer of (_a = style.layers) !== null && _a !== void 0 ? _a : []) {
            const src = layer.source;
            if (src)
                layerCounts.set(src, ((_b = layerCounts.get(src)) !== null && _b !== void 0 ? _b : 0) + 1);
        }
        let bestVectorSourceId = null;
        let bestVectorCount = 0;
        for (const [sourceId, source] of sources) {
            if (source.type === 'vector') {
                const count = (_c = layerCounts.get(sourceId)) !== null && _c !== void 0 ? _c : 0;
                if (count > bestVectorCount || bestVectorSourceId === null) {
                    bestVectorSourceId = sourceId;
                    bestVectorCount = count;
                }
            }
        }
        if (bestVectorSourceId) {
            const source = sources.get(bestVectorSourceId);
            const rawSpec = (_d = style.sources) === null || _d === void 0 ? void 0 : _d[bestVectorSourceId];
            const tileSize = (_f = (_e = rawSpec === null || rawSpec === void 0 ? void 0 : rawSpec.tileSize) !== null && _e !== void 0 ? _e : source.tileSize) !== null && _f !== void 0 ? _f : 256;
            const desiredOffset = tileSize > 256 ? -2 : -1;
            this.storageLevelOffset = desiredOffset;
            const restClient = this.createOmvRestClient(source, this.m_styleParams.accessToken);
            const scheme = (_g = source.scheme) !== null && _g !== void 0 ? _g : 'xyz';
            let delegate = restClient;
            if (scheme === 'tms') {
                delegate = new TMSDataProvider(restClient);
            }
            const bounds = source.bounds;
            if (Array.isArray(bounds) && bounds.length === 4) {
                delegate = new BoundsFilteredDataProvider(delegate, bounds);
            }
            this.m_delegatingProvider.delegate = delegate;
            this.m_currentSourceId = bestVectorSourceId;
            await this.decoder.configure(undefined, {
                mbStyle: style,
                currentSourceId: bestVectorSourceId,
            });
            return true;
        }
        const composite = new CompositeGeoDataProvider();
        let currentSourceId = '';
        let hasRasterSource = false;
        for (const [sourceId, source] of sources) {
            if (source.type === 'geojson') {
                const geoJsonSpec = style.sources[sourceId];
                let data = geoJsonSpec.data;
                if (typeof data === 'string' && data.trim() !== '') {
                    try {
                        const url = data.replace(/^local:\/\//, '/base/@flywave/flywave-mbstyle-datasource/test/rendering/integration/');
                        const resp = await fetch(url);
                        data = await resp.json();
                    }
                    catch (e) {
                    }
                }
                if (data) {
                    composite.add(sourceId, new GeoJSONDataProvider(data, {
                        cluster: geoJsonSpec.cluster,
                        clusterRadius: geoJsonSpec.clusterRadius,
                        clusterMaxZoom: geoJsonSpec.clusterMaxZoom,
                        clusterProperties: geoJsonSpec.clusterProperties,
                    }));
                    if (!currentSourceId)
                        currentSourceId = sourceId;
                }
            }
            else if (source.type === 'raster') {
                hasRasterSource = true;
                const rasterSpec = style.sources[sourceId];
                const tiles = (_h = rasterSpec === null || rasterSpec === void 0 ? void 0 : rasterSpec.tiles) !== null && _h !== void 0 ? _h : [];
                const tileUrl = (_k = (_j = tiles[0]) !== null && _j !== void 0 ? _j : source.tileUrls[0]) !== null && _k !== void 0 ? _k : '';
                if (tileUrl) {
                    const resolvedUrl = tileUrl.replace(/^local:\/\//, '/base/@flywave/flywave-mbstyle-datasource/test/rendering/integration/');
                    composite.add(sourceId, new RasterTileDataProvider(resolvedUrl, (_l = rasterSpec === null || rasterSpec === void 0 ? void 0 : rasterSpec.minzoom) !== null && _l !== void 0 ? _l : 0, (_m = rasterSpec === null || rasterSpec === void 0 ? void 0 : rasterSpec.maxzoom) !== null && _m !== void 0 ? _m : 22));
                    this.m_rasterTileUrl = resolvedUrl;
                    if (!currentSourceId)
                        currentSourceId = sourceId;
                }
            }
        }
        if (hasRasterSource && this.m_styleParams.storageLevelOffset === undefined) {
            this.storageLevelOffset = 0;
        }
        const hasHillshade = ((_o = style.layers) !== null && _o !== void 0 ? _o : []).some((l) => { var _a, _b; return l.type === 'hillshade' && ((_b = (_a = l.layout) === null || _a === void 0 ? void 0 : _a.visibility) !== null && _b !== void 0 ? _b : 'visible') === 'visible'; });
        if (hasHillshade && this.m_demTileUrl) {
            const hillshadeLayer = ((_p = style.layers) !== null && _p !== void 0 ? _p : []).find((l) => l.type === 'hillshade');
            const hillshadeSourceId = (_q = hillshadeLayer === null || hillshadeLayer === void 0 ? void 0 : hillshadeLayer.source) !== null && _q !== void 0 ? _q : 'hillshade-dem';
            composite.add(hillshadeSourceId, new HillshadeTileDataProvider(this.m_demTileUrl, this.m_demTileSize));
            if (!currentSourceId)
                currentSourceId = hillshadeSourceId;
        }
        if (composite.size === 1) {
            const only = composite.getSingleProvider();
            if (!only)
                return false;
            this.m_delegatingProvider.delegate = only;
        }
        else if (composite.size > 0) {
            this.m_delegatingProvider.delegate = composite;
        }
        else {
            return false;
        }
        this.m_currentSourceId = currentSourceId;
        await this.decoder.configure(undefined, {
            mbStyle: style,
            currentSourceId: currentSourceId,
            demTileUrl: this.m_demTileUrl,
            rasterTileUrl: this.m_rasterTileUrl,
        });
        return true;
    }
    createOmvRestClient(source, accessToken) {
        var _a;
        const url = (_a = source.tileUrls[0]) !== null && _a !== void 0 ? _a : '';
        const params = {
            url,
            apiFormat: OmvRestClient_1.APIFormat.XYZMVT,
        };
        if (accessToken) {
            params.authenticationCode = accessToken;
        }
        return new OmvRestClient_1.OmvRestClient(params);
    }
    async connect() {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r, _s, _t, _u, _v, _w, _x, _y, _z, _0, _1, _2;
        await this.m_styleManager.loadStyle(this.m_styleParams.style, this.m_styleParams.accessToken);
        const style = this.m_styleManager.getStyle();
        if (!style) {
            throw new Error('Failed to load Mapbox Style');
        }
        this.buildClipMask(style);
        this.applyBackgroundColor(style);
        this.applyProjection(style);
        this.applyCameraSettings(style);
        this.pushMapboxZoom();
        {
            const { loadColorTheme } = require('./MBColorTheme');
            loadColorTheme(style).then((lut) => {
                this.applyColorTheme(lut);
                this.loadImportThemes(style);
            }).catch(() => { });
        }
        this.m_runtime = new MBStyleRuntime_1.MBStyleRuntime(style, () => {
            var _a, _b, _c, _d, _e;
            this.decoder.configure(undefined, {
                mbStyle: this.m_runtime.style,
                currentSourceId: this.m_currentSourceId,
                pitch: (_a = this.m_runtime.style.pitch) !== null && _a !== void 0 ? _a : 0,
                brightness: (_c = (_b = this.m_environment) === null || _b === void 0 ? void 0 : _b.brightness) !== null && _c !== void 0 ? _c : 0,
                center: (_d = this.m_runtime.style.center) !== null && _d !== void 0 ? _d : [0, 0],
            });
            const decEval = this.decoder.m_layerEvaluator;
            if (decEval === null || decEval === void 0 ? void 0 : decEval.setColorTheme) {
                decEval.setColorTheme(this.m_colorThemeLut);
                for (const [scopeId, lut] of this.m_importLuts) {
                    (_e = decEval.setColorThemeScope) === null || _e === void 0 ? void 0 : _e.call(decEval, scopeId, lut);
                }
            }
            if (this.mapView) {
                this.mapView.markTilesDirty(this);
            }
        });
        const sources = this.m_styleManager.getResolvedSources();
        const maxSourceZoom = Math.max(1, ...[...sources.values()].map(s => { var _a; return (_a = s.maxzoom) !== null && _a !== void 0 ? _a : 22; }));
        this.maxDataLevel = Math.min(22, maxSourceZoom);
        for (const [sourceId, source] of sources) {
            if (source.type === 'raster-dem') {
                const demSpec = style.sources[sourceId];
                const tiles = (_a = demSpec === null || demSpec === void 0 ? void 0 : demSpec.tiles) !== null && _a !== void 0 ? _a : [];
                const tileUrl = (_c = (_b = tiles[0]) !== null && _b !== void 0 ? _b : source.tileUrls[0]) !== null && _c !== void 0 ? _c : '';
                if (tileUrl) {
                    this.m_demTileUrl = tileUrl.replace(/^local:\/\//, '/base/@flywave/flywave-mbstyle-datasource/test/rendering/integration/');
                    this.m_demTileSize = (_d = demSpec === null || demSpec === void 0 ? void 0 : demSpec.tileSize) !== null && _d !== void 0 ? _d : 256;
                    this.m_demMaxZoom = (_f = (_e = demSpec === null || demSpec === void 0 ? void 0 : demSpec.maxzoom) !== null && _e !== void 0 ? _e : source.maxzoom) !== null && _f !== void 0 ? _f : 22;
                }
                break;
            }
        }
        if (style.sprite) {
            await this.loadSpriteAtlas(style.sprite);
            this.m_lastAppliedSprite = style.sprite;
        }
        await this.wireTileSources(style, sources);
        if (style.glyphs) {
            await this.loadGlyphMetrics(style);
            this.m_lastAppliedGlyphs = style.glyphs;
        }
        if (this.mapView) {
            this.m_environment = new MBEnvironmentManager_1.MBEnvironmentManager(this.mapView);
            this.m_environment.applyLights(style.lights, style.light);
            this.applyBackgroundColor(style);
            this.m_environment.applyFog(style.fog, (_g = style.zoom) !== null && _g !== void 0 ? _g : 0);
            this.m_environment.applySky((_h = this.buildSkyFromLayers(style)) !== null && _h !== void 0 ? _h : style.sky, style.fog);
            const bgLayer = ((_j = style.layers) !== null && _j !== void 0 ? _j : []).find((l) => l.type === 'background');
            if (bgLayer) {
                const bgPaint = (_k = bgLayer.paint) !== null && _k !== void 0 ? _k : {};
                const pattern = bgPaint['background-pattern'];
                const pitchAlign = (_l = bgPaint['background-pitch-alignment']) !== null && _l !== void 0 ? _l : 'map';
                if (pattern && this.m_spriteAtlas) {
                    await this.m_environment.applyBackgroundPattern(pattern, this.m_spriteAtlas, (_m = bgPaint['background-color']) !== null && _m !== void 0 ? _m : '#000000', (_o = bgPaint['background-opacity']) !== null && _o !== void 0 ? _o : 1, pitchAlign);
                }
            }
            await this.decoder.configure(undefined, {
                mbStyle: style,
                currentSourceId: this.m_currentSourceId,
                demTileUrl: this.m_demTileUrl,
                pitch: (_p = style.pitch) !== null && _p !== void 0 ? _p : 0,
                bearing: (_q = style.bearing) !== null && _q !== void 0 ? _q : 0,
                brightness: this.m_environment.brightness,
                clipMask: Object.fromEntries(this.m_clipMask),
                worldview: (_t = (_s = (_r = style.metadata) === null || _r === void 0 ? void 0 : _r.test) === null || _s === void 0 ? void 0 : _s.worldview) !== null && _t !== void 0 ? _t : '',
                center: (_u = style.center) !== null && _u !== void 0 ? _u : [0, 0],
            });
            this.m_materialPatcher = new MBMaterialPatchManager_1.MBMaterialPatchManager(this);
            this.m_materialPatcher.invalidate();
            const patcher = this.m_materialPatcher;
            const self = this;
            try {
                const { MBStyleSymbolPlacement } = await Promise.resolve().then(() => __importStar(require('./MBStyleSymbolPlacement')));
                self.m_symbolPlacement = new MBStyleSymbolPlacement(this.mapView, self);
            }
            catch (_3) { }
            try {
                const { MBHeatmapRenderer } = await Promise.resolve().then(() => __importStar(require('./MBHeatmapRenderer')));
                self.m_heatmapRenderer = new MBHeatmapRenderer(this.mapView, self);
            }
            catch (_4) { }
            try {
                const { MBAdditiveLineRenderer } = await Promise.resolve().then(() => __importStar(require('./MBAdditiveLineRenderer')));
                self.m_additiveLineRenderer = new MBAdditiveLineRenderer(this.mapView, self);
            }
            catch (_5) { }
            const placement = this.m_symbolPlacement;
            this.mapView.addEventListener(flywave_mapview_2.MapViewEventNames.AfterRender, () => {
                var _a;
                patcher.patchTileMaterials();
                if (placement)
                    placement.run();
                if (self.m_heatmapRenderer) {
                    self.m_heatmapRenderer.run();
                }
                if (self.m_additiveLineRenderer) {
                    self.m_additiveLineRenderer.run();
                }
                if (self.m_debugTileBoundaries)
                    self.drawTileBoundaries();
                const tc = (_a = self.m_environment) === null || _a === void 0 ? void 0 : _a.terrainController;
                if (tc && tc.isMorphing) {
                    tc.updateMorphing(Date.now());
                }
                self.pushMapboxZoom();
            });
        }
        await this.loadModels(style);
        if (this.m_environment && style.terrain) {
            await this.m_environment.applyTerrain(style.terrain, this.m_demTileUrl, (_v = style.zoom) !== null && _v !== void 0 ? _v : 8, (_w = style.center) !== null && _w !== void 0 ? _w : [0, 0], this.m_demMaxZoom, this.m_demTileSize);
            if (this.m_materialPatcher) {
                this.m_materialPatcher.setDepthOcclusion(true);
                this.m_materialPatcher.invalidate();
            }
            if (this.mapView && this.m_environment.terrainController) {
                try {
                    const { TerrainDepthOcclusion } = await Promise.resolve().then(() => __importStar(require('./TerrainDepthOcclusion')));
                    (_x = this.m_depthOcclusion) === null || _x === void 0 ? void 0 : _x.dispose();
                    this.m_depthOcclusion = new TerrainDepthOcclusion(this.mapView, this.m_environment.terrainController);
                    this.m_depthOcclusion.start();
                    if (this.m_materialPatcher && this.m_depthOcclusion.depthTexture) {
                        this.m_materialPatcher.setDepthTexture(this.m_depthOcclusion.depthTexture);
                    }
                }
                catch (_6) { }
            }
            if (this.mapView && this.m_environment.terrainController) {
                try {
                    const { TerrainDraping } = await Promise.resolve().then(() => __importStar(require('./TerrainDraping')));
                    (_y = this.m_terrainDraping) === null || _y === void 0 ? void 0 : _y.dispose();
                    this.m_terrainDraping = new TerrainDraping(this.mapView, this.m_environment.terrainController);
                    this.m_terrainDraping.start();
                }
                catch (_7) { }
            }
        }
        if (this.m_environment && this.m_rasterTileUrl) {
            const rasterLayer = ((_z = style.layers) !== null && _z !== void 0 ? _z : []).find((l) => l.type === 'raster');
            const rasterPaint = (_0 = rasterLayer === null || rasterLayer === void 0 ? void 0 : rasterLayer.paint) !== null && _0 !== void 0 ? _0 : {};
            await this.m_environment.applyRasterSource(this.m_rasterTileUrl, Math.min(Math.max(Math.floor((_1 = style.zoom) !== null && _1 !== void 0 ? _1 : 0), 0), 12), (_2 = style.center) !== null && _2 !== void 0 ? _2 : [0, 0], rasterPaint, rasterLayer);
        }
        if (this.m_environment) {
            await this.m_environment.applyImageSources(style);
        }
        await super.connect();
    }
    get spriteAtlas() {
        return this.m_spriteAtlas;
    }
    get demTileUrl() {
        return this.m_demTileUrl;
    }
    get rasterTileUrl() {
        return this.m_rasterTileUrl;
    }
    async loadModels(style) {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q;
        const modelLayers = ((_a = style.layers) !== null && _a !== void 0 ? _a : []).filter((l) => { var _a, _b; return l.type === 'model' && ((_b = (_a = l.layout) === null || _a === void 0 ? void 0 : _a.visibility) !== null && _b !== void 0 ? _b : 'visible') === 'visible'; });
        if (modelLayers.length === 0)
            return;
        const scene = (_b = this.mapView) === null || _b === void 0 ? void 0 : _b.m_scene;
        if (!scene)
            return;
        const LOCAL = '/base/@flywave/flywave-mbstyle-datasource/test/rendering/integration/';
        const resolveUrl = (u) => { var _a; return (_a = u === null || u === void 0 ? void 0 : u.replace(/^local:\/\//, LOCAL)) !== null && _a !== void 0 ? _a : ''; };
        for (const layer of modelLayers) {
            const layout = (_c = layer.layout) !== null && _c !== void 0 ? _c : {};
            const modelScale = (_d = layout['model-scale']) !== null && _d !== void 0 ? _d : 1;
            const modelRotation = layout['model-rotation'];
            const modelDefs = [];
            const inlineModels = layer.models;
            if (inlineModels && typeof inlineModels === 'object') {
                for (const m of Object.values(inlineModels)) {
                    if (m.uri) {
                        modelDefs.push({ url: resolveUrl(m.uri), position: (_e = m.position) !== null && _e !== void 0 ? _e : [] });
                    }
                }
            }
            if (modelDefs.length === 0) {
                const sourceId = layer.source;
                const source = sourceId ? style.sources[sourceId] : null;
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
            if (modelDefs.length === 0)
                continue;
            try {
                const { GLTFLoader } = await Promise.resolve().then(() => __importStar(require('three/examples/jsm/loaders/GLTFLoader.js')));
                const loader = new GLTFLoader();
                const { GeoCoordinates } = require('@flywave/flywave-geoutils');
                const projection = this.mapView.projection;
                for (const def of modelDefs) {
                    if (!def.url)
                        continue;
                    let gltf;
                    try {
                        gltf = await loader.loadAsync(def.url);
                    }
                    catch (_r) {
                        continue;
                    }
                    const model = gltf.scene.clone(true);
                    try {
                        this.m_loadedModels.push({ model, layer: layer });
                        this.applyThemeToModel(model, layer);
                    }
                    catch (_s) { }
                    const lng = (_f = def.position[0]) !== null && _f !== void 0 ? _f : 0;
                    const lat = (_g = def.position[1]) !== null && _g !== void 0 ? _g : 0;
                    const z = (_h = def.position[2]) !== null && _h !== void 0 ? _h : 0;
                    if (projection) {
                        const geoCoord = new GeoCoordinates(lat, lng);
                        const worldPos = projection.projectPoint(geoCoord);
                        model.position.set(worldPos.x, worldPos.y, (_j = worldPos.z) !== null && _j !== void 0 ? _j : z);
                    }
                    if (Array.isArray(modelScale)) {
                        model.scale.set((_k = modelScale[0]) !== null && _k !== void 0 ? _k : 1, (_l = modelScale[1]) !== null && _l !== void 0 ? _l : 1, (_m = modelScale[2]) !== null && _m !== void 0 ? _m : 1);
                    }
                    else {
                        model.scale.setScalar(modelScale);
                    }
                    if (Array.isArray(modelRotation)) {
                        model.rotation.set(((_o = modelRotation[0]) !== null && _o !== void 0 ? _o : 0) * Math.PI / 180, ((_p = modelRotation[1]) !== null && _p !== void 0 ? _p : 0) * Math.PI / 180, ((_q = modelRotation[2]) !== null && _q !== void 0 ? _q : 0) * Math.PI / 180);
                    }
                    scene.add(model);
                }
            }
            catch (_t) { }
        }
    }
    get runtime() {
        return this.m_runtime;
    }
    setColorTheme(theme) {
        const { loadColorTheme } = require('./MBColorTheme');
        if (!theme || theme.data === undefined || theme.data === null) {
            this.m_runtime.m_runtimeThemeOverride = true;
            this.applyColorTheme(null);
            return;
        }
        this.m_runtime.m_runtimeThemeOverride = true;
        loadColorTheme({ 'color-theme': theme }).then((lut) => {
            if (lut)
                this.applyColorTheme(lut);
        }).catch(() => { });
    }
    setImportColorTheme(importId, theme) {
        var _a, _b, _c;
        const { loadColorTheme } = require('./MBColorTheme');
        const style = (_a = this.m_runtime) === null || _a === void 0 ? void 0 : _a.style;
        if (!theme || theme.data === undefined || theme.data === null) {
            const own = (_c = (_b = style === null || style === void 0 ? void 0 : style._importThemes) === null || _b === void 0 ? void 0 : _b[importId]) !== null && _c !== void 0 ? _c : null;
            if (own && own.data) {
                loadColorTheme({ 'color-theme': own, _config: style === null || style === void 0 ? void 0 : style._config }).then((lut) => {
                    this.m_importLuts.set(importId, lut);
                    this.propagateScopedThemes();
                }).catch(() => { });
            }
            else {
                this.m_importLuts.set(importId, null);
                this.propagateScopedThemes();
            }
            return;
        }
        loadColorTheme({ 'color-theme': theme, _config: style === null || style === void 0 ? void 0 : style._config }).then((lut) => {
            this.m_importLuts.set(importId, lut !== null && lut !== void 0 ? lut : null);
            this.propagateScopedThemes();
        }).catch(() => { });
    }
    applyThemeToModel(model, layer) {
        var _a, _b;
        try {
            const useTheme = (_b = (_a = layer === null || layer === void 0 ? void 0 : layer.paint) === null || _a === void 0 ? void 0 : _a['model-color-use-theme']) !== null && _b !== void 0 ? _b : 'default';
            const modelLut = ((layer === null || layer === void 0 ? void 0 : layer._importScope) && this.m_importLuts.has(layer._importScope))
                ? this.m_importLuts.get(layer._importScope)
                : this.m_colorThemeLut;
            if (!modelLut || useTheme === 'none')
                return;
            const { applyColorTheme, applyColorThemeToPixels } = require('./MBColorTheme');
            model.traverse((o) => {
                var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k;
                const mat = o.material;
                if (!mat)
                    return;
                for (const mk of ['color', 'emissive']) {
                    if (!mat[mk] || !mat[mk].isColor)
                        continue;
                    if (!((_b = (_a = mat.userData) === null || _a === void 0 ? void 0 : _a._mbPristine) === null || _b === void 0 ? void 0 : _b[mk])) {
                        mat.userData = (_c = mat.userData) !== null && _c !== void 0 ? _c : {};
                        mat.userData._mbPristine = (_d = mat.userData._mbPristine) !== null && _d !== void 0 ? _d : {};
                        mat.userData._mbPristine[mk] = mat[mk].clone();
                    }
                    const css = mat.userData._mbPristine[mk].getStyle(THREE.SRGBColorSpace);
                    mat[mk].setStyle(applyColorTheme(modelLut, css), THREE.SRGBColorSpace);
                }
                for (const tk of ['map', 'emissiveMap']) {
                    const tex = mat[tk];
                    const img = tex === null || tex === void 0 ? void 0 : tex.image;
                    if (!tex || !img)
                        continue;
                    if (!((_e = tex.userData) === null || _e === void 0 ? void 0 : _e._mbPristineCanvas)) {
                        try {
                            const cv = document.createElement('canvas');
                            cv.width = (_g = (_f = img.width) !== null && _f !== void 0 ? _f : img.videoWidth) !== null && _g !== void 0 ? _g : 1;
                            cv.height = (_j = (_h = img.height) !== null && _h !== void 0 ? _h : img.videoHeight) !== null && _j !== void 0 ? _j : 1;
                            const cx = cv.getContext('2d');
                            cx.drawImage(img, 0, 0);
                            tex.userData = (_k = tex.userData) !== null && _k !== void 0 ? _k : {};
                            tex.userData._mbPristineCanvas = cv;
                        }
                        catch (_l) {
                            continue;
                        }
                    }
                    const pristine = tex.userData._mbPristineCanvas;
                    const cv = document.createElement('canvas');
                    cv.width = pristine.width;
                    cv.height = pristine.height;
                    const cx = cv.getContext('2d');
                    cx.drawImage(pristine, 0, 0);
                    const id = cx.getImageData(0, 0, cv.width, cv.height);
                    applyColorThemeToPixels(modelLut, id.data);
                    cx.putImageData(id, 0, 0);
                    const nt = new THREE.Texture(cv);
                    nt.needsUpdate = true;
                    nt.flipY = tex.flipY;
                    nt.colorSpace = tex.colorSpace;
                    nt.wrapS = tex.wrapS;
                    nt.wrapT = tex.wrapT;
                    nt.userData = { _mbPristineCanvas: pristine };
                    mat[tk] = nt;
                }
            });
        }
        catch (_c) { }
    }
    loadImportThemes(style) {
        var _a;
        const { loadColorTheme } = require('./MBColorTheme');
        const themes = (_a = style === null || style === void 0 ? void 0 : style._importThemes) !== null && _a !== void 0 ? _a : {};
        let pending = 0;
        for (const [id, theme] of Object.entries(themes)) {
            if (!theme || !theme.data) {
                this.m_importLuts.set(id, null);
                continue;
            }
            pending++;
            loadColorTheme({ 'color-theme': theme, _config: style === null || style === void 0 ? void 0 : style._config })
                .then((lut) => this.m_importLuts.set(id, lut))
                .catch(() => this.m_importLuts.set(id, null))
                .finally(() => {
                if (--pending === 0)
                    this.propagateScopedThemes();
            });
        }
        if (pending === 0)
            this.propagateScopedThemes();
    }
    propagateScopedThemes() {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l;
        const style = (_b = (_a = this.m_runtime) === null || _a === void 0 ? void 0 : _a.style) !== null && _b !== void 0 ? _b : this.m_styleManager.m_style;
        const evaluator = (_c = this.m_runtime) === null || _c === void 0 ? void 0 : _c.evaluator;
        if (evaluator) {
            for (const [id, lut] of this.m_importLuts) {
                (_d = evaluator.setColorThemeScope) === null || _d === void 0 ? void 0 : _d.call(evaluator, id, lut);
            }
        }
        const decEval = this.decoder.m_layerEvaluator;
        if (decEval === null || decEval === void 0 ? void 0 : decEval.setColorThemeScope) {
            for (const [id, lut] of this.m_importLuts) {
                decEval.setColorThemeScope(id, lut);
            }
        }
        const fogScope = style === null || style === void 0 ? void 0 : style._fogImportScope;
        const fogLut = (fogScope && this.m_importLuts.has(fogScope))
            ? this.m_importLuts.get(fogScope)
            : this.m_colorThemeLut;
        (_e = this.m_environment) === null || _e === void 0 ? void 0 : _e.setColorTheme(fogLut !== null && fogLut !== void 0 ? fogLut : null);
        const lightsScope = style === null || style === void 0 ? void 0 : style._lightsImportScope;
        const lightsLut = (lightsScope && this.m_importLuts.has(lightsScope))
            ? this.m_importLuts.get(lightsScope)
            : this.m_colorThemeLut;
        (_f = this.m_environment) === null || _f === void 0 ? void 0 : _f.setLightsColorTheme(lightsLut !== null && lightsLut !== void 0 ? lightsLut : null);
        if (this.m_environment) {
            try {
                this.m_environment.applyLights(style === null || style === void 0 ? void 0 : style.lights, style === null || style === void 0 ? void 0 : style.light);
                this.m_environment.applyFog(style === null || style === void 0 ? void 0 : style.fog, (_g = style === null || style === void 0 ? void 0 : style.zoom) !== null && _g !== void 0 ? _g : 0);
            }
            catch (_m) { }
        }
        try {
            const st = style;
            if (st && this.m_environment)
                this.applyBackgroundColor(st);
        }
        catch (_o) { }
        this.bakeThemeIntoSprites(undefined);
        for (const { model, layer } of this.m_loadedModels) {
            this.applyThemeToModel(model, layer);
        }
        (_j = (_h = this.mapView) === null || _h === void 0 ? void 0 : _h.markTilesDirty) === null || _j === void 0 ? void 0 : _j.call(_h, this);
        (_l = (_k = this.mapView) === null || _k === void 0 ? void 0 : _k.update) === null || _l === void 0 ? void 0 : _l.call(_k);
    }
    applyColorTheme(lut) {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k;
        this.m_colorThemeLut = lut;
        const { bumpThemeGeneration } = require('./MBColorTheme');
        (_a = this.m_runtime) === null || _a === void 0 ? void 0 : _a.evaluator.setColorTheme(lut);
        (_c = (_b = this.decoder.m_layerEvaluator) === null || _b === void 0 ? void 0 : _b.setColorTheme) === null || _c === void 0 ? void 0 : _c.call(_b, lut);
        (_d = this.m_environment) === null || _d === void 0 ? void 0 : _d.setColorTheme(lut);
        try {
            const st = (_f = (_e = this.m_runtime) === null || _e === void 0 ? void 0 : _e.style) !== null && _f !== void 0 ? _f : this.m_styleManager.m_style;
            if (st && this.m_environment)
                this.applyBackgroundColor(st);
        }
        catch (_l) { }
        this.bakeThemeIntoSprites(lut);
        (_h = (_g = this.mapView) === null || _g === void 0 ? void 0 : _g.markTilesDirty) === null || _h === void 0 ? void 0 : _h.call(_g, this);
        (_k = (_j = this.mapView) === null || _j === void 0 ? void 0 : _j.update) === null || _k === void 0 ? void 0 : _k.call(_j);
    }
    bakeThemeIntoSprites(lut) {
        var _a;
        let bakeLut = lut === undefined ? this.m_colorThemeLut : lut;
        if (!bakeLut) {
            for (const l of this.m_importLuts.values()) {
                if (l) {
                    bakeLut = l;
                    break;
                }
            }
        }
        const { bumpThemeGeneration, applyColorThemeToPixels } = require('./MBColorTheme');
        try {
            (_a = this.m_spriteAtlas) === null || _a === void 0 ? void 0 : _a.applyColorTheme(bakeLut !== null && bakeLut !== void 0 ? bakeLut : null);
            for (const cv of this.m_themedIconCanvases) {
                const ctx = cv.getContext('2d');
                if (!ctx)
                    continue;
                let pristine = this.m_iconCanvasPristine.get(cv);
                if (!pristine) {
                    pristine = ctx.getImageData(0, 0, cv.width, cv.height);
                    this.m_iconCanvasPristine.set(cv, pristine);
                }
                const img = ctx.createImageData(pristine.width, pristine.height);
                img.data.set(pristine.data);
                if (bakeLut)
                    applyColorThemeToPixels(bakeLut, img.data);
                ctx.putImageData(img, 0, 0);
            }
            bumpThemeGeneration();
        }
        catch (_b) { }
    }
    setCollisionDebug(enabled) {
        if (this.m_symbolPlacement) {
            this.m_symbolPlacement.setCollisionDebug(enabled);
        }
    }
    setTerrainWireframe(enabled) {
        var _a, _b;
        (_b = (_a = this.m_environment) === null || _a === void 0 ? void 0 : _a.terrainController) === null || _b === void 0 ? void 0 : _b.setWireframe(enabled);
    }
    setLayers3DWireframe(enabled) {
        if (!this.mapView)
            return;
        const scene = this.mapView.m_scene;
        if (!scene)
            return;
        scene.traverse((obj) => {
            var _a;
            if (obj.isMesh && obj.material && ((_a = obj.userData) === null || _a === void 0 ? void 0 : _a.technique)) {
                const tech = obj.userData.technique;
                if (tech.name === 'extruded-polygon' || tech.name === 'fill' || tech.name === 'solid-line') {
                    obj.material.wireframe = enabled;
                }
            }
        });
    }
    setLayers2DWireframe(enabled) {
        if (!this.mapView)
            return;
        const scene = this.mapView.m_scene;
        if (!scene)
            return;
        scene.traverse((obj) => {
            var _a;
            if (obj.isMesh && obj.material && ((_a = obj.userData) === null || _a === void 0 ? void 0 : _a.technique)) {
                const tech = obj.userData.technique;
                if (tech.name === 'circles' || tech.name === 'text' || tech.name === 'labeled-icon') {
                    obj.material.wireframe = enabled;
                }
            }
        });
    }
    setFov(fov) {
        var _a, _b;
        (_b = (_a = this.mapView) === null || _a === void 0 ? void 0 : _a.setFovCalculation) === null || _b === void 0 ? void 0 : _b.call(_a, { type: 'fixed', fov });
    }
    addImage(name, image) {
        var _a, _b, _c, _d;
        MBExpressionEngine_1.MBExpressionEngine.addAvailableImage(name);
        const w = (_a = image.width) !== null && _a !== void 0 ? _a : 0;
        const h = (_b = image.height) !== null && _b !== void 0 ? _b : 0;
        if (w > 0 && h > 0) {
            const cur = MBTileDataEmitter_1.MBTileDataEmitter.s_spriteInfos;
            cur === null || cur === void 0 ? void 0 : cur.set(name, { width: w, height: h });
        }
        return (_d = (_c = this.m_spriteAtlas) === null || _c === void 0 ? void 0 : _c.addIcon(name, image)) !== null && _d !== void 0 ? _d : false;
    }
    removeImage(name) {
        var _a, _b;
        MBExpressionEngine_1.MBExpressionEngine.removeAvailableImage(name);
        return (_b = (_a = this.m_spriteAtlas) === null || _a === void 0 ? void 0 : _a.removeIcon(name)) !== null && _b !== void 0 ? _b : false;
    }
    setDebugTileBoundaries(enabled) {
        this.m_debugTileBoundaries = enabled;
        if (!enabled && this.m_debugLines) {
            this.m_debugLines.visible = false;
        }
    }
    drawTileBoundaries() {
        if (!this.m_debugTileBoundaries || !this.mapView)
            return;
        const THREE = require('three');
        const scene = this.mapView.m_scene;
        if (!scene)
            return;
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
        const positions = [];
        const EarthConstants = require('@flywave/flywave-geoutils').EarthConstants;
        const C = EarthConstants.EQUATORIAL_CIRCUMFERENCE;
        const tiles = this.getDecodedTiles();
        for (const tile of tiles) {
            const tk = tile.tileKey;
            if (!tk)
                continue;
            const n = Math.pow(2, tk.level);
            const ts = C / n;
            const x0 = tk.column * ts;
            const x1 = (tk.column + 1) * ts;
            const y0 = C - (tk.row + 1) * ts;
            const y1 = C - tk.row * ts;
            positions.push(x0, 0, y0, x1, 0, y0, x1, 0, y0, x1, 0, y1, x1, 0, y1, x0, 0, y1, x0, 0, y1, x0, 0, y0);
        }
        const geo = this.m_debugLines.geometry;
        geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        geo.attributes.position.needsUpdate = true;
    }
    async loadSpriteAtlas(spriteUrl) {
        var _a, _b, _c, _d;
        const spriteData = await this.m_styleManager.loadSprite(spriteUrl);
        this.m_themedIconCanvases = [];
        if (spriteData) {
            const icons = new Map();
            for (const [name, info] of Object.entries(spriteData.json)) {
                icons.set(name, info);
            }
            MBExpressionEngine_1.MBExpressionEngine.setAvailableImages(new Set(icons.keys()));
            const spriteInfos = new Map();
            for (const [name, info] of icons) {
                spriteInfos.set(name, {
                    width: info.width,
                    height: info.height,
                    pixelRatio: info.pixelRatio,
                });
            }
            MBTileDataEmitter_1.MBTileDataEmitter.setSpriteInfos(spriteInfos);
            this.m_spriteAtlas = new MapIconMaterial_1.SpriteAtlas(spriteData.image, icons);
            if (this.mapView) {
                const userImageCache = this.mapView.userImageCache;
                if (userImageCache && typeof userImageCache.addImage === 'function') {
                    const atlasImage = spriteData.image;
                    for (const [name, info] of icons) {
                        try {
                            if (typeof document !== 'undefined') {
                                const canvas = document.createElement('canvas');
                                canvas.width = info.width;
                                canvas.height = info.height;
                                const ctx = canvas.getContext('2d');
                                ctx.drawImage(atlasImage, info.x, info.y, info.width, info.height, 0, 0, info.width, info.height);
                                if (info.sdf === true) {
                                    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                                    const d = imgData.data;
                                    for (let p = 0; p < d.length; p += 4) {
                                        d[p] = 255;
                                        d[p + 1] = 255;
                                        d[p + 2] = 255;
                                    }
                                    ctx.putImageData(imgData, 0, 0);
                                    const item = userImageCache.addImage(name, canvas);
                                    if (item && typeof item.then !== 'function') {
                                        item.sdf = true;
                                    }
                                    continue;
                                }
                                userImageCache.addImage(name, canvas);
                                this.m_themedIconCanvases.push(canvas);
                            }
                        }
                        catch (_e) { }
                    }
                }
            }
        }
        if (this.m_colorThemeLut && this.m_spriteAtlas) {
            try {
                this.m_spriteAtlas.applyColorTheme(this.m_colorThemeLut);
                const { applyColorThemeToPixels, bumpThemeGeneration } = require('./MBColorTheme');
                for (const cv of this.m_themedIconCanvases) {
                    const ctx = cv.getContext('2d');
                    if (!ctx)
                        continue;
                    this.m_iconCanvasPristine.set(cv, ctx.getImageData(0, 0, cv.width, cv.height));
                    const img = ctx.createImageData(cv.width, cv.height);
                    img.data.set(this.m_iconCanvasPristine.get(cv).data);
                    applyColorThemeToPixels(this.m_colorThemeLut, img.data);
                    ctx.putImageData(img, 0, 0);
                }
                bumpThemeGeneration();
                (_b = (_a = this.mapView) === null || _a === void 0 ? void 0 : _a.markTilesDirty) === null || _b === void 0 ? void 0 : _b.call(_a, this);
                (_d = (_c = this.mapView) === null || _c === void 0 ? void 0 : _c.update) === null || _d === void 0 ? void 0 : _d.call(_c);
            }
            catch (_f) { }
        }
    }
    async loadGlyphMetrics(style) {
        var _a, _b;
        const glyphsUrl = style.glyphs;
        if (!glyphsUrl)
            return;
        const fontStacks = new Set();
        for (const layer of (_a = style.layers) !== null && _a !== void 0 ? _a : []) {
            const tf = (_b = layer.layout) === null || _b === void 0 ? void 0 : _b['text-font'];
            if (Array.isArray(tf) && tf.length > 0) {
                fontStacks.add(tf.join(','));
            }
        }
        if (fontStacks.size === 0)
            return;
        const { loadGlyphMetrics } = await Promise.resolve().then(() => __importStar(require('./MBGlyphLoader')));
        const RANGES = [0, 1];
        for (const stack of fontStacks) {
            const primaryFont = stack.split(',')[0];
            await loadGlyphMetrics(primaryFont, RANGES, glyphsUrl, this.m_glyphMetrics);
        }
        this.decoder.configure(undefined, {
            mbStyle: style,
            glyphMetrics: this.m_glyphMetrics,
        });
    }
    async setTheme(_theme) {
    }
    async reloadStyle() {
        var _a, _b, _c, _d, _e, _f, _g, _h;
        const style = (_b = (_a = this.m_runtime) === null || _a === void 0 ? void 0 : _a.style) !== null && _b !== void 0 ? _b : (_c = this.m_styleManager) === null || _c === void 0 ? void 0 : _c.getStyle();
        if (!style || !this.mapView)
            return;
        this.applyBackgroundColor(style);
        this.applyCameraSettings(style);
        this.applyProjection(style);
        this.buildClipMask(style);
        const newSprite = style.sprite;
        if (newSprite && newSprite !== this.m_lastAppliedSprite) {
            await this.loadSpriteAtlas(newSprite);
            this.m_lastAppliedSprite = newSprite;
        }
        const newGlyphs = style.glyphs;
        if (newGlyphs && newGlyphs !== this.m_lastAppliedGlyphs) {
            this.m_glyphMetrics.clear();
            await this.loadGlyphMetrics(style);
            this.m_lastAppliedGlyphs = newGlyphs;
        }
        if (this.m_environment) {
            this.m_environment.applyLights(((_d = style.lights) !== null && _d !== void 0 ? _d : style.light) ? [style.light] : undefined);
            this.applyBackgroundColor(style);
            this.m_environment.applyFog(style.fog, (_e = style.zoom) !== null && _e !== void 0 ? _e : 0);
            this.m_environment.applySky((_f = this.buildSkyFromLayers(style)) !== null && _f !== void 0 ? _f : style.sky, style.fog);
        }
        if (this.m_environment && style.terrain) {
            try {
                await this.m_environment.applyTerrain(style.terrain, this.m_demTileUrl, (_g = style.zoom) !== null && _g !== void 0 ? _g : 8, (_h = style.center) !== null && _h !== void 0 ? _h : [0, 0], this.m_demMaxZoom, this.m_demTileSize);
            }
            catch (_j) { }
        }
        try {
            await this.loadModels(style);
        }
        catch (_k) { }
        this.decoder.configure(undefined, {
            mbStyle: style,
            currentSourceId: this.m_currentSourceId,
            glyphMetrics: this.m_glyphMetrics.size > 0 ? this.m_glyphMetrics : undefined,
            clipMask: Object.fromEntries(this.m_clipMask),
        });
        this.mapView.markTilesDirty(this);
        this.mapView.update();
    }
    setFeatureState(featureId, state) {
        const normalizedKey = this.normalizeFeatureStateKey(featureId);
        super.setFeatureState(normalizedKey, state);
        if (this.mapView) {
            this.mapView.markTilesDirty(this);
        }
        this.requestUpdate();
        if (!this.m_featureStates) {
            this.m_featureStates = new Map();
        }
        this.m_featureStates.set(normalizedKey, state);
        this.decoder.configure(undefined, {
            mbStyle: this.m_styleManager.getStyle(),
            currentSourceId: this.m_currentSourceId,
            featureStates: this.m_featureStates,
        });
    }
    removeFeatureState(featureId) {
        var _a;
        const normalizedKey = this.normalizeFeatureStateKey(featureId);
        super.removeFeatureState(normalizedKey);
        if (this.mapView) {
            this.mapView.markTilesDirty(this);
        }
        const states = this.m_featureStates;
        if (states) {
            states.delete(normalizedKey);
        }
        this.decoder.configure(undefined, {
            mbStyle: this.m_styleManager.getStyle(),
            currentSourceId: this.m_currentSourceId,
            featureStates: (_a = this.m_featureStates) !== null && _a !== void 0 ? _a : new Map(),
        });
    }
    dispose() {
        var _a, _b, _c, _d;
        (_b = (_a = this.m_heatmapRenderer) === null || _a === void 0 ? void 0 : _a.dispose) === null || _b === void 0 ? void 0 : _b.call(_a);
        (_d = (_c = this.m_additiveLineRenderer) === null || _c === void 0 ? void 0 : _c.dispose) === null || _d === void 0 ? void 0 : _d.call(_c);
        this.m_heatmapRenderer = null;
        super.dispose();
    }
    normalizeFeatureStateKey(featureId) {
        var _a, _b;
        if (typeof featureId === 'object' && featureId !== null) {
            const desc = featureId;
            const id = (_a = desc === null || desc === void 0 ? void 0 : desc.id) !== null && _a !== void 0 ? _a : desc === null || desc === void 0 ? void 0 : desc.featureId;
            return (id === undefined || id === null) ? String((_b = desc === null || desc === void 0 ? void 0 : desc.source) !== null && _b !== void 0 ? _b : '') : id;
        }
        return featureId;
    }
    refreshDecoderBrightness() {
        var _a, _b, _c, _d, _e, _f, _g, _h;
        const style = this.m_styleManager.getStyle();
        this.decoder.configure(undefined, {
            mbStyle: style,
            currentSourceId: this.m_currentSourceId,
            demTileUrl: this.m_demTileUrl,
            pitch: (_a = style.pitch) !== null && _a !== void 0 ? _a : 0,
            bearing: (_b = style.bearing) !== null && _b !== void 0 ? _b : 0,
            brightness: (_d = (_c = this.m_environment) === null || _c === void 0 ? void 0 : _c.brightness) !== null && _d !== void 0 ? _d : 0,
            clipMask: Object.fromEntries(this.m_clipMask),
            worldview: (_g = (_f = (_e = style.metadata) === null || _e === void 0 ? void 0 : _e.test) === null || _f === void 0 ? void 0 : _f.worldview) !== null && _g !== void 0 ? _g : '',
            center: (_h = style.center) !== null && _h !== void 0 ? _h : [0, 0],
        });
        if (this.mapView) {
            this.mapView.markTilesDirty(this);
        }
    }
    shouldPreloadTiles() {
        return true;
    }
    getDataZoomLevel(zoomLevel) {
        return Math.max(this.minDataLevel, Math.min(this.maxDataLevel, zoomLevel + this.storageLevelOffset));
    }
    buildSkyFromLayers(style) {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l;
        const skyLayers = ((_a = style.layers) !== null && _a !== void 0 ? _a : []).filter((l) => l.type === 'sky');
        if (skyLayers.length === 0)
            return undefined;
        const paint = {};
        for (const layer of skyLayers) {
            Object.assign(paint, (_b = layer.paint) !== null && _b !== void 0 ? _b : {});
        }
        return {
            'sky-type': (_c = paint['sky-type']) !== null && _c !== void 0 ? _c : 'gradient',
            'sky-gradient': (_d = paint['sky-gradient']) !== null && _d !== void 0 ? _d : 'interpolate',
            'sky-gradient-center': (_e = paint['sky-gradient-center']) !== null && _e !== void 0 ? _e : [0, 0],
            'sky-gradient-radius': (_f = paint['sky-gradient-radius']) !== null && _f !== void 0 ? _f : 90,
            'sky-opacity': (_g = paint['sky-opacity']) !== null && _g !== void 0 ? _g : 1,
            'sky-atmosphere-sun': (_h = paint['sky-atmosphere-sun']) !== null && _h !== void 0 ? _h : [0, 0],
            'sky-atmosphere-sun-intensity': (_j = paint['sky-atmosphere-sun-intensity']) !== null && _j !== void 0 ? _j : 1,
            'sky-atmosphere-color': (_k = paint['sky-atmosphere-color']) !== null && _k !== void 0 ? _k : '#88c6fc',
            'sky-atmosphere-halo-color': (_l = paint['sky-atmosphere-halo-color']) !== null && _l !== void 0 ? _l : '#84a6c9',
        };
    }
    applyBackgroundColor(style) {
        var _a, _b, _c, _d, _e, _f, _g, _h;
        for (const layer of (_a = style.layers) !== null && _a !== void 0 ? _a : []) {
            if (layer.type === 'background') {
                const vis = (_c = (_b = layer.layout) === null || _b === void 0 ? void 0 : _b.visibility) !== null && _c !== void 0 ? _c : 'visible';
                if (vis === 'none') {
                    return;
                }
                const paint = (_d = layer.paint) !== null && _d !== void 0 ? _d : {};
                const rawColor = paint['background-color'];
                const opacity = (_e = paint['background-opacity']) !== null && _e !== void 0 ? _e : 1;
                let color = '#000000';
                if (rawColor) {
                    try {
                        const { MBExpressionEngine } = require('./MBExpressionEngine');
                        const evaluated = MBExpressionEngine.evaluate(rawColor, {
                            zoom: (_f = style.zoom) !== null && _f !== void 0 ? _f : 0,
                            feature: undefined,
                        });
                        if (typeof evaluated === 'string')
                            color = evaluated;
                    }
                    catch (_j) { }
                }
                if (paint['background-color-use-theme'] !== 'none') {
                    const scope = layer._importScope;
                    const lut = (scope && this.m_importLuts.has(scope))
                        ? this.m_importLuts.get(scope)
                        : this.m_colorThemeLut;
                    if (lut) {
                        try {
                            const { applyColorTheme } = require('./MBColorTheme');
                            color = applyColorTheme(lut, color);
                        }
                        catch (_k) { }
                    }
                }
                if (this.mapView) {
                    const c = new THREE.Color(color);
                    const ls = (_g = this.m_environment) === null || _g === void 0 ? void 0 : _g.lighting3DState;
                    if (ls) {
                        const rad = ls.groundRadiance;
                        const radLin = [
                            Math.pow(rad[0], 2.2),
                            Math.pow(rad[1], 2.2),
                            Math.pow(rad[2], 2.2),
                        ];
                        const lit = new THREE.Color(c.r * radLin[0], c.g * radLin[1], c.b * radLin[2]);
                        const emissive = Number((_h = paint['background-emissive-strength']) !== null && _h !== void 0 ? _h : 0);
                        if (emissive > 0)
                            lit.lerp(c, Math.min(emissive, 1));
                        this.mapView.clearColor = lit.getHex();
                    }
                    else {
                        this.mapView.clearColor = c.getHex();
                    }
                    this.mapView.clearAlpha = opacity;
                }
                return;
            }
        }
    }
    applyProjection(style) {
        var _a;
        if (!this.mapView)
            return;
        const styleProj = style.projection;
        const projName = typeof styleProj === 'string' ? styleProj : styleProj === null || styleProj === void 0 ? void 0 : styleProj.name;
        const projConfig = { name: projName !== null && projName !== void 0 ? projName : 'mercator', center: styleProj === null || styleProj === void 0 ? void 0 : styleProj.center, parallels: styleProj === null || styleProj === void 0 ? void 0 : styleProj.parallels };
        if (projConfig.name !== 'mercator' && projConfig.name !== 'globe') {
            try {
                const { MBMapProjection } = require('./MBMapProjection');
                const customProj = new MBMapProjection(projConfig);
                this.mapView.projection = customProj;
                return;
            }
            catch (_b) { }
        }
        if (projConfig.name === 'globe') {
            this.mapView.projection = flywave_geoutils_1.sphereProjection;
        }
        else {
            const currentType = (_a = this.mapView.projection) === null || _a === void 0 ? void 0 : _a.type;
            if (currentType === flywave_geoutils_1.ProjectionType.Spherical) {
                this.mapView.projection = flywave_geoutils_1.mercatorProjection;
            }
        }
    }
    applyCameraSettings(style) {
        var _a, _b, _c;
        if (!this.mapView)
            return;
        const center = (_a = style.center) !== null && _a !== void 0 ? _a : [0, 0];
        const pitch = (_b = style.pitch) !== null && _b !== void 0 ? _b : 0;
        const zoom = (typeof style.zoom === 'number' ? style.zoom : 0) + 1;
        const bearing = -((_c = style.bearing) !== null && _c !== void 0 ? _c : 0);
        try {
            const { GeoCoordinates } = require('@flywave/flywave-geoutils');
            const geoCoord = new GeoCoordinates(center[1], center[0]);
            this.mapView.setCameraGeolocationAndZoom(geoCoord, zoom, bearing, pitch);
        }
        catch (_d) { }
    }
    pushMapboxZoom() {
        var _a, _b, _c;
        try {
            const camZoom = (_a = this.mapView) === null || _a === void 0 ? void 0 : _a.zoomLevel;
            if (typeof camZoom === 'number') {
                (_c = (_b = this.decoder).configure) === null || _c === void 0 ? void 0 : _c.call(_b, undefined, {
                    mapboxZoom: Math.max(0, camZoom - 1),
                });
            }
        }
        catch (_d) { }
    }
    buildClipMask(style) {
        var _a, _b, _c, _d, _e, _f;
        this.m_clipMask.clear();
        const clipLayers = ((_a = style.layers) !== null && _a !== void 0 ? _a : []).filter((l) => l.type === 'clip');
        for (const clipLayer of clipLayers) {
            const layerTypes = (_c = (_b = clipLayer.layout) === null || _b === void 0 ? void 0 : _b['clip-layer-types']) !== null && _c !== void 0 ? _c : [];
            const sourceId = clipLayer.source;
            if (!sourceId)
                continue;
            const source = style.sources[sourceId];
            if (!source)
                continue;
            let rings = [];
            const data = source.data;
            if ((data === null || data === void 0 ? void 0 : data.type) === 'Polygon') {
                rings = data.coordinates;
            }
            else if ((data === null || data === void 0 ? void 0 : data.type) === 'MultiPolygon') {
                rings = data.coordinates.flat();
            }
            else if ((data === null || data === void 0 ? void 0 : data.type) === 'FeatureCollection') {
                for (const f of (_d = data.features) !== null && _d !== void 0 ? _d : []) {
                    if (((_e = f.geometry) === null || _e === void 0 ? void 0 : _e.type) === 'Polygon')
                        rings.push(...f.geometry.coordinates);
                    if (((_f = f.geometry) === null || _f === void 0 ? void 0 : _f.type) === 'MultiPolygon')
                        rings.push(...f.geometry.coordinates.flat());
                }
            }
            for (const lt of layerTypes) {
                this.m_clipMask.set(lt, rings);
            }
        }
    }
    static pointInPolygonRing(lng, lat, ring) {
        let inside = false;
        for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
            const xi = ring[i][0], yi = ring[i][1];
            const xj = ring[j][0], yj = ring[j][1];
            const intersect = ((yi > lat) !== (yj > lat)) &&
                (lng < (xj - xi) * (lat - yi) / (yj - yi + 1e-15) + xi);
            if (intersect)
                inside = !inside;
        }
        return inside;
    }
}
exports.MBStyleDataSource = MBStyleDataSource;
//# sourceMappingURL=MBStyleDataSource.js.map