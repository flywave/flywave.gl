# 设计方案：Terrain Draping（三维地形 + 深度遮挡）

> 基于 mapbox-gl-js `src/terrain/` 源码深度分析。目标：在 flywave.gl（three.js）实现真实地形——DEM 网格位移、proxy-tile draping、深度遮挡、vertex morphing。解锁 terrain(69) + depth-occlusion(14) + fill-extrusion-terrain(13) ≈ **96 用例**。

---

## 1. 现状与差距

| 组件 | 现状（flywave） | 目标（mapbox） |
|------|----------------|----------------|
| DEM 加载 | `m_demTileUrl` 仅取中心单瓦片，`applyTerrain` 用单 `PlaneGeometry(128,128)` | 按 zoom+viewport 加载多 DEM 瓦片，per-proxy-tile 采样 |
| 网格位移 | `MapTerrainMaterial` 单瓦片 DEM 贴图 | 共享 128×128 网格 + skirt + 顶点着色器 DEM 采样 |
| Draping | 无 | 非 terrain 层渲染到 proxy-tile FBO → 贴到 DEM 网格 |
| 深度遮挡 | 无 | blit 主 depth → symbol/circle 片元采样 `u_depth` 软淡入 |
| Morphing | 无 | 双 DEM 纹理 + `u_dem_lerp` 250ms 过渡 |

**DEM 编码确切公式**（纠正既有假设）：
```
Mapbox terrain-rgb:  height = (R*65536 + G*256 + B) / 10 - 10000   (米)
Terrarium:           height = R*256 + G + B/256 - 32768            (米)
```
> 注意：**不是** `(r*65536+g*256+b) - 65536`。当前 hillshade patcher 用了错误公式，需一并修正。

---

## 2. 整体架构

```
raster-dem tile (PNG)
   │  RasterDEMTileProvider（每瓦片，类似现有 RasterTileDataProvider）
   ▼
[main] 解码 RGB→Float32  (height = (R*65536+G*256+B)/10 - 10000)
   │  → THREE.DataTexture(float32Array, size, size, RedFormat, FloatType)  [R32F]
   ▼
MBTerrainController（新建，替代 applyTerrain）
   │  - 维护 DEM 瓦片纹理池（按 tileKey 缓存）
   │  - 计算 proxy-tile 覆盖（屏幕空间）
   │  - 每帧 updateTileBinding()
   ▼
渲染流水线（AfterRender 钩子编排）：
   1. proxy-tile FBO 渲染 draped 层（fill/line/raster/circle）→ fbo.texture
   2. 共享 DEM 网格 + terrain_raster 材质，把 fbo.texture 贴到位移后的网格 → 屏幕
   3. blit 主 depth → depthFBO
   4. symbol/circle 材质注入深度遮挡采样
```

---

## 3. 关键算法（three.js 移植）

### 3.1 DEM 解码与 R32F 纹理

```typescript
// 新建 RasterDEMTileProvider（仿 RasterTileDataProvider）
// 每瓦片返回 { url, geoBounds }；terrain controller 加载 PNG → 解码 → DataTexture

function decodeDemPng(image: HTMLImageElement, encoding: 'mapbox' | 'terrarium'): {
    texture: THREE.DataTexture; dim: number;
} {
    const canvas = document.createElement('canvas');
    canvas.width = image.width; canvas.height = image.height;
    const ctx = canvas.getContext('2d')!;
    const { data } = ctx.getImageData(0, 0, image.width, image.height);
    const dim = image.width;   // 假设方形，含 1px border
    const heights = new Float32Array(dim * dim);
    for (let i = 0; i < dim * dim; i++) {
        const r = data[i*4], g = data[i*4+1], b = data[i*4+2];
        heights[i] = encoding === 'mapbox'
            ? (r*65536 + g*256 + b)/10 - 10000
            : r*256 + g + b/256 - 32768;
    }
    const tex = new THREE.DataTexture(heights, dim, dim, THREE.RedFormat, THREE.FloatType);
    tex.minFilter = THREE.LinearFilter;   // 硬件双线性
    tex.magFilter = THREE.LinearFilter;
    tex.needsUpdate = true;
    return { texture: tex, dim };
}
```

