import type * as THREE from "three";
import { type LayerType, type StratumLayerData } from "../decoder";
import { type StratumTileData } from "./StratumTileData";
import { StratumVoxel } from "./StratumVoxel";
export declare class StratumLayer {
    lithology: string;
    private _voxels;
    private readonly _layer?;
    private readonly _material;
    constructor(layer: StratumLayerData, lithology: string, stratumMeshData: StratumTileData, filter?: (voxel: StratumVoxel) => boolean);
    get material(): number;
    get layer(): StratumLayerData;
    dispose(): void;
    get id(): string;
    get type(): LayerType;
    get geometries(): THREE.BufferGeometry[];
    get voxels(): StratumVoxel[];
    get voxelCount(): number;
    extractGroundFaces(): Array<{
        positions: Float32Array;
        indices: Uint32Array;
    }>;
    private extractVoxelGroundFaces;
}
