import * as THREE from 'three';

// 基础线段几何体
export class EdgeGeometry extends THREE.BufferGeometry {
  readonly isPlanar: boolean;
  protected _meshData: any;  // 原始网格数据，实际应用中需定义类型

  constructor(
      meshData: any, indices: Uint8Array, endPointAndQuadIndices: Uint8Array) {
    super();
    this._meshData = meshData;
    this.isPlanar = false;  // 根据实际情况计算

    // 位置属性 (3个无符号字节)
    const positionAttr = new THREE.Uint8BufferAttribute(indices, 3);
    positionAttr.normalized = false;
    this.setAttribute('position', positionAttr);

    // 端点和四边形索引属性 (4个无符号字节)
    const epqAttr = new THREE.Uint8BufferAttribute(endPointAndQuadIndices, 4);
    epqAttr.normalized = false;
    this.setAttribute('a_endPointAndQuadIndices', epqAttr);

    this.computeBoundingSphere();
  }

  static create(mesh: any, edges: any): EdgeGeometry|undefined {
    // 实际应用需从edges参数提取数据
    const indices = new Uint8Array(edges.indices.data);
    const endPointAndQuadIndices = new Uint8Array(edges.endPointAndQuadIndices);
    return new EdgeGeometry(mesh, indices, endPointAndQuadIndices);
  }
}

// 轮廓边几何体
export class SilhouetteEdgeGeometry extends EdgeGeometry {
  private _normalPairs: Uint8Array;

  constructor(
      meshData: any, indices: Uint8Array, endPointAndQuadIndices: Uint8Array,
      normalPairs: Uint8Array) {
    super(meshData, indices, endPointAndQuadIndices);
    this._normalPairs = normalPairs;

    // 法线对属性 (4个无符号字节)
    const normalAttr = new THREE.Uint8BufferAttribute(normalPairs, 4);
    normalAttr.normalized = false;
    this.setAttribute('a_normals', normalAttr);
  }

  static createSilhouettes(mesh: any, params: any): SilhouetteEdgeGeometry
      |undefined {
    const indices = new Uint8Array(params.indices.data);
    const endPointAndQuadIndices =
        new Uint8Array(params.endPointAndQuadIndices);
    const normalPairs = new Uint8Array(params.normalPairs);
    return new SilhouetteEdgeGeometry(
        mesh, indices, endPointAndQuadIndices, normalPairs);
  }
}

// 折线几何体
export class PolylineEdgeGeometry extends THREE.BufferGeometry {
  readonly isPlanar: boolean;
  protected _meshData: any;

  constructor(
      meshData: any, vertices: Float32Array, indices: Uint32Array|Uint16Array) {
    super();
    this._meshData = meshData;
    this.isPlanar = false;

    // 顶点位置
    const posAttr = new THREE.Float32BufferAttribute(vertices, 3);
    this.setAttribute('position', posAttr);

    // 索引
    this.setIndex(new THREE.BufferAttribute(indices, 1));

    this.computeBoundingSphere();
  }

  static create(mesh: any, polyline: any): PolylineEdgeGeometry|undefined {
    // 实际应用需从polyline参数提取数据
    const vertices = new Float32Array(polyline.vertices);
    const indices = new Uint32Array(polyline.indices);
    return new PolylineEdgeGeometry(mesh, vertices, indices);
  }
}