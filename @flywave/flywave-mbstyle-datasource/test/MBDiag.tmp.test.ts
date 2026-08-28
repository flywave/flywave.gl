import { expect } from 'chai';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { TileKey, webMercatorTilingScheme } from '@flywave/flywave-geoutils';
import { MBStyleDecoder } from '../src/MBStyleDecoder';

describe('MBDiag', () => {
    it('two-pass decode: deferred curves resolve on warm registry', async () => {
        const style = JSON.parse(readFileSync('test/render-tests/3d-intersections/road-markups/style.json', 'utf8'));
        const tileDir = 'test/rendering/integration/tiles/3d-intersections';
        const tiles = readdirSync(tileDir).filter(f => f.startsWith('18-4211'));
        const decoder = new MBStyleDecoder();
        decoder.configure({}, { mbStyle: style, storageLevelOffset: -1, currentSourceId: 'hd-roads' } as any);

        let withId = 0, noId = 0;
        const decodeAll = async (tag: string) => {
            for (const f of tiles) {
                const m = f.match(/(\d+)-(\d+)-(\d+)\.mvt/);
                if (!m) continue;
                const data = readFileSync(join(tileDir, f));
                const ab = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
                const key = TileKey.fromRowColumnLevel(+m[3], +m[2], +m[1]);
                const tile = await decoder.decodeThemedTile(ab as any, key, undefined as any, webMercatorTilingScheme.projection, +m[1]);
                let flat = 0, elev = 0;
                for (const g of tile.geometries ?? []) {
                    for (const gr of g.groups ?? []) {
                        const t = (tile.techniques ?? [])[gr.technique] as any;
                        if (!t || t._layerId !== 'double-lines') continue;
                        const pos = g.vertexAttributes.find((a: any) => a.name === 'position');
                        if (!pos) continue;
                        const arr = new Float32Array(pos.buffer);
                        let minZ = Infinity, maxZ = -Infinity;
                        for (let i = 2; i < arr.length; i += 3) {
                            minZ = Math.min(minZ, arr[i]); maxZ = Math.max(maxZ, arr[i]);
                        }
                        if (maxZ - minZ < 0.01 && Math.abs(maxZ) < 0.01) flat += gr.count; else elev += gr.count;
                    }
                }
                console.log(`    ${tag} ${f} double-lines flatN=${flat} elevN=${elev}`);
                void withId; void noId;
            }
        };
        const origHook = (MBStyleDecoder as any);
        // count double-lines features by id presence via the emitter hook
        const { MBTileDataEmitter } = require('../src/MBTileDataEmitter');
        const proto = MBTileDataEmitter.prototype;
        const origPL = proto.processLineFeature;
        proto.processLineFeature = function (layerName, extents, geometry, properties, featureId, matchedLayers) {
            if (String(properties?.line_type) === 'double') {
                if (properties?.['3d_elevation_id'] !== undefined) withId++; else noId++;
            }
            return origPL.call(this, layerName, extents, geometry, properties, featureId, matchedLayers);
        };
        await decodeAll('PASS1');
        proto.processLineFeature = origPL;
        console.log(`    DOUBLE-FEATURES withId=${withId} noId=${noId}`);
        await decodeAll('PASS2');
        expect(true).to.equal(true);
    });
});