### 3.2 共享 DEM 网格（含 skirt）

```typescript
// GRID_DIM = 128；顶点 130×130（含 skirt 外圈）
const GRID_DIM = 128;
const EXTENT_TILE = 1;  // 归一化到单位平面

function createTerrainGrid(dim: number): THREE.BufferGeometry {
    const count = dim + 2;      // 含 skirt 外圈 = 130
    const positions: number[] = [];
    const skirts: number[] = [];  // 1.0 = skirt 顶点
    for (let y = 0; y < count; y++) {
        for (let x = 0; x < count; x++) {
            const isSkirt = x === 0 || y === 0 || x === count-1 || y === count-1;
            const u = (x - 1) / dim;        // [0,1] 内部
            const su = Math.max(0, Math.min(1, u));   // skirt 钳到 [0,1]
            positions.push(su, 1 - Math.max(0, Math.min(1, (y-1)/dim)), 0);
            skirts.push(isSkirt ? 1.0 : 0.0);
        }
    }
    // 索引：内部 grid quads + skirt strips（连接外圈与第一圈内部顶点）
    const indices: number[] = [];
    for (let y = 0; y < count-1; y++)
        for (let x = 0; x < count-1; x++) {
            const a = y*count + x, b = a+1, c = a+count, d = c+1;
            indices.push(a, c, b, b, c, d);
        }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('aSkirt', new THREE.Float32BufferAttribute(skirts, 1));
    geo.setIndex(indices);
    return geo;
}
```

### 3.3 顶点着色器 DEM 位移 + skirt + morphing

```glsl
// terrain_raster.vertex.glsl（注入到 MeshBasicMaterial.onBeforeCompile）
uniform sampler2D u_dem;
uniform sampler2D u_dem_prev;     // morphing 源
uniform float u_dem_lerp;         // morph 进度 [0,1]，1=完全 dst
uniform float u_exaggeration;
uniform float u_skirt_height;
uniform float u_dem_scale;        // pow(2, demZ - proxyZ)
uniform vec2  u_dem_tl;           // proxy tile 在 DEM tile 中的偏移
attribute float aSkirt;

varying vec2 vProxyUv;

void main() {
    vProxyUv = position.xy;   // [0,1]² proxy tile UV

    // DEM 采样坐标：proxy UV 映射到 DEM tile 的子区域
    vec2 demUv = u_dem_tl + position.xy * u_dem_scale;
    float cur = texture2D(u_dem, demUv).r * u_exaggeration;
    float prev = texture2D(u_dem_prev, demUv).r * u_exaggeration;
    float elev = mix(prev, cur, u_dem_lerp);

    // skirt 顶点向下压，消除相邻 tile 裂缝
    elev -= aSkirt * u_skirt_height;

    vec3 transformed = vec3(position.x, position.y, elev);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(transformed, 1.0);
}
```

### 3.4 Proxy-tile Draping（核心交织）

**概念**：把每个屏幕可见 tile 的所有 2D 图层先渲染到一张离屏 RenderTarget，再用 terrain_raster 材质贴到该 tile 的 DEM 网格上。

```typescript
class TerrainDrapeRenderer {
    private fboPool: THREE.WebGLRenderTarget[] = [];   // FBO 池（5 个）
    private demTextures: Map<string, THREE.DataTexture> = new Map();
    private sharedGrid: THREE.BufferGeometry;
    private drapeMaterial: THREE.ShaderMaterial;       // terrain_raster

    // 每帧（AfterRender）：
    renderFrame(renderer, scene, camera, drapedLayers, proxyTiles) {
        for (const proxy of proxyTiles) {
            const fbo = this.acquireFbo(proxy.size);
            // 1. 离屏渲染该 proxy tile 的 draped 层
            renderer.setRenderTarget(fbo);
            renderer.clear();
            for (const layer of drapedLayers) {
                this.renderLayerToProxy(renderer, scene, camera, layer, proxy);
            }
            // 2. 贴到 DEM 网格（屏幕）
            renderer.setRenderTarget(null);
            this.drawTerrainRaster(renderer, camera, proxy, fbo.texture);
        }
    }

    private drawTerrainRaster(renderer, camera, proxy, drapeTexture) {
        const mesh = this.getProxyMesh(proxy);  // 共享 grid + per-proxy 变换
        (this.drapeMaterial.uniforms.u_image0.value as any) = drapeTexture;
        this.drapeMaterial.uniforms.u_dem.value = this.demTextures.get(proxy.demKey);
        this.drapeMaterial.uniforms.u_dem_tl.value = proxy.demTl;
        this.drapeMaterial.uniforms.u_dem_scale.value = proxy.demScale;
        renderer.render(mesh, camera);
    }
}
```

