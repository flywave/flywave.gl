import { expect } from 'chai';
import * as THREE from 'three';
import { TileKey, webMercatorTilingScheme, OrientedBox3 } from '@flywave/flywave-geoutils';
import {
    polygonSubdivision,
    lineSubdivision,
    clipRingToBox,
    clipLinesToBox,
} from '../src/3d-style/util/MBPolygonClippingHD';
import { MBElevationFeature } from '../src/3d-style/elevation/MBElevationFeature';
import { MBElevatedStructures } from '../src/3d-style/elevation/MBElevatedStructures';
import { MBElevationPortalGraph } from '../src/3d-style/elevation/MBElevationGraph';
import { MBExpressionEngine } from '../src/MBExpressionEngine';
import { MBLayerEvaluator } from '../src/MBLayerEvaluator';
import { MBTileDataEmitter } from '../src/MBTileDataEmitter';

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

describe('MBPolygonClippingHD', () => {
    it('polygonSubdivision splits a rectangle across the mid line', () => {
        // Square split by the vertical line x=50.
        const square = [
            { x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }, { x: 0, y: 0 },
        ];
        const pieces = polygonSubdivision([square], [
            { ax: 50, ay: -200, bx: 50, by: 200 },
        ]);
        expect(pieces.length).to.equal(2);
        const areas = pieces.map(p => Math.abs(shoelace(p))).sort((a, b) => a - b);
        expect(areas[0]).to.be.closeTo(5000, 1);
        expect(areas[1]).to.be.closeTo(5000, 1);
    });

    it('polygonSubdivision keeps polygons untouched without edges', () => {
        const square = [
            { x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }, { x: 0, y: 0 },
        ];
        expect(polygonSubdivision([square], [])).to.have.lengthOf(1);
    });

    it('lineSubdivision inserts crossing vertices in order', () => {
        const line = [{ x: 0, y: 0 }, { x: 100, y: 0 }];
        const out: Array<Array<{ x: number; y: number }>> = [];
        lineSubdivision(line, [{ ax: 40, ay: -10, bx: 40, by: 10 }, { ax: 70, ay: -10, bx: 70, by: 10 }], out);
        expect(out.length).to.equal(1);
        const xs = out[0].map(p => p.x);
        expect(xs).to.deep.equal([0, 40, 70, 100]);
    });

    it('lineSubdivision passes through lines without crossings', () => {
        const line = [{ x: 0, y: 0 }, { x: 10, y: 0 }];
        const out: Array<Array<{ x: number; y: number }>> = [];
        lineSubdivision(line, [{ ax: 5, ay: 20, bx: 5, by: 30 }], out);
        expect(out.length).to.equal(1);
        expect(out[0].length).to.equal(2);
    });

    it('clipRingToBox clips to the tile bounds + margin', () => {
        const big = [
            { x: -50, y: -50 }, { x: 5000, y: -50 }, { x: 5000, y: 5000 }, { x: -50, y: 5000 }, { x: -50, y: -50 },
        ];
        const clipped = clipRingToBox(big, 4096, 1);
        expect(clipped).to.not.equal(null);
        if (!clipped) return;
        for (const p of clipped) {
            expect(p.x).to.be.within(-1, 4097);
            expect(p.y).to.be.within(-1, 4097);
        }
    });

    it('clipLinesToBox splits a line into sub-lines at the box border', () => {
        const lines = [[{ x: 0, y: 0 }, { x: 10000, y: 0 }]];
        const out = clipLinesToBox(lines, 4096, 0);
        expect(out.length).to.equal(1);
        expect(out[0][0].x).to.equal(0);
        expect(out[0][out[0].length - 1].x).to.equal(4096);
    });
});

