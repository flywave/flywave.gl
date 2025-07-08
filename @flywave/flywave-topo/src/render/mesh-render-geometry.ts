import {Point3d, Range3d} from '@itwin/core-geometry';
import * as THREE from 'three';

import {MeshParams} from '../../../common/internal/render/MeshParams';
import {SurfaceType} from '../../../common/internal/render/SurfaceParams';
import {RenderMemory} from '../../../render/RenderMemory';

import {ThreeEdgeGeometry} from './ThreeEdgeGeometry';
import {ThreeIndexedEdgeGeometry} from './ThreeIndexedEdgeGeometry';
import {ThreeMeshData} from './ThreeMeshData';
import {ThreePolylineEdgeGeometry} from './ThreePolylineEdgeGeometry';
import {ThreeSilhouetteEdgeGeometry} from './ThreeSilhouetteEdgeGeometry';
import {ThreeSurfaceGeometry} from './ThreeSurfaceGeometry';

/**
 * Three.js 实现的 MeshRenderGeometry
 * 封装了 iTwin.js 的 MeshRenderGeometry 功能
 */
export class ThreeMeshRenderGeometry {
  public readonly renderGeometryType = 'mesh' as const;
  public readonly isInstanceable: boolean;
  public noDispose = false;
  public readonly data: ThreeMeshData;
  public readonly surface?: ThreeSurfaceGeometry;
  public readonly segmentEdges?: ThreeEdgeGeometry;
  public readonly silhouetteEdges?: ThreeSilhouetteEdgeGeometry;
  public readonly polylineEdges?: ThreePolylineEdgeGeometry;
  public readonly indexedEdges?: ThreeIndexedEdgeGeometry;
  public readonly range: Range3d;
  public readonly group: THREE.Group = new THREE.Group();

  private constructor(data: ThreeMeshData, params: MeshParams) {
    this.data = data;
    this.isInstanceable = data.viewIndependentOrigin === undefined;
    this.range = params.vertices.qparams.computeRange();

    // 创建表面几何体
    this.surface = ThreeSurfaceGeometry.create(data, params);
    if (this.surface) {
      const surfaceMesh = this.surface.createThreeMesh();
      if (surfaceMesh) this.group.add(surfaceMesh);
    }

    // 创建边缘几何体
    const edges = params.edges;
    if (edges && data.type !== SurfaceType.VolumeClassifier) {
      // 轮廓边
      if (edges.silhouettes) {
        this.silhouetteEdges = ThreeSilhouetteEdgeGeometry.createSilhouettes(
            data, edges.silhouettes);
        const silhouetteMesh = this.silhouetteEdges?.createThreeMesh();
        if (silhouetteMesh) this.group.add(silhouetteMesh);
      }

      // 线段边
      if (edges.segments) {
        this.segmentEdges = ThreeEdgeGeometry.create(data, edges.segments);
        const segmentMesh = this.segmentEdges?.createThreeMesh();
        if (segmentMesh) this.group.add(segmentMesh);
      }

      // 折线边
      if (edges.polylines) {
        this.polylineEdges =
            ThreePolylineEdgeGeometry.create(data, edges.polylines);
        const polylineMesh = this.polylineEdges?.createThreeMesh();
        if (polylineMesh) this.group.add(polylineMesh);
      }

      // 索引边
      if (edges.indexed) {
        this.indexedEdges =
            ThreeIndexedEdgeGeometry.create(data, edges.indexed);
        const indexedMesh = this.indexedEdges?.createThreeMesh();
        if (indexedMesh) this.group.add(indexedMesh);
      }
    }
  }

  /**
   * 创建 ThreeMeshRenderGeometry 实例
   */
  public static create(params: MeshParams, viewIndependentOrigin?: Point3d):
      ThreeMeshRenderGeometry|undefined {
    const data = ThreeMeshData.create(params, viewIndependentOrigin);
    return data ? new this(data, params) : undefined;
  }

  /**
   * 释放资源
   */
  public dispose() {
    if (this.noDispose) return;

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
  }

  /**
   * 检查是否已释放
   */
  public get isDisposed(): boolean {
    return this.data.isDisposed && (!this.surface || this.surface.isDisposed) &&
        (!this.segmentEdges || this.segmentEdges.isDisposed) &&
        (!this.silhouetteEdges || this.silhouetteEdges.isDisposed) &&
        (!this.polylineEdges || this.polylineEdges.isDisposed) &&
        (!this.indexedEdges || this.indexedEdges.isDisposed);
  }

  /**
   * 收集内存统计信息
   */
  public collectStatistics(stats: RenderMemory.Statistics) {
    this.data.collectStatistics(stats);
    this.surface?.collectStatistics(stats);
    this.segmentEdges?.collectStatistics(stats);
    this.silhouetteEdges?.collectStatistics(stats);
    this.polylineEdges?.collectStatistics(stats);
    this.indexedEdges?.collectStatistics(stats);
  }

  /**
   * 计算边界范围
   */
  public computeRange(out?: Range3d): Range3d {
    return this.range.clone(out);
  }

  /**
   * 更新几何体以响应渲染状态变化
   */
  public updateForRender(target: any, params: any) {
    // 更新表面几何体
    if (this.surface) {
      const surfaceMesh =
          this.group.children.find(c => c.userData?.type === 'surface');
      if (surfaceMesh instanceof THREE.Mesh) {
        this.surface.updateUniforms(surfaceMesh.material, params);
      }
    }

    // 更新边缘几何体
    const updateEdgeGeometry = (geometry: any, type: string) => {
      if (!geometry) return;

      const edgeMesh = this.group.children.find(c => c.userData?.type === type);
      if (edgeMesh instanceof THREE.Mesh) {
        geometry.updateUniforms(edgeMesh.material, params);

        // 根据目标状态显示/隐藏
        const pass = geometry.getPass(target);
        edgeMesh.visible = pass !== 'none';
      }
    };

    updateEdgeGeometry(this.segmentEdges, 'segment-edges');
    updateEdgeGeometry(this.silhouetteEdges, 'silhouette-edges');
    updateEdgeGeometry(this.polylineEdges, 'polyline-edges');
    updateEdgeGeometry(this.indexedEdges, 'indexed-edges');
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
  public setRotation(rotation: {x: number; y: number; z: number}) {
    this.group.rotation.set(rotation.x, rotation.y, rotation.z);
  }

  /**
   * 设置缩放
   */
  public setScale(scale: number) {
    this.group.scale.set(scale, scale, scale);
  }
}
