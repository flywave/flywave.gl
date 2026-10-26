# flywave.gl v2 —— 引擎能力盘点与 flywave-examples 示例体系重设计规划

> 文档版本：v2.0（2026-10-26）
> 范围：全引擎功能模块清单、代码规范审计结论、flywave-examples 现状盘点、**使用者关注点覆盖矩阵**、v2 示例体系完整设计（48 个示例，**不含 MVT 矢量瓦片示例**）、开源数据服务策略、实施路线图。
> 基线：当前分支 `feature/webgpu-support`，聚合包 `@flywave/flywave.gl@0.0.11`，three 0.185.1（WebGPURenderer + TSL）。
> v2.0 修订：数据策略改为"开源数据服务优先 + 离线保底"；新增使用者视角覆盖矩阵；示例标注 P0/P1/P2 优先级；明确引擎不具备的能力（热力图/聚合/视域）不进示例承诺。
> v2.1 修订：**按范围决策，MVT 矢量瓦片渲染不进 v2 示例**（vectortile-datasource 能力保留，接入走文档），连带取消 OpenFreeMap 数据源与 OMT 主题 JSON 交付物；示例总数 49 → 48。
> v2.2 修订（执行期决策）：**internal 分类取消**——调试/归档页对开发者完全不可见：cloud-render、cloud-textures-preview、test-frustum-geobox、test-renderobject-leak 直接删除；real-world×6、ssr-reflection、terrain-memory-visualizer 移至 `@flywave/flywave-examples/archive/`（不打包不导航不可达）；webpack 入口规则收紧（顶层仅 example-browser/codebrowser，示例目录必须有 config.ts，杜绝 common/token-config 等基础设施被当成页面）。终态 **45 个公开示例**。

---

## 第一部分：引擎功能模块全景（已完成能力清单）

### 1.1 架构总览

flywave.gl 是基于 **three/webgpu**（`WebGPURenderer` + TSL 节点材质，可 `forceWebGL` 回退 WebGL2）的 3D 地图引擎，monorepo 共 36 个 `@flywave/*` 包 + 1 个聚合发布包。四个技术支柱：

1. **按需渲染**：MapView 不常驻 rAF，视觉状态变更后调 `update()`，动画/挂起更新存在时才持续渲染。
2. **双相机 / RTE 坐标系**：geo 世界坐标相机 + relative-to-eye 渲染相机，规避地球尺度浮点精度丢失；GPU 深度/拾取结果消费前必须平移回 geo 帧。
3. **场景图每帧重建**：场景根每帧清空重挂可见瓦片；持久对象走 `MapAnchor`。
4. **数据与渲染分离**：Web Worker 解码（DataProvider → ITileDecoder → 纯 ArrayBuffer），主线程帧外创建 three 几何。

依赖方向：`datasource-protocol` ← `geoutils`/`utils` ← `mapview` ← 各数据源/控件 ← `flywave.gl`（唯一发布出口）。

### 1.2 功能模块清单（按层，含成熟度）

成熟度标记：✅ 稳定（有测试/实机验收）｜🟢 可用（功能完整，测试覆盖一般）｜🟡 实验性/类型保护弱｜🔧 仅内部调试用途。

#### 底座层（12 包，无 @flywave 运行时依赖）

| 模块 | 包 | 能力 | 成熟度 |
|---|---|---|---|
| 日志/任务调度 | flywave-utils | LoggerManager、TaskQueue 组优先级队列、URI resolver 链、协程分片 | ✅ |
| LRU 缓存 | flywave-lrucache | 瓦片缓存内核（容量/逐出回调/尺寸度量） | ✅ |
| 传输管理 | flywave-transfer-manager | JSON 去重、并发 16 上限、503 退避重试 | ✅ |
| 坐标/投影 | flywave-geoutils | GeoCoordinates/GeoBox/GeoPolygon、Mercator/TransverseMercator/SphericalEquirectangular 投影族、TileKey 莫顿码四叉树、FrustumTester | ✅ |
| 几何内核 | flywave-geometry | 三角化（earcut/CDT）、Weiler-Atherton 裁剪、跨反经线 wrap、地形适配细分、BVH 拾取加速 | ✅ |
| TSL 材质库 | flywave-materials | 瓦片填充/线/图标/SDF 圆点/大气地表材质、fading/extrusion/shadow mixin | 🟡（8 文件 @ts-nocheck） |
| 粗线渲染 | flywave-lines | 线三角化、高精度（RTE 免抖）线/点对象、虚线帽/接头 | 🟢 |
| SDF 文字 | flywave-text-canvas | 字形图集、排版（含 RTL/阿拉伯文）、TextCanvas/FontCatalog/TextStyle | 🟢 |
| 协议层 | flywave-datasource-protocol | Theme/FlatTheme 模型、Expr 表达式引擎、Technique 联合、DecodedTile、Worker 消息协议 | ✅ |
| 大气/效果库 | flywave-atmosphere | 物理大气/天空/云/CSM/星月 + Bloom/TAA/SMAA/镜头光晕/AGX 调色等 TSL 效果库 | 🟡（66 文件 @ts-nocheck） |
| 解码底座 | flywave-mapview-decoder | DataProvider/TileDataSource 基类、Worker 服务框架、ThemedTileDecoder | ✅ |
| 主题资源 | flywave-map-theme | 纯资源包（tilezen 主题 13 份、11 字族字体、11 个 LUT 预设、云/月/星空纹理） | ✅ |

#### 核心层

| 模块 | 包 | 能力 | 成熟度 |
|---|---|---|---|
| 地图视图 | flywave-mapview | MapView 生命周期/按需渲染循环、四叉树 LOD + 可见瓦片集 + LRU、双相机 RTE、GPU/CPU 拾取、主题管理（setTheme/patchTheme）、合成层（MapRenderingManager 多 pass + MSAA + VRM TSL 节点图）、相机动画族、高程源、MapAnchor 持久对象、18 个事件 | ✅ 核心；vrm/effects 子目录 🟡 |

核心能力细分（对外 API 面已固化，见 `docs/docs/api/` 机器生成文档）：

