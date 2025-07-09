/* eslint-disable no-console */
import * as THREE from "three";

import { LayerType } from "../decoder";
import { StratumVoxel } from "./Voxel";

export class StratumLayer {
    private readonly _id: string;
    private readonly _lithology: string;
    private readonly _type: LayerType;
    private _voxels: StratumVoxel[] = [];
    private _bbox?: THREE.Box3;
    private _material?: THREE.Material; // 类型替换

    constructor(
        layer: {
            id: string;
            type: LayerType;
        },
        voxels: Array<{
            id: string;
            index: number;
            start: number;
            end: number;
            bbox: THREE.Box3;
            neighbors: [number, number, number];
            geometry?: THREE.BufferGeometry; // 类型替换
        }>,
        lithology: string,
        material?: THREE.Material
    ) {
        this._id = layer.id;
        this._lithology = lithology;
        this._type = layer.type;

        // 预先分配数组空间
        this._voxels = new Array(voxels.length);

        // 使用索引填充确保顺序（带有效性检查）
        voxels.forEach(voxel => {
            if (voxel.index >= 0 && voxel.index < voxels.length) {
                this._voxels[voxel.index] = new StratumVoxel(
                    voxel.id,
                    voxel.index,
                    voxel.bbox,
                    voxel.geometry,
                    material
                );
            } else {
                console.error(`Invalid voxel index: ${voxel.index} for voxel ${voxel.id}`);
            }
        });

        // 建立邻接关系（带空值检查）
        voxels.forEach(voxel => {
            const vox = this._voxels[voxel.index];
            if (vox) {
                vox.linkNeighbors(this._voxels, voxel.neighbors);
            } else {
                console.error(`Cannot link neighbors for invalid voxel index: ${voxel.index}`);
            }
        });

        this._bbox = this.calcBoundingBox();
        this._material = material;
    }

    dispose() {
        // 递归释放所有体素资源
        this._voxels.forEach(voxel => voxel.dispose());
        // 清空体素数组
        this._voxels = [];
        // 释放材质引用
        this._material = undefined;
        // 清空包围盒缓存
        this._bbox = undefined;
    }

    get id(): string {
        return this._id;
    }

    get type(): LayerType {
        return this._type;
    }

    get lithology(): string {
        return this._lithology;
    }

    get bbox(): THREE.Box3 {
        return this._bbox!;
    }

    get geometries(): THREE.BufferGeometry[] {
        return this._voxels.map(voxel => voxel.geometry);
    }

    get material(): THREE.Material {
        return this._material!;
    }

    // 体素访问方法
    get voxels(): StratumVoxel[] {
        return [...this._voxels];
    }

    get voxelCount(): number {
        return this._voxels.length;
    }

    // 统计方法
    get volume(): number {
        return this._voxels.reduce((sum, voxel) => sum + voxel.volume, 0);
    }

    /**
     * 计算并返回地层层的包围盒
     * 会缓存计算结果，后续调用直接返回缓存值
     */
    calcBoundingBox(): THREE.Box3 {
        // 返回缓存结果
        if (this._bbox) {
            return this._bbox;
        }

        // 处理空体素情况
        if (this._voxels.length === 0) {
            return new THREE.Box3(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, 0));
        }

        // 初始化第一个体素的包围盒
        const firstBox = this._voxels[0].getBoundingBox();
        const bbox = new THREE.Box3().copy(firstBox);

        // 遍历剩余体素合并包围盒
        for (let i = 1; i < this._voxels.length; i++) {
            const voxelBox = this._voxels[i].getBoundingBox();
            bbox.union(voxelBox); // 使用Three.js的union方法合并包围盒
        }

        // 缓存结果
        this._bbox = bbox;
        return this._bbox;
    }
}
