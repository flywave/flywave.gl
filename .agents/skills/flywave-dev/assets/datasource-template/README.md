# 新数据源模板（路线 A：TileDataSource + Worker 解码）

四件套骨架，API 形状与真实源码一致（`TileDataSource` 构造签名、
`TileDecoderService.start` 注册模式均已核对）。这不是可直接编译的成品——
TODO 处按权威参照补齐。

## 使用步骤

1. 复制本目录 4 个 `.ts` 到目标包（新建包参考 SKILL.md 包拓扑：底座之上、
   依赖 mapview；或放进现有数据源包）。
2. 全局替换：`Xxx` → 你的类名前缀；`xxx` → 小写名（数据源 name、
   styleSetName、serviceType 字符串）。
3. 补齐 TODO。**权威参照**（以它们为准，import 路径有出入时照抄参照文件）：
   - 解码器与服务：`@flywave/flywave-vectortile-datasource/src/VectorTileDecoder.ts`
   - 数据提供者：`@flywave/flywave-vectortile-datasource/src/OmvRestClient.ts`
   - 数据源装配：`@flywave/flywave-geojson-datasource/src/GeoJsonDataSource.ts`
     （最薄的现成范例）
4. **注册 Worker 服务**（漏了 = 静默连不上，铁律 5）：
   `@flywave/flywave.gl/src/DecoderBundleMain.ts` 加
   `import { XxxDecoderService } from ...; XxxDecoderService.start();`
5. theme 加 `styles["xxx"]`（见 `../../references/theming.md`；
   模板 `@flywave/flywave-map-theme/resources/tilezen_base.json`）。
6. 挂载与验证：`mapView.addDataSource(new XxxDataSource({...}))`；
   `pnpm --filter <pkg> test` + `pnpm start` 目检。
7. 导出链：包 `src/index.ts` → 需要对外则 `@flywave/flywave.gl/src/index.ts`
   re-export → `pnpm docs`。

## 文件清单

| 文件 | 运行线程 | 职责 |
|---|---|---|
| `XxxDataProvider.ts` | 主线程 | 按 TileKey 拉原始数据（不做解码） |
| `XxxDecoder.ts` | **Worker** | 原始数据 + StyleSet → DecodedTile |
| `XxxDecoderService.ts` | **Worker** | 向 WorkerServiceManager 注册解码服务 |
| `XxxDataSource.ts` | 主线程 | 组装 TileFactory + Provider + Decoder |
