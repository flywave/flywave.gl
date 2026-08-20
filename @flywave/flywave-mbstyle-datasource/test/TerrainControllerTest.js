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
const THREE = __importStar(require("three"));
const MapTerrainMaterial_1 = require("../src/materials/MapTerrainMaterial");
const TerrainController_1 = require("../src/TerrainController");
const TerrainDrapingUtils_1 = require("../src/TerrainDrapingUtils");
describe('Terrain algorithms', () => {
    describe('decodeTerrainElevation (Mapbox terrain-rgb)', () => {
        it('decodes the canonical zero-elevation triplet', () => {
            chai_1.assert.strictEqual((0, MapTerrainMaterial_1.decodeTerrainElevation)(1, 134, 160), 0);
        });
        it('is monotonic in the blue channel', () => {
            const a = (0, MapTerrainMaterial_1.decodeTerrainElevation)(1, 134, 160);
            const b = (0, MapTerrainMaterial_1.decodeTerrainElevation)(1, 134, 161);
            chai_1.assert.isAbove(b, a);
        });
        it('produces negative heights for low elevations', () => {
            chai_1.assert.strictEqual((0, MapTerrainMaterial_1.decodeTerrainElevation)(0, 0, 0), -10000);
        });
        it('produces positive heights for high elevations', () => {
            const h = (0, MapTerrainMaterial_1.decodeTerrainElevation)(255, 255, 255);
            chai_1.assert.isAbove(h, 6000);
        });
        it('matches the documented mapbox formula exactly', () => {
            for (const [r, g, b] of [[10, 20, 30], [128, 128, 128], [200, 100, 50]]) {
                const expected = (r * 65536 + g * 256 + b) / 10 - 10000;
                chai_1.assert.closeTo((0, MapTerrainMaterial_1.decodeTerrainElevation)(r, g, b), expected, 1e-6);
            }
        });
    });
    describe('createTerrainGrid', () => {
        it('produces a plane with the requested segment count', () => {
            const geo = (0, MapTerrainMaterial_1.createTerrainGrid)(1, 1, 16);
            chai_1.assert.strictEqual(geo.attributes.position.count, 17 * 17);
        });
    });
    describe('createSkirtedGrid', () => {
        it('adds skirt vertices beyond the base grid', () => {
            const segments = 8;
            const baseVerts = (segments + 1) * (segments + 1);
            const geo = (0, TerrainController_1.createSkirtedGrid)(1, segments, 0.01);
            chai_1.assert.isAbove(geo.attributes.position.count, baseVerts, 'skirted grid must have more vertices than the base grid');
            chai_1.assert.isAbove(geo.index.count, segments * segments * 6, 'skirted grid must have more indices than base triangles');
        });
        it('has skirt vertices displaced downward in Y', () => {
            const geo = (0, TerrainController_1.createSkirtedGrid)(1, 4, 0.5);
            const pos = geo.attributes.position;
            let hasLowered = false;
            for (let i = 0; i < pos.count; i++) {
                if (pos.getY(i) < -1e-6) {
                    hasLowered = true;
                    break;
                }
            }
            chai_1.assert.isTrue(hasLowered, 'at least one skirt vertex should be below the plane');
        });
    });
    describe('TerrainController.allDemTiles', () => {
        it('starts empty before any tile is loaded', () => {
            const scene = new THREE.Scene();
            const tc = new TerrainController_1.TerrainController(scene);
            chai_1.assert.strictEqual(tc.allDemTiles.length, 0);
            chai_1.assert.strictEqual(tc.centerDem, null);
            tc.dispose();
        });
        it('exposes each loaded tile with world-space origin and size', () => {
            const scene = new THREE.Scene();
            const tc = new TerrainController_1.TerrainController(scene);
            const C = 40075016.686;
            const tileWorldSize = C / 4;
            const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial());
            mesh.position.set(5 * tileWorldSize + tileWorldSize / 2, 0, 7 * tileWorldSize + tileWorldSize / 2);
            mesh.scale.set(1, 1, 1);
            const fakeTexture = new THREE.DataTexture(new Float32Array([0]), 1, 1, THREE.RedFormat, THREE.FloatType);
            tc.m_meshes.push(mesh);
            tc.m_demTextures.push(fakeTexture);
            const tiles = tc.allDemTiles;
            chai_1.assert.strictEqual(tiles.length, 1);
            chai_1.assert.closeTo(tiles[0].originX, 5 * tileWorldSize, 1e-3);
            chai_1.assert.closeTo(tiles[0].originY, 7 * tileWorldSize, 1e-3);
            chai_1.assert.closeTo(tiles[0].size, tileWorldSize, 1e-3);
            fakeTexture.dispose();
            tc.dispose();
        });
    });
    describe('TerrainDraping.buildTileCamera', () => {
        it('returns null for zero-size tile', () => {
            chai_1.assert.isNull((0, TerrainDrapingUtils_1.buildTileCamera)({ originX: 0, originY: 0, size: 0 }));
        });
        it('builds an OrthographicCamera covering the tile bounds', () => {
            const tile = { originX: 100, originY: 200, size: 50 };
            const cam = (0, TerrainDrapingUtils_1.buildTileCamera)(tile);
            chai_1.assert.isNotNull(cam);
            if (!cam)
                return;
            chai_1.assert.instanceOf(cam, THREE.OrthographicCamera);
            chai_1.assert.strictEqual(cam.left, 100);
            chai_1.assert.strictEqual(cam.right, 150);
            chai_1.assert.strictEqual(cam.top, 250);
            chai_1.assert.strictEqual(cam.bottom, 200);
        });
        it('positions camera at tile center looking down', () => {
            const tile = { originX: 0, originY: 0, size: 1000 };
            const cam = (0, TerrainDrapingUtils_1.buildTileCamera)(tile);
            if (!cam)
                return;
            chai_1.assert.closeTo(cam.position.x, 500, 0.1);
            chai_1.assert.closeTo(cam.position.z, 500, 0.1);
            chai_1.assert.strictEqual(cam.up.z, 1);
        });
        it('camera frustum matches the tile size', () => {
            const tile = { originX: 0, originY: 0, size: 800 };
            const cam = (0, TerrainDrapingUtils_1.buildTileCamera)(tile);
            if (!cam)
                return;
            const width = cam.right - cam.left;
            const height = cam.top - cam.bottom;
            chai_1.assert.closeTo(width, height, 0.001);
            chai_1.assert.closeTo(width, 800, 0.001);
        });
        it('handles negative origin coordinates', () => {
            const tile = { originX: -500, originY: 100, size: 200 };
            const cam = (0, TerrainDrapingUtils_1.buildTileCamera)(tile);
            if (!cam)
                return;
            chai_1.assert.closeTo(cam.left, -500, 0.001);
            chai_1.assert.closeTo(cam.right, -300, 0.001);
            chai_1.assert.closeTo(cam.top, 300, 0.001);
            chai_1.assert.closeTo(cam.bottom, 100, 0.001);
        });
    });
    describe('isEnvironmentObject', () => {
        it('identifies lights as environment objects', () => {
            const light = new THREE.AmbientLight();
            chai_1.assert.isTrue((0, TerrainDrapingUtils_1.isEnvironmentObject)(light));
        });
        it('identifies LineSegments as environment objects', () => {
            const lines = new THREE.LineSegments(new THREE.BufferGeometry());
            chai_1.assert.isTrue((0, TerrainDrapingUtils_1.isEnvironmentObject)(lines));
        });
        it('identifies tagged environment objects', () => {
            const obj = new THREE.Object3D();
            obj.userData.__mbEnvironment = true;
            chai_1.assert.isTrue((0, TerrainDrapingUtils_1.isEnvironmentObject)(obj));
        });
        it('does not flag regular meshes', () => {
            const mesh = new THREE.Mesh(new THREE.BufferGeometry());
            chai_1.assert.isFalse((0, TerrainDrapingUtils_1.isEnvironmentObject)(mesh));
        });
    });
});
//# sourceMappingURL=TerrainControllerTest.js.map