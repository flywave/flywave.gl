/* Copyright (C) 2025 flywave.gl contributors */

/* eslint-disable no-console */
import type * as THREE from "three";

import { type LayerType, type StratumLayerData, FaceTypes } from "../decoder";
import { type StratumTileData } from "./StratumTileData";
import { StratumVoxel } from "./StratumVoxel";

export class StratumLayer {
    private _voxels: StratumVoxel[] = [];
    private readonly _layer?: StratumLayerData;
    private readonly _material: number;
    constructor(
        layer: StratumLayerData,
        public lithology: string,
        stratumMeshData: StratumTileData,
        filter?: (voxel: StratumVoxel) => boolean
    ) {
        this._layer = layer;
        // 预先分配数组空间
        this._voxels = new Array(layer.voxels.length);

        // 使用索引填充确保顺序（带有效性检查）
        layer.voxels.forEach(voxel => {
            if (voxel.index >= 0 && voxel.index < layer.voxels.length) {
                this._voxels[voxel.index] = new StratumVoxel(voxel, stratumMeshData);
            } else {
                console.error(`Invalid voxel index: ${voxel.index} for voxel ${voxel.id}`);
            }
        });

        // 建立邻接关系（带空值检查）
        layer.voxels.forEach(voxel => {
            const vox = this._voxels[voxel.index];
            if (vox) {
                vox.linkNeighbors(this._voxels, voxel.neighbors);
            } else {
                console.error(`Cannot link neighbors for invalid voxel index: ${voxel.index}`);
            }
        });

        if (filter) {
            this._voxels = this._voxels.filter(filter);
        }

        this._material = layer.voxels[0].material;
    }

    get material() {
        return this._material;
    }

    get layer() {
        return this._layer;
    }

    dispose() {
        this._voxels.forEach(voxel => {
            voxel.dispose();
        });
        this._voxels = [];
    }

    get id(): string {
        return this.layer.id;
    }

    get type(): LayerType {
        return this.layer.type;
    }

    get geometries(): THREE.BufferGeometry[] {
        return this._voxels.map(voxel => voxel.geometry);
    }

    // 体素访问方法
    get voxels(): StratumVoxel[] {
        return [...this._voxels];
    }

    get voxelCount(): number {
        return this._voxels.length;
    }

    public extractGroundFaces(): Array<{
        positions: Float32Array;
        indices: Uint32Array;
    }> {
        const groundFaces: Array<{ positions: Float32Array; indices: Uint32Array }> = [];

        for (const voxel of this.voxels) {
            // 跳过无效体素
            if (!voxel.geometry) continue;

            // 直接推送结果避免中间数组
            groundFaces.push(this.extractVoxelGroundFaces(voxel));
        }
        return groundFaces;
    }

    private extractVoxelGroundFaces(voxel: StratumVoxel): {
        positions: Float32Array;
        indices: Uint32Array;
    } {
        if (!voxel.geometry) {
            return { positions: new Float32Array(), indices: new Uint32Array() };
        }

        // 直接从体素获取几何属性
        const positionAttr = voxel.geometry.getAttribute("position");
        const faceTypeAttr = voxel.geometry.getAttribute("facetypes");
        const indices = (voxel.geometry.index?.array as Uint32Array) || new Uint32Array();

        // 筛选地面面（假设faceType=0表示地面）
        const groundIndices = [];
        for (let i = 0; i < faceTypeAttr.count; i++) {
            if (faceTypeAttr.getX(i) === FaceTypes.TopGroundFace) {
                const triIndex = i * 3;
                groundIndices.push(indices[triIndex], indices[triIndex + 1], indices[triIndex + 2]);
            }
        }

        // 提取顶点数据
        return {
            positions: positionAttr.array as Float32Array,
            indices: new Uint32Array(groundIndices)
        };
    }
}
