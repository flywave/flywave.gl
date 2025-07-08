import {RenderMode} from '@itwin/core-common';
import * as THREE from 'three';

import {EdgeTable} from '../../../common/internal/render/EdgeParams';
import {IndexedEdgeParams} from '../../common/internal/render/EdgeParams';

import {ColorInfo} from './ColorInfo';
import {ShaderProgramParams} from './DrawCommand';
import {MeshData} from './MeshData';
import {Pass, RenderOrder} from './RenderFlags';
import {Target} from './Target';
import {TechniqueId} from './TechniqueId';
import {ThreeMeshGeometry} from './ThreeMeshGeometry';

/**
 * Three.js 实现的 IndexedEdgeGeometry
 * 封装了 iTwin.js 的 IndexedEdgeGeometry 功能
 */
export class IndexedEdgeGeometry extends MeshGeometry {
  public readonly edgeLut: THREE.DataTexture;
  private readonly _indices: Uint8Array;

  // 原始实现属性兼容
  public get lutBuffers() {
    return null;
  }  // Three.js 不需要原生缓冲区容器
  public override get asIndexedEdge() {
    return this;
  }
  public get techniqueId() {
    return TechniqueId.IndexedEdge;
  }

  private constructor(mesh: MeshData, indices: Uint8Array, lut: EdgeTable) {
    super(mesh, indices.length / 3);  // 每个索引3个分量
    this._indices = indices;

    // 创建边缘查找表纹理
    this.edgeLut = new THREE.DataTexture(
        lut.data, lut.width, lut.height, THREE.RGBAFormat,
        THREE.UnsignedByteType);
    this.edgeLut.needsUpdate = true;

    // 设置几何体属性
    this.setAttribute('position', new THREE.BufferAttribute(indices, 3, false));
  }

  /**
   * 创建 ThreeIndexedEdgeGeometry 实例
   */
  public static create(mesh: MeshData, params: IndexedEdgeParams):
      ThreeIndexedEdgeGeometry|undefined {
    try {
      return new ThreeIndexedEdgeGeometry(
          mesh, params.indices.data, params.edges);
    } catch (e) {
      console.error('Failed to create IndexedEdgeGeometry:', e);
      return undefined;
    }
  }

  /**
   * 为特定渲染通道创建材质
   */
  protected createMaterialForPass(pass: Pass, target: Target): THREE.Material {
    const isOpaque = pass === 'opaque-linear';
    const isPlanar = this.isPlanar;

    // 基础材质参数
    const baseParams = {
      depthTest: true,
      depthWrite: isOpaque,
      transparent: !isOpaque,
      side: THREE.FrontSide,
      extensions: {
        fragDepth: false  // 禁用片段深度扩展
      }
    };

    // 根据通道选择着色器
    if (isOpaque) {
      return new THREE.ShaderMaterial({
        ...baseParams,
        vertexShader: this.getVertexShader(),
        fragmentShader: this.getFragmentShader(true),
        uniforms: this.getCommonUniforms(target)
      });
    } else {
      return new THREE.ShaderMaterial({
        ...baseParams,
        vertexShader: this.getVertexShader(),
        fragmentShader: this.getFragmentShader(false),
        uniforms: this.getCommonUniforms(target)
      });
    }
  }

  /**
   * 获取公共 uniforms
   */
  private getCommonUniforms(target: Target): Record<string, THREE.IUniform> {
    return {
      viewIndependentOrigin: {value: this.viewIndependentOrigin},
      edgeLut: {value: this.edgeLut},
      edgeWeight: {value: this.edgeWidth},
      edgeLineCode: {value: this.edgeLineCode},
      viewport: {
        value: new THREE.Vector4(
            0, 0, target.viewport.width, target.viewport.height)
      },
      modelMatrix: {value: new THREE.Matrix4()},
      viewMatrix: {value: new THREE.Matrix4()},
      projectionMatrix: {value: new THREE.Matrix4()},
      // 添加其他必要 uniforms
    };
  }

