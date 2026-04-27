import * as THREE from "three";
import { type StratumVoxelData } from "../decoder";
import { BspObject } from "./BspObject";
import { type StratumTileData } from "./StratumTileData";
export type FaceType = number;
export declare class StratumVoxel extends BspObject {
    voxel: StratumVoxelData;
    private _boundingSphere?;
    private _neighbors;
    constructor(voxel: StratumVoxelData, stratumMeshData: StratumTileData);
    get id(): string;
    get index(): number;
    get material(): number;
    get boundingSphere(): THREE.Sphere;
    get neighbors(): [StratumVoxel, StratumVoxel, StratumVoxel];
    dispose(): void;
    linkNeighbors(allVoxels: StratumVoxel[], neighbors: [number, number, number]): void;
    getTopTriangles(): Float32Array;
    getBaseTriangles(): Float32Array;
    getTrianglesByFaceType(faceType: FaceType): Float32Array;
    getBoundingSphere(): THREE.Sphere;
}
