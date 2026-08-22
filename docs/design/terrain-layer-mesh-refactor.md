# DEM 地形「层×瓦片」渲染重构设计

> 状态：已定稿，实施中（分支 `feature/terrain-layer-mesh`）
> 范围：仅 DEM 路径（`DEMTerrainSource` / `@flywave/flywave-terrain-datasource/src/dem-terrain/*`）。
> quantized / CesiumWorld / Stratum 的影像叠加是另一套材质体系，本次不动。

## 1. 背景与问题

WebGPU 下 mesh 与材质是紧密绑定的渲染资源，绑定（bind group）必须稳定。当前 DEM 地形
渲染是「一个 tile 一个 mesh + 一个材质实例处理多张贴图」：

- `DEMTileMeshMaterial` 所有实例共享模块级单例 TSL 节点图（`s_nodes`），per-tile 数据
  （DEM 高度图 + 最多 5 张影像 + uv transform + modifier + 8 槽投影层）全部通过
  `onObjectUpdate` 每帧从 mesh 对象上捞取。
- 后果一：bind group 每帧可能重绑。源码中已有实证——`DEMTileMeshMaterial.ts` 的
  WORKAROUND 注释记录了 vertex-only 纹理绑定在 LOD 分裂后出现 stale binding（整块
  地形高程错乱），靠 fragment 阶段乘 0.0001 采样一次强制 VERTEX|FRAGMENT 可见性绕过。
- 后果二：影像槽位（5）与投影层数（8）是 TSL 编译期展开写死的上限。
- 后果三（现存 bug，重构顺手修复）：
  1. `HeightMapTileLoader.loadTileMeshImpl` 新建路径在多 provider 循环里覆盖
     `tile.cachedMesh`，只缓存最后一个 mesh；
  2. 复用路径所有 provider 轮流调 `setupImageryTexture`，而该方法每次先清空全部
     纹理槽——多影像源时 tile 重建后只有最后一个 provider 可见（丢层）；
  3. `TerrainSource.removeWebTileDataSource` 移除后不触发任何刷新。

## 2. 已确认的设计决策

| 决策点 | 结论 |
|---|---|
| 材质共享 | **绝不共享材质实例**：每 (tile, layer) 一个材质实例 + 静态纹理/uniform 绑定；节点结构一致 → WGSL 一致 → pipeline cache 命中，无编译爆炸 |
| 影像与地形 tiling scheme 不一致（多张拼接瓦片） | **每张拼接瓦片一个 mesh**，不做 CPU 合成 |
| 叠加层（第二张起的影像、投影贴图）光照 | **unlit decal**：贴图 × 不透明度直接叠色，transparent + NormalBlending + depthWrite=false |
| 改动范围 | 仅 DEM 路径 |

## 3. 目标模型

```
Tile (TerrainResourceTile)
 ├─ base mesh      ── 共享几何 + DEMTileLayerMaterial(base 变体)
 │                    1 张影像(或纯色兜底) · lit · 写深度 · receiveShadow · 可拾取
 └─ overlay meshes ── 同一共享几何 + 各自材质实例
      ├─ 影像层：每 provider 每张拼接瓦片一个 mesh（tile UV × uvTransform 变体）
      └─ 投影层：每相交 projector layer 一个 mesh（世界投影矩阵变体）
      全部 unlit decal · depthWrite=false · renderOrder=层序 · raycast 置空
```

- **base 层渲染图像**：第一影像 provider 的贴图作为 albedo 受光；无 provider 时退化为
  纯色但仍写深度（拾取 / 相机碰撞 / overlay 深度测试依赖它存在）。
- **无 z-fight**：同几何 + 同位移代码 → 深度逐位相同，`LessEqualDepth` 下 overlay 全通过。
- **overlay 省 4 次顶点纹理采样**：不算法线（unlit）。
- **换贴图零重建**：材质纹理节点 value 换引用即可，mesh 缓存不动，不触发重编。

## 4. ProjectorOverlayManager 并入卫星图缓存体系

### 4.1 现状对比

| | 卫星图（WebImageryTileProvider） | 投影贴图（现状） |
|---|---|---|
| 数据来源 | `ResourceProvider` 子类，`getTile()` → `resourceManager[uuid]` 缓存 | 游离于资源管线外，8 槽 `ProjectorState` 全局单例 |
| tile 感知 | 每 tile 有资源（含祖先回退） | 无 per-tile 概念，所有 tile 每帧采样全部 8 槽 |
| 变更传播 | 加载完 → `updateTileOverlays()` 重建 | 纯每帧轮询 |

### 4.2 改造设计

