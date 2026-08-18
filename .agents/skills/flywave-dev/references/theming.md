# 主题与样式体系

协议定义：`@flywave/flywave-datasource-protocol/src/Theme.ts`（`Theme` 接口）。
参考主题：`@flywave/flywave-map-theme/resources/tilezen_base.json`。

## Theme JSON 顶层结构

| 字段 | 作用 |
|---|---|
| `extends` | 主题继承链（`ThemeLoader` 解析合并） |
| `clearColor` / `clearAlpha` | 清屏 |
| `lights` | 灯光配置 |
| `sky` | `GradientSky` / `CubemapSky`（平面模式的天空） |
| `fog` | 雾 |
| `atmosphere` | 大气系统配置（`AtmosphereThemeConfig`：云、镜头光晕等；球面投影下生效） |
| `definitions` | 变量 + 表达式定义，styles 里以 `$var` 引用复用 |
| `styles` | `Record<styleSetName, StyleSet>`——数据源按 styleSetName 取样式 |
| `textStyles` / `fontCatalogs` | 文本样式与字体资源 |
| `images` / `imageTextures` / `poiTables` | 图标/贴图/POI 表资源 |
| `priorities` / `labelPriorities` | 要素与标注的显示优先级 |
| `postEffects` / `toneMappingExposure` / `toneMappingMode` | 后期效果与色调映射 |

## Style 与 Technique

`Style` = 匹配条件（styleSet / layer / renderOrder 等）+ technique 名 + 参数。
约 20 种技法（全集见 protocol 的 `Techniques.ts`）：squares / circles / poi /
line / fill / standard / extruded-polygon / text / terrain / tile3d /
shader…。

关键机制：**数据源解码时按 StyleSetEvaluator 把要素匹配到 technique**——新
数据源必须在 theme 里准备 `styles["<你的styleSetName>"]`，否则没有可渲染的
东西（瓦片加载了但什么都不画）。

## Expr 表达式体系

Mapbox 风格：`["get", "$layer"]`、`["interpolate", ...]`。实现在 protocol 的
`Expr.ts` / `ExprEvaluator.ts` / `ExprParser.ts` / `operators/`。主题里所有
随 zoom/属性变化的量（颜色/宽度/透明度）都用 Expr 表达；`definitions` 定义
变量供复用；`ExprPool` 做求值缓存。

## 加载与修改 API（MapViewThemeManager）

`@flywave/flywave-mapview/src/MapViewThemeManager.ts`：

- `setTheme`：完整加载。**异步段**（images / styles / fontCatalogs / extends）
  只能走它；会清 tile cache 并通知所有数据源 `setThemeFromBase`。
- `patchTheme`：同步深合并，适合运行时小改（如开关 atmosphere）。
  **禁止**用它改异步段（铁律 8）。
- `getThemeSync` 等同步 API：theme 未加载完成时直接 throw。

## 改 Theme 结构的联动流程

`Theme.ts` → `theme.schema.json`（postinstall 的 `generate-json-schema`
用 typeconv 生成）。改结构的完整动作：改 `Theme.ts` → 重跑 schema 生成
（`pnpm install` 或手动）→ `pnpm docs` 重新生成 API 文档 → 检查
`tilezen_base.json` 是否要同步示例。

## 内联主题最小例（MapView 构造参数）

theme 可以是内联对象，不必是 URL（与顶层包包装版 MapView 搭配时资源会自动
解析）：

```typescript
new MapView({
    // ...
    theme: {
        atmosphere: { enabled: true, clouds: false, sunTime: ..., sunCastShadow: true }
    }
});
```

权威范例：`@flywave/flywave-examples/src/getting-started-basic-config/index.ts`。

## 工具

`flywave-theme-tools` 的 `flywave-theme-optimizer` CLI：解析 extends/include
并合并、扁平化、可 minify——发布前优化主题用。