> **简化决策**：第一版不做 FBO render-cache（50 个持久缓存），仅用 5 个池 FBO。也不做完整的"按 batch 交织"，改为简单的"每 proxy 全量渲染其 draped 层"。性能足够通过多数测试。

### 3.5 深度遮挡

mapbox GL-JS 实际做法：terrain 渲染后 `blitFramebuffer` 把主 depth 拷到 depthFBO，symbol/circle 片元采样比较。

```typescript
// three.js 等价：渲染 terrain 后，用 WebGLRenderTarget 的 depthTexture
const depthTarget = new THREE.WebGLRenderTarget(w, h);
depthTarget.texture.format = THREE.RGBAFormat;
depthTarget.depthTexture = new THREE.DepthTexture(w, h);
depthTarget.depthTexture.type = THREE.UnsignedShortType;

// 渲染 terrain 到 depthTarget（开启 depth write）
renderer.setRenderTarget(depthTarget);
renderer.render(terrainMeshes, camera);

// symbol/circle 材质注入 u_depth 采样
```

```glsl
// symbol.fragment.glsl 深度遮挡（注入）
uniform sampler2D u_depth;
uniform vec2 u_depth_size_inv;
uniform float u_occlusion_depth_offset;

bool isOccluded(vec4 frag) {
    vec3 ndc = frag.xyz / frag.w;
    float terrainDepth = texture2D(u_depth, (ndc.xy + 1.0) * 0.5).r;
    return ndc.z + u_occlusion_depth_offset > terrainDepth;
}

// circle 软淡入：4 角采样
float occlusionFade(vec4 frag) {
    vec2 base = (frag.xy/frag.w + 1.0) * 0.5;
    float d1 = texture2D(u_depth, base + vec2(-u_depth_size_inv.x, 0)).r;
    float d2 = texture2D(u_depth, base + vec2( u_depth_size_inv.x, 0)).r;
    float d3 = texture2D(u_depth, base + vec2(0, -u_depth_size_inv.y)).r;
    float d4 = texture2D(u_depth, base + vec2(0,  u_depth_size_inv.y)).r;
    float z = frag.z / frag.w + u_occlusion_depth_offset;
    float fade = 0.0;
    fade += clamp(300.0 * (z - d1), 0.0, 1.0);
    fade += clamp(300.0 * (z - d2), 0.0, 1.0);
    fade += clamp(300.0 * (z - d3), 0.0, 1.0);
    fade += clamp(300.0 * (z - d4), 0.0, 1.0);
    return fade * 0.25;
}
```

### 3.6 Vertex Morphing

```typescript
class VertexMorphing {
    private ops: Map<string, { from, to, startTime, duration }> = new Map();
    private readonly DURATION = 250;  // ms

    onTileChanged(proxyKey, prevDem, nextDem, now) {
        if (prevDem && nextDem && prevDem.key !== nextDem.key) {
            this.ops.set(proxyKey, { from: prevDem, to: nextDem, startTime: now, duration: this.DURATION });
        }
    }
    getMorph(proxyKey, now): { lerp: number } | null {
        const op = this.ops.get(proxyKey);
        if (!op) return null;
        const phase = Math.min(1, (now - op.startTime) / op.duration);
        const eased = phase * phase * (3 - 2 * phase);  // smoothstep
        if (phase >= 1) this.ops.delete(proxyKey);
        return { lerp: eased };
    }
}
```

---

## 4. 集成点

