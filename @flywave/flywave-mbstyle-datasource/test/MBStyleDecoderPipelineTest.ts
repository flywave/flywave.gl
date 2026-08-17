import { expect } from 'chai';
import { TileKey, webMercatorTilingScheme, OrientedBox3 } from '@flywave/flywave-geoutils';
import * as THREE from 'three';

import { MBEnvironmentManager } from '../src/MBEnvironmentManager';
import { MBLayerEvaluator } from '../src/MBLayerEvaluator';
import { MBTileDataEmitter } from '../src/MBTileDataEmitter';
import { MBHeatmapRenderer } from '../src/MBHeatmapRenderer';
import { StyleSpecification } from '../src/MBStyleSpec';

const PROJECTION = webMercatorTilingScheme.projection;

function createDecodeInfo(tileKey: TileKey): any {
    const geoBox = webMercatorTilingScheme.getGeoBox(tileKey);
    const projectedBoundingBox = new OrientedBox3();
    PROJECTION.projectBox(geoBox, projectedBoundingBox);
    const center = new THREE.Vector3();
    projectedBoundingBox.getCenter(center);
    return {
        geoBox,
        center,
        targetProjection: PROJECTION,
        tileKey,
        worldTileProjectionCookie: undefined,
        tilingScheme: webMercatorTilingScheme,
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
        const style: StyleSpecification = {
            version: 8,
            sources: {},
            layers: [
                { id: 'fill', type: 'fill', source: 'geojson', paint: { 'fill-color': '#ff0000', 'fill-opacity': 0.8 } },
            ],
        };

        const evaluator = new MBLayerEvaluator(style);
        const tileKey = TileKey.fromRowColumnLevel(0, 0, 0);
        const decodeInfo = createDecodeInfo(tileKey);
        const emitter = new MBTileDataEmitter(tileKey, decodeInfo, 0);

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
        expect(matched.length).to.equal(1);

        emitter.processFillFeature('geojson', 4096, [polygon as any], {}, undefined, matched);

        const decodedTile = emitter.getDecodedTile();
        expect(decodedTile.techniques.length).to.be.greaterThan(0);
        expect(decodedTile.geometries.length).to.be.greaterThan(0);

        const tech = decodedTile.techniques[0] as any;
        expect(tech.name).to.equal('fill');
        expect(tech.color).to.equal('#ff0000');
        expect(tech.opacity).to.equal(0.8);
    });

    it('produces valid DecodedTile from line features', () => {
        const style: StyleSpecification = {
            version: 8,
            sources: {},
            layers: [
                { id: 'line', type: 'line', source: 'geojson', paint: { 'line-color': '#0000ff', 'line-width': 3 } },
            ],
        };

        const evaluator = new MBLayerEvaluator(style);
        const tileKey = TileKey.fromRowColumnLevel(0, 0, 0);
        const decodeInfo = createDecodeInfo(tileKey);
        const emitter = new MBTileDataEmitter(tileKey, decodeInfo, 0);

        const line = {
            positions: [
                new THREE.Vector2(0, 0),
                new THREE.Vector2(100, 100),
                new THREE.Vector2(200, 50),
            ],
        };

        const matched = evaluator.evaluate('geojson', '', { type: 'LineString', properties: {} }, 0, 'line');
        expect(matched.length).to.equal(1);

        emitter.processLineFeature('geojson', 4096, [line as any], {}, undefined, matched);

        const decodedTile = emitter.getDecodedTile();
        expect(decodedTile.techniques.length).to.be.greaterThan(0);
    });

    it('emits a fill outline ribbon for fill-outline-color', () => {
        const style: StyleSpecification = {
            version: 8,
            sources: {},
            layers: [{
                id: 'fill', type: 'fill', source: 'geojson',
                paint: { 'fill-color': 'rgba(0,0,0,0)', 'fill-outline-color': 'blue' },
            }],
        };

        const evaluator = new MBLayerEvaluator(style);
        const tileKey = TileKey.fromRowColumnLevel(0, 0, 0);
        const decodeInfo = createDecodeInfo(tileKey);
        const emitter = new MBTileDataEmitter(tileKey, decodeInfo, 0);

        const polygon = { rings: [[
                new THREE.Vector2(100, 100), new THREE.Vector2(300, 100),
                new THREE.Vector2(300, 300), new THREE.Vector2(100, 100),
            ]] };
        const matched = evaluator.evaluate('geojson', '', { type: 'Polygon', properties: {} }, 0, 'polygon');
        emitter.processFillFeature('geojson', 4096, [polygon as any], {}, undefined, matched);

        const decodedTile = emitter.getDecodedTile();
        const outlineTech = decodedTile.techniques.find(t => (t as any)._isFillOutline) as any;
        expect(outlineTech).not.to.be.undefined;
        expect(outlineTech.name).to.equal('fill');
        expect(outlineTech.color).to.equal('blue');
        // The outline ribbon is a Polygon geometry group with indices.
        const outlineGeom = decodedTile.geometries.find(g =>
            g.groups.some((gr: any) => gr.technique === outlineTech._index)) as any;
        expect(outlineGeom).not.to.be.undefined;
        expect(outlineGeom.index.buffer.byteLength).to.be.greaterThan(0);
    });

    it('produces valid DecodedTile from point features', () => {
        const style: StyleSpecification = {
            version: 8,
            sources: {},
            layers: [
                { id: 'circle', type: 'circle', source: 'geojson', paint: { 'circle-color': '#00ff00', 'circle-radius': 10 } },
            ],
        };

        const evaluator = new MBLayerEvaluator(style);
        const tileKey = TileKey.fromRowColumnLevel(0, 0, 0);
        const decodeInfo = createDecodeInfo(tileKey);
        const emitter = new MBTileDataEmitter(tileKey, decodeInfo, 0);

        const matched = evaluator.evaluate('geojson', '', { type: 'Point', properties: {} }, 0, 'point');
        expect(matched.length).to.equal(1);

        emitter.processPointFeature('geojson', 4096, [new THREE.Vector3(100, 100, 0)], {}, undefined, matched);

        const decodedTile = emitter.getDecodedTile();
        expect(decodedTile.techniques.length).to.be.greaterThan(0);

        const tech = decodedTile.techniques[0] as any;
        expect(tech.name).to.equal('circles');
        expect(tech.size).to.equal(10);
    });

    it('evaluates data-driven expressions during decode', () => {
        const style: StyleSpecification = {
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

        const evaluator = new MBLayerEvaluator(style);
        const tileKey = TileKey.fromRowColumnLevel(0, 0, 0);
        const decodeInfo = createDecodeInfo(tileKey);
        const emitter = new MBTileDataEmitter(tileKey, decodeInfo, 0);

        const polygon = {
            rings: [[
                new THREE.Vector2(0, 0), new THREE.Vector2(100, 0),
                new THREE.Vector2(100, 100), new THREE.Vector2(0, 0),
            ]],
        };

        const matched = evaluator.evaluate('geojson', '',
            { type: 'Polygon', properties: { type: 'water' } }, 0, 'polygon');
        emitter.processFillFeature('geojson', 4096, [polygon as any], { type: 'water' }, undefined, matched);

        const decodedTile = emitter.getDecodedTile();
        const tech = decodedTile.techniques[0] as any;
        expect(tech.color).to.equal('#0000ff');
    });

    it('produces geometry with world-space coordinates', () => {
        const style: StyleSpecification = {
            version: 8,
            sources: {},
            layers: [{ id: 'fill', type: 'fill', source: 'geojson', paint: { 'fill-color': '#fff' } }],
        };

        const evaluator = new MBLayerEvaluator(style);
        const tileKey = TileKey.fromRowColumnLevel(0, 0, 0);
        const decodeInfo = createDecodeInfo(tileKey);
        const emitter = new MBTileDataEmitter(tileKey, decodeInfo, 0);

        const polygon = {
            rings: [[
                new THREE.Vector2(0, 0), new THREE.Vector2(4096, 0),
                new THREE.Vector2(4096, 4096), new THREE.Vector2(0, 0),
            ]],
        };

        const matched = evaluator.evaluate('geojson', '', { type: 'Polygon', properties: {} }, 0, 'polygon');
        emitter.processFillFeature('geojson', 4096, [polygon as any], {}, undefined, matched);

        const decodedTile = emitter.getDecodedTile();
        const geom = decodedTile.geometries[0];
        const posAttr = geom.vertexAttributes![0];
        const positions = new Float32Array(posAttr.buffer);

        // Verify positions are in world space (not tile-local 0-4096)
        const firstX = Math.abs(positions[0]);
        expect(firstX).to.be.greaterThan(1000);
    });

    it('routes heatmap point features to heatmapPoints instead of circles geometry', () => {
        const style: StyleSpecification = {
            version: 8,
            sources: {},
            layers: [{
                id: 'hm', type: 'heatmap' as any, source: 'geojson',
                paint: {
                    'heatmap-weight': 3,
                    'heatmap-radius': 12,
                    'heatmap-intensity': 2,
                    'heatmap-color': [[0, 'rgba(0,0,255,0)'], [1, 'red']],
                },
            }],
        };

        const evaluator = new MBLayerEvaluator(style);
        const tileKey = TileKey.fromRowColumnLevel(0, 0, 0);
        const decodeInfo = createDecodeInfo(tileKey);
        const emitter = new MBTileDataEmitter(tileKey, decodeInfo, 0);

        const matched = evaluator.evaluate('geojson', '',
            { type: 'Point', properties: {} }, 0, 'point');
        expect(matched.length).to.equal(1);

        emitter.processPointFeature('geojson', 4096,
            [new THREE.Vector3(100, 100, 0), new THREE.Vector3(200, 200, 0)],
            {}, undefined, matched);

        const decodedTile = emitter.getDecodedTile();
        const heatmapPoints = (decodedTile as any).heatmapPoints;
        expect(heatmapPoints).to.be.an('array').with.length(2);

        // Kernels carry per-feature weight/radius + absolute world positions.
        const pt = heatmapPoints[0];
        expect(pt.weight).to.equal(3);
        expect(pt.radius).to.equal(12);
        expect(Math.abs(pt.x)).to.be.greaterThan(1000);
        expect(pt.technique).to.be.a('number');

        // No native circles geometry is emitted for the heatmap layer.
        const tech: any = decodedTile.techniques.find((t: any) => t._isHeatmap);
        expect(tech).to.exist;
        expect(tech._heatmapIntensity).to.equal(2);
        expect(tech._heatmapColorStops).to.have.length(2);
        const usesHeatmap = decodedTile.geometries.every((g: any) =>
            g.groups.every((grp: any) => grp.materialIndex !== tech._index));
        expect(usesHeatmap).to.equal(true);
    });

    it('carries zoom-dependent heatmap-radius expression for per-frame evaluation', () => {
        const style: StyleSpecification = {
            version: 8,
            sources: {},
            layers: [{
                id: 'hm', type: 'heatmap' as any, source: 'geojson',
                paint: {
                    'heatmap-radius': { stops: [[0, 5], [20, 40]], base: 1 },
                },
            }],
        };

        const evaluator = new MBLayerEvaluator(style);
        const tileKey = TileKey.fromRowColumnLevel(0, 0, 0);
        const decodeInfo = createDecodeInfo(tileKey);
        const emitter = new MBTileDataEmitter(tileKey, decodeInfo, 0);

        const matched = evaluator.evaluate('geojson', '',
            { type: 'Point', properties: { magnitude: 7 } }, 0, 'point');
        emitter.processPointFeature('geojson', 4096,
            [new THREE.Vector3(100, 100, 0)],
            { magnitude: 7 }, undefined, matched);

        const heatmapPoints = (emitter.getDecodedTile() as any).heatmapPoints;
        expect(heatmapPoints).to.have.length(1);
        expect(heatmapPoints[0].radiusExpr).to.deep.equal({ stops: [[0, 5], [20, 40]], base: 1 });
        expect(heatmapPoints[0].properties).to.deep.equal({ magnitude: 7 });
    });

    it('groups heatmap kernels per layer with isolated render config', () => {
        const buildRamp = (stops: any) => {
            const key = JSON.stringify(stops ?? null);
            return { texture: new THREE.DataTexture(new Uint8Array(4), 1, 1), key };
        };

        // Two tiles; tile A holds layers a + b (different technique indices),
        // tile B holds layer a again under a different index. All of layer a's
        // kernels must land in one group keyed by its layerId.
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

        const groups = MBHeatmapRenderer.buildGroups([tileA as any, tileB as any], buildRamp);
        expect(groups.size).to.equal(2);

        const a = groups.get('hm-a')!;
        expect(a.raw).to.have.length(2); // merged across tiles
        expect(a.renderOrder).to.equal(1);
        expect(a.intensity).to.equal(2);
        expect(a.opacity).to.equal(0.5);
        expect(a.rampKey).to.equal(JSON.stringify([['sA']]));

        const b = groups.get('hm-b')!;
        expect(b.raw).to.have.length(1);
        expect(b.renderOrder).to.equal(5);
        expect(b.intensity).to.equal(1);
    });

    it('computes mapbox 3D-lights ground radiance (lighting-3d-mode)', () => {
        const mgr = new MBEnvironmentManager({ m_scene: { add: () => {}, remove: () => {} } } as any);

        // color-ambient-directional: red ambient@1 + green directional@1 with
        // default direction [0, 90] (polar 90 = horizon, z=0 → no directional
        // ground contribution). Expected groundRadiance = [1, 0, 0].
        mgr.applyLights([
            { type: 'ambient', id: 'a', properties: { color: 'rgba(255, 0, 0, 1)', intensity: 1 } },
            { type: 'directional', id: 'd', properties: { color: 'rgba(0, 255, 0, 1)', intensity: 1 } },
        ] as any);
        let st = mgr.lighting3DState;
        expect(st).not.to.be.null;
        expect(st!.groundRadiance[0]).to.be.closeTo(1, 1e-4);
        expect(st!.groundRadiance[1]).to.be.closeTo(0, 1e-4);
        expect(st!.groundRadiance[2]).to.be.closeTo(0, 1e-4);

        // pitch-45: direction [0, 45] → dirVec z = cos(45°) = 0.7071; green
        // contributes dirColor * z = 0.7071. Expected red 1, green ~0.854.
        mgr.applyLights([
            { type: 'ambient', id: 'a', properties: { color: 'rgba(255, 0, 0, 1)', intensity: 1 } },
            { type: 'directional', id: 'd', properties: { color: 'rgba(0, 255, 0, 1)', intensity: 1, direction: [0, 45] } },
        ] as any);
        st = mgr.lighting3DState;
        // dirVec toward light: a = az+90 = 90°, x=cos90*sin45=0, y=sin90*sin45=0.7071, z=cos45=0.7071
        expect(st!.dir[2]).to.be.closeTo(Math.cos(Math.PI / 4), 1e-6);
        // dirLuminance = 0.7152; factorMin = 1-0.3*0.7152; NdotL=0.7071 → adf=1;
        // dirContrib green * 0.7071 = 0.7071; linear→sRGB(0.7071) = 0.7071^0.4545 ≈ 0.854
        expect(st!.groundRadiance[1]).to.be.closeTo(Math.pow(0.7071, 1 / 2.2), 1e-3);

        // intensity scaling: ambient red @0.39 → sRGBToLinearAndScale(red,0.39)
        // = 1^2.2*0.39 = 0.39; adf=1; linearVec3TosRGB(0.39) = 0.39^0.4545 ≈ 0.652.
        mgr.applyLights([
            { type: 'ambient', id: 'a', properties: { color: 'rgba(255, 0, 0, 1)', intensity: 0.39 } },
            { type: 'directional', id: 'd', properties: { color: 'rgba(0, 0, 100, 1)', intensity: 1 } },
        ] as any);
        st = mgr.lighting3DState;
        expect(st!.groundRadiance[0]).to.be.closeTo(Math.pow(0.39, 1 / 2.2), 1e-3);

        // Ambient-only 3D lights: use3DLights stays true even without a
        // directional light (the 3D-lights shader path reads its own uniforms).
        mgr.applyLights([
            { type: 'ambient', id: 'a', properties: { color: 'rgba(255, 0, 0, 1)', intensity: 1 } },
        ] as any);
        expect(mgr.use3DLights).to.equal(true);
        expect(mgr.extrusionLightState.use3DLights).to.equal(true);
        expect(mgr.lighting3DState).not.to.be.null;
    });

    it('emits anchor-relative icon-text-fit bounds on the icon technique', () => {
        const style: StyleSpecification = {
            version: 8,
            sources: {},
            layers: [{
                id: 'sym', type: 'symbol' as any, source: 'geojson',
                layout: {
                    'text-field': 'ABC',
                    'text-font': ['Open Sans Semibold'],
                    'text-anchor': 'left',
                    'text-size': 20,
                    'icon-image': 'label',
                    'icon-text-fit': 'both',
                    'icon-text-fit-padding': [5, 10, 5, 10],
                },
            } as any],
        };

        const evaluator = new MBLayerEvaluator(style);
        const tileKey = TileKey.fromRowColumnLevel(0, 0, 0);
        const decodeInfo = createDecodeInfo(tileKey);
        const emitter = new MBTileDataEmitter(tileKey, decodeInfo, 0);

        const matched = evaluator.evaluate('geojson', '',
            { type: 'Point', properties: {} }, 0, 'point');
        emitter.processPointFeature('geojson', 4096,
            [new THREE.Vector3(100, 100, 0)],
            {}, undefined, matched);

        const decodedTile = emitter.getDecodedTile();
        const tech: any = decodedTile.techniques.find(t => t.name === 'labeled-icon');
        expect(tech).not.to.be.undefined;
        expect(tech._iconTextFit).to.equal('both');
        // Padding order [top, right, bottom, left].
        expect(tech._iconTextFitPadding).to.deep.equal([5, 10, 5, 10]);
        // text-anchor 'left' → horizontalAlign 0, so the box starts at the
        // symbol point and extends right (left edge = 0, right edge = +W).
        expect(tech._iconFitTextL).to.equal(0);
        expect(tech._iconFitTextR).to.be.greaterThan(0);
        expect(tech._iconFitTextW).to.equal(tech._iconFitTextR);
        // Vertical: 'left' anchor → verticalAlign stays 0.5 (centered).
        expect(tech._iconFitTextT).to.be.closeTo(-tech._iconFitTextH / 2, 1e-6);
        expect(tech._iconFitTextB).to.be.closeTo(tech._iconFitTextH / 2, 1e-6);
    });

    it('emits camera-function icon-size into iconScale', () => {
        const style: StyleSpecification = {
            version: 8,
            sources: {},
            layers: [{
                id: 'sym', type: 'symbol' as any, source: 'geojson',
                layout: {
                    'icon-image': 'dot.sdf',
                    'icon-size': { stops: [[0, 1], [1, 2]] },
                },
            } as any],
        };

        const evaluator = new MBLayerEvaluator(style);
        const tileKey = TileKey.fromRowColumnLevel(0, 0, 0);
        const decodeInfo = createDecodeInfo(tileKey);
        const emitter = new MBTileDataEmitter(tileKey, decodeInfo, 0.5);

        const matched = evaluator.evaluate('geojson', '',
            { type: 'Point', properties: {} }, 0.5, 'point');
        emitter.processPointFeature('geojson', 4096,
            [new THREE.Vector3(100, 100, 0)],
            {}, undefined, matched);

        const decodedTile = emitter.getDecodedTile();
        const tech: any = decodedTile.techniques.find(t => t.name === 'labeled-icon');
        expect(tech).not.to.be.undefined;
        // camera-function at zoom 0.5 → 1.5.
        expect(tech.iconScale).to.equal(1.5);
    });

    it('skips icon-text-fit emission when value is none', () => {
        const style: StyleSpecification = {
            version: 8,
            sources: {},
            layers: [{
                id: 'sym', type: 'symbol' as any, source: 'geojson',
                layout: {
                    'text-field': 'ABC',
                    'text-font': ['Open Sans Semibold'],
                    'icon-image': 'label',
                    'icon-text-fit': 'none',
                },
            } as any],
        };

        const evaluator = new MBLayerEvaluator(style);
        const tileKey = TileKey.fromRowColumnLevel(0, 0, 0);
        const decodeInfo = createDecodeInfo(tileKey);
        const emitter = new MBTileDataEmitter(tileKey, decodeInfo, 0);

        const matched = evaluator.evaluate('geojson', '',
            { type: 'Point', properties: {} }, 0, 'point');
        emitter.processPointFeature('geojson', 4096,
            [new THREE.Vector3(100, 100, 0)],
            {}, undefined, matched);

        const decodedTile = emitter.getDecodedTile();
        const tech: any = decodedTile.techniques.find(t => t.name === 'labeled-icon');
        expect(tech).not.to.be.undefined;
        expect(tech._iconTextFit).to.be.undefined;
    });

    it('emits one extruded geometry group per data-driven color feature', () => {
        // fill-extrusion-color/property-function regression: three buildings
        // with a data-driven color must each produce their own geometry group
        // covering the full footprint (walls + roof), regardless of feature
        // order or position inside the tile.
        const style: StyleSpecification = {
            version: 8,
            sources: {},
            layers: [{
                id: 'extrusion', type: 'fill-extrusion' as any, source: 'geojson',
                paint: {
                    'fill-extrusion-height': 10,
                    'fill-extrusion-color': {
                        property: 'property',
                        stops: [[10, 'rgba(255,0,0,1)'], [20, 'rgba(0,255,0,1)'], [30, 'rgba(0,0,255,1)']],
                    } as any,
                },
            } as any],
        };

        const evaluator = new MBLayerEvaluator(style);
        const tileKey = TileKey.fromRowColumnLevel(0, 0, 0);
        const decodeInfo = createDecodeInfo(tileKey);
        const emitter = new MBTileDataEmitter(tileKey, decodeInfo, 0);

        // Three squares at distinct south/center/north positions, mirroring the
        // actual test fixture (lat -0.00047..-0.00017 / ±0.00015 / 0..0.00047).
        const extents = 4096;
        const mkSquare = (cx: number, cy: number, half: number) => ({
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
            const matched = evaluator.evaluate('geojson', '',
                { type: 'Polygon', properties: f.props }, 0, 'polygon');
            emitter.processFillFeature('geojson', extents, [f.poly as any], f.props, undefined, matched);
        }

        const decodedTile = emitter.getDecodedTile();
        // One technique per distinct color value.
        const extTechs = decodedTile.techniques.filter((t: any) => t.name === 'extruded-polygon');
        expect(extTechs.length).to.equal(3);
        // Three geometry groups, each with indices + extrusionAxis and the
        // full z-extent (ground 0 → roof 10).
        expect(decodedTile.geometries.length).to.equal(3);
        for (const geo of decodedTile.geometries) {
            const g = geo as any;
            expect(g.index).to.not.be.undefined;
            const posAttr = g.vertexAttributes.find((a: any) => a.name === 'position');
            const axisAttr = g.vertexAttributes.find((a: any) => a.name === 'extrusionAxis');
            expect(axisAttr).to.not.be.undefined;
            const pos = new Float32Array(posAttr.buffer);
            let minZ = Infinity, maxZ = -Infinity;
            for (let i = 2; i < pos.length; i += 3) {
                minZ = Math.min(minZ, pos[i]);
                maxZ = Math.max(maxZ, pos[i]);
            }
            expect(minZ).to.equal(0);
            expect(maxZ).to.equal(10);
        }
    });
});