describe('MBElevationFeature subdivision edges', () => {
    it('perpendicular split lines run through every vertex', () => {
        // A horizontal ramp: heights 0 → 10 along +x.
        const feature = new MBElevationFeature(1, { minX: 0, minY: 0, maxX: 100, maxY: 10 },
            undefined,
            [
                { x: 0, y: 5, height: 0, extent: 4, index: 0 },
                { x: 50, y: 5, height: 5, extent: 4, index: 1 },
                { x: 100, y: 5, height: 10, extent: 4, index: 2 },
            ],
            [{ a: 0, b: 1 }, { a: 1, b: 2 }],
            1 /* metersToTile */);
        const edges = feature.getSubdivisionEdges(1);
        expect(edges.length).to.equal(3);
        // Middle vertex direction = +x → perpendicular is vertical.
        expect(edges[1].ay).to.be.lessThan(5);
        expect(edges[1].by).to.be.greaterThan(5);
        // Strip half width = (extent + 1) * metersToTile = 5.
        expect(edges[1].ay).to.be.closeTo(0, 1e-6);
        expect(edges[1].by).to.be.closeTo(10, 1e-6);
    });

    it('pointElevation interpolates along the nearest edge', () => {
        const feature = new MBElevationFeature(1, { minX: 0, minY: 0, maxX: 100, maxY: 10 },
            undefined,
            [
                { x: 0, y: 5, height: 0, extent: 4, index: 0 },
                { x: 100, y: 5, height: 10, extent: 4, index: 1 },
            ],
            [{ a: 0, b: 1 }],
            1);
        expect(feature.pointElevation(50, 5)).to.be.closeTo(5, 1e-6);
        expect(feature.pointElevation(25, 5)).to.be.closeTo(2.5, 1e-6);
    });
});

describe('MBElevatedStructures', () => {
    function makeStructures(): MBElevatedStructures {
        const s = new MBElevatedStructures(10, 5, 5);
        // One curve with a linear ramp, plus its meta polygon.
        s.addRawFeature({
            type: 'Point',
            properties: {
                type: 'curve_point', version: '1.0.1',
                '3d_elevation_id': 1, elevation_idx: 0, extent: 4, height: 0,
            },
            x: 0, y: 4096, bounds: [0, 0, 4096, 4096], layerExtent: 4096,
        });
        s.addRawFeature({
            type: 'Point',
            properties: {
                type: 'curve_point', version: '1.0.1',
                '3d_elevation_id': 1, elevation_idx: 1, extent: 4, height: 10000,
            },
            x: 4096, y: 4096, bounds: [0, 0, 4096, 4096], layerExtent: 4096,
        });
        s.addRawFeature({
            type: 'Polygon',
            properties: { type: 'curve_meta', version: '1.0.1', '3d_elevation_id': 1 },
            x: 0, y: 0, bounds: [0, 0, 4096, 4096], layerExtent: 4096,
        });
        s.finalize(1);
        return s;
    }

    it('finalize assembles the curve from meta + vertices', () => {
        const s = makeStructures();
        expect(s.features).to.have.lengthOf(1);
        expect(s.features[0].vertices.length).to.equal(2);
        expect(s.isEmpty).to.equal(false);
    });

    it('prepareFillGeometry samples per-vertex heights across the ramp', () => {
        const s = makeStructures();
        const square = [
            { x: 0, y: 0 }, { x: 4096, y: 0 }, { x: 4096, y: 4096 }, { x: 0, y: 4096 }, { x: 0, y: 0 },
        ];
        const plan = s.prepareFillGeometry({ '3d_elevation_id': 1 }, [square], false, 4096);
        expect(plan).to.not.equal(null);
        if (!plan) return;
        // Heights should rise along +x: sample some vertices.
        const heights = plan.pieces.flatMap(p => p.heights);
        expect(Math.max(...heights)).to.be.greaterThan(0.9);
        expect(Math.min(...heights)).to.be.lessThan(0.1);
        expect(plan.isTunnel).to.equal(false);
    });

    it('prepareLineGeometry subdivides a line crossing the ramp', () => {
        const s = makeStructures();
        const plan = s.prepareLineGeometry(
            { '3d_elevation_id': 1 },
            [{ x: 0, y: 4096 }, { x: 4096, y: 4096 }],
            true, 4096);
        expect(plan).to.not.equal(null);
        if (!plan) return;
        expect(plan.heights.length).to.equal(plan.points.length);
        // Markup bias lifts by smoothstep(0, bias, |h|) — zero at h = 0,
        // full +0.05 once the curve is at/above the bias height.
        expect(plan.heights[0]).to.be.closeTo(0, 0.02);
        expect(plan.heights[plan.heights.length - 1]).to.be.closeTo(1.05, 0.02);
    });

    it('returns null when the feature references no curve', () => {
        const s = makeStructures();
        const plan = s.prepareFillGeometry({ '3d_elevation_id': 99 }, [
            [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }, { x: 0, y: 0 }],
        ], false, 4096);
        expect(plan).to.equal(null);
    });

    it('portal candidates classify ground edges as entrances', () => {
        const s = makeStructures();
        const feature = s.features[0];
        // Curve endpoints are at 0 and 1m — the y=0 edge lies on the ramp,
        // the x=0 edge touches ground at the left end.
        s.addPortalCandidates(1, [
            { x: 0, y: 4096 }, { x: 10, y: 4096 }, { x: 10, y: 4095 }, { x: 0, y: 4095 }, { x: 0, y: 4096 },
        ], false, feature);
        const portals = s.evaluatePortals().portals;
        expect(portals.length).to.be.greaterThan(0);
        for (const p of portals) {
            expect(['entrance', 'border', 'unevaluated', 'tunnel', 'polygon', 'none'])
                .to.include(p.type);
        }
    });

    it('portal evaluate pairs shared edges between two polygons', () => {
        // Two graphs sharing an edge — one tunnel, one not — merge into a
        // single 'tunnel' portal (mgl elevation_graph.evaluate). Endpoints
        // stay clear of the tile border so the border tag doesn't fire.
        const g1 = new MBElevationPortalGraph();
        g1.addPortal({
            connection: { a: 1, b: undefined },
            vaX: 1000, vaY: 1000, vbX: 1010, vbY: 1000, length: 10,
            hash: 'h1', isTunnel: true, type: 'unevaluated',
        });
        const g2 = new MBElevationPortalGraph();
        g2.addPortal({
            connection: { a: 2, b: undefined },
            vaX: 1000, vaY: 1000, vbX: 1010, vbY: 1000, length: 10,
            hash: 'h1', isTunnel: false, type: 'unevaluated',
        });
        const out = MBElevationPortalGraph.evaluate([g1, g2]);
        expect(out.portals.length).to.equal(1);
        expect(out.portals[0].type).to.equal('tunnel');
        expect(out.portals[0].connection).to.deep.equal({ a: 1, b: 2 });
    });
});