- **渲染后端**：WebGPU 优先 + WebGL2 回退；反转深度缓冲；MSAA（静/动态采样）；dynamicPixelRatio 移动降采样；synchronousRendering 外置循环。
- **相机**：lookAt/flyTo/flyToBounds（linear/bow 曲线）、CameraPanAnimation/RotationAnimation/KeyTrackAnimation + Builder、相机-地形碰撞、动态 FOV、min/maxZoomLevel、geoMaxBounds。
- **瓦片调度**：tileCacheSize、maxVisibleDataSourceTiles、quadTreeSearchDistance、extendedFrustumCulling、tileWrapping、mixed LOD、clip planes 评估器族、lockVisibleTileSet。
- **主题**：Theme/FlatTheme、extends 继承链、Expr 表达式（match/case/step/interpolate 全家）、setTheme（异步段唯一入口）/patchTheme（同步深合并）、languages/politicalView、setDynamicProperty 动态样式变量。
- **拾取**：GPU 深度+稠密 pickId O(1) 拾取（enableGpuPicking）、CPU raycast、PickResult 惰性细节、feature-state CRUD、enablePickTechnique。
- **高程**：setElevationSource、ElevationProvider（getHeight/sampleHeight/raycast/getDisplacementMap）、ElevationRangeSource。
- **技术参数动态化**：technique 数值/颜色参数均为 `DynamicProperty<T> = T | JsonExpr | InterpolatedPropertyDefinition<T>`（已验证 `TechniqueParams.ts:110`）——即**按属性表达式（`["get","height"]`）与缩放插值样式开箱可用**，是"3D 柱状图/分级设色"类示例的技术基础。

#### 数据源层（7 个解码/渲染型数据源）

| 模块 | 包 | 能力 | 成熟度 |
|---|---|---|---|
| 矢量瓦片 | flywave-vectortile-datasource | **MVT 解码（自带 Mapbox `vector_tile.proto`）+ OMV schema 适配器**、OmvRestClient、GeoJsonDataProvider（geojson-vt 适配器：**大 GeoJSON 客户端瓦片化**）、tilezen 主题配套 | ✅（示例零覆盖——v2.1 决策维持，见 4.4 B 节注） |
| 栅格瓦片 | flywave-webtile-datasource | OSM/Mapbox/ArcGIS/Bing/自定义 URL 模板影像瓦片（可适配 WMTS/WMS REST 模板） | ✅ |
| GeoJSON | flywave-geojson-datasource | 静态 GeoJSON 加载渲染 | ✅ |
| 运行时要素 | flywave-features-datasource | 运行时增删改的程序化要素层（点/线/面），实时数据驱动的基础 | ✅ |
| 地形 | flywave-terrain-datasource | DEM（mapbox/terrarium 编码）、quantized-mesh、多套 DEM 修正层（DemPatchLayer 优先级硬覆盖）、地层、HeightMapModifierManager 地面修改（笔刷/开挖/刷高程）、投影贴图 | ✅（DEM patch 2026-10-14 落地，32 用例全绿） |
| 3D Tiles | flywave-3dtile-datasource | OGC 3D Tiles（内嵌 TilesRenderer fork）、批属性样式（独立于 styleSet 管线）、高斯泼溅、pnts 点云、ECEF transform | 🟢（theme 铁律：批材质套上后渲染路径零操作） |
| 调试网格 | flywave-debug-datasource | 瓦片网格调试覆盖（~150 行，最小 DataSource 范例） | ✅ |

#### 控件与模型层

| 模块 | 包 | 能力 | 成熟度 |
|---|---|---|---|
| 相机控件 | flywave-map-controls | MapControls + MapControlsUI 面板（含截图按钮）、缩略图生成 | ✅ |
| 绘制测量 | flywave-draw-controls | 点/线/面绘制、编辑、测量、GeoJSON 导入导出 | ✅ |
| 调试面板 | flywave-inspector | dat.GUI 模块化监控面板（ModularMapViewMonitor） | 🟢 |
| React 封装 | flywave-react | MapProvider/MapCanvas/hooks | 🟢（**示例零覆盖**） |
| glTF 栈 | flywave-gltf + flywave-draco | glTF/GLB 解析→three Scene、Draco 编解码（自带 worker） | 🟢 |
| 高斯泼溅 | flywave-splats | 3DGS Mesh/Material/树（经 glTF 扩展消费） | 🟢 |
| 计算几何 | flywave-topo | B 样条/polyface/solid/半边图/裁剪拓扑内核 | 🟡（any 密度全仓最高） |
| 工具链 | flywave-atlas-tools / theme-tools / webpack-utils | 图标图集 CLI、主题合并优化 CLI、webpack 预设（浏览器包+decoder 包+资源拷贝） | 🟢 |

#### 渲染效果能力（跨包合成，对外入口 `mapView.postEffects` / `mapRenderingManager` / theme）

bloom（静态/动态对象注册）、选择性描边 outline、SSR 平面反射、雾灯 fogLight（夜景）、调色 LUT（11 内置预设，.cube/.3dl/.png strip）、TAA/SMAA/MSAA 抗锯齿、AGX-punchy 色调映射、vignette/sepia/hueSaturation/brightnessContrast、物理大气（瑞利散射天空/空中透视）、太阳/月亮/星空、体积云（3D 噪声，low/high 质量档）、CSM 级联阴影、镜头光晕、天气（theme.rain/snow 降水）、贴地投影贴花（ProjectorOverlayManager）、自定义 shader technique（`shader` technique + TSL 可写任意材质，实绩：生态养殖示例的 TSL 动态水面）。

---

## 第二部分：代码规范审计报告

### 2.1 审计结果一览

| 维度 | 现状 | 结论 |
|---|---|---|
| 中文注释英译 | 残留 52 文件 / 274 行，**全部是合法字符串文案**（nameZh/titleZh、UI 文案）；重灾区（mapview/vrm、materials、atmosphere）计数为 0 | ✅ **英译主线已完成** |
| 版权头 | 1436 个 .ts 中 94.7% 有新式头（`flywave.gl contributors`）；2 个 HERE 旧头残留；97 个无头（96 个在 examples） | ⚠️ 但 **LicenseHeaderTest 正则仍要求 HERE 旧格式，守门已失效** |
| @ts-nocheck | 98 文件：atmosphere 66（73%）、mapview 11（vrm/effects）、terrain 8、materials 8 | ⚠️ 类型保护洼地，对外敏感区（materials/vrm）优先 |
| TODO/FIXME | 176 处（mapview 44、gltf 30），9 条空标记 | 🟢 健康（0.14/文件），v2 切支时 triage |
| console.log | src 下 143 处，核心引擎真实残留仅 ~5 处 | 🟢 顺手清零 |
| eslint | 风格硬规则真实生效；**~40 条类型规则被显式关闭**（no-floating-promises 等） | ⚠️ 建议开回 1-2 条高价值规则 |
| any 密度 | 1934 处：topo 484、examples 366、gltf 250（密度最高 5.1/文件） | ⚠️ 对外导出类型优先收敛 |
| @deprecated | 全仓 130 处（mapview 47、datasource-protocol 21） | 🔴 **v2 必须出 removal 名单** |
| 注释质量 | MapView.ts（248 JSDoc，解释"为什么"）与 GeoJsonDataSource（教科书级 @example）是基线；MapMeshMaterials 公共接口 **0 JSDoc + 裸 any** | 🟡 两极分化 |

