import * as THREE from "three";
import { type MeshParams } from "../common/render/primitives/mesh-params";
import { type Point3d, type Range3d } from "../core-geometry";
import { EdgeGeometry, PolylineEdgeGeometry, SilhouetteEdgeGeometry } from "./edge-geometry";
import { IndexedEdgeGeometry } from "./indexed-edge-geometry";
import { MeshData } from "./mesh-data";
import { type RenderGeometry } from "./render-geometry";
import { SurfaceGeometry } from "./surface-geometry";
export declare class MeshRenderGeometry implements RenderGeometry {
    readonly renderGeometryType: "mesh";
    readonly isInstanceable: boolean;
    readonly data: MeshData;
    readonly surface?: SurfaceGeometry;
    readonly segmentEdges?: EdgeGeometry;
    readonly silhouetteEdges?: SilhouetteEdgeGeometry;
    readonly polylineEdges?: PolylineEdgeGeometry;
    readonly indexedEdges?: IndexedEdgeGeometry;
    readonly range: Range3d;
    readonly group: THREE.Group;
    private _isDisposed;
    private constructor();
    /**
     * 创建 MeshRenderGeometry 实例
     */
    static create(params: MeshParams, viewIndependentOrigin?: Point3d): MeshRenderGeometry | undefined;
    /**
     * 释放资源
     */
    dispose(): void;
    /**
     * 检查是否已释放
     */
    get isDisposed(): boolean;
    /**
     * 计算边界范围
     */
    computeRange(out?: Range3d): Range3d;
    /**
     * 获取 Three.js 场景对象
     */
    get threeObject(): THREE.Object3D;
    /**
     * 设置可见性
     */
    setVisible(visible: boolean): void;
    /**
     * 设置位置
     */
    setPosition(position: Point3d): void;
    /**
     * 设置旋转
     */
    setRotation(rotation: {
        x: number;
        y: number;
        z: number;
    }): void;
    /**
     * 设置缩放
     */
    setScale(scale: number): void;
}
