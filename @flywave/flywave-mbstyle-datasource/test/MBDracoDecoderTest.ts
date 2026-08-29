/**
 * §547: unit tests for the main-thread Draco decoder (MBDracoDecoder) and
 * the mesh_features per-part styling (MBMeshFeatures), exercised against the
 * real landmark tile fixtures.
 */

import { expect } from 'chai';
import * as fs from 'fs';
import * as path from 'path';
import { decodeGlbDraco, parseGlb } from '../src/MBDracoDecoder';
import { applyMeshFeatures, hasMeshFeatures } from '../src/MBMeshFeatures';

// __dirname is lib/test at runtime — the package root is one level up.
const TILE = path.join(__dirname, '..', '..', 'test', 'rendering', 'integration',
    'models', 'landmark', 'mbx', '8718-5683-14.glb');
// Frauenkirche tower; settles the z-is-meters semantics (a tile-units z
// would max at ~20 m).
const TOL = 0.15;

// mgl buildMeshFeatureArray partId histogram of this tile, via the same
// decode path — guards against decode regressions changing part assignment.
const EXPECTED_PARTS_M0 = { '1': 12925, '2': 20, '3': 315, '4': 1982, '6': 3104 };
const EXPECTED_PARTS_M2 = { '1': 6379, '2': 26, '3': 179, '4': 96 };

describe('MBDracoDecoder', () => {
    it('parses GLB container', () => {
        const buf = fs.readFileSync(TILE);
        const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
        const { json, bin } = parseGlb(ab);
        expect(json.asset.version).to.equal('2.0');
        expect(json.extensionsUsed).to.include('KHR_draco_mesh_compression');
        expect(bin.length).to.equal(json.buffers[0].byteLength);
    });

    it('repacks the landmark tile into a valid uncompressed GLB', async () => {
        const buf = fs.readFileSync(TILE);
        const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
        const repacked = await decodeGlbDraco(ab);
        expect(repacked.byteLength).to.be.greaterThan(ab.byteLength);

        const { json, bin } = parseGlb(repacked);
        expect(json.extensionsUsed ?? []).to.not.include('KHR_draco_mesh_compression');
        expect(json.extensionsRequired ?? []).to.not.include('KHR_draco_mesh_compression');
        expect(json.buffers).to.have.lengthOf(1);
        expect(bin.length).to.equal(json.buffers[0].byteLength);
        for (const bv of json.bufferViews) {
            expect((bv.byteOffset ?? 0) + bv.byteLength).to.be.at.most(bin.length);
            expect((bv.byteOffset ?? 0) % 4).to.equal(0);
        }
        for (const mesh of json.meshes) {
            for (const prim of mesh.primitives) {
                expect(prim.extensions && prim.extensions.KHR_draco_mesh_compression).to.equal(undefined);
            }
        }
    });

    it('decodes POSITION matching the declared accessor bounds', async () => {
        const buf = fs.readFileSync(TILE);
        const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
        const repacked = await decodeGlbDraco(ab);
        const { json, bin } = parseGlb(repacked);
        for (const mesh of json.meshes) {
            for (const prim of mesh.primitives) {
                const acc = json.accessors[prim.attributes.POSITION];
                const bv = json.bufferViews[acc.bufferView];
                const start = bin.byteOffset + (bv.byteOffset ?? 0);
                const f32 = new Float32Array(bin.buffer, start, acc.count * 3);
                const mn = [Infinity, Infinity, Infinity];
                const mx = [-Infinity, -Infinity, -Infinity];
                for (let i = 0; i < acc.count; i++) {
                    for (let c = 0; c < 3; c++) {
                        const v = f32[i * 3 + c];
                        mn[c] = Math.min(mn[c], v);
                        mx[c] = Math.max(mx[c], v);
                    }
                }
                for (let c = 0; c < 3; c++) {
                    const span = acc.max[c] - acc.min[c];
                    // decoded values are draco-quantized; the accessor bounds
                    // were declared on the full-precision source.
                    expect(mn[c]).to.be.closeTo(acc.min[c], Math.max(span / 512, TOL));
                    expect(mx[c]).to.be.closeTo(acc.max[c], Math.max(span / 512, TOL));
                }
            }
        }
    });

    it('decodes _FEATURE_RGBA4444 part ids stably', async () => {
        const buf = fs.readFileSync(TILE);
        const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
        const repacked = await decodeGlbDraco(ab);
        const { json, bin } = parseGlb(repacked);
        const hist = (prim: any): Record<string, number> => {
            const fa = json.accessors[prim.attributes._FEATURE_RGBA4444];
            const bv = json.bufferViews[fa.bufferView];
            const u16 = new Uint16Array(bin.buffer, bin.byteOffset + (bv.byteOffset ?? 0), fa.count * 2);
            const out: Record<string, number> = {};
            for (let i = 0; i < fa.count; i++) {
                const u32 = (u16[i * 2] | (u16[i * 2 + 1] << 16)) >>> 0;
                const p = String(u32 & 0xf);
                out[p] = (out[p] ?? 0) + 1;
            }
            return out;
        };
        expect(hist(json.meshes[0].primitives[0])).to.deep.equal(EXPECTED_PARTS_M0);
        expect(hist(json.meshes[2].primitives[0])).to.deep.equal(EXPECTED_PARTS_M2);
    });
});