### 2.2 v2 发布前规范债清单（按优先级）

**P0（阻塞 v2 发布）**
1. 产出 `@deprecated` removal 名单（130 处 → v2 移除/保留决策表），datasource-protocol 21 处公共接口层优先。
2. 修复 `test/LicenseHeaderTest.ts` 正则 → 匹配 `flywave.gl contributors` 新格式、排除 lib/test/scripts、补 2 个旧头与 `heightmap-core.ts` 缺头。

**P1（强烈建议）**
3. materials / mapview-vrm 的 @ts-nocheck 移除计划（先补 JSDoc 与接口类型）。
4. eslint 开回 `no-floating-promises`、`prefer-optional-chain`。
5. 核心引擎 5 处真实 console.log 改走 Logger。
6. gltf 包公共接口 any 收敛。

**P2（可延后）**
7. mapview 44 条 TODO triage；gltf 错误文案 i18n；topo any 治理。

---

## 第三部分：flywave-examples 现状盘点

### 3.1 资产清点

47 个目录：**41 个可运行**、**5 个只剩 .d.ts 残留**（demo-railway-marshalling、demo-shield-machine、terrain-brush-modification、terrain-tools、brush-processor-test，源码已丢失）、1 个只有编译后 .js（weather-precipitation，.ts 源未提交）。

### 3.2 问题清单（v2 重设计的依据）

| # | 问题 | 证据 |
|---|---|---|
| 1 | **约 15/42 是测试/诊断页混在示例里** | test-frustum-geobox、test-renderobject-leak、camera-collision-test、gpu-pick-test、cloud-* 3 个、terrain-memory-visualizer、real-world-pumped-storage（实为 projector UV 校准）、ssr-reflection（自述 "deliberately FLAT"）、depth-reading-pass、dem-patch-overlay（验证页）等 |
| 2 | **real-world 6 个全部硬编码内网 IP**（192.168.1.9/1.18 中文路径），离开内网不可复现 | country-garden、ecological-farming、pipeline、power、pumped-storage、railway |
| 3 | **分类体系与目录前缀脱节** | example-categories.ts 定义 8 类，目录前缀只反映部分；大量 config.ts 的 code 字段与内容不符 |
| 4 | **高重复复制粘贴** | basic-config 与 planar-map 逐行级复制；3dtiles 4 个示例同曼哈顿机位；LUT_PRESETS 表两处逐字重复；real-world 4 个同模板换数据（power 初始相机还是纽约坐标） |
| 5 | **调试探针残留** | getting-started-basic-config / planar-map 内嵌 `__fwStats` NodeBuilder 计数、`__probe` 影像错位探针等整段 TODO(debug) 代码 |
| 6 | **旗舰能力零示例** | React、inspector、大气展示零示例（v2 新建承接）；MVT/OMV 矢量瓦片按 v2.1 范围决策继续不出示例（能力保留） |
| 7 | **外网强依赖无降级** | ArcGIS 影像被 20+ 示例依赖（挂了白屏）；Cesium Ion token 被 8 个示例依赖，缺失时直接报错而非引导 |
| 8 | **公共代码未抽离** | getMapCanvas/初始化/DEM 配置在每个示例复制一份；无统一 MapView 工厂 |
| 9 | **仓库卫生** | 5 个 .d.ts 残留目录、weather-precipitation 源码丢失、3dtiles-animation 注释掉的模块块 |
| 10 | **示例质量两极** | 好的（getting-started-3dtiles 95 行、fog-light、draw-controls-geojson）与差的（3dtiles-style-lab 653 行测试台）并存，无准入标准 |

### 3.3 值得保留的资产

- **基建**：example-browser（分类导航+缩略图+iframe）、codebrowser（源码高亮+链接）、template/example.html、token-config、common-webgl-debug（`?renderer=webgl` 回退 + 错误环形缓冲）、webpack glob 自动发现。
- **高质量示例骨架**：getting-started-3dtiles、fog-light、3dtiles-gaussian-splatting、draw-controls-geojson、features-text-icons、heightmap-overlay、color-grading-lut。
- **技术含量高的实现**（改造后吸收）：ecological-farming 的 TSL 水面材质、camera-collision-test 的 terrarium 编码注释、ssr-reflection 的参数注释、dem-patch-overlay 的 patch 机制讲解。

### 3.4 测试性质示例的处置原则（明确）

**示例是给使用者看的产品门面，不是开发者的回归工具，两者必须物理隔离：**

1. 一切测试/诊断/校准页 → `internal/` 目录，config `internal: true`，浏览器导航默认隐藏（`?showInternal=1` 才显示）。
2. internal 页面不要求教学质量，但要求 `?renderer=webgl` 可跑、版权头齐全。
3. `check-examples` 脚本对**非 internal** 示例强制黑名单扫描：`__fwStats`、`__probe`、`installDebugErrorCapture` 直调、`window.mapView =` 等调试句柄、`192.168.`/`10.`/`localhost` 内网地址——命中即 CI 失败，防止"示例变测试"回潮。
4. 开发调试需求统一走 `src/common/debug.ts`（对 internal 示例开放、对公开示例不导出）。

---

## 第四部分：v2 示例体系设计

### 4.1 使用者关注点覆盖矩阵（设计的出发点多维验证）

以三维地图开发者的真实诉求为主线（对标 CesiumJS / Mapbox GL JS / deck.gl 示例馆的用户心智），逐项映射到引擎能力与示例。**这是 4.3 示例清单的合法性来源：每一个使用者关注点都必须有示例承接，每一个示例都必须承接到关注点。**