  /**
   * 获取顶点着色器代码
   */
  private getVertexShader(): string {
    return `
      attribute vec3 position;
      uniform vec3 viewIndependentOrigin;
      uniform mat4 modelMatrix;
      uniform mat4 viewMatrix;
      uniform mat4 projectionMatrix;
      
      varying vec3 vPosition;
      
      void main() {
        // 字节坐标转换 (0-255 => 0.0-1.0)
        vec3 normalizedPos = position / 255.0;
        
        // 应用视图独立原点偏移
        vec3 worldPos = normalizedPos + viewIndependentOrigin;
        
        // 计算最终位置
        vec4 modelViewPosition = viewMatrix * modelMatrix * vec4(worldPos, 1.0);
        gl_Position = projectionMatrix * modelViewPosition;
        
        vPosition = position;
      }
    `;
  }

  /**
   * 获取片段着色器代码
   * @param isOpaque 是否不透明通道
   */
  private getFragmentShader(isOpaque: boolean): string {
    return `
      precision highp float;
      uniform sampler2D edgeLut;
      uniform float edgeWeight;
      uniform float edgeLineCode;
      uniform vec4 viewport;
      
      varying vec3 vPosition;
      
      void main() {
        // 边缘查找表采样
        vec2 uv = vec2(vPosition.x / 255.0, vPosition.y / 255.0);
        vec4 edgeData = texture2D(edgeLut, uv);
        
        // 边缘可见性检查
        if (edgeData.a < 0.1) discard;
        
        // 边缘颜色计算
        vec3 edgeColor = edgeData.rgb;
        
        // 透明度处理
        float alpha = ${isOpaque ? '1.0' : 'edgeData.a'};
        
        gl_FragColor = vec4(edgeColor, alpha);
        
        // 深度偏移处理（减少Z-fighting）
        gl_FragDepthEXT = gl_FragCoord.z - 0.0001;
      }
    `;
  }

  /**
   * 更新 uniforms
   */
  public updateUniforms(material: THREE.Material, params: ShaderProgramParams):
      void {
    super.updateUniforms(material, params);

    if (!(material instanceof THREE.ShaderMaterial)) return;

    const uniforms = material.uniforms;
    const target = params.target;

    // 更新矩阵
    uniforms.modelMatrix.value =
        params.transform?.matrix ?? new THREE.Matrix4();
    uniforms.viewMatrix.value = target.viewMatrix;
    uniforms.projectionMatrix.value = target.projectionMatrix;

    // 更新边缘参数
    uniforms.edgeWeight.value = this.computeEdgeWeight(params);
    uniforms.edgeLineCode.value = this.computeEdgeLineCode(params);

    // 更新视口
    uniforms.viewport.value.set(
        0, 0, target.viewport.width, target.viewport.height);
  }

  /**
   * 获取渲染通道
   */
  public override getPass(target: Target): Pass {
    return this.computeEdgePass(target);
  }

  /**
   * 获取渲染顺序
   */
  public get renderOrder(): number {
    return this.isPlanar ? RenderOrder.PlanarEdge : RenderOrder.Edge;
  }

  /**
   * 获取颜色信息
   */
  public override getColor(target: Target): ColorInfo {
    return this.computeEdgeColor(target);
  }

  /**
   * 是否需要单色处理
   */
  public override wantMonochrome(target: Target): boolean {
    return target.currentViewFlags.renderMode === RenderMode.Wireframe;
  }

  /**
   * 释放资源
   */
  public override dispose(): void {
    super.dispose();
    this.edgeLut.dispose();
  }

  /**
   * 收集内存统计信息
   */
  public collectStatistics(): {indices: number; texture: number} {
    return {
      indices: this._indices.byteLength,
      texture: this.edgeLut.image.width * this.edgeLut.image.height * 4  // RGBA
    };
  }
}