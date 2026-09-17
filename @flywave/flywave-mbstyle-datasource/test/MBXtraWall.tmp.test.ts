import { expect } from 'chai';
import { readFileSync } from 'fs';
import { TileKey, webMercatorTilingScheme } from '@flywave/flywave-geoutils';import {
    MBStyleDecoder,
    mbCellTileKeyString,
    mbPendingSourceTilesClear,
    mbPendingSourceTilesPut,
} from '../src/MBStyleDecoder';

const PROJECTION = webMercatorTilingScheme.projection;

// A/B: 0 = disable the geojson-branch MVT y flip (run with
// FLIP=0 npx mocha ... to test the no-flip hypothesis).
(globalThis as any).__mbGeojsonFlip = process.env.FLIP === '0' ? 0 : 1;

describe('MBXtraWall repro: shadow-casters geojson wall routing', () => {
    it('routes the 200m wall through decodeTileWithSources into extruded-polygon', async () => {
        const style = JSON.parse(readFileSync(
            'test/render-tests/3d-intersections/elevated-symbols-lighting/style.json', 'utf8'));
        const decoder = new MBStyleDecoder();
        decoder.configure({}, { mbStyle: style, storageLevelOffset: -1, currentSourceId: 'hd-roads' } as any);

        // Hook the evaluator to see every evaluate() call + match count.
        const { MBLayerEvaluator } = require('../src/MBLayerEvaluator');
        const evProto = MBLayerEvaluator.prototype;
        const origEval = evProto.evaluate;
        evProto.evaluate = function (sourceId: string, sourceLayer: string, feat: any, ...rest: any[]) {
            const matched = origEval.call(this, sourceId, sourceLayer, feat, ...rest);
            if (sourceId !== '__mb_background__') {
                // eslint-disable-next-line no-console
                console.log(`[EVAL] src=${sourceId} sl=${sourceLayer} type=${feat?.type} matched=${matched.length} ids=[${matched.map((l: any) => `${l.id}:${l.type}`).join(',')}]`);
            }
            return matched;
        };

        // Hook the emitter fill entry.
        const { MBTileDataEmitter } = require('../src/MBTileDataEmitter');
        const emProto = MBTileDataEmitter.prototype;
        const origFill = emProto.processFillFeature;
        emProto.processFillFeature = function (layer: string, extents: number, geom: any, props: any, fid: any, layers: any[]) {
            // eslint-disable-next-line no-console
            console.log(`[EMIT-FILL] layer=${layer} ext=${extents} nLayers=${layers?.length} types=[${(layers ?? []).map((l: any) => l.type).join(',')}]`);
            return origFill.call(this, layer, extents, geom, props, fid, layers);
        };

        // GeoJSON payload exactly as GeoJSONDataProvider.getTile returns it:
        // filterFeaturesToTile CLIPS the polygon to the tile rect. Replicate
        // the observed 280-byte payload for z19 465686/206486.
        const payload = JSON.stringify({
            type: 'FeatureCollection',
            features: [{
                type: 'Feature',
                properties: {},
                geometry: {
                    coordinates: [[[139.76119995117188, 35.66287517311727],
                        [139.76119995117188, 35.66277484557265],
                        [139.76184935957775, 35.66287517311727]]],
                    type: 'Polygon',
                },
            }],
        });

        mbPendingSourceTilesClear();
        const cellKey = TileKey.fromRowColumnLevel(103243, 232843, 18);
        mbPendingSourceTilesPut(mbCellTileKeyString(cellKey), [
            { sourceId: 'shadow-casters', z: 19, x: 465686, y: 206486, bytes: undefined as any, payload },
        ]);

        // Replicate the browser order: the provider stashes during the SAME
        // getTile that returns the primary MVT bytes — decode the REAL cell
        // MVT (readFileSync → ArrayBuffer) so elevation structures populate
        // exactly like the live run, THEN the extras merge runs.
        const mvtPath = 'test/rendering/integration/tiles/3d-intersections/18-232843-103243.mvt';
        const mvtBuf = readFileSync(mvtPath);
        const mvtAb = mvtBuf.buffer.slice(mvtBuf.byteOffset, mvtBuf.byteOffset + mvtBuf.byteLength);

        const decoded = await decoder.decodeThemedTile(
            mvtAb as any, cellKey, undefined as any, PROJECTION);

        evProto.evaluate = origEval;
        emProto.processFillFeature = origFill;

        // eslint-disable-next-line no-console
        console.log(`[OUT] techs=${decoded.techniques.length} geos=${decoded.geometries.length} maxH=${decoded.maxGeometryHeight}`);
        for (const t of decoded.techniques) {
            // eslint-disable-next-line no-console
            console.log(`  tech name=${(t as any).name} layerId=${(t as any)._layerId} height=${(t as any).height}`);
        }
        // World-position audit for the wall geometry: take every geometry
        // whose group references the extruded-polygon technique, add the
        // cell center (mesh is tile-center-relative), and unproject the
        // result back to lng/lat via the cell's mercator frame.
        const wallTechIdx = decoded.techniques.findIndex(t => (t as any).name === 'extruded-polygon');
        for (const g of decoded.geometries) {
            const isWall = (g.groups ?? []).some(gr => {
                const t = decoded.techniques[gr.technique];
                return t && (t as any).name === 'extruded-polygon';
            });
            if (!isWall) continue;
            const pos = g.vertexAttributes.find((a: any) => a.name === 'position');
            if (!pos) continue;
            const arr = new Float32Array(pos.buffer);
            let minX = Infinity, minY = Infinity, minZ = Infinity, maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
            for (let i = 0; i + 2 < arr.length; i += 3) {
                minX = Math.min(minX, arr[i]); maxX = Math.max(maxX, arr[i]);
                minY = Math.min(minY, arr[i + 1]); maxY = Math.max(maxY, arr[i + 1]);
                minZ = Math.min(minZ, arr[i + 2]); maxZ = Math.max(maxZ, arr[i + 2]);
            }
            // Local frame → absolute world: add the decodeInfo center used by
            // the extras child decode (z19 465686/206486 frame rebased by the
            // merge already — the merged coords are relative to the CELL
            // center). Unproject: world meters → mercator → lng/lat.
            const cellCenter = (decoder as any).m_storageLevelOffset !== undefined ? null : null;
            void cellCenter;
            const R = 6378137;
            const cellC = { x: 0, y: 0 };
            // Recover the cell center the same way DecodeInfo does.
            const geoBox = (webMercatorTilingScheme as any).getGeoBox(cellKey);
            const { OrientedBox3 } = require('@flywave/flywave-geoutils');
            const pb = new OrientedBox3();
            PROJECTION.projectBox(geoBox, pb);
            const c = new (require('three').Vector3)();
            pb.getCenter(c);
            cellC.x = c.x; cellC.y = c.y;
            const toLng = (x: number) => (x / R) * 180 / Math.PI;
            const toLat = (y: number) => (Math.atan(Math.exp((y - cellC.y + cellC.y) / R)) * 2 - Math.PI / 2) * 180 / Math.PI;
            // The mesh frame is cell-center-relative: absolute = local + cellCenter.
            const ax0 = minX + cellC.x, ay0 = minY + cellC.y, ax1 = maxX + cellC.x, ay1 = maxY + cellC.y;
            const lat0 = (Math.atan(Math.exp(ay0 / R)) * 2 - Math.PI / 2) * 180 / Math.PI;
            const lat1 = (Math.atan(Math.exp(ay1 / R)) * 2 - Math.PI / 2) * 180 / Math.PI;
            // eslint-disable-next-line no-console
            console.log(`[WALL-GEO] local x[${minX.toFixed(1)},${maxX.toFixed(1)}] y[${minY.toFixed(1)},${maxY.toFixed(1)}] z[${minZ.toFixed(2)},${maxZ.toFixed(2)}] absX[${ax0.toFixed(1)},${ax1.toFixed(1)}] absY[${ay0.toFixed(1)},${ay1.toFixed(1)}]`);
            void lat0; void lat1; void toLng; void toLat;
        }
        // Exact absolute-position audit in the harp frame: expected = the
        // wall polygon projected by webMercatorProjection; actual = merged
        // mesh local + DecodeInfo(cellKey).center.
        {
            const geoUtils: any = require('@flywave/flywave-geoutils');
            const threeMod: any = require('three');
            const webMerc = geoUtils.webMercatorProjection;
            const geoBox2 = (webMercatorTilingScheme as any).getGeoBox(cellKey);
            const OB3 = geoUtils.OrientedBox3;
            const pb2 = new OB3();
            PROJECTION.projectBox(geoBox2, pb2);
            const cc = new threeMod.Vector3();
            pb2.getCenter(cc);
            const wp = new threeMod.Vector3();
            const GeoCoordinates = geoUtils.GeoCoordinates;
            webMerc.projectPoint(
                GeoCoordinates.fromGeoPoint([139.76119995117188, 35.66287517311727]), wp);
            // eslint-disable-next-line no-console
            console.log(`[WALL-EXP] expected world for wall vertex0 = (${wp.x.toFixed(1)}, ${wp.y.toFixed(1)}, ${wp.z.toFixed(1)}); cellCenter=(${cc.x.toFixed(1)}, ${cc.y.toFixed(1)}, ${cc.z.toFixed(1)})`);
        }
        expect(decoded.techniques.length).to.be.greaterThan(0);
    });
});
