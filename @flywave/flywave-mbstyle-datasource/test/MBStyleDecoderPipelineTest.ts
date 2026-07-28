import { expect } from 'chai';
import { TileKey, webMercatorTilingScheme, OrientedBox3 } from '@flywave/flywave-geoutils';
import * as THREE from 'three';

import { MBLayerEvaluator } from '../src/MBLayerEvaluator';
import { MBTileDataEmitter } from '../src/MBTileDataEmitter';
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
});
