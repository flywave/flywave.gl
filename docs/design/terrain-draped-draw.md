# 贴地绘制（线/面）设计方案

状态：设计定稿待评审
关联：`terrain-layer-mesh-refactor.md`（贴图层基建）、Cesium `GroundPolylinePrimitive` /
`GroundPrimitive` 源码分析（2026-08）

## 1. 目标

在 flywave.gl（three/webgpu + TSL）上实现交互式贴合地面绘制：

- **线**：任意折线/自由手绘，屏幕空间恒定线宽，像素级贴合地形，不穿模不悬空
- **面**：多边形填充 + 描边，填充随地形起伏，边界锐利
- 不依赖 CPU 高程采样；地形 LOD 流式加载期间保持正确
- 可被 draw-controls 的绘制交互直接驱动

## 2. 选型结论与被否路线

| 路线 | 结论 | 原因 |
|---|---|---|
| CPU 高程插值（顶点贴地） | 否 | 地形渲染面是三角网，弦高误差（30m 间距、30° 坡 → 米级偏差）导致必然穿模；消除需顶点密度爆炸 |
| 正交矩阵投影 decal | 否（已删除） | 与 base 表面深度冲突（见 `3d39ac7e` 提交说明），仓库已统一走 tile-UV 模式 |
| 幕帘体积 + 深度反投影（线） | **采纳** | Cesium 验证过的方案，WebGPU 下可砍掉其大部分兼容包袱 |
| 光栅化纹理 + tile-UV overlay（面填充兜底） | 备用 | 保留为超大区域填充的低成本路线；主路线与线统一走深度重建 |

## 3. 总体架构

```
组件 A：地表分类 prepass（MRT：深度 + 表面类型 id）
组件 B：贴地线 = 幕帘体积几何 + TSL 深度反投影材质
         （Cesium GroundPolyline 的 WebGPU 移植）
组件 C：填充面 = earcut 棱柱体积 + 同一 FS 判定（与线统一）
         兜底 = tile-UV overlay（超大区域）；描边 = 组件 B 闭合跑一圈
全程无 stencil（Cesium 两处 stencil 职责分别被解析判定与 MRT 类型通道取代）
```

## 4. 组件 A：地表分类 prepass（深度 + 表面类型）

### 现状

`ViewRenderManager.getDepthTexture()`（`ViewRenderManager.ts:575`）已返回主 pass RT 的
depthTexture，outline 特效已在消费。但主 pass 把整个场景（含幕帘网格自身）渲进同一
RT——幕帘材质在 pass 内采样它属于同帧写读回环，不可用。

### 设计：专用 prepass，MRT 双输出

每渲染帧在主 pass 前：

1. 用主相机（RTE 相机，投影矩阵一致）把可见地表对象渲进独立 RT，TSL `mrt()`
   双输出：
   - attachment 0：`DepthTexture`
   - attachment 1：表面类型 id（地形瓦片=1，3D Tiles=2）
2. 地形对象从 `VisibleTileSet` 取；overrideMaterial 仅写深度+类型（无着色开销）
3. 随按需渲染自然停更（无动画帧不执行）

表面类型 id 取代 Cesium stencil 的目标掩码职责（区分贴地形还是贴 3D Tiles），
且是任意宽度通道——未来可扩展为 layerId，实现"只贴某路瓦片源"。Cesium stencil
的另一职责（体积内外标记）本方案不需要：按三角形建几何后 FS 解析判定（见 5.2、6）。

备选（原型期可用）：直接采上一帧 `getDepthTexture()`。相机静止时完美，
移动中有 1 帧滞后边缘伪影——用于打通管线，不作为最终形态。

### 输出契约

```ts
interface SurfaceClassificationProvider {
    readonly depthTexture: THREE.DepthTexture | null;
    readonly surfaceTypeTexture: THREE.Texture | null; // R=类型 id
    readonly projectionMatrix: THREE.Matrix4; // 与 prepass 一致
    readonly cameraNearFar: { near: number; far: number };
}
```

## 5. 组件 B：贴地线（核心）

### 5.1 几何：幕帘体积（移植 Cesium GroundPolylineGeometry）

折线细分后每段 8 顶点、36 索引（左/右 × 上/下 × 前/后对）。属性布局照搬 Cesium：