| # | 使用者关心什么 | 典型问题 | 引擎能力（已验证） | 承接示例 |
|---|---|---|---|---|
| U1 | 5 分钟出画面 | 装完怎么跑起来？ | MapView + DataSource + MapControls 最小集 | S1 hello-map |
| U2 | 球还是平面？ | 我的场景该用哪种投影 | ellipsoid/mercator/等距圆柱投影族 | S2 projections |
| U3 | 底图好不好看 | 有没有现成漂亮样式、能不能换 | tilezen 主题 13 份 + setTheme/patchTheme | S17 theme-basics、S6 raster-tiles |
| U4 | 我的 GeoJSON 怎么显示 | 点线面样式、本地上传 | GeoJsonDataSource + theme styles | S7 data-geojson |
| U5 | 数据量大了怎么办 | 几十万点/大 GeoJSON 卡不卡 | geojson-vt 客户端瓦片化、SDF 圆点、LOD | S8 large-geojson |
| U6 | 想自己定制底图 | 矢量瓦片 + 自己的配色 | MVT 解码 + 自定义主题 JSON | **v2 不设示例（范围决策，见 4.4 B 节注）** |
| U7 | 卫星影像/自定义服务 | WMTS/WMS/URL 模板接入 | WebTileDataSource 自定义模板 | S6 raster-tiles |
| U8 | 三维地形 | 真实高程、夸张系数 | DEM/terrarium/quantized-mesh + setElevationSource | T1/T2 |
| U9 | 地形数据不准怎么修 | 局部高程纠正、开挖平整 | DemPatchLayer 修正层 + HeightMapModifierManager | T3/T4 |
| U10 | 倾斜摄影/实景三维 | 3D Tiles 怎么加载、怎么定位 | TileRenderDataSource + lookAt(bounds) | D1-D5 |
| U11 | 倾斜模型想变色/高亮楼层 | 按属性改色 | 批属性样式 + when 表达式 | D2 tiles3d-styling |
| U12 | BIM/glTF 模型放到地图上 | 经纬度+高度+朝向放置 | loadGLTF + MapAnchor | M1 |
| U13 | 模型动画 | 骨骼动画/开门/设备运转 | AnimationMixer + MapAnchor | M3 |
| U14 | 点云 | 倾斜摄影点云/激光点云 | pnts tileset | D5 |
| U15 | 高斯泼溅 | 3DGS 新管线 | splats + 3dtiles | D4、M4 |
| U16 | 点击有什么反应 | 拾取、高亮、属性面板 | GPU/CPU 拾取 + PickResult + feature-state | I1/I4 |
| U17 | 悬浮提示/信息窗 | HTML 气泡跟随坐标 | worldToPixel 投影 + overlay DOM | I7 info-window |
| U18 | 画线画面/测量 | 距离/面积量算、编辑 | GeoJSONDrawControls | I2 |
| U19 | 轨迹回放/移动目标 | 车辆/飞行器动起来 + 相机跟随 | MapAnchor 位置更新 + features CRUD + 相机 | I6 track-playback |
| U20 | 实时数据驱动样式 | 预警变色、状态闪烁 | setFeatureState + setDynamicProperty | I4、I6 |
| U21 | 3D 柱状图/数据可视化 | 按属性挤出+分级设色 | extrudedPolygon + DynamicProperty（表达式/插值） | S21 extrusion-bars |
| U22 | 文字标注/POI | 中文标注、图标、避让 | SDF 文字 + FontCatalog + label 碰撞 + languages | S19 text-labels |
| U23 | 大气/日照/时间轴 | 不同时刻的光照效果 | 物理大气 + 太阳方位/时间 + toneMapping | R3 atmosphere-sky |
| U24 | 天气效果 | 雨/雪/阴天 | theme.rain/snow | R5 weather |
| U25 | 夜景 | 城市夜景灯光 | fogLight + bloom + toneMappingExposure | R6 night(fog-light 改造) |
| U26 | 泛光/描边/滤镜 | 后期全家桶 | postEffects 全参数 + outline 对象注册 + LUT | R1/R2 |
| U27 | 反射/水面 | 玻璃幕墙、水体 | SSR + 自定义 TSL 材质（水面实绩） | R8 custom-material |
| U28 | 阴影 | 建筑阴影/CSM | enableShadows + theme.lights + CSM | R7 lighting-shadows |
| U29 | 相机动画/巡航 | 开场动画、关键帧巡游 | CameraAnimationBuilder/KeyTrack | S3 camera |
| U30 | 跟随目标 | 第三人称跟随 | lookAt 周期更新 + MapAnchor | I6 |
| U31 | 相机别钻地下 | 碰撞检测 | enableCameraCollision + TerrainSource.raycast | I5 |
| U32 | 绘制/测量精度 | 高程拾取准不准 | ElevationProvider/getWorldPositionAt | T5 |
| U33 | 性能与内存 | 大场景不卡、内存可控 | tileCacheSize/LOD 参数、PerformanceStatistics、terrain-memory-visualizer | S8、E1 internal、`integration-performance` |
| U34 | 调试面板 | 运行时看状态 | flywave-inspector（ModularMapViewMonitor） | 并入 S10 multi-source |
| U35 | React 工程化 | 组件化集成 | flywave-react | M6 react |
| U36 | 打包集成 | webpack/vite 接入 | addWebpackConfig + decoder bundle | README + template（M 区） |
| U37 | 截图导出/出图报告 | 生成报告截图 | MapControlsUI screenshotButton + renderSync | S4 controls |
| U38 | WebGPU/兼容性 | 老浏览器回退 | forceWebGL 双后端 | 全部示例 DoD + S1 说明 |
| U39 | 多语言/行政区划视图 | 中英文切换、政治视图 | languages/politicalView | S19 |
| U40 | 版权合规 | attribution 展示 | CopyrightElementHandler + copyright-changed 事件 | S6 raster-tiles |

**结论**：40 个关注点中 39 个有示例承接；U6（矢量瓦片自定义底图）按 v2.1 范围决策不设示例，能力保留于 `vectortile-datasource` 包、接入方式走用户文档。S/E 编号对应 4.3 清单。**引擎不具备的能力明确不承诺**（见 4.7 诚实清单）。

### 4.2 设计原则

