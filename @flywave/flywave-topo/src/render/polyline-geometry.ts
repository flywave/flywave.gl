/* Copyright (C) 2025 flywave.gl contributors */



import * as THREE from "three";

import { type PolylineParams } from "../common/render/primitives/polyline-params";
import type { Point3d, Range3d } from "../core-geometry";
import { type RenderGeometry } from "./render-geometry";

// 折线类型标志
export enum PolylineTypeFlags {
    Normal = 0,
    Edge = 1,
    Outline = 2
}

export class PolylineGeometry extends THREE.BufferGeometry implements RenderGeometry {
    // 新增需要实现的接口属性
    public readonly isPlanar: boolean;
    public readonly uniformColor?: THREE.Vector4;
    public readonly vertexColors: boolean;
    public readonly colorInfo?: { hasTranslucency: boolean };

    // 保留原有属性
    public readonly lineWeight: number;
    public readonly lineCode: number;
    public readonly ptype: PolylineTypeFlags;
    public readonly isInstanceable: boolean;
    public readonly renderGeometryType = "polyline" as const;
    isDisposed: boolean;

    constructor(options: {
        positions: Float32Array;
        indices?: Uint16Array | Uint32Array;
        lineWeight: number;
        lineCode: number;
        type: PolylineTypeFlags;
        isPlanar?: boolean;
        viewIndependentOrigin?: THREE.Vector3;
        uniformColor?: THREE.Vector4;
        vertexColors?: boolean;
        colors?: Float32Array;
    }) {
        super();

        // 手动创建几何体属性
        this.setAttribute("position", new THREE.BufferAttribute(options.positions, 3));
        if (options.indices) {
            this.setIndex(new THREE.BufferAttribute(options.indices, 1));
        }

        // 初始化新增属性
        this.isPlanar = options.isPlanar ?? false;
        this.uniformColor = options.uniformColor;
        this.vertexColors = options.vertexColors ?? false;

        // 保留原有赋值
        this.lineWeight = options.lineWeight;
        this.lineCode = options.lineCode;
        this.ptype = options.type;
        this.isInstanceable = !options.viewIndependentOrigin;
    }

    computeRange(out?: Range3d): Range3d {
        throw new Error("Method not implemented.");
    }

    public static create(params: PolylineParams, viOrigin?: Point3d): PolylineGeometry | undefined {
        try {
            // 转换顶点数据为 Float32Array
            const positions = new Float32Array(params.vertices.data);

            // 转换索引数据
            let indices: Uint16Array | Uint32Array | undefined;
            if (params.polyline.indices) {
                const indexData = params.polyline.indices.data;
                if (indexData.length < 65535) {
                    indices = new Uint16Array(indexData);
                } else {
                    indices = new Uint32Array(indexData);
                }
            }

            // 转换视图独立原点
            const viewIndependentOrigin = viOrigin
                ? new THREE.Vector3(viOrigin.x, viOrigin.y, viOrigin.z)
                : undefined;

            return new PolylineGeometry({
                positions,
                indices,
                lineWeight: params.weight,
                lineCode: this.lineCodeFromPixels(params.linePixels),
                type: params.type,
                isPlanar: params.isPlanar,
                viewIndependentOrigin
            });
        } catch (e) {
            return undefined;
        }
    }

    private static lineCodeFromPixels(pixels: number): number {
        // 简化实现：实际应根据像素值计算线型代码
        return pixels > 1 ? 1 : 0;
    }

    // 实现基类要求的抽象方法
    public get asPolyline() {
        return this;
    }

    public get asMesh() {
        return undefined; // 折线几何体不提供网格形式
    }
}