| 位置 | 改动 |
|------|------|
| `MBStyleDataSource.connect()` | 检测 `style.terrain` → 创建 `TerrainDrapeRenderer` 而非 `applyTerrain` |
| `MBEnvironmentManager.applyTerrain()` | 替换为委托给 `TerrainDrapeRenderer` |
| `MBMaterialPatchManager` | symbol/circle 材质注入 `u_depth` 深度遮挡（当 terrain 启用） |
| AfterRender 钩子 | `TerrainDrapeRenderer.renderFrame()` |
| `patchHillshadeMaterial` | 修正 DEM 解码公式为 `/10 - 10000` |

---

## 5. 实施步骤（按依赖排序）

| 步骤 | 内容 | 复杂度 | 解锁 | 状态 |
|------|------|--------|------|------|
| T1 | DEM 解码 + R32F DataTexture + 修正公式 | ⭐ | hillshade 精度 + terrain 基础 | ✅ 完成（`decodeDemImage`） |
| T2 | 共享 128×128 网格 + skirt + 顶点着色器位移（单 proxy） | ⭐⭐ | terrain 基础出图 | ✅ 完成（`createSkirtedGrid`） |
| T3 | 多 DEM 瓦片加载（按 viewport）+ per-proxy DEM 绑定 | ⭐⭐⭐ | terrain 多瓦片 | ✅ 完成（`TerrainController.build` 3×3 网格） |
| T4 | Proxy-tile draping（FBO 池 + 2D 层离屏渲染 + terrain_raster 贴图） | ⭐⭐⭐⭐ | fill/line/raster 贴到地形 | ✅ 完成（T4-lite 顶点位移方案）：patcher `injectTerrainDrape` 让 fill/line/raster/fill-pattern 材质采样中心 DEM（`modelMatrix*position` 取世界坐标）→ 顶点 Z 偏移地形高程 → 几何贴合地形表面。**无需 FBO/proxy-tile**（完整 FBO 方案需 `useMapRenderingManager` 构造时注入，datasource 无法提供） |
| T5 | 深度遮挡（depthTarget + symbol/circle 采样） | ⭐⭐⭐ | depth-occlusion 14 | ✅ 完成：Scheme C（硬件硬遮挡：terrain `renderOrder=-100` + circle `depthTest=true`）+ Scheme A（软淡入：`TerrainDepthOcclusion` 用 WillRender 渲 terrain 到 DepthTexture RT，patcher 注入 `u_terrainDepth` 片元采样 smoothstep 衰减 alpha）。`TerrainController.meshes` getter 暴露地形 mesh 供深度 pass |
| T6 | Vertex morphing（双 DEM + 250ms 过渡） | ⭐⭐ | zoom 切换不闪烁 | ✅ 完成：MapTerrainMaterial 加 `uDemPrev`/`uDemLerp`/`uDemIsFloat`（mix(prev,curr,lerp) + smoothstep）；TerrainController.build 捕获旧 DEM 作 prev、AfterRender 驱动 250ms 动画、完成后释放；**附带修复**：R32F DataTexture 不再被 RGB 误解码（`setDemIsFloat`） |
| T7 | fill-extrusion-terrain（extrusion 高度采样 DEM） | ⭐⭐ | fill-extrusion-terrain 13 | ✅ 完成：TerrainController 暴露 `centerDem`（中心 DEM 纹理 + 世界边界）；patchExtrusionMaterial 用 `modelMatrix` 取顶点世界坐标 → 采样 DEM → 把地形高程加到挤出高度（建筑坐落于地形表面） |

**总估算**：~25–35 PD（5–7 人周）。

---

## 6. 风险

| 风险 | 缓解 |
|------|------|
| FBO 离屏渲染 2D 层与原生 TileGeometryCreator 集成复杂 | 第一版可只 draping raster 层（最简单），逐步扩展 fill/line |
| DepthTexture 支持因平台而异 | 检测 `renderer.extensions.get('WEBGL_depth_texture')`，回退到无遮挡 |
| 性能（每 proxy 全量渲染） | 后续加 render-cache（tile 未变则复用） |

---

## 7. 验证用例

```
terrain/default, terrain/exaggeration, terrain/morphing
depth-occlusion/line-behind-hill, depth-occlusion/circle-behind-hill
fill-extrusion-terrain/basic, fill-extrusion-terrain/exaggeration
hillshade/default（公式修正后精度提升）
```