```
TerrainSource
 ├─ m_materialProviders: WebImageryTileProvider[]     ← 卫星图（不变，public API 保留）
 └─ m_projectorOverlayManager
      ├─ layers: Map<id, ProjectorLayer>              ← 保留，纯层注册表
      ├─ provider: ProjectorImageryProvider           ← 新增，extends ResourceProvider
      │    getTile(tileKey) → 同步求值（无网络）:
      │      entries = layers.filter(geoBox ∩ tileGeoBox)
      │                .map({layerId, texture, matrix, opacity, blendMode})
      │      → ProjectorTileResource
      └─ _sync()/ProjectorState/8 槽采样循环 → 删除
```

1. **走同一条资源管线**：`ProjectorImageryProvider extends
   ResourceProvider<ProjectorTileResource>`，`register(this)` 时机与 web provider 一致；
   `minLevel=0 / maxLevel=∞` 使资源天然落在 tile 自身（投影层与分辨率无关，无祖先回退语义）。
2. **资源即相交层快照**：`getTile` 是纯 CPU geoBox 相交计算，立即 resolve，但仍走
   `enqueueTileLoadingTask → resourceManager.setResource → updateTileOverlays` 同一链路。
   `getBytesUsed()→0`（纹理归用户/manager 所有，如实上报不虚报）；`disposeResources()`
   只丢引用不 dispose 用户纹理（所有权差异在类型注释写死）。
3. **变更传播复用现成 geoBox 过滤**：add/remove/geoBox 变更 → affectedBox =
   union(旧, 新) → `updateTileOverlays(affectedBox)` → 只驱逐相交 tile。
   纯 uniform 变更（opacity / 矩阵微调）零重建。
4. `MAX_PROJECTOR_LAYERS=8` 上限自然消失；`blendMode`（normal/multiply/add）在各自
   材质 shader 内真正实现，保持 NormalBlending 避免排序坑。
5. **遍历统一**：loader 内 `getWebTileDataSources().forEach` 改为
   `getLayerProviders()`（web providers + projector provider）；对外
   `getWebTileDataSources()` 签名不动。

### 4.3 RTE 每帧修正的归属

`cameraPos` 从「每 tile 读 state」改为**每 source 一个共享 `Vector3` 实例**，所有投影层
材质的 uniform 节点包裹同一实例；`attachToMapView` 的 WillRender 监听保留。投影矩阵同理：
`ProjectorLayer.matrix` 实例被该层所有 tile 材质 uniform 直接包裹引用——updateLayer 重算
矩阵后无需 tile 重建。纹理/blendMode 变更走 affectedBox 重建（mesh 缓存命中，代价极小）。

## 5. Mesh 缓存规则（完整规范）

### 5.1 存储结构

```
TerrainResourceTile
  _layerMeshes: Map<layerKey, { mesh, kind, sourceKey }>   ← 取代单槽 _cachedMesh
     "base"                          → lit 基座 mesh
     "web:<providerUuid>:<i>"        → 卫星图层 mesh，i = 拼接瓦片序号
     "proj:<layerId>"                → 投影层 mesh
  tileUniforms: TerrainTileUniforms  ← per-tile 共享 uniform 实例集
```

### 5.2 资源所有权

| 资源 | 归属 | 缓存位置 | 释放时机 |
|---|---|---|---|
| 几何 | 全局共享（`TileGeometryBuilder` 按 `level/row` 缓存） | geometry builder | 永不 per-tile 释放（拆除现 `HeightMapTerrainMesh.dispose()` 里的 `geometry.dispose()` 地雷） |
| 影像纹理 | provider（`textureCache` LRU 100） | WebImageryTileProvider | LRU 驱逐，与 tile 无关 |
| 投影纹理 | 用户/manager | 不缓存 | 用户自管，引擎只引用 |
| 材质 | 每 (tile, layer) 独占实例，绝不共享 | `_layerMeshes` | 层消失或 tile 被地形 LRU 驱逐时 dispose |
| mesh | 每 (tile, layer) 一个 | `_layerMeshes` | 同上（geometry 不动） |

### 5.3 生命周期规则

1. **创建**：只发生在 `loadTileMeshImpl`，仅两个触发口——tile 新建（mapview cache miss）
   与 `updateTileOverlays` 驱逐后重建。重建时 `_layerMeshes` 命中即不新建 mesh 不新建材质。
2. **复用（不高频创建的保证）**：layerKey 已存在 → 只改材质 uniform 引用（换更高级影像
   = 换 texture value；uv transform 重算拷贝）。mesh 数量仅在层集合变化时增减。
