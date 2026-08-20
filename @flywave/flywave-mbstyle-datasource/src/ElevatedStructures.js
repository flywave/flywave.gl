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
exports.buildGuardrailGeometry = buildGuardrailGeometry;
exports.createGuardrailMesh = createGuardrailMesh;
const THREE = __importStar(require("three"));
function buildGuardrailGeometry(positions, index, elevation, wallHeight) {
    if (!index || index.length === 0 || elevation <= 0)
        return null;
    const edgeMap = new Map();
    const idxArr = index;
    const edgeKey = (a, b) => {
        return a < b ? `${a}_${b}` : `${b}_${a}`;
    };
    const triCount = idxArr.length / 3;
    for (let t = 0; t < triCount; t++) {
        const i0 = idxArr[t * 3];
        const i1 = idxArr[t * 3 + 1];
        const i2 = idxArr[t * 3 + 2];
        for (const [a, b] of [[i0, i1], [i1, i2], [i2, i0]]) {
            const key = edgeKey(a, b);
            const existing = edgeMap.get(key);
            if (existing) {
                existing.count++;
            }
            else {
                edgeMap.set(key, { a, b, count: 1 });
            }
        }
    }
    const boundaryEdges = [];
    for (const edge of edgeMap.values()) {
        if (edge.count === 1) {
            boundaryEdges.push({ a: edge.a, b: edge.b });
        }
    }
    if (boundaryEdges.length === 0)
        return null;
    const wallBottom = wallHeight !== undefined ? Math.max(0, elevation - wallHeight) : 0;
    const wallTop = elevation;
    const wallPositions = [];
    const wallIndices = [];
    let vOffset = 0;
    for (const { a, b } of boundaryEdges) {
        const ax = positions[a * 3];
        const ay = positions[a * 3 + 1];
        const bx = positions[b * 3];
        const by = positions[b * 3 + 1];
        const i0 = vOffset;
        const i1 = vOffset + 1;
        const i2 = vOffset + 2;
        const i3 = vOffset + 3;
        wallPositions.push(ax, ay, wallTop, ax, ay, wallBottom, bx, by, wallBottom, bx, by, wallTop);
        wallIndices.push(i0, i1, i2, i0, i2, i3);
        wallIndices.push(i0, i2, i1, i0, i3, i2);
        vOffset += 4;
    }
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.Float32BufferAttribute(wallPositions, 3));
    geom.setIndex(wallIndices);
    geom.computeVertexNormals();
    return geom;
}
function createGuardrailMesh(mesh, elevation, color = '#666666') {
    const geom = mesh.geometry;
    if (!geom || !geom.attributes.position)
        return null;
    const positions = geom.attributes.position.array;
    const index = geom.index ? geom.index.array : null;
    const wallGeom = buildGuardrailGeometry(positions, index, elevation);
    if (!wallGeom)
        return null;
    const material = new THREE.MeshStandardMaterial({
        color: new THREE.Color(color),
        side: THREE.DoubleSide,
        roughness: 0.8,
        metalness: 0.0,
    });
    const wallMesh = new THREE.Mesh(wallGeom, material);
    wallMesh.position.copy(mesh.position);
    wallMesh.rotation.copy(mesh.rotation);
    wallMesh.scale.copy(mesh.scale);
    wallMesh.renderOrder = mesh.renderOrder + 1;
    return wallMesh;
}
//# sourceMappingURL=ElevatedStructures.js.map