| 属性（vec4 × 5） | 内容 |
|---|---|
| startHiAndForwardOffsetX | 起点 RTE 高位 + 前向偏移 x |
| startLoAndForwardOffsetY | 起点 RTE 低位 + 前向偏移 y |
| startNormalAndForwardOffsetZ | 起 miter 平面法线 + 前向偏移 z |
| endNormalAndTexcoordNormX | 终 miter 平面法线 + s 归一化（符号编码左右侧别） |
| rightNormalAndTexcoordNormY | 右平面法线 + t 归一化（>1 编码底顶点） |

体积垂直跨度：取覆盖线段的**已加载 DEM 瓦片实际 min/max 高程**（比 Cesium 全球预编译表
更紧、体积更小）；无数据时回退 [-11000, 9000]。锐角 miter 断裂阈值沿用 30°/150°。

生成时机：Worker 或主线程 CREATE 任务组；编辑中增量重算最后一段。

### 5.2 TSL 材质

VS：

1. `czm_computePosition` 等价物：RTE 高低位合成 positionEC（仓库本就全程 RTE，铁律 1 天然满足）
2. `metersPerPixel(positionEC)` 移植为 TSL 节点 → 把像素宽度换算成米沿 miter 法线展开
   （Cesium VS 同款公式）
3. 底部顶点向下挤 `min(地形最低高程, geometricTolerance×距离)` 防 z-fighting

FS（核心判定，Cesium PolylineShadowVolumeFS 的直译）：

```wgsl
depth = texture(surfaceDepth, screenUV);          // 组件 A attachment 0
type  = texture(surfaceType, screenUV).r;         // 组件 A attachment 1
if (depth == clear) { discard; }                  // 天空
if (type 与本线配置的目标不符) { discard; }          // TERRAIN / TILES / BOTH
terrainEC = unproject(screenUV, depth);           // 反投影到 RTE 眼空间
if (abs(planeDist(rightPlane, terrainEC)) > halfWidthMeters) { discard; }
if (planeDist(startPlane) < 0 || planeDist(endPlane) < 0) { discard; }
s,t 由三平面距离恢复 → 材质取色（纯色/渐变/虚线样式）
```

### 5.3 渲染状态与已知风险

- 只画背面（防双绘）、不写深度、预乘 alpha 混合——照搬 Cesium
- **无 stencil**：Cesium stencil 的两个职责分别被取代——体积内外标记由按三角形
  几何 + FS 解析判定消灭；地形/3D Tiles 目标区分由 prepass 表面类型通道承担（MRT）
- **深度钳制风险**：WebGPU 无 GL_DEPTH_CLAMP。幕帘穿近/远平面时会被裁剪。
  缓解：DEM 实际 min/max 让体积很紧 + 相机远时体积整体在锥内。P1 用极端俯仰角
  场景专项验证；不达标再用 WGSL 写 gl_FragDepth 方案兜底

## 6. 填充面：棱柱体积（与线同一套机制）

主路线——统一到深度重建：

1. 多边形 earcut 三角剖分 → 每个三角形竖直拉伸成棱柱 [该区域 minH, maxH]
2. 棱柱顶点携带本三角形三顶点坐标属性
3. FS 与线共用核心：采 prepass 深度+类型 → 反投影地形点 → 类型过滤 →
   对"本三角形"做 3 次半平面内外测试 → 在内上色 : discard

关键差异点（相对 Cesium GroundPrimitive）：Cesium 按实例批量几何、片元无法得知
自身所属三角形，被迫用 stencil 正背面计数做体积内外标记；我们按三角形建几何、
顶点进属性，判定退化为解析式，stencil 整体免除。

优势：与线单一心智模型、编辑即改即见、无分辨率天花板、半透明填充由管线正常混合。

已知瑕疵与对策：相邻棱柱共享边可能双覆盖像素导致半透明描边加深——填充三角化
时内缩半个像素当量，或对 alpha ≤ 阈值取 max 而非相加。

兜底路线——tile-UV overlay（保留）：超大区域填充时，Canvas 光栅化 +
`ProjectorOverlayManager.addLayer()`（`3d39ac7e` 后保留层生命周期 + 资源管线，
材质统一 tile-UV × uvTransform）纹理采样成本更低。