1. **教学性优先**：每个示例回答一个明确问题（"如何用 X 做 Y"），主文件 ≤ 300 行；超出部分拆子模块或砍掉。
2. **开源数据服务优先 + 离线保底**：优先使用免 token 的开源/公共数据服务（AWS 地形、OSM、NASA GIBS）；本地 resources 作保底层；Cesium Ion 等需 token 的服务单独徽章标记并给引导页。任何示例**永不白屏**：公网层加载失败自动降级。
3. **单一事实来源**：MapView 初始化、数据源工厂、LUT 预设等公共逻辑全部进 `src/common/`；示例只写"差异部分"。
4. **演示与调试分离**：测试/诊断页移入 `internal/`（处置原则见 3.4），从浏览器导航隐藏。
5. **能力全覆盖**：v2 发布时，4.1 矩阵的每个关注点至少有一个示例；凡对外 API 面上的能力至少被一个示例演示。
6. **元数据驱动**：config.ts 扩展 schema，浏览器按 level/tags/依赖徽章组织；缺 thumbnail/字段的示例 CI 拒绝。

### 4.3 新分类体系（8 类 → 9 类）

| code | 名称 | 定位 |
|---|---|---|
| `getting-started` | 入门 | 5 分钟跑通：最小地图、投影、相机、控件 |
| `data-sources` | 数据源 | 每种数据源一个教学示例（v2 新增类目，补最大缺口） |
| `terrain-elevation` | 地形与高程 | DEM/quantized-mesh/修正层/地面修改/高程查询 |
| `tiles-3d` | 3D Tiles | 基础/样式/地形叠加/泼溅/点云 |
| `styling-theming` | 样式与主题 | 主题模型/technique 画廊/文字标注/动态属性/数据可视化 |
| `rendering-effects` | 渲染效果 | 后期/大气/天气/夜景/光照/自定义材质 |
| `interaction` | 交互 | 拾取/绘制/锚点/轨迹回放/信息窗/相机碰撞 |
| `models-integration` | 模型与集成 | glTF/Draco/泼溅/动画/第三方库/React |
| `internal` | 内部工具 | 测试/诊断/校准页（浏览器默认隐藏） |

### 4.4 示例完整清单（48 个，含优先级）

优先级：**P0 = v2 发布必须**（覆盖 U 矩阵主干）；**P1 = 应有**（补齐体验）；**P2 = 加分**（可延后到 v2.x）。
标记：`=改造自` / `+新建` / `→移入 internal/` / `✂下线`。

#### A. 入门（getting-started，5 个）

| 目录 | 优先级 | 演示点 | 依赖 | 来源 |
|---|---|---|---|---|
| S1 `getting-started-hello-map` | P0 | 零依赖最小示例：MapView + 地形底图 + 控件 + 主题，≤ 80 行；页面脚注说明 WebGPU→WebGL2 回退 | 本地 DEM（离线） | +新建 |
| S2 `getting-started-projections` | P0 | globe/mercator/等距圆柱切换 + 适用场景（U2） | 本地 DEM + ArcGIS（降级） | =合并 basic-config + planar-map，**删除全部调试探针** |
| S3 `getting-started-camera` | P0 | lookAt/flyTo/flyToBounds + KeyTrack 巡航（U29） | 本地 DEM + ArcGIS | =改造 camera-animation（496→~250 行） |
| S4 `getting-started-controls` | P1 | MapControlsUI 全家：交互模式/倾斜旋转/**截图导出（U37）**/缩略图 | 本地 DEM | +新建 |
| S5 `getting-started-3dtiles` | P0 | 保留（质量好），token 缺失时显示引导卡片 | Ion token（徽章） | =改造 |

#### B. 数据源（data-sources，7 个）—— 数据接入全景

> **范围决策（v2.1）**：MVT 矢量瓦片渲染**不进 v2 示例**——矢量瓦片消费需配套数据源与主题体系（OMT/tilezen schema 主题），投入产出比不适合示例集；`vectortile-datasource` 包能力原样保留，接入方式写入用户文档。B 区其余示例覆盖栅格/GeoJSON/要素/多源/调证据链的完整接入故事。`S12 data-custom-decoder` 保留——它教的是 Worker 解码器注册机制（铁律 5），不绑定 MVT。

| 目录 | 优先级 | 演示点 | 依赖 | 来源 |
|---|---|---|---|---|
| S6 `data-raster-tiles` | P0 | OSM/ArcGIS/GIBS 三源切换、自定义 URL 模板（WMTS/WMS 形态）、**版权 attribution（U40）** | 开源服务 | +新建 |
| S7 `data-geojson` | P0 | GeoJSON 点线面样式（fill/solidLine/text）、运行时换数据（U4） | 本地 resources geojson | +新建 |
| S8 `data-large-geojson` | P1 | **大 GeoJSON 客户端瓦片化**（GeoJsonDataProvider+geojson-vt）+ 大规模点位性能（U5/U33） | 本地生成样例数据 | +新建 |
| S9 `data-features-layer` | P0 | FeaturesDataSource 运行时要素增删改（U20 的基础） | 本地图标 + ArcGIS | =改造 features-text-icons |
| S10 `data-multi-source` | P0 | 影像+地形+要素+3dtiles 四层叠加、渲染顺序、inspector 面板（U34）、clearTileCache | 混合 | +新建（吸收 real-world 多源模式，去内网） |
| S11 `data-debug-grid` | P1 | debug datasource：瓦片键/LOD 可视化（同时是自定义 DataSource 教学范本） | 零依赖 | +新建 |
| S12 `data-custom-decoder` | P2 | 进阶：自定义 Worker 解码器 + DecoderBundle 注册 | 零依赖 | +新建（面向贡献者） |

#### C. 地形与高程（terrain-elevation，5 个）

| 目录 | 优先级 | 演示点 | 依赖 | 来源 |
|---|---|---|---|---|
| T1 `terrain-dem` | P0 | DEMTerrainSource + setElevationSource + 高程夸张系数（U8） | AWS terrarium + ArcGIS | =改造 getting-started-dem-terrain（换 AWS 免费源为主） |
| T2 `terrain-quantized-mesh` | P0 | quantized-mesh 地形（U8） | Ion token（徽章） | =改造 getting-started-quantized-terrain |
| T3 `terrain-dem-patch` | P1 | DemPatchLayer 多套修正层优先级覆盖（U9），教学化改造 | 本地 DEM，补丁离线生成 | =改造 dem-patch-overlay |
| T4 `terrain-ground-modification` | P0 | HeightMapModifierManager：开挖/平整/阶梯墙（U9） | 本地 DEM | =合并 heightmap-overlay + terrain-brush 意图 |
| T5 `terrain-elevation-query` | P0 | ElevationProvider/getWorldPositionAt 高程查询（U32）+ terrarium 编码要点 | AWS terrarium | =提炼 camera-collision-test + depth-reading-pass 教学核心 |

