import { assert } from 'chai';
import { decodeTerrainElevation, createTerrainGrid } from '../src/materials/MapTerrainMaterial';
import { createSkirtedGrid } from '../src/TerrainController';

describe('Terrain algorithms', () => {
    describe('decodeTerrainElevation (Mapbox terrain-rgb)', () => {
        it('decodes the canonical zero-elevation triplet', () => {
            // (R*65536+G*256+B)/10 - 10000 = 0  =>  R*65536+G*256+B = 100000
            // 100000 = 1*65536 + 134*256 + 160  → R=1,G=134,B=160
            assert.strictEqual(decodeTerrainElevation(1, 134, 160), 0);
        });

        it('is monotonic in the blue channel', () => {
            const a = decodeTerrainElevation(1, 134, 160);
            const b = decodeTerrainElevation(1, 134, 161);
            assert.isAbove(b, a);
        });

        it('produces negative heights for low elevations', () => {
            // R=G=B=0 → (0)/10 - 10000 = -10000
            assert.strictEqual(decodeTerrainElevation(0, 0, 0), -10000);
        });

        it('produces positive heights for high elevations', () => {
            // R=255,G=255,B=255 → (16711680 - ... )/10 - 10000; just check large positive
            const h = decodeTerrainElevation(255, 255, 255);
            assert.isAbove(h, 6000);
        });

        it('matches the documented mapbox formula exactly', () => {
            // Cross-check a few samples against the formula directly.
            for (const [r, g, b] of [[10, 20, 30], [128, 128, 128], [200, 100, 50]] as const) {
                const expected = (r * 65536 + g * 256 + b) / 10 - 10000;
                assert.closeTo(decodeTerrainElevation(r, g, b), expected, 1e-6);
            }
        });
    });

    describe('createTerrainGrid', () => {
        it('produces a plane with the requested segment count', () => {
            const geo = createTerrainGrid(1, 1, 16);
            // (segments+1)^2 vertices
            assert.strictEqual(geo.attributes.position.count, 17 * 17);
        });
    });

    describe('createSkirtedGrid', () => {
        it('adds skirt vertices beyond the base grid', () => {
            const segments = 8;
            const baseVerts = (segments + 1) * (segments + 1);
            const geo = createSkirtedGrid(1, segments, 0.01);
            assert.isAbove(geo.attributes.position.count, baseVerts,
                'skirted grid must have more vertices than the base grid');
            assert.isAbove(geo.index!.count, segments * segments * 6,
                'skirted grid must have more indices than base triangles');
        });

        it('has skirt vertices displaced downward in Y', () => {
            const geo = createSkirtedGrid(1, 4, 0.5);
            const pos = geo.attributes.position;
            let hasLowered = false;
            for (let i = 0; i < pos.count; i++) {
                if (pos.getY(i) < -1e-6) { hasLowered = true; break; }
            }
            assert.isTrue(hasLowered, 'at least one skirt vertex should be below the plane');
        });
    });
});
