import * as THREE from 'three';
import { Point3d } from '@itwin/core-geometry';
import { FeatureIndexType, PolylineTypeFlags, QParams3d } from '@itwin/core-common';
import { PolylineParams } from '../../../common/internal/render/PolylineParams';
import { RenderMemory } from '../../../render/RenderMemory';
import { ColorInfo } from './ColorInfo';
import { LineCode } from './LineCode';
import { BuffersContainer } from './AttributeBuffers';
import { RenderOrder } from './RenderFlags';
import { TechniqueId } from './TechniqueId';
import { VertexLUT } from './VertexLUT';

// 自定义类型声明
type WebGLDisposable = {
  dispose: () => void;
  isDisposed: boolean;
};

class BufferHandle implements WebGLDisposable {
  public readonly buffer: THREE.InstancedBufferAttribute | THREE.BufferAttribute;
  public readonly bytesUsed: number;
  public isDisposed = false;

  constructor(data: ArrayBufferView, itemSize: number, type: THREE.BufferAttributeType) {
    this.buffer = new THREE.BufferAttribute(data, itemSize);
    this.bytesUsed = data.byteLength;
  }

  dispose() {
    this.buffer.dispose();
    this.isDisposed = true;
  }
}

/** @internal */
export class PolylineBuffers implements WebGLDisposable {
  public geometry: THREE.BufferGeometry;
  public indices: BufferHandle;
  public prevIndices: BufferHandle;
  public nextIndicesAndParams: BufferHandle;
  
  private constructor(indices: BufferHandle, prevIndices: BufferHandle, nextIndicesAndParams: BufferHandle) {
    this.geometry = new THREE.BufferGeometry();
    this.indices = indices;
    this.prevIndices = prevIndices;
    this.nextIndicesAndParams = nextIndicesAndParams;
    
    // 设置几何属性
    this.geometry.setAttribute('a_pos', indices.buffer);
    this.geometry.setAttribute('a_prevIndex', prevIndices.buffer);
    
    // 处理共享缓冲区的属性
    const nextBuffer = nextIndicesAndParams.buffer as THREE.BufferAttribute;
    this.geometry.setAttribute('a_nextIndex', new THREE.BufferAttribute(
      nextBuffer.array,
      3,
      false,
      undefined,
      undefined,
      undefined,
      4
    ));
    
    this.geometry.setAttribute('a_param', new THREE.BufferAttribute(
      nextBuffer.array,
      1,
      false,
      undefined,
      undefined,
      3,
      4
    ));
  }

  public static create(polyline: any): PolylineBuffers | undefined {
    // 假设polyline结构包含必要的数据
    const indices = new BufferHandle(
      new Uint8Array(polyline.indices.data),
      3,
      THREE.UnsignedByteType
    );
    
    const prev = new BufferHandle(
      new Uint8Array(polyline.prevIndices.data),
      3,
      THREE.UnsignedByteType
    );
    
    const next = new BufferHandle(
      new Uint8Array(polyline.nextIndicesAndParams),
      4, // 包含3字节索引 + 1字节参数
      THREE.UnsignedByteType
    );
    
    return new PolylineBuffers(indices, prev, next);
  }

  public collectStatistics(stats: RenderMemory.Statistics, type: any): void {
    stats.addBuffer(type, this.indices.bytesUsed + this.prevIndices.bytesUsed + this.nextIndicesAndParams.bytesUsed);
  }

  public get isDisposed(): boolean {
    return this.geometry === null &&
      this.indices.isDisposed &&
      this.prevIndices.isDisposed &&
      this.nextIndicesAndParams.isDisposed;
  }

  public dispose() {
    this.geometry.dispose();
    this.indices.dispose();
    this.prevIndices.dispose();
    this.nextIndicesAndParams.dispose();
    this.geometry = null as any;
  }
}

/** @internal */
export class PolylineGeometry {
  public readonly isInstanceable: boolean;
  public vertexParams: QParams3d;
  private readonly _hasFeatures: boolean;
  public lineWeight: number;
  public lineCode: number;
  public type: PolylineTypeFlags;
  private _isPlanar: boolean;
  public lut: VertexLUT;
  public numIndices: number;
  private _buffers: PolylineBuffers;
  private _origin: Point3d | undefined;
  
  public threeGeometry: THREE.BufferGeometry;
  public material: THREE.Material;

  constructor(lut: VertexLUT, buffers: PolylineBuffers, params: PolylineParams, viOrigin: Point3d | undefined) {
    this.isInstanceable = undefined === viOrigin;
    this.vertexParams = params.vertices.qparams;
    this._hasFeatures = FeatureIndexType.Empty !== params.vertices.featureIndexType;
    this.lineWeight = params.weight;
    this.lineCode = LineCode.valueFromLinePixels(params.linePixels);
    this.type = params.type;
    this._isPlanar = params.isPlanar;
    this.lut = lut;
    this.numIndices = params.polyline.indices.length;
    this._buffers = buffers;
    this._origin = viOrigin;
    
    // 创建Three.js几何体
    this.threeGeometry = buffers.geometry.clone();
    
    // 添加颜色信息
    if (lut.colorInfo) {
      const colorAttr = new THREE.BufferAttribute(
        new Float32Array(lut.colorInfo.colors),
        4
      );
      this.threeGeometry.setAttribute('color', colorAttr);
    }
    
    // 创建材质
    this.material = this.createPolylineMaterial();
  }

