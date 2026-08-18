# 地形深度功能（开挖 / 刷高程 / 投影贴图 / 地层）

包：`@flywave/flywave-terrain-datasource`（聚合包全量 re-export）。四大功能
各有独立的 manager，全部从 terrainSource 上取：
`terrainSource.getGroundModificationManager()` /
`getProjectorOverlayManager()`。

⚠️ **文档陷阱**：该包 `README.md:200-270` 描述的
`GroundModificationManager.addModification(type, boundary, slopeWidth, ...)`
、kriging、`GroundModificationType` **在源码中不存在**——真实 API 是下面的
`HeightMapModifierManager` 与 `ProjectorOverlayManager`，以代码为准。

## 兼容性矩阵（先看这个再选型）

| 功能 | DEMTerrainSource | Quantized / CesiumWorld | QuantizedStratumSource |
|---|---|---|---|
| 地面修改（开挖/刷高程） | ✅ 实时 GPU 顶点位移（最佳） | ✅ 解码时烘 DEM + 回退 DEM 网格 | ⚠️ 有解码钩子，运行时 change 抛"未实现" |
| 投影贴图 ProjectorOverlay | ✅ | ❌ 材质无 projectorState | ❌ |
| 影像叠加 addWebTileDataSource | ✅ | ✅（最多 5 张 + uv transform） | ✅ |
| CSG 裁剪 clipTerrainMesh | 独立工具函数，任意 BufferGeometry | 同左 | 用 StratumClipRegion 替代 |

## 地面修改：HeightMapModifierManager（开挖 / 刷高程）

**模型：一块修改 = 一张高度纹理 + 一个 GeoBox（矩形）**。任意形状开挖靠
高度图 **alpha 通道做掩膜**。

```typescript
const manager = terrainSource.getGroundModificationManager();

// source: {type:"image", image: ImageData|canvas|ImageBitmap} 或 {type:"data", data, width, height}
// 注意 {type:"url"} 会直接抛错（不支持远程 URL 建纹理）
manager.addModifier("my-trench", { type: "image", image: imageData }, geoBox, "add");
//   heightOperation: "add"（叠加高差）| "replace"（按 alpha 混合替换）
manager.updateModifierTexture(id, dataTexture);       // 实时笔刷：直接换 GPU 纹理
manager.updateModifierHeightRange(id, min, max);      // 笔刷后手动更新高差（包围盒用）
manager.updateModifier(id, { enabled: false });       // 临时禁用
manager.removeModifier(id); manager.clear();          // 无内置 undo 栈，撤销 = remove
manager.getModifiedElevation(baseHeight, lon, lat);   // CPU 采样（拾取/高度查询）
```

**高度编码（三处必须一致的硬约定）**：RGBA8 纹理，RGB = mapbox
terrain-rgb 式 `(r*65536 + g*256 + b)/10 - 10000`（米），A = 掩膜权重。
参考实现：CPU 解码 `HeightMapModifierManager.ts`；笔刷编码
`flywave-heightmap-painter/src/utils/brushEngine.ts`；GPU 混合
`DEMTileMeshMaterial.ts` 的 `applyModifier`（add → `h + modH*alpha`；
replace → `mix(h, modH, alpha)`）。

**数据流**：DEM 路径纯 GPU（网格每帧比对 `manager.version` 懒刷新 uniforms，
零 tile 重载）；quantized 路径在 worker 里把修改器烘进 DEM（相交 tile 失效
重载，100ms debounce）。高程查询与包围盒都会计入修改（ElevationProvider /
ElevationRangeSource 走 manager）——**不会出现"看得见挖坑但拾取高度没变"**。

## 投影贴图：ProjectorOverlayManager

```typescript
const pm = terrainSource.getProjectorOverlayManager();
const id = pm.addLayer({ texture, geoBox, opacity: 1, blendMode: "normal" });
pm.updateLayer(id, { geoBox, texture, opacity });   // 改 geoBox 重算投影矩阵
pm.removeLayer(id); pm.clear();
```
- 原理：geoBox → 沿地表法线的正交相机投影矩阵，TSL 在 DEM 网格上采样
  （RTE 修正）。图片/canvas/视频纹理皆可。
- **上限 8 层**（TSL 编译期展开）；blendMode 声明了 multiply/add 但
  **着色器目前只实现 normal**；只支持矩形 GeoBox。
- **仅 DEMTerrainSource 可用**。

## 地层：QuantizedStratumSource（地质体可视化）

```typescript
const stratum = new QuantizedStratumSource({ url: "https://host/layer.json" });
mapView.setElevationSource(stratum);
```
- 数据：TileJSON 风格 layer.json + `.stratum` 二进制瓦片
  （`format: "stratum-mesh-1.0"`，extensions: materials/fault/borehole/
  collapse/section）。
- 要素：地层体（StratumLayer）、钻孔（Borehole）、剖面
  （StratumCrossSections）、断层、塌陷柱、体素；`StratumClipRegion
  { boundary: GeoCoordinates[] }` 多边形窗口裁剪（挖开地层看剖面）。
- 自带第二套笔刷类型（`StratumBrushType`：raise/lower/smooth/flatten/
  noise/erode），独立于 HeightMapModifier。

## CSG 裁剪：clipTerrainMesh

`clipTerrainMesh(clipers: QuantizedAreaCliper[], geometry, projection, center)`
（基于 three-bvh-csg）：`{ geoArea: GeoBox | GeoCoordinates[], topAltitude,
bottomAltitude }` 挤成垂直棱柱做布尔减——从地形网格凿洞/挖坑。
**边界**：侧面永远垂直（无边坡）、只有 SUBTRACTION、仓库内当前无调用方
（试验性工具）。

## 影像叠加与 HeightmapPainter

- 影像：`terrainSource.addWebTileDataSource(new ArcGISTileProvider({...}))`
  ——tiling scheme 不一致时自动跨瓦片拼接，每 provider 100 条 ImageBitmap LRU。
- 笔刷组件 `@flywave/flywave-heightmap-painter`（React）：
  `new HeightmapPainter({ mapView, terrainSource, container, mapControls })`；
  事件 `brushStart/Move/End`、`heightmapChange`、`export({imageData, geoBox})`；
  内部就是 `brushEngine.getTexture()` → `manager.updateModifierTexture()`——
  **不重建几何，靠 DEM shader 实时位移**。按住 Space 切换绘制模式。

## 黄金示例

| 示例 | 演示 |
|---|---|
| `examples/src/real-world-pumped-storage/` | 开挖+贴图全流程：纯代码生成 trench 高度图（距离场 + mapbox 编码 + alpha 衰减）→ addModifier → addLayer 贴图 |
| `examples/src/heightmap-painter/` | HeightmapPainter 标准接法（Cesium 地形 + export 事件回灌 modifier） |
| `examples/src/heightmap-overlay/` | 最短的手写 ImageData 高度图示例（quantized 地形也能用地面修改的证明） |
| `examples/src/getting-started-dem-terrain/` | 最小 DEM + 影像叠加 |

⚠️ `terrain-brush-modification/`、`terrain-tools/` 等旧示例目录只剩陈旧
`.d.ts` 残骸（无源码），**不要引用**——功能已被 heightmap-painter 取代。