describe('MBExpressionEngine line elevation operators', () => {
    it('at-interpolated returns exact values at integer indices', () => {
        const ctx: any = { zoom: 0 };
        expect(MBExpressionEngine.evaluate(
            ['at-interpolated', ['literal', 1], ['get', 'elevation']],
            { ...ctx, feature: { properties: { elevation: [10, 20, 30] } } } as any,
        )).to.equal(20);
    });

    it('at-interpolated interpolates between numeric entries', () => {
        const ctx: any = { zoom: 0 };
        expect(MBExpressionEngine.evaluate(
            ['at-interpolated', 0.5, ['get', 'elevation']],
            { ...ctx, feature: { properties: { elevation: [10, 20] } } } as any,
        )).to.equal(15);
    });

    it('at-interpolated returns null out of bounds', () => {
        const ctx: any = { zoom: 0 };
        expect(MBExpressionEngine.evaluate(
            ['at-interpolated', 5, ['get', 'elevation']],
            { ...ctx, feature: { properties: { elevation: [10, 20] } } } as any,
        )).to.equal(null);
    });

    it('line-progress reads the context value', () => {
        const ctx: any = { zoom: 0, lineProgress: 0.25 };
        expect(MBExpressionEngine.evaluate(['line-progress'], ctx)).to.equal(0.25);
        expect(MBExpressionEngine.evaluate(['line-progress'], { zoom: 0 } as any)).to.equal(0);
    });
});

describe('MBTileDataEmitter sea-mode per-vertex z-offset', () => {
    it('evaluates line-z-offset per vertex with line-progress', () => {
        const style: any = {
            version: 8,
            sources: {},
            layers: [{
                id: 'elev',
                type: 'line',
                source: 'geojson',
                layout: {
                    'line-elevation-reference': 'sea',
                    'line-z-offset': ['-', ['at-interpolated', ['*', ['line-progress'], 1], ['get', 'elevation']], 300],
                },
                paint: { 'line-color': '#0000ff', 'line-width': 3 },
            }],
        };
        const evaluator = new MBLayerEvaluator(style);
        const tileKey = TileKey.fromRowColumnLevel(0, 0, 0);
        const decodeInfo = createDecodeInfo(tileKey);
        const emitter = new MBTileDataEmitter(tileKey, decodeInfo, 0);

        const line = {
            positions: [
                new THREE.Vector2(0, 0),
                new THREE.Vector2(2048, 2048),
                new THREE.Vector2(4096, 4096),
            ],
        };
        const props = { elevation: [5000, 1000] };
        const matched = evaluator.evaluate('geojson', '', { type: 'LineString', properties: props }, 0, 'line');
        expect(matched.length).to.equal(1);

        emitter.processLineFeature('geojson', 4096, [line as any], props, undefined, matched);

        const decodedTile = emitter.getDecodedTile();
        expect(decodedTile.geometries.length).to.be.greaterThan(0);
        const pos = decodedTile.geometries[0].vertexAttributes.find((a: any) => a.name === 'position');
        expect(pos).to.not.equal(undefined);
        const arr = new Float32Array(pos.buffer);
        const zs: number[] = [];
        for (let i = 2; i < arr.length; i += 3) zs.push(arr[i]);
        // mgl semantics: first vertex at progress 0 → 5000 - 300 = 4700;
        // last vertex at progress 1 → 1000 - 300 = 700. The ribbon must
        // SPAN that range (per-vertex evaluation), not sit flat.
        expect(Math.max(...zs)).to.be.greaterThan(4000);
        expect(Math.min(...zs)).to.be.lessThan(1500);
    });
});