#### D. 3D Tiles（tiles-3d，5 个）

| 目录 | 优先级 | 演示点 | 依赖 | 来源 |
|---|---|---|---|---|
| D1 `tiles3d-basic` | P0 | tileset 结构/zoomTo/版权、性能面板 | Ion token（徽章） | =改造 getting-started-3dtiles 拉开差异 |
| D2 `tiles3d-styling` | P0 | 批属性分级配色、when 表达式、单条/批量样式、点击属性表（U11） | Ion token | =合并 style-lab + 3dtiles-animation 教学核心（653+462→~350 行） |
| D3 `tiles3d-terrain-overlay` | P1 | 倾斜模型贴地叠加 + translucentDepth（U10） | Ion + 本地 DEM | =改造 |
| D4 `tiles3d-gaussian-splatting` | P0 | 3DGS 泼溅加载定位（U15） | 本地资源（离线） | 保留 |
| D5 `tiles3d-point-cloud` | P1 | pnts 点云 tileset（U14） | 本地生成样例点云 | =提炼 real-world-railway 的 pnts 部分，去内网化 |

#### E. 样式与主题（styling-theming，5 个）

| 目录 | 优先级 | 演示点 | 依赖 | 来源 |
|---|---|---|---|---|
| S17 `styling-theme-basics` | P0 | Theme/FlatTheme/extends、setTheme vs patchTheme、**明暗底图一键切换（U3）** | 本地 + tilezen 主题 | +新建（主题系统门面） |
| S18 `styling-technique-gallery` | P0 | technique 画廊：fill/solidLine（含虚线）/extrudedPolygon/poi/text 同屏对比 + Expr when 过滤 + **缩放插值样式** | 本地 geojson/要素 | +新建 |
| S19 `styling-text-labels` | P0 | POI/文字标注/FontCatalog/**多语言 languages（U22/U39）**/碰撞避让 | 本地字体 + 底图 | =改造 text-styling-dynamic（搬回地图上） |
| S20 `styling-dynamic-props` | P1 | setDynamicProperty + Expr 动态变量：滑动条实时改样式（U20） | 本地数据 | +新建 |
| S21 `styling-extrusion-bars` | **P0（可视化刚需）** | **按属性挤出 3D 柱 + 分级设色 + 缩放插值**（U21），数据可视化看板基石 | 本地 geojson（统计样例） | +新建 |

#### F. 渲染效果（rendering-effects，8 个）

| 目录 | 优先级 | 演示点 | 依赖 | 来源 |
|---|---|---|---|---|
| R1 `fx-post-processing` | P0 | PostProcessingGUIModule 全参数 + bloom + outline 描边 + 抗锯齿面板（U26） | 本地 DEM | =改造 post-processing-effects |
| R2 `fx-color-grading-lut` | P1 | 11 预设 LUT 切换（LUT_PRESETS 入 common/） | 本地 lut | =改造 color-grading-lut |
| R3 `fx-atmosphere-sky` | **P0（卖点）** | **物理大气**：太阳时间轴/星空/月相/空中透视/tonMapping（U23） | 零依赖 | +新建 |
| R4 `fx-clouds` | P1 | 体积云 quality 档位 + 云参数（从对照页改展示页） | 零依赖 | =改造 cloud-mapview |
| R5 `fx-weather` | P0 | theme.rain/snow 降水 + GUI patchTheme 调参（U24） | 本地 DEM | =恢复 weather-precipitation 源码后改造 |
| R6 `fx-night-city` | P0 | **夜景**：fogLight + bloom + toneMappingExposure + 夜间主题（U25） | 本地 DEM | =改造 fog-light（升级为夜景全家桶） |
| R7 `fx-lighting-shadows` | P1 | theme.lights + enableShadows + CSM + 光源 GUI（U28） | 本地 DEM + ArcGIS | =改造 threejs-lighting（40+ CONFIG 砍到 10） |
| R8 `fx-custom-material` | P1 | **自定义 TSL 材质**：动态水面 + shader technique 扫描圈/发光（U27） | 本地数据 | +新建（水面实现取自 ecological-farming） |

（ssr-reflection → `internal/`，参数注释迁入 R1/API 文档。）

#### G. 交互（interaction，7 个）

| 目录 | 优先级 | 演示点 | 依赖 | 来源 |
|---|---|---|---|---|
| I1 `interaction-picking` | P0 | GPU vs CPU 拾取、PickResult 惰性细节、悬浮高亮+点击属性（U16） | 本地 DEM + 模型 | =合并 gpu-depth-picking + gpu-pick-test 教学核心 |
| I2 `interaction-draw-measure` | P0 | 绘制/编辑/**距离与面积测量**/GeoJSON 导入导出（U18） | Ion token | =改造 draw-controls-geojson |
| I3 `interaction-map-anchors` | P0 | MapAnchor 持久对象：放置/移除/pickable/overlay（铁律 2 教学化） | 本地 DEM | +新建 |
| I4 `interaction-feature-state` | P0 | setFeatureState 动态高亮/悬停效果/状态复位（U16/U20） | 本地数据 | +新建 |
| I5 `interaction-camera-collision` | P1 | 相机-地形碰撞开关对比 + 参数 GUI（U31） | AWS terrarium | =改造 camera-collision-test |
| I6 `interaction-track-playback` | **P0（数字孪生刚需）** | **轨迹回放**：移动目标 + 时间轴控制 + **相机跟随**（U19/U30）+ 途中 setFeatureState 状态变化 | 本地 geojson 轨迹 | +新建 |
| I7 `interaction-info-window` | P0 | **信息窗**：点击弹出 HTML 气泡 + worldToPixel 跟随锚定 + 视野外出窗（U17） | 本地数据 | +新建 |

#### H. 模型与集成（models-integration，6 个）

