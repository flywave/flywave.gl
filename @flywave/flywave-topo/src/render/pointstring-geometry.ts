
export class PointStringGeometry extends THREE.BufferGeometry {
  public readonly vertexParams: QParams3d;
  public readonly weight: number;
  public readonly hasFeatures: boolean;
  public readonly isInstanceable: boolean;

  private _positionBuffer: Float32Array;
  private _originalIndices: Uint8Array|Uint16Array|Uint32Array;
  private _viOrigin?: Point3d;

  constructor(params: PointStringParams, viOrigin?: Point3d) {
    super();

    this._viOrigin = viOrigin;
    this.isInstanceable = viOrigin === undefined;
    this.vertexParams = params.vertices.qparams;
    this.weight = params.weight;
    this.hasFeatures =
        params.vertices.featureIndexType !== FeatureIndexType.Empty;
    this._originalIndices = params.indices.data;

    // 解量化顶点数据
    this._positionBuffer =
        this._dequantizeVertices(params.vertices.data, params.vertices.qparams);

    // 创建位置属性
    this.setAttribute(
        'position', new THREE.BufferAttribute(this._positionBuffer, 3));

    // 设置索引（如果需要）
    if (params.indices.data instanceof Uint16Array ||
        params.indices.data instanceof Uint32Array) {
      this.setIndex(new THREE.BufferAttribute(params.indices.data as any, 1));
    }

    // 计算边界框
    this.computeBoundingBox();

    // 设置绘制范围
    this.setDrawRange(0, params.indices.length);
  }

  // 解量化顶点位置
  private _dequantizeVertices(data: Uint8Array|Uint16Array, qparams: QParams3d):
      Float32Array {
    const origin = qparams.origin;
    const scale = qparams.scale;
    const dequantized = new Float32Array(data.length);

    if (data instanceof Uint8Array) {
      for (let i = 0; i < data.length; i += 3) {
        dequantized[i] = data[i] * scale.x + origin.x;
        dequantized[i + 1] = data[i + 1] * scale.y + origin.y;
        dequantized[i + 2] = data[i + 2] * scale.z + origin.z;
      }
    } else if (data instanceof Uint16Array) {
      for (let i = 0; i < data.length; i += 3) {
        dequantized[i] = data[i] * scale.x + origin.x;
        dequantized[i + 1] = data[i + 1] * scale.y + origin.y;
        dequantized[i + 2] = data[i + 2] * scale.z + origin.z;
      }
    }

    return dequantized;
  }

  // 内存使用统计
  public calculateMemoryUsage(): number {
    let bytes = this._positionBuffer.byteLength;
    bytes += this._originalIndices.byteLength;
    return bytes;
  }

  // 应用实例化偏移
  public applyInstanceOffset(offset: Point3d): this {
    if (!this.isInstanceable || !this._viOrigin) return this;

    const positionAttr = this.getAttribute('position') as THREE.BufferAttribute;
    const positions = positionAttr.array as Float32Array;

    for (let i = 0; i < positions.length; i += 3) {
      positions[i] += offset.x - this._viOrigin.x;
      positions[i + 1] += offset.y - this._viOrigin.y;
      positions[i + 2] += offset.z - this._viOrigin.z;
    }

    positionAttr.needsUpdate = true;
    this.computeBoundingBox();

    return this;
  }

  // 克隆方法
  clone(): this {
    const cloned = super.clone() as PointStringGeometry;

    // 复制自定义属性
    cloned.vertexParams = {...this.vertexParams};
    cloned.weight = this.weight;
    cloned.hasFeatures = this.hasFeatures;
    cloned.isInstanceable = this.isInstanceable;
    cloned._positionBuffer = new Float32Array(this._positionBuffer);
    cloned._originalIndices =
        new (this._originalIndices.constructor as any)(this._originalIndices);

    if (this._viOrigin) {
      cloned._viOrigin =
          new Point3d(this._viOrigin.x, this._viOrigin.y, this._viOrigin.z);
    }

    return cloned as this;
  }
}
