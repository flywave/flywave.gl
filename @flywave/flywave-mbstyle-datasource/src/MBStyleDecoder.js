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
exports.MBStyleDecoder = void 0;
const index_worker_1 = require("@flywave/flywave-mapview-decoder/index-worker");
const OmvDataAdapter_1 = require("@flywave/flywave-vectortile-datasource/adapters/omv/OmvDataAdapter");
const GeoJsonDataAdapter_1 = require("@flywave/flywave-vectortile-datasource/adapters/geojson/GeoJsonDataAdapter");
const DecodeInfo_1 = require("@flywave/flywave-vectortile-datasource/DecodeInfo");
const OmvUtils_1 = require("@flywave/flywave-vectortile-datasource/OmvUtils");
const THREE = __importStar(require("three"));
const MBLayerEvaluator_1 = require("./MBLayerEvaluator");
const MBTileDataEmitter_1 = require("./MBTileDataEmitter");
class MBStyleDataProcessor {
    setMvtYOffset(offset) {
        this.m_mvtYOffset = offset;
    }
    mvtTransform(p) {
        if (this.m_mvtYOffset === null)
            return p;
        return new THREE.Vector2(p.x, this.m_mvtYOffset - p.y);
    }
    transformLineGeometry(geometry) {
        if (this.m_mvtYOffset === null)
            return geometry;
        return geometry.map(g => (Object.assign(Object.assign({}, g), { positions: g.positions.map(p => this.mvtTransform(p)) })));
    }
    transformPolygonGeometry(geometry) {
        if (this.m_mvtYOffset === null)
            return geometry;
        return geometry.map(g => (Object.assign(Object.assign({}, g), { rings: g.rings.map(ring => ring.map(p => this.mvtTransform(p))) })));
    }
    transformPoints(points) {
        if (this.m_mvtYOffset === null)
            return points;
        return points.map(p => new THREE.Vector3(p.x, this.m_mvtYOffset - p.y, p.z));
    }
    constructor(m_tileKey, m_decodeInfo, m_layerEvaluator, m_sourceId, m_zoom, m_pitch = 0, m_brightness = 0, m_clipMask = {}, m_worldview = '', m_center = [0, 0]) {
        this.m_tileKey = m_tileKey;
        this.m_decodeInfo = m_decodeInfo;
        this.m_layerEvaluator = m_layerEvaluator;
        this.m_sourceId = m_sourceId;
        this.m_zoom = m_zoom;
        this.m_pitch = m_pitch;
        this.m_brightness = m_brightness;
        this.m_clipMask = m_clipMask;
        this.m_worldview = m_worldview;
        this.m_center = m_center;
        this.m_featureStates = new Map();
        this.m_mvtYOffset = null;
        this.m_lastExtents = 4096;
    }
    setEmitter(emitter) {
        this.m_emitter = emitter;
    }
    setFeatureStates(states) {
        this.m_featureStates = states;
    }
    isClipped(layerType, lng, lat) {
        const rings = this.m_clipMask[layerType];
        if (!rings || rings.length === 0)
            return false;
        const exterior = rings[0];
        if (!exterior)
            return false;
        if (!MBStyleDataProcessor.pointInPolygonRing(lng, lat, exterior))
            return true;
        for (let h = 1; h < rings.length; h++) {
            if (MBStyleDataProcessor.pointInPolygonRing(lng, lat, rings[h]))
                return true;
        }
        return false;
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
    getFeatureState(featureId) {
        if (featureId === undefined)
            return undefined;
        const direct = this.m_featureStates.get(featureId);
        if (direct)
            return direct;
        const alt = typeof featureId === 'number' ? String(featureId) : Number(featureId);
        return this.m_featureStates.get(alt);
    }
    tileToLocalLngLat(px, py, extent = 4096) {
        const tCol = this.m_tileKey.column;
        const tRow = this.m_tileKey.row;
        const n = Math.pow(2, this.m_tileKey.level);
        const lng = ((tCol + px / extent) / n) * 360 - 180;
        const latRad = Math.atan(Math.sinh(Math.PI * (1 - 2 * (tRow + py / extent) / n)));
        const lat = latRad * 180 / Math.PI;
        return [lng, lat];
    }
    processPointFeature(layer, extents, geometry, properties, featureId) {
        var _a;
        if (extents > 0 && extents !== this.m_lastExtents) {
            this.m_lastExtents = extents;
            (_a = this.m_emitter) === null || _a === void 0 ? void 0 : _a.setExtents(extents);
        }
        const coords = geometry.length > 0
            ? this.tileToLocalLngLat(geometry[0].x, geometry[0].y, extents)
            : [0, 0];
        const effectiveSourceId = (properties === null || properties === void 0 ? void 0 : properties._sourceId) || this.m_sourceId;
        const matched = this.m_layerEvaluator.evaluate(effectiveSourceId, layer, { type: 'Point', properties, id: featureId, _geom: { type: 'Point', coordinates: coords } }, this.m_zoom, 'point', this.getFeatureState(featureId), this.m_pitch, this.m_brightness, this.m_worldview, this.m_center);
        if (matched.length === 0 || !this.m_emitter)
            return;
        const visible = matched.filter(l => !this.isClipped(l.type, coords[0], coords[1]));
        if (visible.length === 0)
            return;
        this.m_emitter.processPointFeature(layer, extents, this.transformPoints(geometry), properties, featureId, visible);
    }
    processLineFeature(layer, extents, geometry, properties, featureId) {
        var _a;
        if (extents > 0 && extents !== this.m_lastExtents) {
            this.m_lastExtents = extents;
            (_a = this.m_emitter) === null || _a === void 0 ? void 0 : _a.setExtents(extents);
        }
        const coords = geometry.length > 0 && geometry[0].positions.length > 0
            ? this.tileToLocalLngLat(geometry[0].positions[0].x, geometry[0].positions[0].y, extents)
            : [0, 0];
        let lineVertices;
        if (geometry.length > 0 && geometry[0].positions.length > 1) {
            const positions = geometry[0].positions;
            const step = Math.max(1, Math.floor(positions.length / 20));
            lineVertices = [];
            for (let i = 0; i < positions.length; i += step) {
                lineVertices.push(this.tileToLocalLngLat(positions[i].x, positions[i].y, extents));
            }
        }
        const feat = {
            type: 'LineString',
            properties,
            id: featureId,
            _geom: { type: 'Point', coordinates: coords },
        };
        if (lineVertices)
            feat._lineGeom = lineVertices;
        const effectiveSourceId = (properties === null || properties === void 0 ? void 0 : properties._sourceId) || this.m_sourceId;
        const matched = this.m_layerEvaluator.evaluate(effectiveSourceId, layer, feat, this.m_zoom, 'line', this.getFeatureState(featureId), this.m_pitch, this.m_brightness, this.m_worldview, this.m_center);
        if (matched.length === 0 || !this.m_emitter)
            return;
        const symbolLayers = matched.filter(l => l.type === 'symbol' && !this.isClipped('symbol', coords[0], coords[1]));
        const nonSymbolLayers = matched.filter(l => l.type !== 'symbol' && l.type !== 'circle' && !this.isClipped(l.type, coords[0], coords[1]));
        const circleLayers = matched.filter(l => l.type === 'circle' && !this.isClipped('circle', coords[0], coords[1]));
        if (nonSymbolLayers.length > 0) {
            this.m_emitter.processLineFeature(layer, extents, this.transformLineGeometry(geometry), properties, featureId, nonSymbolLayers);
        }
        if (circleLayers.length > 0 && geometry.length > 0 && geometry[0].positions.length > 0) {
            const pts = this.transformPoints(geometry[0].positions.map((p) => new THREE.Vector3(p.x, p.y, 0)));
            this.m_emitter.processPointFeature(layer, extents, pts, properties, featureId, circleLayers);
        }
        if (symbolLayers.length > 0 && geometry.length > 0 && geometry[0].positions.length > 1) {
            const linePts = [];
            const positions = geometry[0].positions;
            const step = Math.max(1, Math.floor(positions.length / 20));
            for (let i = 0; i < positions.length; i += step) {
                linePts.push(new THREE.Vector3(positions[i].x, positions[i].y, 0));
            }
            if (linePts.length >= 2) {
                const midIdx = Math.floor(linePts.length / 2);
                const midPt = linePts[midIdx];
                const transformedPts = this.transformPoints(linePts);
                this.m_emitter.processPointFeature(layer, extents, this.transformPoints([midPt]), Object.assign(Object.assign({}, properties), { _linePath: transformedPts.map(p => [p.x, p.y]) }), featureId, symbolLayers);
            }
        }
    }
    processPolygonFeature(layer, extents, geometry, properties, featureId) {
        const coords = geometry.length > 0 && geometry[0].rings.length > 0 && geometry[0].rings[0].length > 0
            ? this.tileToLocalLngLat(geometry[0].rings[0][0].x, geometry[0].rings[0][0].y, extents)
            : [0, 0];
        let polyRings;
        if (geometry.length > 0 && geometry[0].rings.length > 0) {
            polyRings = geometry[0].rings.map((ring) => {
                const step = Math.max(1, Math.floor(ring.length / 20));
                const out = [];
                for (let i = 0; i < ring.length; i += step) {
                    out.push(this.tileToLocalLngLat(ring[i].x, ring[i].y, extents));
                }
                return out;
            });
        }
        const feat = {
            type: 'Polygon',
            properties,
            id: featureId,
            _geom: { type: 'Point', coordinates: coords },
        };
        if (polyRings)
            feat._polyGeom = polyRings;
        const effectiveSourceId = (properties === null || properties === void 0 ? void 0 : properties._sourceId) || this.m_sourceId;
        const matched = this.m_layerEvaluator.evaluate(effectiveSourceId, layer, feat, this.m_zoom, 'polygon', this.getFeatureState(featureId), this.m_pitch, this.m_brightness, this.m_worldview, this.m_center);
        if (matched.length === 0 || !this.m_emitter)
            return;
        const visible = matched.filter(l => !this.isClipped(l.type, coords[0], coords[1]));
        if (visible.length === 0)
            return;
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
class MBStyleDecoder extends index_worker_1.ThemedTileDecoder {
    constructor() {
        super();
        this.m_currentSourceId = '';
        this.m_featureStates = new Map();
        this.m_pitch = 0;
        this.m_brightness = 0;
        this.m_clipMask = {};
        this.m_worldview = '';
        this.m_center = [0, 0];
        this.m_bearing = 0;
        this.m_glyphMetrics = new Map();
        this.m_omvAdapter = new OmvDataAdapter_1.OmvDataAdapter();
        this.m_geoJsonAdapter = new GeoJsonDataAdapter_1.GeoJsonDataAdapter({ mglCompat: true });
    }
    connect() {
        return Promise.resolve();
    }
    configure(options, customOptions) {
        super.configure(options, customOptions);
        if (customOptions === null || customOptions === void 0 ? void 0 : customOptions.mbStyle) {
            this.m_layerEvaluator = new MBLayerEvaluator_1.MBLayerEvaluator(customOptions.mbStyle);
        }
        if (customOptions === null || customOptions === void 0 ? void 0 : customOptions.currentSourceId) {
            this.m_currentSourceId = customOptions.currentSourceId;
        }
        if (customOptions === null || customOptions === void 0 ? void 0 : customOptions.featureStates) {
            this.m_featureStates = customOptions.featureStates;
        }
        if ((customOptions === null || customOptions === void 0 ? void 0 : customOptions.pitch) !== undefined) {
            this.m_pitch = customOptions.pitch;
        }
        if ((customOptions === null || customOptions === void 0 ? void 0 : customOptions.brightness) !== undefined) {
            this.m_brightness = customOptions.brightness;
        }
        if ((customOptions === null || customOptions === void 0 ? void 0 : customOptions.clipMask) !== undefined) {
            this.m_clipMask = customOptions.clipMask;
        }
        if ((customOptions === null || customOptions === void 0 ? void 0 : customOptions.worldview) !== undefined) {
            this.m_worldview = customOptions.worldview;
        }
        if ((customOptions === null || customOptions === void 0 ? void 0 : customOptions.center) !== undefined) {
            const c = customOptions.center;
            if (Array.isArray(c) && c.length >= 2) {
                this.m_center = [c[0], c[1]];
            }
        }
        if ((customOptions === null || customOptions === void 0 ? void 0 : customOptions.bearing) !== undefined) {
            this.m_bearing = customOptions.bearing;
        }
        if ((customOptions === null || customOptions === void 0 ? void 0 : customOptions.glyphMetrics) !== undefined) {
            this.m_glyphMetrics = customOptions.glyphMetrics;
        }
        if ((customOptions === null || customOptions === void 0 ? void 0 : customOptions.mapboxZoom) !== undefined) {
            this.m_mapboxZoom = customOptions.mapboxZoom;
        }
    }
    buildGlyphLookup() {
        const metrics = this.m_glyphMetrics;
        return {
            getMetrics(font, char) {
                const direct = metrics.get(`${font}:${char}`);
                if (direct)
                    return direct;
                if (font && font.includes(',')) {
                    for (const f of font.split(',').map(s => s.trim())) {
                        const m = metrics.get(`${f}:${char}`);
                        if (m)
                            return m;
                    }
                }
                if (font) {
                    const base = font.split(' ').slice(0, -1).join(' ');
                    if (base) {
                        const m = metrics.get(`${base}:${char}`);
                        if (m)
                            return m;
                    }
                }
                return undefined;
            },
        };
    }
    decodeTile(data, tileKey, projection) {
        if (!this.m_layerEvaluator) {
            return Promise.resolve(undefined);
        }
        return this.decodeThemedTile(data, tileKey, undefined, projection);
    }
    async decodeThemedTile(data, tileKey, _styleSetEvaluator, projection) {
        if (!this.m_layerEvaluator) {
            return { techniques: [], geometries: [] };
        }
        const zoom = Math.max(0, this.m_mapboxZoom !== undefined
            ? this.m_mapboxZoom
            : tileKey.level - this.m_storageLevelOffset - 1);
        const decodeInfo = new DecodeInfo_1.DecodeInfo(projection, tileKey, this.m_storageLevelOffset);
        const emitter = new MBTileDataEmitter_1.MBTileDataEmitter(tileKey, decodeInfo, zoom);
        emitter.setBearing(this.m_bearing);
        if (this.m_glyphMetrics.size > 0) {
            emitter.setGlyphLookup(this.buildGlyphLookup());
        }
        const processor = new MBStyleDataProcessor(tileKey, decodeInfo, this.m_layerEvaluator, this.m_currentSourceId, zoom, this.m_pitch, this.m_brightness, this.m_clipMask, this.m_worldview, this.m_center);
        processor.setEmitter(emitter);
        processor.setFeatureStates(this.m_featureStates);
        try {
            if (data instanceof ArrayBuffer || data instanceof Uint8Array) {
                const buffer = data instanceof Uint8Array ? data.buffer : data;
                const N = Math.log2(emitter.extents);
                const scale = Math.pow(2, tileKey.level + N);
                const { north } = decodeInfo.geoBox;
                const top = (0, OmvUtils_1.lat2tile)(north, tileKey.level + N);
                processor.setMvtYOffset(scale - 2 * top);
                this.m_omvAdapter.process(buffer, decodeInfo, processor);
            }
            else if (typeof data === 'string') {
                const N = Math.log2(emitter.extents);
                const scale = Math.pow(2, tileKey.level + N);
                const { north } = decodeInfo.geoBox;
                const top = (0, OmvUtils_1.lat2tile)(north, tileKey.level + N);
                processor.setMvtYOffset(scale - 2 * top);
                const geoJson = JSON.parse(data);
                const normalized = MBStyleDecoder.normalizeGeoJson(geoJson);
                if (this.m_geoJsonAdapter.canProcess(normalized)) {
                    this.m_geoJsonAdapter.process(normalized, decodeInfo, processor);
                }
            }
            else if (typeof data === 'object' && data !== null && !Array.isArray(data)) {
                const N = Math.log2(emitter.extents);
                const scale = Math.pow(2, tileKey.level + N);
                const { north } = decodeInfo.geoBox;
                const top = (0, OmvUtils_1.lat2tile)(north, tileKey.level + N);
                processor.setMvtYOffset(scale - 2 * top);
                const normalized = MBStyleDecoder.normalizeGeoJson(data);
                if (this.m_geoJsonAdapter.canProcess(normalized)) {
                    this.m_geoJsonAdapter.process(normalized, decodeInfo, processor);
                }
            }
        }
        catch (e) {
            return { techniques: [], geometries: [] };
        }
        return emitter.getDecodedTile();
    }
    static normalizeGeoJson(data) {
        if (!data || typeof data !== 'object')
            return data;
        if (data.type === 'FeatureCollection' && Array.isArray(data.features)) {
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
exports.MBStyleDecoder = MBStyleDecoder;
//# sourceMappingURL=MBStyleDecoder.js.map