| 目录 | 优先级 | 演示点 | 依赖 | 来源 |
|---|---|---|---|---|
| M1 `model-gltf` | P0 | loadGLTF 管线 + 经纬度/高度/朝向放置（U12）+ A/B 对比 | 本地 cctv.glb | =改造 threejs-gltf-viewer |
| M2 `model-draco` | P1 | Draco 压缩模型加载 | 本地模型 | +新建 |
| M3 `model-animation` | P0 | 骨骼动画 + AnimationMixer + GUI（U13） | 本地模型 | =改造 threejs-model-animation |
| M4 `model-gaussian-splatting` | P1 | glTF 扩展消费 3DGS（U15） | 本地资源 | 保留 gltf-splat |
| M5 `integration-third-party` | P2 | three-nebula 粒子等第三方库接入模式 | 本地资源 | =改造 threejs-particle-system |
| M6 `integration-react` | **P0（工程化缺口）** | flywave-react：MapProvider/MapCanvas/hooks 组件化（U35） | 本地 DEM | +新建 |

（`integration-webpack` 由 README + template 承担；`integration-performance`（U33 性能调参：缓存/LOD/帧统计面板）作为 P2 候选，v2.x 补。）

#### I. 行业案例（showcase，处置方案）

**原 real-world 6 个全部下线出导航**（内网不可复现 + 同模板复制 + 客户验收残留属性）：

1. `real-world-pumped-storage`（实为 UV 校准工具）→ `internal/projector-uv-calibration`。
2. 其余 5 个源码归档 `internal/legacy-realworld/`（不打包不导航），技术点提取：
   - ecological-farming 的 **TSL 水面** → `common/water-material.ts`，供 R8 使用；
   - railway 的 **pnts 点云** → 已由 D5 承接；
   - 多图层分类显隐 → 已由 S10 承接。
3. v2 营销位改为 `showcase-smart-park`（P2，可发布后补）：用公开数据重建——本地 DEM + 程序化建筑 + glTF 设施 + 水面（R8 复用）+ 天气 + 夜景 + inspector，作为"能力集大成"门面页。

#### J. internal/（导航隐藏，12 个）

`test-frustum-geobox`、`test-renderobject-leak`、`terrain-memory-visualizer`（→ E1，S8 的性能演示可引用）、`cloud-render`、`cloud-textures-preview`、`depth-reading-pass`、`ssr-reflection`、`gpu-pick-test`、`gpu-depth-picking`（教学核心已并入 I1）、`internal/projector-uv-calibration`、`internal/legacy-realworld/*`。

#### 汇总数字

- v2 对外示例：**48 个**（P0 共 27 个、P1 共 15 个、P2 共 6 个），internal 12 个。
- 新建 **21 个**、改造 **18 个**、原样保留 **4 个**（fog-light 属改造升级、gaussian-splatting/gltf-splat/draw-controls 保留）。
- P0 集合是 v2 发布的最小完整面：27 个示例覆盖 U 矩阵全部主干关注点（U6 矢量瓦片除外）；P1/P2 允许顺延而不伤门面。

### 4.5 公共基建改造

1. **`src/common/` 公共库**（新建）：
   - `createExampleMap(config)`：统一 MapView + MapControls + 主题加载 + WebGL 回退 + 公网层降级 + 错误处理（吸收每示例 ~80 行模板）；
   - `datasources.ts`：`demoTerrain()`（默认 AWS terrarium，本地 DEM 兜底）/ `demoImagery({provider})`（OSM/ArcGIS/GIBS 工厂 + 失败降级 debug 网格）/ `ionSource(asset)`（token 检查 + 引导回调）；
   - `lut-presets.ts`、`properties-table.ts`、`water-material.ts`、`gui-theme.ts`、`info-window.ts`（I7 的 HTML 气泡锚定组件，多示例可复用）。
2. **config.ts schema v2**（向后兼容扩展）：
   ```ts
   export default {
     title, titleZh, description, descriptionZh,   // 现有
     thumbnail,                                     // 强制，CI 校验
     code: "terrain-elevation",                     // 新 9 类
     order: 2,
     level: "beginner" | "intermediate" | "advanced",  // 新增
     tags: ["terrain", "dem"],                      // 新增
     apis: ["DEMTerrainSource", "setElevationSource"], // 新增，反向索引 API 文档
     concerns: ["U8"],                              // 新增，回链 4.1 矩阵
     dataPolicy: "offline" | "open-data" | "token", // 新增，徽章
     internal: false                                // 新增，true 不进导航
   };
   ```
3. **example-browser v2**：level/标签过滤、dataPolicy 徽章（token 缺失显示引导卡片）、`?showInternal=1` 开关、关注点矩阵页（把 4.1 矩阵渲染成"我想做 X → 看这个示例"的检索页）。
4. **token-config**：缺失时返回 `undefined` + `checkTokenOrShowGuide()` 统一引导，杜绝硬编码 fallback 进仓库。
5. **CI/脚本** `scripts/check-examples.ts`：config 完整性/thumbnail/分类 code 合法/主文件行数软告警；**黑名单扫描**（仅对非 internal）：`__fwStats`、`__probe`、`window.mapView =` 调试句柄、`192.168.`/`10.`/`localhost` 内网地址、注释掉的代码块统计——命中即失败。
6. **仓库卫生**：删除 5 个 .d.ts 残留目录；补 weather-precipitation 源码；全示例英文注释（nameZh 等文案除外）；examples 版权头补齐（96 个文件）。

### 4.6 开源数据服务策略（具体清单）

| 层级 | 服务 | URL 模板 | 用途 | 许可/政策 |
|---|---|---|---|---|
| **开源地形（主力）** | AWS Open Data Terrain Tiles（terrarium） | `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png` | T1/T5/I5 的 DEM 主数据源，免费无 token、全球覆盖 | 开放数据（ODbL 系），已在 camera-collision-test 实证可用 |
| **开源栅格底图** | OpenStreetMap | `https://tile.openstreetmap.org/{z}/{x}/{y}.png` | S6 的标准底图源（演示 attribution） | ODbL + 使用政策（demo 量级合规，需署名） |
| **公共影像** | NASA GIBS（WMTS REST） | `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/VIIRS_SNPP_CorrectedReflectance_TrueColor/default/{time}/GoogleMapsCompatible_Level9/{z}/{y}/{x}.jpg` | S6 的影像源（免 token，顺带演示时间参数模板） | 公共领域 |
| **公网美化层（现状保留）** | ArcGIS World Imagery | `https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/mapTile/{z}/{y}/{x}` | 各示例的 draped 影像（现有实证链路，国内可达） | 免费使用条款，attribution 必须显示 |
| **Token 层（徽章+引导）** | Cesium Ion | asset 75343（曼哈顿实景）/ asset 1（世界地形） | S5/D1/D2/D3/T2/I2 | 商业 token；缺失时引导卡片而非报错 |
| **离线保底层** | 仓库 `resources/` | 本地 DEM、3dtiles/3DGS tileset、geojson、模型、字体、LUT | P0 示例的兜底数据；断网可跑的最低集 | 自有资产 |

