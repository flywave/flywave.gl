# 新示例模板

## 规则（webpack 按 glob 自动发现，无需注册）

- 目录：`@flywave/flywave-examples/src/<你的示例名>/`
- 必备：`index.ts`（入口）+ `config.ts`（元数据）+ `thumbnail.png`（缩略图）
- `config.ts` 的 `code` 取分类码，全集见
  `@flywave/flywave-examples/src/example-categories.ts`
- 描述字段中英成对（title/titleZh、description/descriptionZh）
- 复制本目录的 `index.ts` / `config.ts` 后补 TODO；
  权威参照：`src/getting-started-basic-config/index.ts`

## 固定流程（index.ts 的骨架顺序）

1. 取 canvas（id 必须是 `mapCanvas`）
2. `new MapView({ projection, target, zoomLevel, tilt, heading, canvas, theme })`
   —— 从 `@flywave/flywave.gl` 导入（聚合包，非各子包）
3. `new MapControls(mapView)` + 可选 `MapControlsUI`
4. 配置数据源（TODO）
5. `window.__mapView = mapView`（调试惯例）
6. 持久 3D 对象用 `mapAnchors.add` + `.anchor`（见 references/coordinates.md 范式 A）
