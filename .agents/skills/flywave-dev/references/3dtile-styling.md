# 3D Tiles 样式（按 batch 属性样式化）

3D Tiles **不走**地图主题的 styleSet 解码管线（铁律 5 的体系），它有一套独立的
样式机制：数据源持有动态样式集，瓦片加载时按 batch 属性逐要素求值，用单个
TSL 材质（`B3DMBatchMaterial`）+ 顶点 `_BATCHID` 属性在一次 draw call 里完成
逐楼着色。

黄金示例：`@flywave/flywave-examples/src/3dtiles-animation/index.ts`。
机制源码：`@flywave/flywave-3dtile-datasource/src/theme/`（`Tiles3DStyleWatcher`
+ `BatchStyleProcessor`）。

## Style 结构（复用 protocol 的 Style 类型）

```typescript
const theme: Theme = {
    styles: {
        "3dtiles": [                              // key = 数据源的 styleSetName
            {
                id: "tier-0-15",                  // 可选，动态更新的句柄
                when: "Height >= 0 && Height < 15", // 布尔表达式，属性名 = batch table 列名
                technique: "tile3d",
                color: "#7EC8FF",                 // 单色；或 { from, to } + value(0~1) 渐变
                opacity: 1                        // 或 { from, to }
            }
        ]
    }
};
```

- `when`（`Theme.ts` 的 `Style.when?: string | JsonExpr`）：普通布尔表达式，
  `== != > < >= <= && || !`，字符串用单引号；属性名大小写敏感、必须与
  batch table 列名完全一致。HIERARCHY 扩展的继承属性也会展开进可引用属性。
  **不支持算术运算符**（`* + - /` 等不在文法里，写了会解析失败）。解析失败的
  `when` 走 **fail-closed**：该样式永不命中并打日志（2026-09-23 修复；此前
  解析失败会让样式无条件命中所有要素，静默染全部对象）。
- `Style.id`：可选；`addStyle` 会为无 id 的样式生成标识。

## 合并语义（写交互高亮的关键）

一个要素命中**多条**样式时按顺序合并，**后者覆盖前者**（`BatchStyleProcessor`
的 `mergeBatchStyles`）。因此：分级配色放前面，交互高亮类放最后，并用恒假
条件占位（`when: "0!=0"`），运行时改 `when` 实现单要素高亮/清除。

## 生效链路（改这块代码前理解）

theme 传播（`MapViewThemeManager` → `setThemeFromBase`）→
`TileRenderDataSource.setTheme` 创建 `Tiles3DStyleWatcher`（按
`styleSetName` 从 `theme.styles` 取样式集）→ 瓦片加载触发 `onTileLoaded` →
按 `batchId` 从 batch table 提取属性 → `getBatchStyle` 求值合并 →
`B3DMBatchMaterial.setBatchStyles(Map<batchId, style>)`。B3DM/I3DM 都支持
（I3DM 按实例求值）。**批材质首次激活时创建并套上，此后渲染路径上不再触碰**——
失活/复活/逐出/重解析都不翻动材质（见下方铁律）。`onTileUnloaded` 里的
"恢复原材质并 dispose" 是死代码（`ObserveTileChange` 对 uri 永久去重，
unload 通知实际到不了），行为上等于"一次套上，终身有效"。

## 数据源配置

```typescript
new CesiumIonDataSource({
    styleSetName: "3dtiles",                          // 必须与 theme key 一致
    customAttributeConfig: { batchIdAttributeName: "_batchid" }, // 按数据实际属性名
    accessToken, assetId
});
```
自建 tileset 用 `TileRenderDataSource({ url, styleSetName: "3dtiles", ... })`。

## 动态更新 API（TileRenderDataSource 上）

| API | 语义 |
|---|---|
| `addStyle(style)` | 追加；返回带生成 id 的样式 |
| `updateStyleById(id, Partial<Style>)` | 改 `when`/`color`/`opacity` 等；对所有已加载瓦片重算（材质 uniform 更新，不重建几何） |
| `removeStyleById(id)` | 移除 |

