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
（I3DM 按实例求值）；卸载时自动恢复原材质并 dispose。

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