describe('MBElevatedStructures mesh construction', () => {
    function makeCurveStructures(heights: number[]): MBElevatedStructures {
        const s = new MBElevatedStructures(10, 5, 5);
        if (heights.length === 1) heights = [heights[0], heights[0]];
        heights.forEach((h, i) => {
            // Duplicate a lone height so the curve has an edge — an
            // edgeless (single-vertex) curve has no defined surface and
            // pointElevation falls back to 0 (mgl getClosestEdge miss).
            s.addRawFeature({
                type: 'Point',
                properties: {
                    type: 'curve_point', version: '1.0.1',
                    // h arrives as the RAW property value (/10000 on decode).
                    '3d_elevation_id': 1, elevation_idx: i, extent: 4, height: h,
                },
                x: i * 4096, y: 4096, bounds: [0, 0, 4096, 4096], layerExtent: 4096,
            });
        });
        s.addRawFeature({
            type: 'Polygon',
            properties: { type: 'curve_meta', version: '1.0.1', '3d_elevation_id': 1 },
            x: 0, y: 0, bounds: [0, 0, 4096, 4096], layerExtent: 4096,
        });
        s.finalize(1);
        return s;
    }

    it('builds bridge guard-rail strips around an elevated road', () => {
        const s = makeCurveStructures([50000]); // constant 5 m
        const plan = s.prepareFillGeometry({ '3d_elevation_id': 1 }, [
            [{ x: 100, y: 100 }, { x: 200, y: 100 }, { x: 200, y: 200 }, { x: 100, y: 200 }, { x: 100, y: 100 }],
        ], false, 4096);
        expect(plan).to.not.equal(null);
        if (!plan) return;
        s.addPortalCandidates(plan.feature.id, plan.clippedRingsCanonical[0], plan.isTunnel, plan.feature);
        s.addElevatedFeature({
            featureIndex: 0, guardRailEnabled: true, isTunnel: plan.isTunnel,
            pieces: plan.piecesCanonical,
        });
        const mesh = s.construct();
        expect(mesh).to.not.equal(null);
        if (!mesh) return;
        // 4 ring edges → 3 strips × 2 triangles × 4 quads… at minimum the
        // rails must exist and rise above the 5 m surface.
        expect(mesh.indices.length).to.be.greaterThan(0);
        expect(mesh.tunnelStart).to.equal(mesh.indices.length); // no tunnel segment
        let maxZ = -Infinity;
        for (let i = 2; i < mesh.positions.length; i += 3) {
            if (mesh.positions[i] > maxZ) maxZ = mesh.positions[i];
        }
        // Rail top = surface 5 m + 0.5 m rail height.
        expect(maxZ).to.be.greaterThan(5.4);
        expect(maxZ).to.be.lessThan(5.6);
    });

    it('builds tunnel walls and double-sided entrances below ground', () => {
        const s = makeCurveStructures([-60000]); // constant −6 m → tunnel
        const plan = s.prepareFillGeometry({ '3d_elevation_id': 1 }, [
            [{ x: 100, y: 100 }, { x: 200, y: 100 }, { x: 200, y: 200 }, { x: 100, y: 200 }, { x: 100, y: 100 }],
        ], false, 4096);
        expect(plan).to.not.equal(null);
        if (!plan) return;
        expect(plan.isTunnel).to.equal(true);
        s.addPortalCandidates(plan.feature.id, plan.clippedRingsCanonical[0], plan.isTunnel, plan.feature);
        s.addElevatedFeature({
            featureIndex: 0, guardRailEnabled: true, isTunnel: plan.isTunnel,
            pieces: plan.piecesCanonical,
        });
        const mesh = s.construct();
        expect(mesh).to.not.equal(null);
        if (!mesh) return;
        // Single tunnel polygon: no bridge segment; the walls carry the
        // tunnel flag and rise to h + TUNNEL_ENTERANCE_HEIGHT = −2 m.
        expect(mesh.indices.length).to.be.greaterThan(0);
        // Entrance quads reach −6 + 4 = −2 m; walls stay below 0.
        let maxZ = -Infinity;
        for (let i = 2; i < mesh.positions.length; i += 3) {
            if (mesh.positions[i] > maxZ) maxZ = mesh.positions[i];
        }
        expect(maxZ).to.be.closeTo(-2, 1e-6);
        // Underground walls descend to the road surface −6 m.
        let minZ = Infinity;
        for (let i = 2; i < mesh.positions.length; i += 3) {
            if (mesh.positions[i] < minZ) minZ = mesh.positions[i];
        }
        expect(minZ).to.be.closeTo(-6, 1e-6);
    });

    it('portal evaluate keeps descending hash order for prepareEdges', () => {
        const g1 = new MBElevationPortalGraph();
        g1.addPortal({
            connection: { a: 1, b: undefined },
            vaX: 2000, vaY: 2000, vbX: 2100, vbY: 2000, length: 100,
            hash: 'aaa', isTunnel: false, type: 'entrance',
        });
        const out = MBElevationPortalGraph.evaluate([g1]);
        expect(out.portals.length).to.equal(1);
        expect(out.portals[0].type).to.equal('entrance');
    });
});