3. **每帧更新下沉为 per-tile 单点**：`TerrainTileUniforms` 每 tile 一份，持有
   `patchPos0-3 / demUnpack / heightMapPos / texSize / skirtHeight / projectionFactor /
   modifier*` 等实例 + DEM 纹理句柄。所有层材质的 uniform 节点包裹这些同一实例——
   `onBeforeRender` 里的投影插值 / modifier version 检查每 tile 执行一次写入 holder
   即全体层可见。modifier 多 modifier CPU 合并纹理从 per-mesh 提升为 per-tile 一份。
4. **DEM 纹理更新**：tile 级操作——遍历该 tile 层材质 set 纹理 value（材质私有绑定，
   WebGPU 下绑定稳定）。
5. **移除**：`loadTileMeshImpl` diff——新层集合 vs `_layerMeshes` keys，消失的 → dispose
   材质、删条目；geometry/纹理永不在此释放。`removeWebTileDataSource` 补全量
   `updateTileOverlays()`（修 bug 3）。
6. **驱逐**：地形 LRU `dispose(true)` → dispose 该 tile 全部层材质 + 清 map +
   `resourceManager.dispose()`。mapview 侧 `ShadowTerrainResourceTile` 三个
   shouldDispose 全 false 不动。
7. **顺序与深度**：`tile.objects = [base, …影像层(注册序), …投影层(id 序)]`，renderOrder
   = 序号；base 写深度（LessEqual、raycast 正常、receiveShadow）；overlay
   `depthWrite=false, depthTest=true, raycast 置空, castShadow=false`。

### 5.4 触发矩阵

| 事件 | 范围 | 动作 |
|---|---|---|
| 更高级 DEM 祖先到达 | 该 tile | 各层材质换 height 纹理（mesh 复用） |
| 影像 tile 到达 | 该 tile | 对应层换纹理/uvTransform（mesh 复用） |
| `addWebTileDataSource` / remove | 全部 tile | 全量 diff 重建 |
| projector add/remove/geoBox 变更 | 相交 tile | affectedBox 过滤重建 |
| projector opacity / 矩阵微调 | 零重建 | 共享实例直写 |
| 相机移动（RTE）/ 投影切换动画 | 每 tile 每帧 | 写 tileUniforms + 共享 cameraPos |
| 地形 LRU 驱逐 | 该 tile | 全部层材质 dispose |

## 6. 材质三变体

新文件 `dem-terrain/DEMTileLayerMaterial.ts`，共用顶点位移代码（现 `positionNode` 逻辑：
DEM 采样 + modifier + patchPos/projectionFactor 插值 + skirt）：

| 变体 | 采样 | 光照/深度 |
|---|---|---|
| base | tile UV × uvTransform，1 张影像（无影像纯色兜底） | lit、写深度、receiveShadow、可拾取 |
| overlay | 同上，UV 出界 alpha=0 | unlit decal、transparent + NormalBlending、depthWrite=false、不算法线 |
| projector | `positionWorld + cameraPos(RTE)` × 正交投影矩阵 | 同 overlay |

所有纹理/uniform 是材质自己的静态节点（构造时绑定）；彻底去掉静态数据的
`onObjectUpdate`。

## 7. 诚实代价

draw call 从 1/tile → N/tile，overlay 全几何 overdraw、顶点位移重复计算。换来：绑定
稳定（WORKAROUND 可复核移除）、层数无上限、每层独立混合模式、修 3 个丢层/缓存 bug。

## 8. 实施阶段

- **Phase 1 影像层（核心）**：新建 `DEMTileLayerMaterial` 三变体；mesh 参数化；loader
  diff 式重建；`_layerMeshes` 多层缓存；修 3 个 bug；`DEMTileMeshMaterial` 标记 deprecated。
- **Phase 2 投影层**：`ProjectorImageryProvider` + `ProjectorTileResource`；manager 改
  层注册表 + affectedBox 传播；删 `ProjectorState` / `MAX_PROJECTOR_LAYERS`。
- **Phase 3 清理**：删 `defaultDEMTileMeshMaterial` / 5 槽数组死代码；复核 WORKAROUND；
  更新 skill 文档兼容矩阵；核对聚合包 re-export 与 `pnpm docs`。

## 9. 验证

1. `pnpm --filter @flywave/flywave-terrain-datasource test`
2. `pnpm start` 目检：`getting-started-dem-terrain`（单影像）、
   `real-world-pumped-storage`（开挖 + 投影全流程）、临时双 provider + 混 tiling scheme
3. `pnpm prettier && pnpm eslint`；公共 API 导出面变化 → `pnpm docs`
