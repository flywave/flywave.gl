/* Copyright (C) 2025 flywave.gl contributors */



import * as THREE from "three";

import { type MeshParams } from "../common/render/primitives/mesh-params";
import { type Point3d, type Range3d } from "../core-geometry";
import { EdgeGeometry, PolylineEdgeGeometry, SilhouetteEdgeGeometry } from "./edge-geometry";
import { IndexedEdgeGeometry } from "./indexed-edge-geometry";
import { MeshData } from "./mesh-data";
import { type RenderGeometry } from "./render-geometry";
import { SurfaceGeometry } from "./surface-geometry";

export class MeshRenderGeometry implements RenderGeometry {
    public readonly renderGeometryType = "mesh" as const;
    public readonly isInstanceable: boolean;
    public readonly data: MeshData;
    public readonly surface?: SurfaceGeometry;
    public readonly segmentEdges?: EdgeGeometry;
    public readonly silhouetteEdges?: SilhouetteEdgeGeometry;
    public readonly polylineEdges?: PolylineEdgeGeometry;
    public readonly indexedEdges?: IndexedEdgeGeometry;
    public readonly range: Range3d;
    public readonly group: THREE.Group = new THREE.Group();
    private _isDisposed = false;

    private constructor(data: MeshData, params: MeshParams) {
        this.data = data;
        this.isInstanceable = data.viewIndependentOrigin === undefined;
        this.range = params.vertices.qparams.computeRange();

        // 创建表面几何体
        this.surface = SurfaceGeometry.create(data, params);
        if (this.surface) {
            const surfaceMesh = this.surface.createMesh(); // 添加括号
            if (surfaceMesh) this.group.add(surfaceMesh);
        }

        // 创建边缘几何体
        const edges = params.edges;
        if (edges) {
            // 轮廓边
            if (edges.silhouettes) {
                this.silhouetteEdges = SilhouetteEdgeGeometry.createSilhouettes(
                    data,
                    edges.silhouettes
                );
                const silhouetteMesh = this.silhouetteEdges.createMesh(); // 添加括号
                if (silhouetteMesh) this.group.add(silhouetteMesh);
            }

            // 线段边
            if (edges.segments) {
                this.segmentEdges = EdgeGeometry.create(data, edges.segments);
                const segmentMesh = this.segmentEdges?.createMesh(); // 添加括号
                if (segmentMesh) this.group.add(segmentMesh);
            }

            // 折线边
            if (edges.polylines) {
                this.polylineEdges = PolylineEdgeGeometry.create(data, edges.polylines);
                const polylineMesh = this.polylineEdges?.createMesh(); // 添加括号
                if (polylineMesh) this.group.add(polylineMesh);
            }

            // 索引边
            if (edges.indexed) {
                this.indexedEdges = IndexedEdgeGeometry.create(edges.indexed);
                const indexedMesh = this.indexedEdges?.createMesh(); // 添加括号
                if (indexedMesh) this.group.add(indexedMesh);
            }
        }
    }

    /**
     * 创建 MeshRenderGeometry 实例
     */
    public static create(
        params: MeshParams,
        viewIndependentOrigin?: Point3d
    ): MeshRenderGeometry | undefined {
        const data = MeshData.create(params, viewIndependentOrigin);
        return data ? new this(data, params) : undefined;
    }

    /**
     * 释放资源
     */
    public dispose() {
        if (this._isDisposed) return;

        // 释放所有几何体资源
        this.data.dispose();
        this.surface?.dispose();
        this.segmentEdges?.dispose();
        this.silhouetteEdges?.dispose();
        this.polylineEdges?.dispose();
        this.indexedEdges?.dispose();

        // 释放 Three.js 对象
        while (this.group.children.length > 0) {
            const child = this.group.children[0];
            if (child instanceof THREE.Mesh) {
                child.geometry?.dispose();
                if (Array.isArray(child.material)) {
                    child.material.forEach(mat => mat.dispose());
                } else if (child.material) {
                    child.material.dispose();
                }
            }
            this.group.remove(child);
        }

        this._isDisposed = true;
    }

    /**
     * 检查是否已释放
     */
    public get isDisposed(): boolean {
        return this._isDisposed;
    }

    /**
     * 计算边界范围
     */
    public computeRange(out?: Range3d): Range3d {
        return this.range.clone(out);
    }

    /**
     * 获取 Three.js 场景对象
     */
    public get threeObject(): THREE.Object3D {
        return this.group;
    }

    /**
     * 设置可见性
     */
    public setVisible(visible: boolean) {
        this.group.visible = visible;
    }

    /**
     * 设置位置
     */
    public setPosition(position: Point3d) {
        this.group.position.set(position.x, position.y, position.z);
    }

    /**
     * 设置旋转
     */
    public setRotation(rotation: { x: number; y: number; z: number }) {
        this.group.rotation.set(rotation.x, rotation.y, rotation.z);
    }

    /**
     * 设置缩放
     */
    public setScale(scale: number) {
        this.group.scale.set(scale, scale, scale);
    }
}
