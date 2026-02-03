# DepthReadingPass 对数深度缓冲问题

## 1. 问题描述

### 1.1 功能定义

`DepthReadingPass` 继承自 `DepthCopyPass`，提供深度读取功能：

```typescript
readDepth(ndc: Vector2 | Vector3): number | null
```

### 1.2 当前状态

-   **`logarithmicDepthBuffer = false`**：功能正常
-   **`logarithmicDepthBuffer = true`**：读取的深度值错误（值异常大）

---

## 2. 源码和项目地址

### 2.1 Three.js

**项目地址**：`/Users/wh/github/three.js`

**相关文件**：

-   `src/renderers/WebGLRenderer.js`
-   `src/renderers/webgl/WebGLTextures.js`
-   `src/renderers/shaders/ShaderChunk/`

### 2.2 Postprocessing

**项目地址**：`/Users/wh/github/postprocessing`

**相关文件**：

-   `src/passes/Pass.js`
-   `src/passes/DepthCopyPass.js`
-   `src/passes/DepthPickingPass.js`
-   `src/materials/DepthCopyMaterial.js`
-   `src/core/EffectComposer.js`

### 2.3 本项目

**相关文件**：

-   `/Users/wh/github/flywave.gl/@flywave/flywave-mapview/src/composing/DepthReadingPass.ts`
-   `/Users/wh/github/flywave.gl/@flywave/flywave-terrain-datasource/src/quantized-terrain/quantized-mesh/QuantizedMesh.ts`
-   `/Users/wh/github/flywave.gl/@flywave/flywave-mapview/src/composing/MapRenderingManager.ts`

---

## 3. 已知信息

### 3.1 QuantizedMesh 的特殊处理

**文件**：`/Users/wh/github/flywave.gl/@flywave/flywave-terrain-datasource/src/quantized-terrain/quantized-mesh/QuantizedMesh.ts`

**已确认的事实**：

-   第 112 行：`allowOverride = false`
-   第 82 行：`isRenderingDepth: { value: boolean }` uniform
-   第 266-277 行：`setRenderingDepth` 和 `getIsRenderingDepth` 方法
-   第 151-159 行：shader 中有条件判断控制 logdepthbuf

### 3.2 DepthCopyPass 的渲染

**文件**：`/Users/wh/github/postprocessing/src/passes/DepthCopyPass.js`

**关键代码位置**：

-   第 26-52 行：构造函数
-   第 128-133 行：render 方法

### 3.3 DepthPickingPass 的深度读取

**文件**：`/Users/wh/github/postprocessing/src/passes/DepthPickingPass.js`

**关键代码位置**：

-   第 30-42 行：`unpackRGBAToDepth` 函数
-   第 113-123 行：`readDepth` 方法
-   第 168 行：`readRenderTargetPixels` 调用

### 3.4 WebGLRenderer 的读取限制

**文件**：`/Users/wh/github/three.js/src/renderers/WebGLRenderer.js`

**关键代码位置**：

-   第 2850-2914 行：`readRenderTargetPixels` 方法
-   第 2899 行：读取颜色缓冲区的代码

---

## 4. 遇到的问题

### 4.1 核心问题

对数深度缓冲开启时，`readDepth()` 返回的深度值不正确。

### 4.2 已尝试的方法

1. 直接从 `DepthCopyPass` 的 `renderTarget` 读取 → 得到对数深度值（错误）
2. CPU 反算对数深度 → 精度损失巨大，不可行

### 4.3 技术限制

1. Three.js 的 `readRenderTargetPixels` 只能读取颜色缓冲区
2. QuantizedMesh 的 `allowOverride = false`，不接受 `scene.overrideMaterial`
3. 对数深度的非线性特性导致 CPU 反算误差极大

---

## 5. 解决思路

### 5.1 核心思路

使用 `scene.overrideMaterial` 配合特殊材质的 `setRenderingDepth` 方法：

1. **全局材质覆盖**：通过 `scene.overrideMaterial` 设置一个不带 logdepthbuf 的材质

    - 对普通对象有效
    - 对 `allowOverride = false` 的对象无效

2. **特殊材质处理**：通过 `setRenderingDepth(true)` 通知特殊材质

    - 材质内部有 `isRenderingDepth` uniform
    - Shader 中条件判断：`if (!isRenderingDepth) { #include <logdepthbuf_fragment> }`
    - 为 true 时，禁用 logdepthbuf，渲染线性深度

3. **重新渲染场景**：
    - 创建临时 renderTarget（带深度纹理）
    - 应用上述两个机制
    - 渲染一帧，获取线性深度
    - 从深度纹理读取深度值

### 5.2 关键接口

**DepthMaterialAware 接口**：

```typescript
interface DepthMaterialAware {
    setRenderingDepth(enabled: boolean): void;
}
```

**已知实现**：

-   `QuantizedMeshMaterial` 在 `/Users/wh/github/flywave.gl/@flywave/flywave-terrain-datasource/src/quantized-terrain/quantized-mesh/QuantizedMesh.ts`

### 5.3 执行流程

```
readDepth() 被调用
  ↓
if (对数深度开启) {
    创建临时 renderTarget
      ↓
    通知所有 DepthMaterialAware 材质：setRenderingDepth(true)
      ↓
    设置 scene.overrideMaterial = depthMaterial（不带 logdepthbuf）
      ↓
    渲染场景到临时 renderTarget
      ↓
    从深度纹理读取线性深度
      ↓
    恢复状态：
      - scene.overrideMaterial = null
      - 通知材质：setRenderingDepth(false)
      ↓
    返回深度值
} else {
    // 对数深度关闭：直接读取 DepthCopyPass 的结果
}
```

---

## 6. 技术背景

### 5.1 对数深度缓冲

**参考**：Three.js 源码中的 shader chunks

-   `/Users/wh/github/three.js/src/renderers/shaders/ShaderChunk/logdepthbuf_pars_vertex.glsl`
-   `/Users/wh/github/three.js/src/renderers/shaders/ShaderChunk/logdepthbuf_pars_fragment.glsl`

### 5.2 WebGL 深度读取

**参考**：WebGL 规范和文档

-   [WebGL Depth Textures](https://www.khronos.org/webgl/wiki/Handling_WebGL_Depth)
-   [Depth Buffer Precision](https://www.khronos.org/opengl/wiki/Depth_Buffer_Precision)

### 5.3 Postprocessing 架构

**参考**：`/Users/wh/github/postprocessing` 项目

---

**文档版本**：3.0  
**创建日期**：2025-02-03  
**说明**：只包含源码地址和已确认的事实，不包含分析和方案
