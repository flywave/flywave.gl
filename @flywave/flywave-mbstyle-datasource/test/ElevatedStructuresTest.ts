import { expect } from 'chai';
import * as THREE from 'three';
import { buildGuardrailGeometry, createGuardrailMesh } from '../src/ElevatedStructures';

describe('ElevatedStructures', () => {
    describe('buildGuardrailGeometry', () => {
        it('returns null for zero elevation', () => {
            const positions = new Float32Array([0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 0, 0]);
            const index = new Uint32Array([0, 1, 2]);
            expect(buildGuardrailGeometry(positions, index, 0)).to.equal(null);
        });

        it('returns null when no index is provided', () => {
            const positions = new Float32Array([0, 0, 0, 1, 0, 0]);
            expect(buildGuardrailGeometry(positions, null, 5)).to.equal(null);
        });

        it('produces wall geometry for a single elevated triangle', () => {
            // One triangle with 3 boundary edges at elevation 5.
            const positions = new Float32Array([
                0, 0, 5,
                4, 0, 5,
                2, 3, 5,
            ]);
            const index = new Uint32Array([0, 1, 2]);
            const geom = buildGuardrailGeometry(positions, index, 5);
            expect(geom).to.not.equal(null);
            if (!geom) return;
            // Each boundary edge → 4 vertices (top-a, bottom-a, bottom-b, top-b).
            expect(geom.attributes.position.count).to.equal(12);
            // Each edge → 6 front + 6 back indices = 12; 3 edges → 36.
            expect(geom.index!.count).to.equal(36);
        });

        it('skips interior edges shared by two triangles', () => {
            // Two triangles sharing edge (1,2): only 4 boundary edges total.
            // Triangles: (0,1,2) and (1,3,2) — shared edge is (1,2).
            const positions = new Float32Array([
                0, 0, 0,
                2, 0, 0,
                1, 2, 0,
                3, 2, 0,
            ]);
            const index = new Uint32Array([0, 1, 2, 1, 3, 2]);
            const geom = buildGuardrailGeometry(positions, index, 4);
            expect(geom).to.not.equal(null);
            if (!geom) return;
            // 4 boundary edges × 4 vertices = 16.
            expect(geom.attributes.position.count).to.equal(16);
        });

        it('respects explicit wallHeight parameter', () => {
            const positions = new Float32Array([
                0, 0, 10,
                1, 0, 10,
                0, 1, 10,
            ]);
            const index = new Uint32Array([0, 1, 2]);
            // wallHeight = 2 → wall spans [8, 10]
            const geom = buildGuardrailGeometry(positions, index, 10, 2);
            expect(geom).to.not.equal(null);
            if (!geom) return;
            const zValues: number[] = [];
            const pos = geom.attributes.position;
            for (let i = 0; i < pos.count; i++) {
                zValues.push(pos.getZ(i));
            }
            // Both top and bottom of the wall must be within [8, 10].
            for (const z of zValues) {
                expect(z).to.be.at.least(8 - 1e-6);
                expect(z).to.be.at.most(10 + 1e-6);
            }
        });

        it('computes vertex normals for lighting', () => {
            const positions = new Float32Array([0, 0, 5, 1, 0, 5, 0, 1, 5]);
            const index = new Uint32Array([0, 1, 2]);
            const geom = buildGuardrailGeometry(positions, index, 5);
            expect(geom).to.not.equal(null);
            if (!geom) return;
            expect(geom.attributes.normal).to.not.equal(undefined);
        });
    });

    describe('createGuardrailMesh', () => {
        it('returns null for mesh without positions', () => {
            const mesh = new THREE.Mesh(new THREE.BufferGeometry());
            expect(createGuardrailMesh(mesh, 5)).to.equal(null);
        });

        it('creates a Mesh with the wall geometry attached', () => {
            // Build a simple triangle mesh with positions + index.
            const geom = new THREE.BufferGeometry();
            geom.setAttribute('position', new THREE.Float32BufferAttribute([
                0, 0, 5, 4, 0, 5, 2, 3, 5,
            ], 3));
            geom.setIndex([0, 1, 2]);
            const mesh = new THREE.Mesh(geom);
            const wall = createGuardrailMesh(mesh, 5, '#4488cc');
            expect(wall).to.not.equal(null);
            if (!wall) return;
            expect(wall.geometry.attributes.position.count).to.be.greaterThan(0);
            // Material should be a double-sided MeshStandardMaterial.
            const material = wall.material as THREE.MeshStandardMaterial;
            expect(material.side).to.equal(THREE.DoubleSide);
            // Color should be the requested blue.
            expect(material.color.getHex()).to.equal(new THREE.Color('#4488cc').getHex());
        });

        it('inherits the source mesh transform', () => {
            const geom = new THREE.BufferGeometry();
            geom.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 5, 1, 0, 5, 0, 1, 5], 3));
            geom.setIndex([0, 1, 2]);
            const mesh = new THREE.Mesh(geom);
            mesh.position.set(10, 20, 30);
            mesh.rotation.z = Math.PI / 4;
            const wall = createGuardrailMesh(mesh, 5);
            expect(wall).to.not.equal(null);
            if (!wall) return;
            expect(wall.position.x).to.equal(10);
            expect(wall.position.y).to.equal(20);
            expect(wall.position.z).to.equal(30);
        });
    });
});
