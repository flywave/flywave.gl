# 资源路径配置与解析链

主题、字体、图标、天空盒贴图、decoder worker 脚本——这些相对 URI 在运行时
到底解析成什么 URL，由一条固定的链决定。本文全部按源码核实（含一处
**注释与代码不一致**的陷阱）。

## 一条相对 URI 的旅程

```
相对 URI（theme 字符串 / theme 内 extends、sky 贴图 / decoder 脚本名）
  → mapAssetsUriResolver.resolveUri()            （@flywave/flywave.gl/src/BundleMain.ts）
  → baseResourceUrl 三态（见下表）
  → 最终 URL（http(s) 绝对地址永远直通，不参与解析）
```

`mapAssetsUriResolver` 是单例（`BundleMain.ts` 导出），由**聚合包包装版
MapView** 注入到三个消费端：

1. **`MapViewOptions.uriResolver`** → ThemeLoader 用它解析 theme URL 与
   主题内子资源；
2. **`imageLoader`**（`ready` 后 configure，解析 GLTF 纹理）；
3. **decoder/tiler worker 脚本 URL**（`mapBundleMain()` 钩住
   `ConcurrentDecoderFacade`/`ConcurrentTilerFacade` 的 `getWorkerSet`）。

直接用 `@flywave/flywave-mapview` 裸类（不走聚合包）= 没有这些注入，
资源全靠自己解析。

## baseResourceUrl 的真实优先级（源码核实）

⚠️ 曾有一处注释与代码不符（注释声称 window → DefinePlugin → network 的
优先级），2026-08 已把 `BundleMain.ts` 注释改为如实描述代码。实际逻辑
（`baseResourceUrl` getter）：

| 运行时配置 | base 取值 | 效果 |
|---|---|---|
| 什么都不配（`FLYWAVE_BASE_URL` falsy：未定义/空串） | 硬编码 `https://unpkg.com/@flywave/flywave.gl@latest/dist` | **默认打 CDN**。能跑（包已发布、dist 含资源），但依赖外网、`@latest` 版本漂移、离线必挂 |
| bundle 加载前 `window.FLYWAVE_BASE_URL = "/my/"`（HTML 里先设） | window 值 | 自托管资源 |
| DefinePlugin 定义 truthy 值 + 未设 window | `undefined` | `resolveUri` 原样返回 → **页面相对解析**（资源相对当前页面 URL） |
| DefinePlugin truthy + window truthy | window 值 | window 优先 |

三个附注（都踩过才知道的）：

- 模块加载副作用：`if (!window.FLYWAVE_BASE_URL) window.FLYWAVE_BASE_URL = ""`
  （`BundleMain.ts` 尾部）——所以 bundle 之后再设 window 变量**太晚**。
- DefinePlugin 定义空串 `""` 是 falsy → 仍然走 CDN。想要页面相对模式必须给
  truthy 值。
- `FLYWAVE_BASE_URL` 在源码消费（如 examples 的 alias）下是自由变量，运行时
  查 `window.FLYWAVE_BASE_URL`；只有 DefinePlugin 才是编译期替换。

`resolveUri` 语义：绝对 `http(s)` 直通；有 base → 去掉 URI 前导斜杠、base 补
尾斜杠后拼接；无 base → 原样返回。

## 主题内子资源的合成管道（ThemeLoader）

`ThemeLoader.resolveUrls`：先 `uriResolver.resolveUri(theme)` 得到 theme.url；
主题内部引用（`extends` 基主题、sky cubemap 六面贴图等）用
`composeUriResolvers(uriResolver, new RelativeUriResolver(theme.url))`——
**管道式**（`flywave-utils/src/UriResolver.ts`：先过 mapAssetsUriResolver，
再相对 theme.url 解析；绝对 URL 在第二段直通）。

推论：CDN 模式下 theme 从 unpkg 加载，其 extends/贴图也全部落 CDN；
页面相对模式下则相对主题文件所在目录。

## decoder / tiler worker 脚本

`DEFAULT_DECODER_SCRIPT_URL = "flywave-decoders.js"`；base 以 `.min.js`
结尾时自动换用 `.min.js` 版 decoder。解析失败时的 console.error 出自
`getActualDecoderScriptUrl`。数据源可显式传 `concurrentDecoderScriptUrl`
覆盖（排查 URL 问题的快速手段）。

## 不经过 mapAssetsUriResolver 的：数据源自己的数据 URL

`DEMTerrainSource` 的 `source.json`、瓦片 URL 模板、GeoJSON URL 等由
DataProvider **直接 fetch**（已核实 terrain 包无 resolveUri 调用）——页面
相对或绝对，与你传什么有关。examples 里 `"dem_terrain/source.json"` 能工作
是因为 examples 的 resources 拷到了 dist 根。

## 资源清单与部署样板（examples webpack.config.ts 的拷贝规则）

| 资源 | 来源 | 部署位置 |
|---|---|---|
| 主题 JSON、示例数据（dem_terrain 等） | `@flywave/flywave-examples/resources` | dist 根（`resources/...`） |
| 字体/图标/天空盒/大气贴图 | `@flywave/flywave-map-theme/resources` | `dist/resources/` |
| draco 解码器 | three 的 draco 库 | `dist/resources/libs` |
| harp 字体资源 | fontcatalog | `dist/resources/fonts` |

聚合包的发布构建同样用 `createAssetsConfig` 把资源打进 `dist/`——这是
unpkg CDN 兜底能工作的前提。**新增主题资源后记得过这条拷贝链**。

## 外部工程三种配置模式

| 模式 | 配置 | 适用 |
|---|---|---|
| A. CDN 免配置 | 什么都不做 | 原型验证；不建议生产（外网 + @latest 漂移） |
| B. 自托管 | HTML 里 bundle 之前 `window.FLYWAVE_BASE_URL = "/assets/flywave/"`，把 npm 包 `dist/` 内容（含 resources、flywave-decoders.js）拷过去 | 生产推荐 |
| C. 页面相对 | DefinePlugin 给 truthy 值（如 `"."`）且不设 window；资源随页面部署 | 资源与页面同源的工程 |

自建 webpack 工程直接抄 `@flywave/flywave-examples/webpack.config.ts`
（`createDecoderConfig` + `createAssetsConfig` + CopyWebpackPlugin 规则）。

## 排障速查

| 症状 | 检查点 |
|---|---|
| 主题/字体 404，URL 打到 unpkg | 默认 CDN 模式：内网/离线环境改用模式 B/C |
| 改了 window.FLYWAVE_BASE_URL 没生效 | 设晚了——必须在 bundle 加载前（模块副作用已置 `""`） |
| DefinePlugin 配了空串还是走 CDN | 空串是 falsy；页面相对模式需要 truthy 值 |
| theme 内 extends/贴图 404 | 看合成管道：它们跟随 theme.url 的解析结果，不是页面相对 |
| 字体/图标 404 但主题正常 | 资源没进部署目录（拷贝链缺），或 base 指向的目录里没有 resources/ |
| 数据 404 但主题正常 | 数据源 URL 不走 resolver——检查传给 DataProvider 的路径相对页面是否正确 |

## 改这块代码时

- 注释已对齐实际行为；**改 resolver 逻辑时必须同步更新 getter 上方的优先级
  注释**，不要让两者再次漂移。
- 任何 resolver 行为改动，用 Network 面板过滤主题/字体/decoder 请求实测
  三种模式。
