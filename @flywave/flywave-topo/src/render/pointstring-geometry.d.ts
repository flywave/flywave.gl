import * as THREE from "three";
import { type PointStringParams } from "../common/render/primitives/point-string-params";
import { type Point3d, Range3d } from "../core-geometry";
import type { RenderPass, RenderTarget } from "./mesh-geometry";
import { type RenderGeometry } from "./render-geometry";
export declare class PointStringGeometry extends THREE.BufferGeometry implements RenderGeometry {
    readonly weight: number;
    readonly isInstanceable: boolean;
    private readonly _numPoints;
    readonly viewIndependentOrigin?: THREE.Vector3;
    readonly uniformColor?: THREE.Vector4;
    readonly vertexColors: boolean;
    readonly renderGeometryType: "point-string";
    isDisposed: boolean;
    constructor(options: {
        positions: Float32Array;
        weight: number;
        viewIndependentOrigin?: THREE.Vector3;
        uniformColor?: THREE.Vector4;
        vertexColors?: boolean;
        colors?: Float32Array;
    });
    computeRange(out?: Range3d): Range3d;
    static create(params: PointStringParams, viOrigin?: Point3d): PointStringGeometry | undefined;
    /**
     * 确定渲染通道
     */
    protected determineRenderPass(target: RenderTarget): RenderPass;
    /**
     * 获取渲染顺序
     */
    get renderOrder(): number;
    /**
     * 收集内存统计信息
     */
    collectStatistics(): {
        vertices: number;
    };
    get asPointString(): this;
    getPass(target: RenderTarget): RenderPass;
    wantMonochrome(target: RenderTarget): boolean;
}
