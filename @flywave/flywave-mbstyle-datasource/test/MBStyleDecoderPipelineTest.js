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
const chai_1 = require("chai");
const flywave_geoutils_1 = require("@flywave/flywave-geoutils");
const THREE = __importStar(require("three"));
const MBEnvironmentManager_1 = require("../src/MBEnvironmentManager");
const MBLayerEvaluator_1 = require("../src/MBLayerEvaluator");
const MBTileDataEmitter_1 = require("../src/MBTileDataEmitter");
const MBHeatmapRenderer_1 = require("../src/MBHeatmapRenderer");
const PROJECTION = flywave_geoutils_1.webMercatorTilingScheme.projection;
function createDecodeInfo(tileKey) {
    const geoBox = flywave_geoutils_1.webMercatorTilingScheme.getGeoBox(tileKey);
    const projectedBoundingBox = new flywave_geoutils_1.OrientedBox3();
    PROJECTION.projectBox(geoBox, projectedBoundingBox);
    const center = new THREE.Vector3();
    projectedBoundingBox.getCenter(center);
    return {
        geoBox,
        center,
        targetProjection: PROJECTION,
        tileKey,
        worldTileProjectionCookie: undefined,
        tilingScheme: flywave_geoutils_1.webMercatorTilingScheme,
        projectedBoundingBox,
        tileBounds: new THREE.Box3(),
        tileSize: new THREE.Vector3(),
        tileSizeOnScreen: 256,
        columnCount: 1,
        rowCount: 1,
    };
}
describe('MBStyle decode pipeline', () => {
    it('produces valid DecodedTile from fill features', () => {
        const style = {
            version: 8,
            sources: {},
            layers: [
                { id: 'fill', type: 'fill', source: 'geojson', paint: { 'fill-color': '#ff0000', 'fill-opacity': 0.8 } },
            ],
        };
        const evaluator = new MBLayerEvaluator_1.MBLayerEvaluator(style);
        const tileKey = flywave_geoutils_1.TileKey.fromRowColumnLevel(0, 0, 0);
        const decodeInfo = createDecodeInfo(tileKey);
        const emitter = new MBTileDataEmitter_1.MBTileDataEmitter(tileKey, decodeInfo, 0);
        const polygon = {
            rings: [[
                    new THREE.Vector2(0, 0),
                    new THREE.Vector2(100, 0),
                    new THREE.Vector2(100, 100),
                    new THREE.Vector2(0, 100),
                    new THREE.Vector2(0, 0),
                ]],
        };
        const matched = evaluator.evaluate('geojson', '', { type: 'Polygon', properties: {} }, 0, 'polygon');
        (0, chai_1.expect)(matched.length).to.equal(1);
        emitter.processFillFeature('geojson', 4096, [polygon], {}, undefined, matched);
        const decodedTile = emitter.getDecodedTile();
        (0, chai_1.expect)(decodedTile.techniques.length).to.be.greaterThan(0);
        (0, chai_1.expect)(decodedTile.geometries.length).to.be.greaterThan(0);
        const tech = decodedTile.techniques[0];
        (0, chai_1.expect)(tech.name).to.equal('fill');
        (0, chai_1.expect)(tech.color).to.equal('#ff0000');
        (0, chai_1.expect)(tech.opacity).to.equal(0.8);
    });
    it('produces valid DecodedTile from line features', () => {
        const style = {
            version: 8,
            sources: {},
            layers: [
                { id: 'line', type: 'line', source: 'geojson', paint: { 'line-color': '#0000ff', 'line-width': 3 } },
            ],
        };
        const evaluator = new MBLayerEvaluator_1.MBLayerEvaluator(style);
        const tileKey = flywave_geoutils_1.TileKey.fromRowColumnLevel(0, 0, 0);
        const decodeInfo = createDecodeInfo(tileKey);
        const emitter = new MBTileDataEmitter_1.MBTileDataEmitter(tileKey, decodeInfo, 0);
        const line = {
            positions: [
                new THREE.Vector2(0, 0),
                new THREE.Vector2(100, 100),
                new THREE.Vector2(200, 50),
            ],
        };
        const matched = evaluator.evaluate('geojson', '', { type: 'LineString', properties: {} }, 0, 'line');
        (0, chai_1.expect)(matched.length).to.equal(1);
        emitter.processLineFeature('geojson', 4096, [line], {}, undefined, matched);
        const decodedTile = emitter.getDecodedTile();
        (0, chai_1.expect)(decodedTile.techniques.length).to.be.greaterThan(0);
    });
    it('emits a fill outline ribbon for fill-outline-color', () => {
        const style = {
            version: 8,
            sources: {},
            layers: [{
                    id: 'fill', type: 'fill', source: 'geojson',
                    paint: { 'fill-color': 'rgba(0,0,0,0)', 'fill-outline-color': 'blue' },
                }],
        };
        const evaluator = new MBLayerEvaluator_1.MBLayerEvaluator(style);
        const tileKey = flywave_geoutils_1.TileKey.fromRowColumnLevel(0, 0, 0);
        const decodeInfo = createDecodeInfo(tileKey);
        const emitter = new MBTileDataEmitter_1.MBTileDataEmitter(tileKey, decodeInfo, 0);
        const polygon = { rings: [[
                    new THREE.Vector2(100, 100), new THREE.Vector2(300, 100),
                    new THREE.Vector2(300, 300), new THREE.Vector2(100, 100),
                ]] };
        const matched = evaluator.evaluate('geojson', '', { type: 'Polygon', properties: {} }, 0, 'polygon');
        emitter.processFillFeature('geojson', 4096, [polygon], {}, undefined, matched);
        const decodedTile = emitter.getDecodedTile();
        const outlineTech = decodedTile.techniques.find(t => t._isFillOutline);
        (0, chai_1.expect)(outlineTech).not.to.be.undefined;
        (0, chai_1.expect)(outlineTech.name).to.equal('fill');
        (0, chai_1.expect)(outlineTech.color).to.equal('blue');
        const outlineGeom = decodedTile.geometries.find(g => g.groups.some((gr) => gr.technique === outlineTech._index));
        (0, chai_1.expect)(outlineGeom).not.to.be.undefined;
        (0, chai_1.expect)(outlineGeom.index.buffer.byteLength).to.be.greaterThan(0);
    });
    it('produces valid DecodedTile from point features', () => {
        const style = {
            version: 8,
            sources: {},
            layers: [
                { id: 'circle', type: 'circle', source: 'geojson', paint: { 'circle-color': '#00ff00', 'circle-radius': 10 } },
            ],
        };
        const evaluator = new MBLayerEvaluator_1.MBLayerEvaluator(style);
        const tileKey = flywave_geoutils_1.TileKey.fromRowColumnLevel(0, 0, 0);
        const decodeInfo = createDecodeInfo(tileKey);
        const emitter = new MBTileDataEmitter_1.MBTileDataEmitter(tileKey, decodeInfo, 0);
        const matched = evaluator.evaluate('geojson', '', { type: 'Point', properties: {} }, 0, 'point');
        (0, chai_1.expect)(matched.length).to.equal(1);
        emitter.processPointFeature('geojson', 4096, [new THREE.Vector3(100, 100, 0)], {}, undefined, matched);
        const decodedTile = emitter.getDecodedTile();
        (0, chai_1.expect)(decodedTile.techniques.length).to.be.greaterThan(0);
        const tech = decodedTile.techniques[0];
        (0, chai_1.expect)(tech.name).to.equal('circles');
        (0, chai_1.expect)(tech.size).to.equal(10);
    });
    it('evaluates data-driven expressions during decode', () => {
        const style = {
            version: 8,
            sources: {},
            layers: [
                {
                    id: 'fill', type: 'fill', source: 'geojson',
                    paint: {
                        'fill-color': ['match', ['get', 'type'], 'water', '#0000ff', '#00ff00'],
                    },
                },
            ],
        };
        const evaluator = new MBLayerEvaluator_1.MBLayerEvaluator(style);
        const tileKey = flywave_geoutils_1.TileKey.fromRowColumnLevel(0, 0, 0);
        const decodeInfo = createDecodeInfo(tileKey);
        const emitter = new MBTileDataEmitter_1.MBTileDataEmitter(tileKey, decodeInfo, 0);
        const polygon = {
            rings: [[
                    new THREE.Vector2(0, 0), new THREE.Vector2(100, 0),
                    new THREE.Vector2(100, 100), new THREE.Vector2(0, 0),
                ]],
        };
        const matched = evaluator.evaluate('geojson', '', { type: 'Polygon', properties: { type: 'water' } }, 0, 'polygon');
        emitter.processFillFeature('geojson', 4096, [polygon], { type: 'water' }, undefined, matched);
        const decodedTile = emitter.getDecodedTile();
        const tech = decodedTile.techniques[0];
        (0, chai_1.expect)(tech.color).to.equal('#0000ff');
    });
    it('produces geometry with world-space coordinates', () => {
        const style = {
            version: 8,
            sources: {},
            layers: [{ id: 'fill', type: 'fill', source: 'geojson', paint: { 'fill-color': '#fff' } }],
        };
        const evaluator = new MBLayerEvaluator_1.MBLayerEvaluator(style);
        const tileKey = flywave_geoutils_1.TileKey.fromRowColumnLevel(0, 0, 0);
        const decodeInfo = createDecodeInfo(tileKey);
        const emitter = new MBTileDataEmitter_1.MBTileDataEmitter(tileKey, decodeInfo, 0);
        const polygon = {
            rings: [[
                    new THREE.Vector2(0, 0), new THREE.Vector2(4096, 0),
                    new THREE.Vector2(4096, 4096), new THREE.Vector2(0, 0),
                ]],
        };
        const matched = evaluator.evaluate('geojson', '', { type: 'Polygon', properties: {} }, 0, 'polygon');
        emitter.processFillFeature('geojson', 4096, [polygon], {}, undefined, matched);
        const decodedTile = emitter.getDecodedTile();
        const geom = decodedTile.geometries[0];
        const posAttr = geom.vertexAttributes[0];
        const positions = new Float32Array(posAttr.buffer);
        const firstX = Math.abs(positions[0]);
        (0, chai_1.expect)(firstX).to.be.greaterThan(1000);
    });
    it('routes heatmap point features to heatmapPoints instead of circles geometry', () => {
        const style = {
            version: 8,
            sources: {},
            layers: [{
                    id: 'hm', type: 'heatmap', source: 'geojson',
                    paint: {
                        'heatmap-weight': 3,
                        'heatmap-radius': 12,
                        'heatmap-intensity': 2,
                        'heatmap-color': [[0, 'rgba(0,0,255,0)'], [1, 'red']],
                    },
                }],
        };
        const evaluator = new MBLayerEvaluator_1.MBLayerEvaluator(style);
        const tileKey = flywave_geoutils_1.TileKey.fromRowColumnLevel(0, 0, 0);
        const decodeInfo = createDecodeInfo(tileKey);
        const emitter = new MBTileDataEmitter_1.MBTileDataEmitter(tileKey, decodeInfo, 0);
        const matched = evaluator.evaluate('geojson', '', { type: 'Point', properties: {} }, 0, 'point');
        (0, chai_1.expect)(matched.length).to.equal(1);
        emitter.processPointFeature('geojson', 4096, [new THREE.Vector3(100, 100, 0), new THREE.Vector3(200, 200, 0)], {}, undefined, matched);
        const decodedTile = emitter.getDecodedTile();
        const heatmapPoints = decodedTile.heatmapPoints;
        (0, chai_1.expect)(heatmapPoints).to.be.an('array').with.length(2);
        const pt = heatmapPoints[0];
        (0, chai_1.expect)(pt.weight).to.equal(3);
        (0, chai_1.expect)(pt.radius).to.equal(12);
        (0, chai_1.expect)(Math.abs(pt.x)).to.be.greaterThan(1000);
        (0, chai_1.expect)(pt.technique).to.be.a('number');
        const tech = decodedTile.techniques.find((t) => t._isHeatmap);
        (0, chai_1.expect)(tech).to.exist;
        (0, chai_1.expect)(tech._heatmapIntensity).to.equal(2);
        (0, chai_1.expect)(tech._heatmapColorStops).to.have.length(2);
        const usesHeatmap = decodedTile.geometries.every((g) => g.groups.every((grp) => grp.materialIndex !== tech._index));
        (0, chai_1.expect)(usesHeatmap).to.equal(true);
    });
    it('carries zoom-dependent heatmap-radius expression for per-frame evaluation', () => {
        const style = {
            version: 8,
            sources: {},
            layers: [{
                    id: 'hm', type: 'heatmap', source: 'geojson',
                    paint: {
                        'heatmap-radius': { stops: [[0, 5], [20, 40]], base: 1 },
                    },
                }],
        };
        const evaluator = new MBLayerEvaluator_1.MBLayerEvaluator(style);
        const tileKey = flywave_geoutils_1.TileKey.fromRowColumnLevel(0, 0, 0);
        const decodeInfo = createDecodeInfo(tileKey);
        const emitter = new MBTileDataEmitter_1.MBTileDataEmitter(tileKey, decodeInfo, 0);
        const matched = evaluator.evaluate('geojson', '', { type: 'Point', properties: { magnitude: 7 } }, 0, 'point');
        emitter.processPointFeature('geojson', 4096, [new THREE.Vector3(100, 100, 0)], { magnitude: 7 }, undefined, matched);
        const heatmapPoints = emitter.getDecodedTile().heatmapPoints;
        (0, chai_1.expect)(heatmapPoints).to.have.length(1);
        (0, chai_1.expect)(heatmapPoints[0].radiusExpr).to.deep.equal({ stops: [[0, 5], [20, 40]], base: 1 });
        (0, chai_1.expect)(heatmapPoints[0].properties).to.deep.equal({ magnitude: 7 });
    });
    it('groups heatmap kernels per layer with isolated render config', () => {
        const buildRamp = (stops) => {
            const key = JSON.stringify(stops !== null && stops !== void 0 ? stops : null);
            return { texture: new THREE.DataTexture(new Uint8Array(4), 1, 1), key };
        };
        const tileA = {
            techniques: [
                { _isHeatmap: true, _layerId: 'hm-a', renderOrder: 1, _heatmapIntensity: 2, opacity: 0.5, _heatmapColorStops: [['sA']] },
                { _isHeatmap: true, _layerId: 'hm-b', renderOrder: 5, _heatmapIntensity: 1, opacity: 1, _heatmapColorStops: [['sB']] },
            ],
            kernels: [
                { x: 1, y: 2, z: 0, weight: 1, radius: 10, technique: 0 },
                { x: 3, y: 4, z: 0, weight: 2, radius: 20, technique: 1 },
            ],
        };
        const tileB = {
            techniques: [
                { _isHeatmap: true, _layerId: 'hm-a', renderOrder: 1, _heatmapIntensity: 2, opacity: 0.5, _heatmapColorStops: [['sA']] },
            ],
            kernels: [
                { x: 5, y: 6, z: 0, weight: 3, radius: 30, technique: 0 },
            ],
        };
        const groups = MBHeatmapRenderer_1.MBHeatmapRenderer.buildGroups([tileA, tileB], buildRamp);
        (0, chai_1.expect)(groups.size).to.equal(2);
        const a = groups.get('hm-a');
        (0, chai_1.expect)(a.raw).to.have.length(2);
        (0, chai_1.expect)(a.renderOrder).to.equal(1);
        (0, chai_1.expect)(a.intensity).to.equal(2);
        (0, chai_1.expect)(a.opacity).to.equal(0.5);
        (0, chai_1.expect)(a.rampKey).to.equal(JSON.stringify([['sA']]));
        const b = groups.get('hm-b');
        (0, chai_1.expect)(b.raw).to.have.length(1);
        (0, chai_1.expect)(b.renderOrder).to.equal(5);
        (0, chai_1.expect)(b.intensity).to.equal(1);
    });
    it('computes mapbox 3D-lights ground radiance (lighting-3d-mode)', () => {
        const mgr = new MBEnvironmentManager_1.MBEnvironmentManager({ m_scene: { add: () => { }, remove: () => { } } });
        mgr.applyLights([
            { type: 'ambient', id: 'a', properties: { color: 'rgba(255, 0, 0, 1)', intensity: 1 } },
            { type: 'directional', id: 'd', properties: { color: 'rgba(0, 255, 0, 1)', intensity: 1 } },
        ]);
        let st = mgr.lighting3DState;
        (0, chai_1.expect)(st).not.to.be.null;
        (0, chai_1.expect)(st.groundRadiance[0]).to.be.closeTo(1, 1e-4);
        (0, chai_1.expect)(st.groundRadiance[1]).to.be.closeTo(0, 1e-4);
        (0, chai_1.expect)(st.groundRadiance[2]).to.be.closeTo(0, 1e-4);
        mgr.applyLights([
            { type: 'ambient', id: 'a', properties: { color: 'rgba(255, 0, 0, 1)', intensity: 1 } },
            { type: 'directional', id: 'd', properties: { color: 'rgba(0, 255, 0, 1)', intensity: 1, direction: [0, 45] } },
        ]);
        st = mgr.lighting3DState;
        (0, chai_1.expect)(st.dir[2]).to.be.closeTo(Math.cos(Math.PI / 4), 1e-6);
        (0, chai_1.expect)(st.groundRadiance[1]).to.be.closeTo(Math.pow(0.7071, 1 / 2.2), 1e-3);
        mgr.applyLights([
            { type: 'ambient', id: 'a', properties: { color: 'rgba(255, 0, 0, 1)', intensity: 0.39 } },
            { type: 'directional', id: 'd', properties: { color: 'rgba(0, 0, 100, 1)', intensity: 1 } },
        ]);
        st = mgr.lighting3DState;
        (0, chai_1.expect)(st.groundRadiance[0]).to.be.closeTo(Math.pow(0.39, 1 / 2.2), 1e-3);
        mgr.applyLights([
            { type: 'ambient', id: 'a', properties: { color: 'rgba(255, 0, 0, 1)', intensity: 1 } },
        ]);
        (0, chai_1.expect)(mgr.use3DLights).to.equal(true);
        (0, chai_1.expect)(mgr.extrusionLightState.use3DLights).to.equal(true);
        (0, chai_1.expect)(mgr.lighting3DState).not.to.be.null;
    });
    it('emits anchor-relative icon-text-fit bounds on the icon technique', () => {
        const style = {
            version: 8,
            sources: {},
            layers: [{
                    id: 'sym', type: 'symbol', source: 'geojson',
                    layout: {
                        'text-field': 'ABC',
                        'text-font': ['Open Sans Semibold'],
                        'text-anchor': 'left',
                        'text-size': 20,
                        'icon-image': 'label',
                        'icon-text-fit': 'both',
                        'icon-text-fit-padding': [5, 10, 5, 10],
                    },
                }],
        };
        const evaluator = new MBLayerEvaluator_1.MBLayerEvaluator(style);
        const tileKey = flywave_geoutils_1.TileKey.fromRowColumnLevel(0, 0, 0);
        const decodeInfo = createDecodeInfo(tileKey);
        const emitter = new MBTileDataEmitter_1.MBTileDataEmitter(tileKey, decodeInfo, 0);
        const matched = evaluator.evaluate('geojson', '', { type: 'Point', properties: {} }, 0, 'point');
        emitter.processPointFeature('geojson', 4096, [new THREE.Vector3(100, 100, 0)], {}, undefined, matched);
        const decodedTile = emitter.getDecodedTile();
        const tech = decodedTile.techniques.find(t => t.name === 'labeled-icon');
        (0, chai_1.expect)(tech).not.to.be.undefined;
        (0, chai_1.expect)(tech._iconTextFit).to.equal('both');
        (0, chai_1.expect)(tech._iconTextFitPadding).to.deep.equal([5, 10, 5, 10]);
        (0, chai_1.expect)(tech._iconFitTextL).to.equal(0);
        (0, chai_1.expect)(tech._iconFitTextR).to.be.greaterThan(0);
        (0, chai_1.expect)(tech._iconFitTextW).to.equal(tech._iconFitTextR);
        (0, chai_1.expect)(tech._iconFitTextT).to.be.closeTo(-tech._iconFitTextH / 2, 1e-6);
        (0, chai_1.expect)(tech._iconFitTextB).to.be.closeTo(tech._iconFitTextH / 2, 1e-6);
    });
    it('emits camera-function icon-size into iconScale', () => {
        const style = {
            version: 8,
            sources: {},
            layers: [{
                    id: 'sym', type: 'symbol', source: 'geojson',
                    layout: {
                        'icon-image': 'dot.sdf',
                        'icon-size': { stops: [[0, 1], [1, 2]] },
                    },
                }],
        };
        const evaluator = new MBLayerEvaluator_1.MBLayerEvaluator(style);
        const tileKey = flywave_geoutils_1.TileKey.fromRowColumnLevel(0, 0, 0);
        const decodeInfo = createDecodeInfo(tileKey);
        const emitter = new MBTileDataEmitter_1.MBTileDataEmitter(tileKey, decodeInfo, 0.5);
        const matched = evaluator.evaluate('geojson', '', { type: 'Point', properties: {} }, 0.5, 'point');
        emitter.processPointFeature('geojson', 4096, [new THREE.Vector3(100, 100, 0)], {}, undefined, matched);
        const decodedTile = emitter.getDecodedTile();
        const tech = decodedTile.techniques.find(t => t.name === 'labeled-icon');
        (0, chai_1.expect)(tech).not.to.be.undefined;
        (0, chai_1.expect)(tech.iconScale).to.equal(1.5);
    });
    it('skips icon-text-fit emission when value is none', () => {
        const style = {
            version: 8,
            sources: {},
            layers: [{
                    id: 'sym', type: 'symbol', source: 'geojson',
                    layout: {
                        'text-field': 'ABC',
                        'text-font': ['Open Sans Semibold'],
                        'icon-image': 'label',
                        'icon-text-fit': 'none',
                    },
                }],
        };
        const evaluator = new MBLayerEvaluator_1.MBLayerEvaluator(style);
        const tileKey = flywave_geoutils_1.TileKey.fromRowColumnLevel(0, 0, 0);
        const decodeInfo = createDecodeInfo(tileKey);
        const emitter = new MBTileDataEmitter_1.MBTileDataEmitter(tileKey, decodeInfo, 0);
        const matched = evaluator.evaluate('geojson', '', { type: 'Point', properties: {} }, 0, 'point');
        emitter.processPointFeature('geojson', 4096, [new THREE.Vector3(100, 100, 0)], {}, undefined, matched);
        const decodedTile = emitter.getDecodedTile();
        const tech = decodedTile.techniques.find(t => t.name === 'labeled-icon');
        (0, chai_1.expect)(tech).not.to.be.undefined;
        (0, chai_1.expect)(tech._iconTextFit).to.be.undefined;
    });
    it('emits one extruded geometry group per data-driven color feature', () => {
        const style = {
            version: 8,
            sources: {},
            layers: [{
                    id: 'extrusion', type: 'fill-extrusion', source: 'geojson',
                    paint: {
                        'fill-extrusion-height': 10,
                        'fill-extrusion-color': {
                            property: 'property',
                            stops: [[10, 'rgba(255,0,0,1)'], [20, 'rgba(0,255,0,1)'], [30, 'rgba(0,0,255,1)']],
                        },
                    },
                }],
        };
        const evaluator = new MBLayerEvaluator_1.MBLayerEvaluator(style);
        const tileKey = flywave_geoutils_1.TileKey.fromRowColumnLevel(0, 0, 0);
        const decodeInfo = createDecodeInfo(tileKey);
        const emitter = new MBTileDataEmitter_1.MBTileDataEmitter(tileKey, decodeInfo, 0);
        const extents = 4096;
        const mkSquare = (cx, cy, half) => ({
            rings: [[
                    new THREE.Vector2(cx - half, cy - half),
                    new THREE.Vector2(cx - half, cy + half),
                    new THREE.Vector2(cx + half, cy + half),
                    new THREE.Vector2(cx + half, cy - half),
                    new THREE.Vector2(cx - half, cy - half),
                ]],
        });
        const feats = [
            { poly: mkSquare(2048, 800, 250), props: { property: 10 } },
            { poly: mkSquare(2048, 2048, 150), props: { property: 20 } },
            { poly: mkSquare(2048, 3300, 250), props: { property: 30 } },
        ];
        for (const f of feats) {
            const matched = evaluator.evaluate('geojson', '', { type: 'Polygon', properties: f.props }, 0, 'polygon');
            emitter.processFillFeature('geojson', extents, [f.poly], f.props, undefined, matched);
        }
        const decodedTile = emitter.getDecodedTile();
        const extTechs = decodedTile.techniques.filter((t) => t.name === 'extruded-polygon');
        (0, chai_1.expect)(extTechs.length).to.equal(3);
        (0, chai_1.expect)(decodedTile.geometries.length).to.equal(3);
        for (const geo of decodedTile.geometries) {
            const g = geo;
            (0, chai_1.expect)(g.index).to.not.be.undefined;
            const posAttr = g.vertexAttributes.find((a) => a.name === 'position');
            const axisAttr = g.vertexAttributes.find((a) => a.name === 'extrusionAxis');
            (0, chai_1.expect)(axisAttr).to.not.be.undefined;
            const pos = new Float32Array(posAttr.buffer);
            let minZ = Infinity, maxZ = -Infinity;
            for (let i = 2; i < pos.length; i += 3) {
                minZ = Math.min(minZ, pos[i]);
                maxZ = Math.max(maxZ, pos[i]);
            }
            (0, chai_1.expect)(minZ).to.equal(0);
            (0, chai_1.expect)(maxZ).to.equal(10);
        }
    });
});
//# sourceMappingURL=MBStyleDecoderPipelineTest.js.map