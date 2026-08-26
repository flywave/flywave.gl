import { assert } from 'chai';
import * as THREE from 'three';
import { decodeTerrainElevation, createTerrainGrid } from '../src/materials/MapTerrainMaterial';
import { createSkirtedGrid, TerrainController } from '../src/TerrainController';
import { buildTileCamera, isEnvironmentObject } from '../src/TerrainDrapingUtils';

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

    describe('TerrainController.allDemTiles', () => {
        it('starts empty before any tile is loaded', () => {
            const scene = new THREE.Scene();
            const tc = new TerrainController(scene);
            assert.strictEqual(tc.allDemTiles.length, 0);
            assert.strictEqual(tc.centerDem, null);
            tc.dispose();
        });

        it('exposes each loaded tile with world-space origin and size', () => {
            // Inspect the geometry of allDemTiles by manually populating the
            // controller via its private mesh list — we cannot easily fake
            // an HTTP DEM load in a unit test. Instead we verify that the
            // public getter's math is correct for a synthetic mesh.
            const scene = new THREE.Scene();
            const tc = new TerrainController(scene);
            const C = 40075016.686;
            const tileWorldSize = C / 4;
            // Synthesise a mesh matching what loadAndAddTile would produce.
            const mesh = new THREE.Mesh(
                new THREE.PlaneGeometry(1, 1),
                new THREE.MeshBasicMaterial(),
            );
            // z-up engine: x/y are the mercator plane, elevation on z.
            mesh.position.set(
                5 * tileWorldSize + tileWorldSize / 2,
                7 * tileWorldSize + tileWorldSize / 2,
                0);
            mesh.scale.set(1, 1, 1);
            const fakeTexture = new THREE.DataTexture(
                new Float32Array([0]), 1, 1, THREE.RedFormat, THREE.FloatType,
            );
            // Inject into the private fields the getter reads. §117: the
            // getter reads the WORLD position from userData, not mesh.position
            // (which is camera-relative at runtime).
            mesh.userData.__mbWorldPos = mesh.position.clone();
            (tc as any).m_meshes.push(mesh);
            (tc as any).m_demTextures.push(fakeTexture);
            const tiles = tc.allDemTiles;
            assert.strictEqual(tiles.length, 1);
            // Origin is the corner of the tile, not the center.
            assert.closeTo(tiles[0].originX, 5 * tileWorldSize, 1e-3);
            assert.closeTo(tiles[0].originY, 7 * tileWorldSize, 1e-3);
            assert.closeTo(tiles[0].size, tileWorldSize, 1e-3);
            fakeTexture.dispose();
            tc.dispose();
        });
    });

    describe('TerrainDraping.buildTileCamera', () => {
        it('returns null for zero-size tile', () => {
            assert.isNull(buildTileCamera({ originX: 0, originY: 0, size: 0 }));
        });

        it('builds an OrthographicCamera covering the tile bounds', () => {
            const tile = { originX: 100, originY: 200, size: 50 };
            const cam = buildTileCamera(tile);
            assert.isNotNull(cam);
            if (!cam) return;
            assert.instanceOf(cam, THREE.OrthographicCamera);
            assert.strictEqual(cam.left, 100);
            assert.strictEqual(cam.right, 150);
            assert.strictEqual(cam.top, 250);
            assert.strictEqual(cam.bottom, 200);
        });

        it('positions camera at tile center looking down', () => {
            // §139/§280 semantics: camera-relative x/y center, fixed z=6000
            // inside the 1..12000 frustum window, up = +Y (z-up scene).
            const tile = { originX: 0, originY: 0, size: 1000 };
            const cam = buildTileCamera(tile);
            if (!cam) return;
            assert.closeTo(cam.position.x, 500, 0.1);
            assert.closeTo(cam.position.y, 500, 0.1);
            assert.strictEqual(cam.position.z, 6000);
            assert.strictEqual(cam.up.y, 1);
        });

        it('camera frustum matches the tile size', () => {
            const tile = { originX: 0, originY: 0, size: 800 };
            const cam = buildTileCamera(tile);
            if (!cam) return;
            const width = cam.right - cam.left;
            const height = cam.top - cam.bottom;
            assert.closeTo(width, height, 0.001);
            assert.closeTo(width, 800, 0.001);
        });

        it('handles negative origin coordinates', () => {
            const tile = { originX: -500, originY: 100, size: 200 };
            const cam = buildTileCamera(tile);
            if (!cam) return;
            assert.closeTo(cam.left, -500, 0.001);
            assert.closeTo(cam.right, -300, 0.001);
            assert.closeTo(cam.top, 300, 0.001);
            assert.closeTo(cam.bottom, 100, 0.001);
        });
    });

    describe('isEnvironmentObject', () => {
        it('identifies lights as environment objects', () => {
            const light = new THREE.AmbientLight();
            assert.isTrue(isEnvironmentObject(light as any));
        });

        it('identifies LineSegments as environment objects', () => {
            const lines = new THREE.LineSegments(new THREE.BufferGeometry());
            assert.isTrue(isEnvironmentObject(lines as any));
        });

        it('identifies tagged environment objects', () => {
            const obj = new THREE.Object3D();
            obj.userData.__mbEnvironment = true;
            assert.isTrue(isEnvironmentObject(obj));
        });

        it('does not flag regular meshes', () => {
            const mesh = new THREE.Mesh(new THREE.BufferGeometry());
            assert.isFalse(isEnvironmentObject(mesh));
        });
    });
});