降级规则：`demoImagery()` 优先级链 = ArcGIS → OSM → debug 网格；地形链 = AWS terrarium → 本地 DEM；任何一层失败只产生 Logger 警告，不中断场景。

### 4.7 能力缺口诚实清单（v2 不承诺，防止示例/文档虚假宣传）

以下能力是三维地图用户会问的，但引擎**当前不具备**（已 grep 验证无实现），不进示例、不写文档承诺；登记为 v2.x 候选路线：

| 能力 | 现状 | v2.x 候选方案 |
|---|---|---|
| 热力图（heatmap） | 无任何实现 | features + TSL 密度聚合材质，或引入 deck.gl 式图层 |
| 点聚合（clustering） | 无（label 碰撞避让≠聚合） | 数据源侧聚合策略 + POI 批次渲染 |
| 视域分析（viewshed） | 无 | 需地形+遮挡分析，工程量大 |
| KML/CZML 解析 | 无 | 走 toGeoJSON 转换后进 GeoJsonDataSource（文档给方案即可） |
| 服务端瓦片裁剪/矢量切片服务 | 无（客户端为主） | 超出前端引擎范围，不做 |
| 地下模式（地表半透明看管线） | 无专项支持（real-world 靠数据高度偏移变通） | clip planes + 地表透明度组合，可先出教程页 |

---

## 第五部分：实施路线图

### 阶段划分（估时按 1 人全职；P0 先行，P1/P2 可顺延）

| 阶段 | 内容 | 产出 | 估时 |
|---|---|---|---|
| **P0 清理**（1-2 天） | 删 5 个残留目录；补 weather-precipitation 源码；去 basic-config/planar-map 调试探针；修复 LicenseHeaderTest；examples 版权头补齐 | 仓库卫生达标 | 1-2 天 |
| **P1 基建**（2-3 天） | `src/common/` 公共库（含 info-window 组件）；config schema v2；example-browser v2（徽章/过滤/internal 开关/关注点矩阵页）；`check-examples` 黑名单脚本 | 新骨架可用 | 2-3 天 |
| **P2 数据准备**（1-2 天） | 本地样例数据生成（大 GeoJSON、点云 tileset、轨迹数据）；AWS/OSM/GIBS 链路实证 | 数据层就绪 | 1-2 天 |
| **P3 存量改造**（4-5 天） | 18 个改造示例按 4.4 清单完成（入门 4 + 地形 4 + 3dtiles 3 + 效果 5 + 交互 2），统一走 common 库 | 存量达标 | 4-5 天 |
| **P4 缺口新建·P0 批次**（6-8 天） | 21 个新建中的 **P0 全部**：React、大气、raster、geojson、multi-source、theme-basics、technique-gallery、extrusion-bars、night-city、weather、track-playback、info-window、anchors、feature-state、picking、elevation-query、ground-modification、hello-map、3dtiles-basic/styling 等 | P0 = 27 个全绿 | 6-8 天 |
| **P5 收敛与下线**（2 天） | real-world 处置（归档+提取）；测试页迁 internal；重复合并收尾 | 对外 = 精选集 | 2 天 |
| **P6 P1/P2 批次 + 验收发布**（4-5 天） | P1 15 个（可再裁）；全示例双后端冒烟；docs/docs/getting-started/examples.md 重写（按 U 矩阵组织）；thumbnail 生成 | v2 就绪 | 4-5 天 |

总计：**P0 范围（清理+基建+数据+存量+P0 新建+下线）约 16-22 人日**；含 P1 全量约 20-27 人日。可与第二部分规范债并行（LicenseHeaderTest 修复、deprecated 名单穿插在 P0/P1 期间）。

### 验收标准（每个示例的 DoD）

1. 离线可跑（dataPolicy: offline 的示例断网零报错；open-data 的降级链生效；token 的引导卡片正确）。
2. 双后端通过：WebGPU 默认 + `?renderer=webgl` 回退无功能差异。
3. Console 零错误零警告（Logger 正常输出除外）。
4. 主文件 ≤ 300 行；公共逻辑全部走 `src/common/`；黑名单扫描通过（无调试探针/内网 IP/window 句柄/注释掉的代码块）。
5. 英文注释 + JSDoc 覆盖导出函数；config 元数据完整（含 concerns 回链）+ thumbnail 存在。
6. `check-examples` 全绿；example-browser 导航/徽章/深链/关注点检索正确。

### 风险与决策点（需要拍板）

1. **showcase-smart-park 是否进 v2**：营销投入，P2 优先级，可发布后补。
2. **deprecated removal 范围**：130 处决策需按包过一遍，datasource-protocol 21 处可能引发 examples/docs 联动。
3. **`@ts-nocheck` 治理深度**：v2 只承诺 materials + vrm 两区计划，atmosphere 73% 洼地留到 v2.x。

---

## 附录：本文档事实来源

- 引擎模块清单：`.agents/skills/flywave-dev/references/package-map.md`、`api-surface.md`（37 包拓扑、MapViewOptions/方法/18 事件、合成层结构）；DynamicProperty 定义实测 `@flywave/flywave-datasource-protocol/src/TechniqueParams.ts:110`；MVT 解码实测 `flywave-vectortile-datasource/src/adapters/omv/proto/vector_tile.proto`；geojson-vt 适配器实测 `src/adapters/geojson-vt/`。
- 规范审计：全仓 grep 统计（2026-10-26 实测：中文字符 52 文件/274 行全为文案、版权头 1360/1436、@ts-nocheck 98、TODO 176、any 1934、@deprecated 130）。
- 示例盘点：41 个可运行示例逐一分析（import/规模/质量/依赖），5 个 .d.ts 残留目录核验。
- 能力缺口核验：heatmap/viewshed/clustering 全仓 grep 无命中（2026-10-26）。