  private createPolylineMaterial(): THREE.Material {
    return new THREE.MeshBasicMaterial({
      vertexColors: this.lut.colorInfo ? true : false,
      side: THREE.DoubleSide,
      transparent: this.lut.colorInfo?.hasTranslucency,
      opacity: this.lut.colorInfo?.transparency,
      linewidth: this.lineWeight
    });
  }

  public get isDisposed(): boolean { 
    return this._buffers.isDisposed && this.lut.isDisposed; 
  }

  public dispose() {
    if (!this.noDispose) {
      this.lut.dispose();
      this._buffers.dispose();
      this.threeGeometry.dispose();
      (this.material as any).dispose();
    }
  }

  public collectStatistics(stats: RenderMemory.Statistics): void {
    this._buffers.collectStatistics(stats, RenderMemory.BufferType.Polylines);
    stats.addVertexTable(this.lut.bytesUsed);
  }

  public get isAnyEdge(): boolean { return PolylineTypeFlags.Normal !== this.type; }
  public get isNormalEdge(): boolean { return PolylineTypeFlags.Edge === this.type; }
  public get isOutlineEdge(): boolean { return PolylineTypeFlags.Outline === this.type; }

  public get renderOrder(): RenderOrder {
    if (this.isAnyEdge)
      return this.isPlanar ? RenderOrder.PlanarEdge : RenderOrder.Edge;
    else
      return this.isPlanar ? RenderOrder.PlanarLinear : RenderOrder.Linear;
  }

  protected _wantWoWReversal(_target: any): boolean { return true; }

  public get polylineBuffers(): PolylineBuffers | undefined { return this._buffers; }

  private _computeEdgePass(target: any, colorInfo: ColorInfo): string {
    const vf = target.currentViewFlags;
    if (vf.renderMode === 'smooth' && !vf.visibleEdges)
      return "none";

    const isTranslucent: boolean = vf.renderMode === 'wireframe' && vf.transparency && colorInfo.hasTranslucency;
    return isTranslucent ? "translucent" : "opaque-linear";
  }

  public getPass(target: any): string {
    const vf = target.currentViewFlags;
    if (this.isEdge) {
      let pass = this._computeEdgePass(target, this.lut.colorInfo);
      if ("none" !== pass && this.isOutlineEdge && vf.renderMode === 'wireframe' && vf.fill)
        pass = "none";

      return pass;
    }

    const isTranslucent: boolean = vf.transparency && this.lut.colorInfo.hasTranslucency;
    return isTranslucent ? "translucent" : "opaque-linear";
  }

  public get techniqueId(): TechniqueId { return TechniqueId.Polyline; }
  public get isPlanar(): boolean { return this._isPlanar; }
  public get isEdge(): boolean { return this.isAnyEdge; }
  public get qOrigin(): Float32Array { return this.lut.qOrigin; }
  public get qScale(): Float32Array { return this.lut.qScale; }
  public get numRgbaPerVertex(): number { return this.lut.numRgbaPerVertex; }
  public get hasFeatures() { return this._hasFeatures; }

  protected _getLineWeight(params: any): number {
    return this.isEdge ? params.target.computeEdgeWeight(params.renderPass, this.lineWeight) : this.lineWeight;
  }
  
  protected _getLineCode(params: any): number {
    return this.isEdge ? params.target.computeEdgeLineCode(params.renderPass, this.lineCode) : this.lineCode;
  }
  
  public getColor(target: any): ColorInfo {
    return this.isEdge ? target.computeEdgeColor(this.lut.colorInfo) : this.lut.colorInfo;
  }

  public static create(params: PolylineParams, viewIndependentOrigin: Point3d | undefined): PolylineGeometry | undefined {
    const lut = VertexLUT.createFromVertexTable(params.vertices);
    if (undefined === lut) return undefined;

    const buffers = PolylineBuffers.create(params.polyline);
    if (undefined === buffers) return undefined;

    return new PolylineGeometry(lut, buffers, params, viewIndependentOrigin);
  }

  // Three.js 特定方法
  public createMesh(): THREE.Mesh {
    return new THREE.Mesh(this.threeGeometry, this.material);
  }

  public updateMaterialForPass(pass: string): void {
    if (pass === "translucent") {
      this.material.transparent = true;
      this.material.opacity = this.lut.colorInfo.transparency || 0.7;
    } else {
      this.material.transparent = false;
      this.material.opacity = 1.0;
    }
  }
  
  // 实例化支持
  public createInstancedMesh(count: number): THREE.InstancedMesh {
    const instancedMesh = new THREE.InstancedMesh(
      this.threeGeometry, 
      this.material, 
      count
    );
    
    // 设置实例化属性
    // 这里可以根据需要添加实例化属性
    
    return instancedMesh;
  }
  
  public noDispose = false;
}