describe('MBMeshFeatures', () => {
    const PAINT = {
        'model-color-mix-intensity':
            ['match', ['get', 'part'], 'logo', 0.0, 'windows', 1.0, 0.9],
        'model-emissive-strength':
            ['match', ['get', 'part'], 'door', 0.0, 'logo', 0.0, 'window', 1.0, 0.0],
        'model-color': ['match', ['get', 'part'],
            'door', ['rgba', 0.0, 255.0, 204.0, 1.0],
            'roof', ['rgba', 252.5, 255.0, 0.0, 1.0],
            'window', ['rgba', 255.0, 190.0, 0.0, 1.0],
            ['rgba', 245.0, 224.0, 102.1, 1.0]],
        'model-roughness': ['match', ['get', 'part'], 'window', 0.4, 1.0],
    };

    it('detects mesh_features tiles', () => {
        const buf = fs.readFileSync(TILE);
        const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
        expect(hasMeshFeatures(ab)).to.equal(true);
    });

    it('splits feature meshes per part with baked vertex colors', async () => {
        const buf = fs.readFileSync(TILE);
        const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
        const repacked = await decodeGlbDraco(ab);
        // Node lacks the image decode pipeline GLTFLoader uses for the GLB's
        // occlusion JPEGs — stub it (texture content is irrelevant here).
        const g = globalThis as any;
        if (typeof g.self === 'undefined') g.self = g;
        if (typeof g.createImageBitmap !== 'function') {
            g.createImageBitmap = async () => ({ width: 1, height: 1, close() { /* noop */ } });
        }
        if (typeof URL !== 'undefined' && typeof (URL as any).createObjectURL !== 'function') {
            (URL as any).createObjectURL = () => 'blob:stub';
            (URL as any).revokeObjectURL = () => undefined;
        }
        const { GLTFLoader } = await eval('import("three/examples/jsm/loaders/GLTFLoader.js")');
        const loader = new GLTFLoader();
        const gltf: any = await new Promise((resolve, reject) =>
            loader.parse(repacked, '', resolve, reject));
        applyMeshFeatures(gltf.scene, PAINT, 17.85, null);

        const parts: Record<number, number> = {};
        gltf.scene.traverse((o: any) => {
            if (!o.isMesh || o.userData.__mbPart === undefined) return;
            parts[o.userData.__mbPart] = (parts[o.userData.__mbPart] ?? 0) + 1;
            expect(o.geometry.getAttribute('color')).to.exist;
            expect(o.material.vertexColors).to.equal(true);
            if (o.userData.__mbPart === 4) {
                // window: roughness 0.4 + emissive strength 1.0 (fixture paint)
                expect(o.material.roughness).to.be.closeTo(0.4, 1e-6);
                expect(o.material.__mbMglLit).to.equal(true);
            }
        });
        expect(parts[1]).to.be.greaterThan(0); // wall
        expect(parts[4]).to.be.greaterThan(0); // window
        expect(parts[6]).to.be.greaterThan(0); // logo
    });
});
