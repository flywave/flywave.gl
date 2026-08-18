# 顶层聚合包 @flywave/flywave.gl（对外使用核心）

**全仓唯一发布到 npm 的包**（`publishConfig.access: public`，其余包全部
`private: true`）。外部用户只通过它消费引擎——引擎侧的任何公开能力最终都要
落到这个包的出口上。改这里或影响这里时，按本文检查。

## 什么时候必须动这个包（引擎侧 checklist）

| 你做了什么 | 顶层包的对应动作 |
|---|---|
| 任何子包新增/变更公共 API | `src/index.ts` 加/改 re-export，跑 `pnpm docs` |
| 新增解码型数据源 | `src/DecoderBundleMain.ts` 注册 DecoderService（铁律 5 的最终落点） |
| 新增主题资源/字体/draco | webpack 资产配置（`@flywave/flywave-webpack-utils` 的 `createAssetsConfig` 消费面） |
| 改了 three 相关导出 | 确认 `window.THREE` 挂载（`src/index.ts` 开头）与 externals 兼容 |

## 包内三块核心

- **`src/index.ts`**：re-export 面（mapview、mapview-decoder、各数据源、
  protocol、geoutils、utils 等）+ 用 `three/webgpu` 挂 `window.THREE` +
  **包装版 `MapView`**（自动注入 `mapAssetsUriResolver`，ready 后配置
  imageLoader）——外部用户应使用这个 MapView，不是 mapview 包里的裸类。
- **`src/BundleMain.ts`**：`mapBundleMain()` 处理 decoder worker 接线——
  `DEFAULT_DECODER_SCRIPT_URL = "flywave-decoders.js"`，假设 decoder 脚本与
  主 bundle 同目录（压缩版主包自动配压缩版 decoder），经
  `mapAssetsUriResolver.resolveUri` 解析后 hook
  `ConcurrentDecoderFacade.getWorkerSet`。**找不到脚本时的报错信息就在这里**，
  外部工程"瓦片不解码"问题先查这一环。
- **`src/DecoderBundleMain.ts`**：worker 侧入口，启动
  `VectorTileDecoderService` / `GeoJsonTilerService` /
  `TerrainTileDecoderService`。新解码服务漏注册 = 静默失败。

## 构建产物（scripts: tsc / build / prepare / build-typings / debug）

- **双格式主包**（webpack）：`dist/flywave.gl.module.js`（ESM，exports 的
  `import`）+ `dist/flywave.gl.cjs.js`（CJS，`require`）。
  three / three-webgpu / three-tsl 全部 **external**——消费方自带 three，
  版本兼容是接入约束。
- **decoder worker bundle**：`dist/flywave-decoders.js`（webworker target，
  入口 `DecoderBundleMain.ts`），exports 子路径 `./decoder`。
- **类型**：`build-typings` = tsc + api-extractor 滚平成单文件
  `dist/flywave.d.ts`（bundledPackages 见包内 `api-extractor.json`）。
- exports 映射：`.`（import/require/types）、`./decoder`、`./package.json`。

## 外部应用接入指引（回答"怎么用"时的标准答案）

1. **最小接入**：`import { MapView, MapControls, sphereProjection, ... }
   from "@flywave/flywave.gl"`——用聚合包，不要让用户直接依赖内部子包；
   配 `MapControls` 与数据源的固定流程见
   `assets/example-template/index.ts`。
2. **decoder worker**：确保 `flywave-decoders.js` 被部署到主 bundle 同目录
   （默认约定），或在数据源构造时显式传 `concurrentDecoderScriptUrl`。
   自建 webpack 工程可直接用 `@flywave/flywave-webpack-utils`：
   `createDecoderConfig`（产出 worker bundle）+ `createAssetsConfig`
   （拷贝 map-theme 资源、字体、draco）。
3. **资源解析**：包装版 MapView 的 `mapAssetsUriResolver` 免配置解析
   主题/字体/图标/decoder 脚本；完整的解析链、`FLYWAVE_BASE_URL` 配置矩阵
   与三种部署模式见 `references/asset-paths.md`。
4. 参考实现：`@flywave/flywave-examples`（webpack.config.ts 基于同一套
   webpack-utils，就是"外部工程"的样板）。

## 发布链路

- lerna independent 版本；git tag → **手动触发** `publish.yml` workflow →
  `lerna publish-from-git` → GitHub Release。
- 发布前确认：`build` + `build-typings` 通过、`pnpm docs` 已重新生成、
  新公共 API 已进 re-export 面。
- 注意：仓库 CI 无 PR/push 自动测试（详见
  `references/testing-workflow.md`），发布质量靠本地验证。

## 排障速查

| 症状（外部工程） | 检查点 |
|---|---|
| 瓦片加载了但永不解码（无报错） | `flywave-decoders.js` 不在主 bundle 同目录 / Service 未注册进 DecoderBundleMain；worker 加载失败是静默挂起（默认 10s 超时且无兜底报错） |
| decoder 脚本打到 unpkg CDN | `BundleMain.ts` 的 URL 解析顺序：`window.FLYWAVE_BASE_URL` → webpack `DefinePlugin` 的 `FLYWAVE_BASE_URL` → 兜底 CDN——内网/离线环境必须显式配置前两者之一 |
| 一切正常但某数据源仍不解码 | 依赖树里存在**重复的 @flywave/flywave-mapview 实例**（`mapBundleMain` 钩子打到 A 份、数据源用 B 份 facade），`pnpm why` 查重 |
| 类型缺失或滚动冲突 | `dist/flywave.d.ts` 未重建（build-typings）；消费方 three 版本与 externals 不兼容 |
| 主题/字体/图标 404 | 资产未随部署拷贝（createAssetsConfig）；mapAssetsUriResolver 被覆盖错 |
| window.THREE 相关调试失效 | `src/index.ts` 的 THREE 挂载是否被 tree-shake / 改动 |
| 验证 URL 解析问题的快速手段 | 数据源构造时显式传 `concurrentDecoderScriptUrl` 指向确定可 200 的地址——能解码即锁定 URL 解析问题 |