改完**必须 `mapView.update()`**（铁律 3，按需渲染）。

## 拾取联动（点击查属性 → 定向高亮）

```typescript
const picks = mapView.intersectMapObjects(x, y);       // PickResult[]
if (picks.length > 0 && picks[0].intersection) {       // intersection 是惰性字段（铁律 7）
    const props = dataSource.getBatchProperties(
        picks[0].intersection,                          // 直接传 intersection
        "_batchid"                                      // batch 属性名，默认 "_BATCHID"
    );
    dataSource.updateStyleById("selected", { when: `DOITT_ID == '${props.DOITT_ID}'` });
    mapView.update();
}
```
注意区分两种 undefined：`picks.length === 0` 是真 miss；`intersection` 为
undefined 可能只是惰性细节未就绪（GPU 拾取 + 相机已移动），别当 miss 处理。

## 铁律：批材质套上后渲染路径零操作（2026-09-23 三次踩坑定案）

**任何**在瓦片生命周期里"翻动材质"的操作都会触发全量管线重编译，高频路径
（相机移动引起的失活/复活每帧都在发生）直接表现成整屏卡顿。已实证的雷区：

- `material.needsUpdate = true` → 整条 pipeline dispose + 重建 + 着色器重编译
  （通用机制见 `postprocessing-vrm.md`「节点图重建很贵」，diff 再置位、低频才用）。
- 换 `mesh.material` / dispose+new 材质 / 重绑定作——同理。
- 贴图 `texture.needsUpdate = true` 只是重上传不重编译，但高频发生一样卡。

**机制（three@0.185.1 源码证据，three.webgpu.js）**：

1. 节点图与 WGSL 缓存在 **RenderObject** 上：`RenderObject._nodeBuilderState ||
   nodes.getForRender(this)`（≈:30015）。
2. stage 缓存按 **WGSL 字符串**键控：`programs.vertex.get(nodeBuilderState.vertexShader)`
   （≈:32318）；pipeline 缓存 key 含 stage id。
3. uniform 名嵌节点实例自增 id（`UniformNode.getHash → String(this.id)`）→
   **每次重新建图必然产出不同的 WGSL 字符串** → stage/pipeline 缓存结构性必
   MISS → 全量重编译。
4. `RenderObjects.get`：`material.version !== renderObject.version` 且 cacheKey
   变化 → `renderObject.dispose()` 整个丢弃重建（≈:30710）。

推论：**同配置的"新材质实例"也不会命中缓存**——省编译的唯一方式是根本不产生
新的建图，即材质套上后一根手指都不要动。

**三次踩坑史（均已回滚）**：v1 失活即 dispose、复活即重建；v2 保留实例但重
parse 时重建；v3 原地重绑（uniform 直改 + 贴图 image 移植）+ 拔除
`cached.materials` 别名。共同错误：把 `onTileUnloaded`"死代码"当成要修的 bug，
让失活/复活/重解析开始翻动材质。**原版行为是特性不是 bug**：uri 永久去重 =
"一次套上，终身有效"，这是该渲染管线下的性能护栏。

**正确修法（2026-09-23 落地）：逐出即遗忘**——`src/TilesRenderer.disposeTile`
通知观察者 `onTileDisposed(tile)`，观察者只清登记（去重 uri、批材质、features）。
效果：瓦片**重新解析后的首次激活**重新求值样式并对全新 mesh 套批材质（首次
挂载，编译一次，代价等同首载）；**激活/失活路径一行未动**，已挂材质依然零触碰。
顺带修掉 `m_appliedMaterials` 随逐出瓦片无界增长的泄漏。动手前仍应跑编译探针
（包装 `device.createRenderPipeline/createShaderModule` 每秒计数）验证稳态
`sync=0`。
