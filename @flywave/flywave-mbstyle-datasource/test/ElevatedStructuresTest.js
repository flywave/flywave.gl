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
const ElevatedStructures_1 = require("../src/ElevatedStructures");
describe('ElevatedStructures', () => {
    describe('buildGuardrailGeometry', () => {
        it('returns null for zero elevation', () => {
            const positions = new Float32Array([0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 0, 0]);
            const index = new Uint32Array([0, 1, 2]);
            (0, chai_1.expect)((0, ElevatedStructures_1.buildGuardrailGeometry)(positions, index, 0)).to.equal(null);
        });
        it('returns null when no index is provided', () => {
            const positions = new Float32Array([0, 0, 0, 1, 0, 0]);
            (0, chai_1.expect)((0, ElevatedStructures_1.buildGuardrailGeometry)(positions, null, 5)).to.equal(null);
        });
        it('produces wall geometry for a single elevated triangle', () => {
            const positions = new Float32Array([
                0, 0, 5,
                4, 0, 5,
                2, 3, 5,
            ]);
            const index = new Uint32Array([0, 1, 2]);
            const geom = (0, ElevatedStructures_1.buildGuardrailGeometry)(positions, index, 5);
            (0, chai_1.expect)(geom).to.not.equal(null);
            if (!geom)
                return;
            (0, chai_1.expect)(geom.attributes.position.count).to.equal(12);
            (0, chai_1.expect)(geom.index.count).to.equal(36);
        });
        it('skips interior edges shared by two triangles', () => {
            const positions = new Float32Array([
                0, 0, 0,
                2, 0, 0,
                1, 2, 0,
                3, 2, 0,
            ]);
            const index = new Uint32Array([0, 1, 2, 1, 3, 2]);
            const geom = (0, ElevatedStructures_1.buildGuardrailGeometry)(positions, index, 4);
            (0, chai_1.expect)(geom).to.not.equal(null);
            if (!geom)
                return;
            (0, chai_1.expect)(geom.attributes.position.count).to.equal(16);
        });
        it('respects explicit wallHeight parameter', () => {
            const positions = new Float32Array([
                0, 0, 10,
                1, 0, 10,
                0, 1, 10,
            ]);
            const index = new Uint32Array([0, 1, 2]);
            const geom = (0, ElevatedStructures_1.buildGuardrailGeometry)(positions, index, 10, 2);
            (0, chai_1.expect)(geom).to.not.equal(null);
            if (!geom)
                return;
            const zValues = [];
            const pos = geom.attributes.position;
            for (let i = 0; i < pos.count; i++) {
                zValues.push(pos.getZ(i));
            }
            for (const z of zValues) {
                (0, chai_1.expect)(z).to.be.at.least(8 - 1e-6);
                (0, chai_1.expect)(z).to.be.at.most(10 + 1e-6);
            }
        });
        it('computes vertex normals for lighting', () => {
            const positions = new Float32Array([0, 0, 5, 1, 0, 5, 0, 1, 5]);
            const index = new Uint32Array([0, 1, 2]);
            const geom = (0, ElevatedStructures_1.buildGuardrailGeometry)(positions, index, 5);
            (0, chai_1.expect)(geom).to.not.equal(null);
            if (!geom)
                return;
            (0, chai_1.expect)(geom.attributes.normal).to.not.equal(undefined);
        });
    });
    describe('createGuardrailMesh', () => {
        it('returns null for mesh without positions', () => {
            const mesh = new THREE.Mesh(new THREE.BufferGeometry());
            (0, chai_1.expect)((0, ElevatedStructures_1.createGuardrailMesh)(mesh, 5)).to.equal(null);
        });
        it('creates a Mesh with the wall geometry attached', () => {
            const geom = new THREE.BufferGeometry();
            geom.setAttribute('position', new THREE.Float32BufferAttribute([
                0, 0, 5, 4, 0, 5, 2, 3, 5,
            ], 3));
            geom.setIndex([0, 1, 2]);
            const mesh = new THREE.Mesh(geom);
            const wall = (0, ElevatedStructures_1.createGuardrailMesh)(mesh, 5, '#4488cc');
            (0, chai_1.expect)(wall).to.not.equal(null);
            if (!wall)
                return;
            (0, chai_1.expect)(wall.geometry.attributes.position.count).to.be.greaterThan(0);
            const material = wall.material;
            (0, chai_1.expect)(material.side).to.equal(THREE.DoubleSide);
            (0, chai_1.expect)(material.color.getHex()).to.equal(new THREE.Color('#4488cc').getHex());
        });
        it('inherits the source mesh transform', () => {
            const geom = new THREE.BufferGeometry();
            geom.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 5, 1, 0, 5, 0, 1, 5], 3));
            geom.setIndex([0, 1, 2]);
            const mesh = new THREE.Mesh(geom);
            mesh.position.set(10, 20, 30);
            mesh.rotation.z = Math.PI / 4;
            const wall = (0, ElevatedStructures_1.createGuardrailMesh)(mesh, 5);
            (0, chai_1.expect)(wall).to.not.equal(null);
            if (!wall)
                return;
            (0, chai_1.expect)(wall.position.x).to.equal(10);
            (0, chai_1.expect)(wall.position.y).to.equal(20);
            (0, chai_1.expect)(wall.position.z).to.equal(30);
        });
    });
});
//# sourceMappingURL=ElevatedStructuresTest.js.map