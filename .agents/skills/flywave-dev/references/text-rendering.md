# 文本与标注渲染

文本是独立于场景图的第二条渲染管线：Worker 解码产出
`textGeometries/poiGeometries`（protocol 的 `DecodedTile`）→ 主线程
`TileGeometryCreator` 生成 `TextElement` → `placeText` 做屏幕碰撞放置 →
内部正交相机用 `TextCanvas`/`PoiRenderer` 单独绘制（`MapView.render()` 的
场景渲染之后）。**任何文字问题先看本文排障清单。**

核心文件：`@flywave/flywave-mapview/src/text/`（TextElementsRenderer、
TextStyleCache、Placement、TextElementBuilder）、`src/poi/`（PoiManager、
PoiTableManager、PoiRenderer）；字体：`@flywave/flywave-text-canvas`。

## 放置机制（决定文字可见性的规则）

- `placeText` 只在 `renderLabels && !pointOfView` 时执行——**外部相机模式
  （pointOfView）下所有 label 直接跳过**。
- 放置前早筛：`visible` → PoiTable 已加载 → **zoom 裁剪**
  （`min/maxZoomLevel`；注意 `zoomLevel === maxZoomLevel` 也判不可见）→
  距离裁剪（`maxDistance * 0.99`）→ 去重（同 featureId 或同文本 + 空间容差）。
- 屏幕碰撞：`ScreenCollisions` 按 priority **降序**放置，先 persistent 后
  new（受 `maxNumVisibleLabels` 限制）；路名底条（blockingElements）优先占屏。
- 图标/文本连带：非 `iconIsOptional` 时图标被拒 → 文本也被拒（反之亦然）。
- 过载保护：可见 label > 20000 时进入限时模式（每帧放置 10ms / 新增 ≤100），
  移动相机期间文字变少是此机制，静止后补全。

## Theme 结构

```typescript
theme = {
    fontCatalogs: [{ name: "fira", url: "fonts/Default_FontCatalog.json" }],
    defaultTextStyle: { color: "#6D7477", fontCatalogName: "fira" },
    textStyles: [{ name: "smallSign", ... }],          // 被 technique.style 引用
    images: { maki: { url: "maki_icons.png", atlas: "maki_icons.json" } },
    poiTables: [{ name: "poiMasterList", url: "poi_table_maki.json" }],
    styles: {
        "my-ds": [                                     // key = 数据源 styleSetName
            { technique: "text", when: ...,
              attr: { text: ["get", "name"], size: 14, priority: 50, style: "smallSign" } },
            { technique: "labeled-icon", when: ...,
              attr: { text: ["get", "name"], imageTexture: "cafe", iconScale: 1 } }
        ]
    }
};
```

- technique 名：`"text"`（TextTechnique）、`"labeled-icon"`（PoiTechnique）、
  `"line-marker"`（道路 shield，+ `shieldGroupIndex`/`minDistance`）。
- 高频字段：`priority`（默认 0，越高越先占屏）、`mayOverlap/reserveSpace`、
  `fadeNear/fadeFar`、`distanceScale`、`min/maxZoomLevel`、POI 专属
  `text/iconMin|MaxZoomLevel`（独立裁剪）、`text/iconIsOptional`、
  `poiTable + poiName(+Field)`、`imageTexture(+Field/Prefix)`。
- 文本取值链（`getFeatureText`）：technique `text` 表达式 → `label` →
  `name:short` → `iso_code` → **`name:$lang`（按 `mapView.languages` 顺序）**
  → `name`。
- **patchTheme 不能改** `textStyles/fontCatalogs/images/poiTables`（异步段，
  铁律 8）——必须 `setTheme`。

## FontCatalog（字体）

- theme 里 `fontCatalogs[].url` 走与主题相同的解析链
  （`mapAssetsUriResolver` + 相对 theme URL，见
  `references/asset-paths.md`）。
- glyph 按 Unicode Block **懒加载**（`FontCatalog.loadCharset`），中文字形
  不在 `Default_FontCatalog` 里是常态。
- **字形缺失 = 静默丢弃整条 label，无任何日志**（`FontCatalog.getGlyphs`
  返回 undefined）。诊断开关：
  `mapView.textElementsRenderer.showReplacementGlyphs = true`（缺字显示 "?"）。
- catalog 加载失败：只 `logger.error` + `info: rendering without font
  catalog, only icons possible`，地图其余正常。

## PoiTable（图标查表）

technique 带 `poiTable` 时按 feature 字段值查表，可**覆盖**
iconName/visible/priority/zoom 范围。参照
`@flywave/flywave-map-theme/resources/poi_table_maki.json`：多数条目
`iconMinLevel: 18`——**zoom < 18 时这些 POI 图标和文字根本不出现**（最高频
的"文字不显示"原因之一）。表加载中 → label 推迟（NotReady）。

## MapView API

```typescript
mapView.renderLabels = false;              // 总开关
mapView.languages = ["en", "zh"];          // name:$lang 回退顺序
mapView.addOverlayText([textElement]);     // 程序化文字（屏幕归一化坐标 0..1）
mapView.clearOverlayText();
mapView.textElementsRenderer               // @hidden 全量入口（pickTextElements/waitLoaded/...）
```
没有公开的 per-tile addTextElement API；瓦片级是 `Tile.addTextElement`
（需拿到 tile）。文字拾取：`intersectMapObjects` 结果的
`PickObjectType.Text/Icon`。

## 排障清单：「文字为什么不显示」（按管线顺序）

1. `pointOfView` 外部相机模式 → label 全跳过。
2. styleSet 不匹配：数据源 `styleSetName` 在 theme `styles` 里没有含
   text/labeled-icon technique 的规则 → 解码器根本不产文本几何（worker 侧
   就没了）。
3. feature 没有 `name`（且 `name:$lang` 系列全空）→ 无文本可放。
4. **FontCatalog 404**：控制台找 `Failed to load FontCatalog`；检查 URL
   相对解析（`FLYWAVE_BASE_URL`，见 asset-paths.md）。
5. **字形缺失静默失败**：开 `showReplacementGlyphs` 看 "?"。
6. **zoom 裁剪**：technique / PoiTable 的 min/maxZoomLevel（maki 表默认 18-20）。
7. priority 太低 + 屏幕被占满；或过载模式限时。
8. 距离淡出：`fadeFar`、`maxDistance * 0.99` 裁剪。
9. 图标连带拒绝：`imageTexture` 名不在 atlas JSON 段里 + 非 iconIsOptional。
10. `delayLabelsUntilMovementFinished` 开着 → 移动中不新增 label。
11. 调试：`collisionDebugCanvas`（画碰撞框）、
    `textElementsRenderer.loading / waitLoaded()`（字体是否就绪）。

## 黄金示例

| 示例 | 演示 |
|---|---|
| `examples/src/features-text-icons/` | 最完整的地图文本+图标（labeled-icon/text technique、FeaturesDataSource + styleSetName 对应） |
| `examples/src/text-styling-dynamic/` | TextCanvas/FontCatalog 底层直用（不经 MapView），GUI 动态改字体样式 |
| `@flywave/flywave-map-theme/resources/` | tilezen_base.json（textStyles/fontCatalogs 写法）、poi_table_maki.json、maki_icons atlas |