function shoelace(ring: Array<{ x: number; y: number }>): number {
    let a = 0;
    for (let i = 0; i < ring.length - 1; i++) {
        a += ring[i].x * ring[i + 1].y - ring[i + 1].x * ring[i].y;
    }
    return a / 2;
}

describe('MBTileDataEmitter sea-mode ground-scale (§548)', () => {
    function runSeaZs(layoutExtra: Record<string, unknown>, exaggeration: number | null): number[] {
        const style: any = {
            version: 8,
            sources: {},
            layers: [{
                id: 'elev',
                type: 'line',
                source: 'geojson',
                layout: {
                    'line-elevation-reference': 'sea',
                    'line-z-offset': ['literal', 1000],
                    ...layoutExtra,
                },
                paint: { 'line-color': '#0000ff', 'line-width': 3 },
            }],
        };
        const evaluator = new MBLayerEvaluator(style);
        const tileKey = TileKey.fromRowColumnLevel(0, 0, 0);
        const decodeInfo = createDecodeInfo(tileKey);
        const emitter = new MBTileDataEmitter(tileKey, decodeInfo, 0);
        if (exaggeration !== null) emitter.setTerrainExaggeration(exaggeration);

        const line = {
            positions: [
                new THREE.Vector2(0, 0),
                new THREE.Vector2(2048, 2048),
                new THREE.Vector2(4096, 4096),
            ],
        };
        const props = {};
        const matched = evaluator.evaluate('geojson', '', { type: 'LineString', properties: props }, 0, 'line');
        emitter.processLineFeature('geojson', 4096, [line as any], props, undefined, matched);

        const decodedTile = emitter.getDecodedTile();
        const pos = decodedTile.geometries[0].vertexAttributes.find((a: any) => a.name === 'position');
        const arr = new Float32Array(pos.buffer);
        const zs: number[] = [];
        for (let i = 2; i < arr.length; i += 3) zs.push(arr[i]);
        return zs;
    }

    it('scales sea z-offset by mix(1, exaggeration, ground-scale)', () => {
        // exaggeration 2, ground-scale 0.5 → factor 1.5 → z = 1000×1.5 = 1500.
        const zs = runSeaZs({ 'line-elevation-ground-scale': 0.5 }, 2);
        for (const z of zs) expect(z).to.be.closeTo(1500, 1e-3);
    });

    it('keeps the z-offset at exaggeration 1 (default)', () => {
        const zs = runSeaZs({ 'line-elevation-ground-scale': 0.5 }, null);
        for (const z of zs) expect(z).to.be.closeTo(1000, 1e-3);
    });

    it('applies ground-scale only for sea reference (mgl gate)', () => {
        const zs = runSeaZs(
            { 'line-elevation-reference': 'ground', 'line-elevation-ground-scale': 1 }, 2);
        for (const z of zs) expect(z).to.be.closeTo(1000, 1e-3);
    });
});
