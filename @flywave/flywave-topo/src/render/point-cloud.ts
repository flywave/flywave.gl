import * as THREE from 'three';


// 对应的材质实现示例
export class PointCloudMaterial extends THREE.ShaderMaterial {
  constructor() {
    super({
      vertexShader: `...`, // 包含解量化/颜色处理逻辑
      fragmentShader: `...`,
      uniforms: {
        voxelSize: { value: 1.0 },
        overrideColor: { value: null },
        // ...其他uniforms
      },
      vertexColors: true
    });
  }
}

export interface PointCloudArgs {
  positions: Float32Array | Uint8Array | Uint16Array;
  qparams: {
    origin: Float32Array;
    scale: Float32Array;
  };
  colors?: Uint8Array;
  features: {
    type: FeatureIndexType;
  };
  voxelSize: number;
  colorFormat: 'rgb' | 'bgr';
}

enum FeatureIndexType {
  Empty = 0,
  // ...其他枚举值
}

export class PointCloudGeometry extends THREE.BufferGeometry {
  public readonly isPointCloudGeometry = true;
  public readonly voxelSize: number;
  public readonly colorIsBgr: boolean;
  public readonly hasFeatures: boolean;
  
  private _vertexCount: number;
  private _colors: Uint8Array | null = null;

  constructor(pointCloud: PointCloudArgs) {
    super();
    
    // 处理顶点数据
    this._vertexCount = pointCloud.positions.length / 3;
    const positions = this._dequantizePositions(
      pointCloud.positions,
      pointCloud.qparams
    );
    this.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    // 处理颜色数据
    if (pointCloud.colors) {
      this._colors = pointCloud.colorFormat === 'bgr' 
        ? this._convertBgrToRgb(pointCloud.colors) 
        : pointCloud.colors;
        
      this.setAttribute('color', new THREE.BufferAttribute(this._colors, 3, true));
    }

    // 设置元数据
    this.voxelSize = pointCloud.voxelSize;
    this.colorIsBgr = pointCloud.colorFormat === 'bgr';
    this.hasFeatures = pointCloud.features.type !== FeatureIndexType.Empty;
  }

  // 解量化顶点位置
  private _dequantizePositions(
    positions: Float32Array | Uint8Array | Uint16Array,
    qparams: { origin: Float32Array; scale: Float32Array }
  ): Float32Array {
    if (positions instanceof Float32Array) {
      return positions;
    }

    const origin = qparams.origin;
    const scale = qparams.scale;
    const dequantized = new Float32Array(positions.length);

    if (positions instanceof Uint8Array) {
      for (let i = 0; i < positions.length; i++) {
        const idx = Math.floor(i / 3);
        dequantized[i] = positions[i] * scale[idx % 3] + origin[idx % 3];
      }
    } else if (positions instanceof Uint16Array) {
      for (let i = 0; i < positions.length; i++) {
        const idx = Math.floor(i / 3);
        dequantized[i] = positions[i] * scale[idx % 3] + origin[idx % 3];
      }
    }

    return dequantized;
  }

  // 转换BGR颜色到RGB
  private _convertBgrToRgb(colors: Uint8Array): Uint8Array {
    const converted = new Uint8Array(colors.length);
    for (let i = 0; i < colors.length; i += 3) {
      converted[i] = colors[i + 2];     // R
      converted[i + 1] = colors[i + 1]; // G
      converted[i + 2] = colors[i];     // B
    }
    return converted;
  }

  // 计算内存使用
  public calculateMemoryUsage(): number {
    let bytes = this.getAttribute('position').array.byteLength;
    const colorAttr = this.getAttribute('color');
    if (colorAttr) bytes += colorAttr.array.byteLength;
    return bytes;
  }

  // 实例化支持（Three.js内置）
  public applyMatrix4(matrix: THREE.Matrix4): this {
    super.applyMatrix4(matrix);
    return this;
  }
}
