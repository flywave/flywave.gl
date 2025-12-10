/* Copyright (C) 2025 flywave.gl contributors */



import * as THREE from "three";

import { type PointStringParams } from "../common/render/primitives/point-string-params";
import { type Point3d, Range3d } from "../core-geometry";
import type { RenderPass, RenderTarget } from "./mesh-geometry";
import { type RenderGeometry } from "./render-geometry";

// 渲染顺序常量
enum RenderOrder {
    PlanarLinear = 3000
}

export class PointStringGeometry extends THREE.BufferGeometry implements RenderGeometry {
    public readonly weight: number;
    public readonly isInstanceable: boolean;
    private readonly _numPoints: number;
    public readonly viewIndependentOrigin?: THREE.Vector3;
    public readonly uniformColor?: THREE.Vector4;
    public readonly vertexColors: boolean = false;
    public readonly renderGeometryType = "point-string" as const;
    isDisposed: boolean;

    constructor(options: {
        positions: Float32Array;
        weight: number;
        viewIndependentOrigin?: THREE.Vector3;
        uniformColor?: THREE.Vector4;
        vertexColors?: boolean;
        colors?: Float32Array;
    }) {
        super();

        // 初始化buffer attributes
        this.setAttribute("position", new THREE.BufferAttribute(options.positions, 3));

        // 保留原有属性初始化
        this.weight = options.weight;
        this.isInstanceable = !options.viewIndependentOrigin;
        this._numPoints = options.positions.length / 3;
        this.viewIndependentOrigin = options.viewIndependentOrigin;
        this.uniformColor = options.uniformColor?.clone();
        this.vertexColors = options.vertexColors || false;

        // 处理顶点颜色
        if (options.colors) {
            this.setAttribute("color", new THREE.BufferAttribute(options.colors, 3));
            this.vertexColors = true;
        }
    }

    computeRange(out?: Range3d): Range3d {
        const range = out || new Range3d();
        const positions = this.attributes.position.array as Float32Array;

        for (let i = 0; i < positions.length; i += 3) {
            range.extendXYZ(positions[i], positions[i + 1], positions[i + 2]);
        }
        return range;
    }

    public static create(
        params: PointStringParams,
        viOrigin?: Point3d
    ): PointStringGeometry | undefined {
        try {
            // 转换点数据为 Float32Array
            const positions = new Float32Array(params.indices.length * 3);
            for (let i = 0; i < params.indices.length; i++) {
                const index = params.indices.data[i];
                positions[i * 3] = index[0];
                positions[i * 3 + 1] = index[1];
                positions[i * 3 + 2] = index[2];
            }

            // 转换视图独立原点
            const viewIndependentOrigin = viOrigin
                ? new THREE.Vector3(viOrigin.x, viOrigin.y, viOrigin.z)
                : undefined;

            return new PointStringGeometry({
                positions,
                weight: params.weight,
                viewIndependentOrigin
            });
        } catch (e) {
            return undefined;
        }
    }

    /**
     * 确定渲染通道
     */
    protected determineRenderPass(target: RenderTarget): RenderPass {
        // 点几何体通常作为不透明渲染
        return "opaque";
    }

    /**
     * 获取渲染顺序
     */
    public get renderOrder(): number {
        return RenderOrder.PlanarLinear;
    }

    /**
     * 收集内存统计信息
     */
    public collectStatistics(): { vertices: number } {
        return {
            vertices: this._numPoints
        };
    }

    // 实现基类要求的抽象方法
    public get asPointString() {
        return this;
    }

    public getPass(target: RenderTarget): RenderPass {
        return this.determineRenderPass(target);
    }

    public wantMonochrome(target: RenderTarget): boolean {
        return false; // 点串通常不需要单色处理
    }
}
