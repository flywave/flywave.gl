/* Copyright (C) 2025 flywave.gl contributors */

import { fromVectors } from "@flywave/flywave-geoutils";
import * as THREE from "three";

import { type StratumVoxelData, FaceTypes } from "../decoder";
import { BspObject } from "./BspObject";
import { type StratumTileData } from "./StratumTileData";

export type FaceType = number;

export class StratumVoxel extends BspObject {
    private _boundingSphere?: THREE.Sphere;
    private _neighbors: [
        StratumVoxel | undefined,
        StratumVoxel | undefined,
        StratumVoxel | undefined
    ];

    constructor(public voxel: StratumVoxelData, stratumMeshData: StratumTileData) {
        super(stratumMeshData.createVoxelGeometry(voxel));
        this._neighbors = [undefined, undefined, undefined];

        this.getBoundingSphere();

        this.geometry.boundingSphere = this._boundingSphere;
    }

    get id() {
        return this.voxel.id;
    }

    get index() {
        return this.voxel.index;
    }

    get material(): number {
        return this.voxel.material!;
    }

    get boundingSphere(): THREE.Sphere {
        return this._boundingSphere!;
    }

    get neighbors() {
        return this._neighbors;
    }

    dispose() {
        this.geometry?.dispose();
        this.geometry = undefined;
        this._boundingSphere = undefined;
    }

    linkNeighbors(allVoxels: StratumVoxel[], neighbors: [number, number, number]) {
        this._neighbors = neighbors.map(idx => (idx !== -1 ? allVoxels[idx] : undefined)) as [
            StratumVoxel | undefined,
            StratumVoxel | undefined,
            StratumVoxel | undefined
        ];
    }

    getTopTriangles(): Float32Array {
        return this.getTrianglesByFaceType(FaceTypes.TopFace);
    }

    getBaseTriangles(): Float32Array {
        return this.getTrianglesByFaceType(FaceTypes.BaseFace);
    }

    getTrianglesByFaceType(faceType: FaceType): Float32Array {
        if (!this.geometry) {
            return new Float32Array(0);
        }

        const positionAttr = this.geometry.getAttribute("position");
        const indexAttr = this.geometry.getIndex();
        // @ts-ignore - custom attribute
        const faceTypesAttr = this._geometry.getAttribute("facetypes");

        if (!positionAttr || !indexAttr || !faceTypesAttr) {
            return new Float32Array(0);
        }

        const positions = positionAttr.array;
        const indices = indexAttr.array;
        const faceTypesArray = faceTypesAttr.array;
        const result: number[] = [];

        for (let i = 0; i < indices.length; i += 3) {
            const faceTypeIndex = Math.floor(i / 3);
            if (faceTypesArray[faceTypeIndex] & faceType) {
                const i0 = indices[i] * 3;
                const i1 = indices[i + 1] * 3;
                const i2 = indices[i + 2] * 3;

                result.push(
                    positions[i0],
                    positions[i0 + 1],
                    positions[i0 + 2],
                    positions[i1],
                    positions[i1 + 1],
                    positions[i1 + 2],
                    positions[i2],
                    positions[i2 + 1],
                    positions[i2 + 2]
                );
            }
        }

        return new Float32Array(result);
    }

    getBoundingSphere(): THREE.Sphere {
        if (this._boundingSphere) {
            return this._boundingSphere;
        }

        if (!this.geometry || !this.voxel) {
            return new THREE.Sphere(new THREE.Vector3(0, 0, 0), 0);
        }

        const positionAttr = this.geometry.getAttribute("position");
        const index = this.geometry.index;

        if (!positionAttr || !index) {
            return new THREE.Sphere(new THREE.Vector3(0, 0, 0), 0);
        }

        const positions = positionAttr.array;
        const indices = index.array;

        if (indices.length === 0) {
            return new THREE.Sphere(new THREE.Vector3(0, 0, 0), 0);
        }

        // 一次性计算中心点和最大半径
        const center = new THREE.Vector3(0, 0, 0);
        let vertexCount = 0;
        const vertex = new THREE.Vector3();
        let maxRadiusSq = 0;

        // 第一遍：计算中心点
        for (let i = 0; i < indices.length; i++) {
            const vertexIndex = indices[i];
            vertex.fromArray(positions, vertexIndex * 3);
            center.add(vertex);
            vertexCount++;
        }

        center.divideScalar(vertexCount);

        // 第二遍：计算最大半径平方（避免开方运算）
        for (let i = 0; i < indices.length; i++) {
            const vertexIndex = indices[i];
            vertex.fromArray(positions, vertexIndex * 3);
            const radiusSq = center.distanceToSquared(vertex);
            if (radiusSq > maxRadiusSq) {
                maxRadiusSq = radiusSq;
            }
        }

        this._boundingSphere = new THREE.Sphere(center.clone(), Math.sqrt(maxRadiusSq));
        return this._boundingSphere;
    }
}