已知缺口（接受）：quantized 中间块降级期间贴图暂缺（`3d39ac7e` 已注释），精确网格
到达后恢复。绘制工具场景用户正盯着目标区，影响窗口极短。

## 7. 拾取

GPU pick 在 FS 判定通过后才写 pick id——discard 天然剔除幕帘体积的误命中，
拾取结果即"画在地形上的可见部分"，无需额外逻辑。CPU 射线路径（若用）单独按
中心折线 vs 地形表面求交，不走幕帘几何。

## 8. 仓库铁律对照

- RTE：反投影与平面方程全部在同一 RTE 帧内闭环，输出前平移回 geo（铁律 1）
- 持久化：绘制对象走 MapAnchor，绝不挂场景根（铁律 2）
- 交互中每次编辑/相机变更调 `mapView.update()`（铁律 3）
- prepass 属渲染管线改动，落 ViewRenderManager，TSL only（铁律 6）

## 9. 分阶段落地

| 阶段 | 内容 | 验收 |
|---|---|---|
| P0 | 组件 A prepass + TerrainDepthProvider | demo：全屏 quad 采深度重建地形轮廓 |
| P1 | 幕帘几何生成器 + TSL 材质，单条折线贴地 | 山地斜坡折线各视角不穿模不悬空 |
| P2 | 接 draw-controls 自由手绘、miter/断头处理 | 手绘流畅、转角正确 |
| P3 | 填充光栅化 + overlay 接入 + 边界描边组合 | 面+描边一体成型 |
| P4 | 批量化（多线合批）、半分辨率深度调优 | 性能达标 |

## 10. 风险清单

1. WebGPU 下 DepthTexture 采样语法/格式（depth24plus vs r32float）需 P0 首验
2. TSL `mrt()` 在 prepass（overrideMaterial）下的多目标输出配置——P0 与风险 1 一并验证
3. 深度钳制缺失：WebGPU 无 GL_DEPTH_CLAMP，幕帘穿近/远平面会被裁剪。
   缓解：DEM 实际 min/max 让体积很紧；不达标再用 WGSL 写 gl_FragDepth 兜底
4. 半分辨率深度的边缘锯齿——线宽 < 2px 时可能露馅，回退全分辨率即可
5. quantized 中间块贴图缺口（已接受，见第 6 节兜底路线说明）

## 实证结论（2026-08-24 定版）

- 深度语义：`MapView` 开启 `reversedDepthBuffer`，three 将其实现进投影矩阵本身。
  重建必须**直接使用采样深度 + pass 后快照的 `projectionMatrix.invert()`**，
  禁止任何手动 `1 - d` 翻转（会双重翻转导致全灭）。
- 体积跨度：对应 Cesium `minTerrainHeight/maxTerrainHeight`。竖向跨度必须覆盖
  路径地形包络，否则栅格化裁剪显示区域；纯示例与引擎均验证。
- 带宽锚定：半宽在顶点阶段按体积自身 `|z|·mpp` 求出后以 varying 插值；
  绝不能用重建点距离换算（远山 mpp 膨胀 → 远景泄漏）。
- 混合约定：`CustomBlending(One, OneMinusSrcAlpha)` 要求**预乘 alpha**
  （rgb 先乘 mask），否则被拒像素以加性方式漏色。
- 相机入体/掠射角加固：
  - `DoubleSide + depthTest=false + depthWrite=false`：相机穿入体积仍正确；
  - 推距分母做保号幅度钳制 `sign(d)·max(|d|,1e-3)`，杜绝退化角度下顶点爆炸；
  - `frustumCulled=false`、`renderOrder=2` 保证任意视角不剔除、混合顺序正确；
  - 天空剔除走捕获**类型纹理**（globe 尺度下清除深度阈值不可靠）。
- 共享片元组装层（fragmentContext/buildDrapedColorNode）曾破坏幕帘路径，
  幕帘现内嵌纯净参考实现；prism 路径继续使用共享层（已验收）。
- 高程基准：DEM `getHeight` 与渲染位移存在区域性系统差（实测 ~+200m），
  DEM 仅可用于起伏/跨度，绝对高度须另行标定或由用户给定。
