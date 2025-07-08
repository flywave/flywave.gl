import * as THREE from 'three';
import { MeshData } from './mesh-data';
import { ColorInfo } from './color-info';
import { FloatRgba } from './float-rgba';
import { RenderMode } from '@itwin/core-common';

/**
 * Three.js 实现的 MeshGeometry 基础类
 * 封装了 iTwin.js 的 MeshGeometry 功能
 */
export abstract class ThreeMeshGeometry extends THREE.BufferGeometry {
  // 原始 iTwin.js 的 MeshData 引用
  public readonly mesh: MeshData;
  
  // 视图独立原点 (用于世界坐标转换)
  public readonly viewIndependentOrigin: THREE.Vector3;
  
  // 索引数量
  protected readonly _numIndices: number;
  
  // 访问器
  public get asMesh() { return this; }
  public get edgeWidth() { return this.mesh.edgeWidth; }
  public get edgeLineCode() { return this.mesh.edgeLineCode; }
  public get hasFeatures() { return this.mesh.hasFeatures; }
  public get surfaceType() { return this.mesh.type; }
  public get fillFlags() { return this.mesh.fillFlags; }
  public get isPlanar() { return this.mesh.isPlanar; }
  public get colorInfo(): ColorInfo { return this.mesh.lut.colorInfo; }
  public get uniformColor(): FloatRgba | undefined {
    return this.colorInfo.isUniform ? this.colorInfo.uniform : undefined;
  }
  public get texture() { return this.mesh.texture; }
  public get normalMap() { return this.mesh.normalMap; }
  public get hasBakedLighting() { return this.mesh.hasBakedLighting; }
  public get lut() { return this.mesh.lut; }
  public get hasScalarAnimation() { return this.mesh.lut.hasScalarAnimation; }

  // 材质缓存
  private _materialCache = new Map<string, THREE.Material>();
  
  protected constructor(mesh: MeshData, numIndices: number) {
    super();
    this.mesh = mesh;
    this._numIndices = numIndices;
    
    // 转换视图独立原点为 Three.js 向量
    this.viewIndependentOrigin = new THREE.Vector3(
      mesh.viewIndependentOrigin.x,
      mesh.viewIndependentOrigin.y,
      mesh.viewIndependentOrigin.z
    );
  }

  /**
   * 计算边缘线宽 (Three.js 实现)
   */
  protected computeEdgeWeight(params: ShaderProgramParams): number {
    // 在实际应用中，这里应该实现具体的线宽计算逻辑
    // 简化实现：根据渲染通道和原始线宽计算
    const baseWidth = this.edgeWidth;
    if (params.renderPass === 'translucent') {
      return baseWidth * 0.8; // 半透明通道使用稍细的线
    }
    return baseWidth;
  }

  /**
   * 计算边缘线代码 (Three.js 实现)
   */
  protected computeEdgeLineCode(params: ShaderProgramParams): number {
    // 在实际应用中，这里应该实现具体的线代码计算逻辑
    // 简化实现：根据渲染通道和原始线代码计算
    return this.edgeLineCode;
  }

  /**
   * 计算边缘颜色 (Three.js 实现)
   */
  protected computeEdgeColor(target: Target): ColorInfo {
    // 在实际应用中，这里应该实现具体的颜色计算逻辑
    // 简化实现：返回原始颜色信息
    return this.colorInfo;
  }

  /**
   * 计算渲染通道 (Three.js 实现)
   */
  protected computeEdgePass(target: Target): Pass {
    // 简化实现：根据视图标志决定渲染通道
    const vf = target.currentViewFlags;
    
    if (target.isDrawingShadowMap) return "none";
    if (RenderMode.SmoothShade === vf.renderMode && !vf.visibleEdges) return "none";
    
    const isTranslucent = RenderMode.Wireframe === vf.renderMode && 
                         vf.transparency && 
                         this.colorInfo.hasTranslucency;
    
    return isTranslucent ? "translucent" : "opaque-linear";
  }

  /**
   * 创建或获取缓存的材质
   * @param pass 渲染通道
   * @param target 渲染目标
   */
  public getMaterial(pass: Pass, target: Target): THREE.Material {
    const cacheKey = `${pass}_${this.mesh.type}_${this.isPlanar}`;
    
    if (this._materialCache.has(cacheKey)) {
      return this._materialCache.get(cacheKey)!;
    }
    
    const material = this.createMaterialForPass(pass, target);
    this._materialCache.set(cacheKey, material);
    return material;
  }

  /**
   * 根据渲染通道创建材质
   */
  protected abstract createMaterialForPass(pass: Pass, target: Target): THREE.Material;

  /**
   * 创建 Three.js 网格对象
   */
  public createThreeMesh(target: Target): THREE.Mesh {
    const pass = this.computeEdgePass(target);
    if (pass === 'none') {
      throw new Error('Geometry should not be rendered in current pass');
    }
    
    const material = this.getMaterial(pass, target);
    return new THREE.Mesh(this, material);
  }

  /**
   * 更新 uniforms (在渲染前调用)
   */
  public updateUniforms(material: THREE.Material, params: ShaderProgramParams): void {
    if (!(material instanceof THREE.ShaderMaterial)) return;
    
    const uniforms = material.uniforms;
    
    // 更新线宽
    if (uniforms.edgeWeight) {
      uniforms.edgeWeight.value = this.computeEdgeWeight(params);
    }
    
    // 更新线代码
    if (uniforms.edgeLineCode) {
      uniforms.edgeLineCode.value = this.computeEdgeLineCode(params);
    }
    
    // 更新视图独立原点
    if (uniforms.viewIndependentOrigin) {
      uniforms.viewIndependentOrigin.value = this.viewIndependentOrigin;
    }
    
    // 更新颜色信息
    if (this.uniformColor && uniforms.uniformColor) {
      const color = this.uniformColor;
      uniforms.uniformColor.value = new THREE.Vector4(color.red, color.green, color.blue, color.alpha);
    }
    
    // 更新纹理
    if (this.texture && uniforms.map) {
      uniforms.map.value = this.texture;
    }
    
    if (this.normalMap && uniforms.normalMap) {
      uniforms.normalMap.value = this.normalMap;
    }
  }

  /**
   * 释放资源
   */
  public dispose(): void {
    super.dispose();
    
    // 释放所有缓存的材质
    for (const material of this._materialCache.values()) {
      material.dispose();
    }
    this._materialCache.clear();
  }
}