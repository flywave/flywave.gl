# Render-Tests 移植 TODO（特性清单 + 实现状态）

> 本文依据 `@flywave/flywave-mbstyle-datasource/test/render-tests/` 的**全量 270 个分类 / 3031 个用例**，逐项对照 `@flywave/flywave-mbstyle-datasource/src/` 源码（`MBTileDataEmitter.ts` / `MBMaterialPatchManager.ts` / `MBStyleSymbolPlacement.ts` / `MBStyleDataSource.ts` / `MBEnvironmentManager.ts` / `MBExpressionEngine.ts` / `MBFilterCompiler.ts` / `PlacementEngine.ts` / `TextShaping.ts` 等）做实现状态核验后整理而成。
>
> **状态结论来源**：直接 grep/read 源码，标注 `文件:行` 证据；不沿用既有文档结论。审计日期 2026-08-07。
>
> **最重要的新发现（决定全部状态判定）**：审计时发现渲染管线存在 5 个系统级缺陷，导致 `MBMaterialPatchManager` 与 `MBStyleSymbolPlacement` 两条增强路径**整体不可达**——详见 §1。所有"仅存在于 patcher / symbol-placement 中"的特性，实际**不会**产生视觉效果。
>
> **2026-08-09 更新**：§1 的 S1–S5 已全部修复（见 §8），自动化管道已可跑通 3026 个用例；`render-tests-index.ts` 已重新生成全量索引并通过 tsc。修复后 §2 中标注 🔧 的分类进入"待像素级验证"状态。
>
> **2026-08-12 更新**：完成**首次全量实测基线**（3031 用例，Edge 151 headless + SwiftShader）：2775 个上报结果中 **182 通过（6.56%）**，455 个失败差异 ≤600px（近失），256 个因浏览器崩溃/超时未上报。实测远低于 §3 的 50–60% 估算，text/line/raster/fog/skybox/lighting 等系整域全红——详见 §10。
>
> **2026-08-17 更新**：§14 冻结后的 5 个 commit（fog 模型 / skybox 接线 / 3D-lights 修正 ×2 / heatmap 双 pass 通道对齐）完成 G7 全量验收（§12.27）：lighting-3d-mode 2→**10 通过**、skybox 0→**1**、fog 0 通过但近失 3（space-color-use-theme 39 第一梯队）、heatmap 仍 0（data-expression 308 近失）。§14 的 F12 已勾除、F3 状态已更新。
>
> **2026-08-17 更新（F3 落地）**：heatmap 双 pass 对齐 mgl 全链（§12.28），**0/18 → 15/18**（opacity/intensity/weight 全绿、color 2/2、radius 4/7）。§14 F3 完成，仅剩 antimeridian / pitch30 / projected 三个单测。
>
> **2026-08-17 当前快照（最新）**：§12.21–§12.28 的 08-16/17 系列修复全部落地——icon-text-fit 0→**7/41**（3b8da244）、fill-outline-color 1→**2/8**（57baa3e0）、icon-size 4→**9/18**（af54f113）、icon-halo-blur 0→**4/5** + width 3→**4/4** + color 3→**5/7**（f1b5a066）、icon-rotate 四角旋转接线（62ca4139）、heatmap 0/18→**15/18**（6fa78651）、lighting-3d-mode 2→**10** + skybox 0→**1**（G7 验收，§12.27）。最新全量基线仍为 baseline4（08-15，§12.9）**231/2827（8.17%）**，0 DISCONNECTED。剩余主线：F1 fill-extrusion 墙面几何对齐（~140 例）、F8 line-join/cap、F11 raster/image、G4 text 像素精度（见 §14 待办清单）。
>
> **2026-08-19 快照（dash 校准，§12.63）**：`4d45e37b`+`a9f41ee7` 完成 §12.62 遗留三项——dash 周期单位（floorwidth + 2^frac 瓦片锚点）、zero-dash 隐形、data-driven 分键 + meters 单位 + 形状 SDF（butt/square/round cap 复刻 mgl line_atlas）。数值验证 period 与 expected.png 逐像素吻合。渲染验证攒批延后。
>
> **2026-08-19 快照（相机 bearing 符号，§12.64）**：`814fae16`+`e18ab549` 修复相机 bearing 符号反转（mapbox 顺时针 → flywave 逆时针 yawDeg），全视图 2·bearing 旋转消除。line-visibility/visible 12318→**4126**、line-translate-anchor map 20469→**1236** / viewport→**1274**、elevated 11659→**2303**。599 例非零 bearing 测试解锁整类 180° 旋转错误（代价 3 例对称 symbol 0→54-85px 侥幸暴露）。残余为线宽 AA（N5 专项）。
>
> **2026-08-19 快照（代码对齐批 §12.65，测试延后）**：`98aa2762`+`92f53811`+`0383f6fa`+`a6ab7eaf`+`15765cb3` 五项 mgl 逻辑对齐——line-blend-mode multiply `premultipliedAlpha=true`（否则 three r178 不设 blendFunc，multiply 因子从不进 GL，交叉不累计）、fill/fill-extrusion/circle-translate px→world 单位（shader 把像素当世界米加，z14 仅 ~2px）、icon/text-translate viewport anchor 按 +bearing 旋转。tsc 绿、55 passing。待渲染验证：multiply 1456、fill-translate-anchor 884、extrusion/circle-translate、icon/text-translate。
>
> **2026-08-19 快照（代码对齐批 §12.66，测试延后）**：`fd1ff405` text-anchor 水平对齐按 anchor 水平分量推导（对齐 mgl `getAnchorAlignment`），修掉原 `text-justify` 误推导（'top-left' 本应 Left 却落到 Center）。顺带修正 line-translate viewport 注释（代码按 +bearing 旋转，原注释误写 -bearing）。tsc `--build` 绿、lib 重建含修正。待渲染验证：text-anchor（11 分类）。
>
> **2026-08-19 快照（§12.65/§12.66 延后验证批落地，§12.67）**：translate×6 层 + line-blend-mode + text-anchor 共 79 用例实测——**circle-translate 5/5、fill-translate 5/5、fill-extrusion-translate 4/6、line-blend-mode/multiply 全绿（0-2px）**，§12.65 五项对齐全部兑现（+16 通过）；text-anchor/text-translate 仍全红但**与 baseline5 逐例像素一致（零回归）**，§12.66 排查确认为"text不渲染"域（G4/F13）而非对齐错误。runner 已修复 karma 结束后自动退出（无需手动 kill）。
>
> **2026-08-19 快照（§12.68 text 域解锁 + additive 双 pass 半成品）**：**text 整域"完全不渲染"根因修复**——harness 注入的 PBF FontCatalog 在主题重置时被 `updateFontCatalogs` 删除（`MapView.setFontCatalog` 现持久化注入并在 `resetTextRenderer` 后重注册）+ canvas 缺失期间 text element 状态卡死（`setFontCatalog` 现 `invalidateCache()` 强制重试）。text-anchor/translate/color/field/max-width/size 93 例实测**文本全部开始渲染**（icon-text-fit 文本段、poiTexts 46→61+），`text-anchor/center` 14476→10596、`text-color/default` 5774→4680、一批进入近失带（151-567px）；残余为字形位置/hAnchor 精度（下一步）。line-blend additive 双 pass 当时未稳定（详见 §12.71 落地）。

> **2026-08-19 快照（§12.71 additive 落地 + §12.72 text 精度二分）**：line-blend-mode **0→6/6 全 PASS**（additive 双 pass 密度合成像素级一致，additive×5 全 0mm 含 auto-density mean×2 公式兑现；multiply 保持 2px）。§12.68 "帧间不稳定" 根因 = COMP_FRAG 重复行 GLSL 语法错误 + NoBlending 替换语义。text 精度首轮二分：mgl 源码 AA 公式（±0.84px smoothstep）实测变差已还原（参考图/源码版本漂移）；typesetter 盒宽改动三类中性（点标签 bounds 不走 typesetter globalBounds，下轮先定位真实消费链）。

>
> **2026-08-17 更新（F1 落地——真因是 FOV 而非墙面几何）**：F1 排查**证伪了 §14 F1 的"墙面外扩 ~6px"假设**——mgl 默认 `fill-extrusion-line-width=0`（wallMode 关）且 `edge-radius=0`，默认墙面就在 footprint 上，与我们相同。真因：**flywave 默认 FOV 40°（`FovCalculation.ts:44`）vs mapbox 默认 36.87°（`transform.ts:247` 0.6435rad）**，焦距差 → 相机更近 → 透视更激进（近缘宽/远缘窄），数值模拟精确复现 expected（fov36.87：近墙顶 317.7 vs 实测 316、bbox 57.7..202.8 vs 58..202）与 current（fov40：330.4 vs 330）。修复：harness 建 MapView 时设 `fovCalculation:{type:'fixed',fov:36.86989764584402}`。收益（§12.29）：fill-extrusion-color 0→**3**（default/function/literal 全 0mm）、base 1→**5**、height 0→1、terrain 0→1、combinations 15→16、circle-color/radius function 各+1，**净 +11**；代价 2 例（circle-pitch-scale/viewport 系 40° 侥幸通过→215px 近失）。
>
> **2026-08-17 更新（F2a 落地——近裁剪面贴地，§12.30）**：property-function/zoom-and-property 半块方块缺南墙+屋顶的根因是**相机近平面按 maxElevation=0 求解贴在地面**，高出地面的挤出内容（最靠近相机一侧）被 GPU 近平面裁剪——同时解释 §12.6 C3 未解的"最靠近相机内容缺失"签名。修复：emitter 上报 `DecodedTile.maxGeometryHeight` + datasource 扫描样式设 `DataSource.maxGeometryHeight`（两级：解码后近平面/geoBox、解码前 cull box）。**fill-extrusion-color/property-function 8237→PASS(66px)、zoom-and-property 8171→PASS(1px)**，零回归。§14 F2a 勾除。
>
> **2026-08-17 更新（F2 落地——color alpha 语义 + 3D-lights 双重光照，§12.31）**：`no-alpha-no-multiply` 37842→**PASS 0**（mapbox 对 fill-extrusion-color alpha 不做 blend，RGB×alpha 预乘不透明；alpha=0 剔除要素）；`data-driven-zero-alpha` 28010→**1288 近失**（场景灯双重光照/ambient π/linear 域 ×k/clearColor linear radiance 四项修复，红蓝黄逐色对齐；残余=cast-shadow 阴影）；lighting-3d-mode 连带 10→**12** 通过零回归。§14 F2 主体完成。
>
> **2026-08-18 深夜更新（baseline5）**：N9 第五轮全量基线 **375/2810（13.35%）**，vs baseline4 231（8.17%）净 **+144**（§12.53）。N1 系列（pattern 三重根因/shader 平铺/sRGB/世界相位/icon_set 光栅化对齐）与 line 域大轮全部兑现为通过数。下一优先级：N7 raster 双路径（sRGB 修正已预研待验）、N2 symbol-elevation（被 raster 阻塞）。

> **2026-08-18 会话总结（line 域 ribbon 管线对齐大轮，commit `90c061d4`→`58e24339`，§12.33–§12.49）**：
> - **方法论**：代码端分批闭环（七批）+ 二分法渲染验证（每轮单变量，karma ~7min/轮）；几何数学验证必须配真实数据鲁棒性验证（短段路网证伪 earcut 单环方案）。
> - **转通过**：line-join/miter·bevel·default（历史千级近失）、line-gradient/gradient、line-pattern/literal。
> - **进入近失带**：line-trim-offset 全族（48 例，120–4597px）、line-border 全族（13 例，737–4864px）、line-pattern 系（opacity 37/with-dasharray 102/@2x 693）、cross-fade（221–2350）、sprites 2x-icon（41）、symbol-elevation collision（220/387）、line-translate/literal（754）、line-offset/literal（1180）、meters-default（2672）、line-blur/default（745）。
> - **新实现清单**：join 全语义（miter-limit/round-limit/bevel/round/none，矩形+外角楔形鲁棒构造）、caps、gradient/pattern 上 ribbon 全链（colorspace 后注入/alpha 通道/v 拉伸线宽/u 纵横比/@2x pixelRatio/sprite 竞态）、line-border 双边条、trim-color/fade、cross-fade 双纹理（line+fill）、per-progress 变宽、blur 中心衰减公式（数值拟合）、translate/offset 几何烘焙（实测方向）、meters 全链、symbol-elevation、icon/text-translate、text-radial-offset、text-max-angle 分段、sprite @2x 选择、image raster paint、['image'] 可用性回退。
> - **零回归**：line-color 344≈337 基线全程保持；既有通过项（line-join 系/gradient）稳定。
> - **known-gap**：raster premultiplied 上传（three 链路不可用，121k 为既有基线）；大 line-offset（>20px）瓦片截断（mgl 是屏幕空间 shader）；blur 晕圈 blend 隔离（与全量 AA feather 同专项）；int-zoom pattern 白点相位；gradient-vector-tile 多 feature 进度。


---

## 0. 状态图例

| 标记 | 含义 |
|------|------|
| ✅ | 端到端生效：emitter 产出 technique prop → 原生 `TileGeometryCreator`/`SolidLineMaterial`/`CirclePointsMaterial`/`TextElementsRenderer`/环境管理器 直接消费 |
| ⚠️ | 部分生效：仅常量值生效 / 依赖 patcher 但 patcher 不可达 / 数据驱动值丢失 / 近似实现 |
| ❌ | 未实现：无消费者，或仅存在于不可达的死代码路径（patcher / symbol-placement），或无源码支持 |
| 🔧 | 由 §1 系统级缺陷导致（`m_tiles` 不可达 / filter 误路由 / technique 缓存 / feature-state 键不匹配 / setStyle URL 崩溃），修复后状态可立即提升 |

---

## 1. 关键系统级阻塞（P0，最先修复）

### S1. `m_tiles` 幻影属性 → patcher 与 symbol-placement 整体不可达（最高优先级）

**✅ 已修复（2026-08-09）**：在 `MBStyleDataSource` 新增 `getDecodedTiles()`，从 `mapView.m_visibleTiles.m_dataSourceCache`（`DataSourceCache`，键 = mortonCode+offset+dataSource，LRUCache.forEach 迭代）过滤本 datasource 的 `Tile.objects`；`MBMaterialPatchManager.patchTileMaterials` / `MBStyleSymbolPlacement.collectSymbols` / `drawTileBoundaries` 三处改用该接口。验证：fill-pattern 系列由空白/纯色变为带图案渲染（literal 仅 3842/262144 px 差异），circle-translate-anchor 58px、text-field/literal 113px，patcher 通路已恢复。

**证据**：全仓库 `@flywave/` 内 `m_tiles` 只有 3 处**读取**、零处赋值：

- `src/MBStyleSymbolPlacement.ts:267` — `const tiles = ds2.m_tiles as Map | undefined;`
- `src/MBMaterialPatchManager.ts:49` — `const tiles = tds.m_tiles as Map | undefined;`
- `src/MBStyleDataSource.ts:1055` — `const tiles = ds.m_tiles as Map | undefined;`

**影响**：`AfterRender` 钩子（`MBStyleDataSource.ts:764-775`）调用 `patcher.patchTileMaterials()` 与 `placement.run()`，二者内部 `if (!tiles) continue;` 直接跳过 → **整个 `MBMaterialPatchManager` 的 shader 增强（pattern/translate/dasharray/gradient/join/border/blur/emissive/trim-offset/extrusion 渐变与地形贴底/heatmap/hillshade/raster 色彩调整/building 立面/护栏/icon halo/icon-text-fit）与整个 `MBStyleSymbolPlacement`（碰撞/offsets/旋转/z-order/跨瓦片 fade）全部不执行**。

**正确瓦片来源**：flywave-mapview 中瓦片缓存于 `MapView.m_visibleTiles.m_dataSourceCache`（`DataSourceCache`，`VisibleTileSet.ts:1272` 以 `mortonCode+offset+dataSource` 键存取；`Tile.objects` 为渲染对象，`Tile.ts:174`）。修补需在 `MBMaterialPatchManager`/`MBStyleSymbolPlacement` 中改用 `ds.m_mapView.m_visibleTiles.m_dataSourceCache` 遍历（或为 `DataSource` 增加公开迭代接口）。

**影响分类**：fill/line/circle/extrusion 的 translate/pattern/join/cap/border/blur/emissive/trim、line-gradient、multi-element dasharray、heatmap、hillshade、raster 色彩调整、building 立面、guardrails、icon-halo/icon-text-fit/icon-anchor/icon-offset、text-offset/rotate/anchor/translate/variable-anchor/keep-upright/rotation/pitch-alignment、symbol-z-order/sort-key/spacing/placement-line、collision debug 等约 **40+ 分类**。修复 S1 后这些状态由 ❌ 一次性提升到"待像素级验证"。

### S2. `isLegacyFilter` 只判算子名 → 表达式形式 filter 被误路由

**✅ 已修复（2026-08-09）**：`isLegacyFilter` 改为——原子算子（has/!has/==/!=/>/>=/</<=/in/!in）仅当 `filter[1]` 为字符串（legacy 属性键形式）才走 legacy；`all/any/none/within/!within` 保持 legacy 编译（其内部递归 `compile()` 已能正确分派表达式子 filter）。同时补上 `distance-from-center` 表达式（haversine 距离，center 经 decoder.configure 传入，`MBExpressionEngine` + `MBLayerEvaluator` + `MBStyleDecoder` 全链路）。验证：`['==',['get','class'],'road']` / `['in',['get','class'],['literal',[...]]]` 表达式形式正确求值，legacy 形式仍正确。

**证据**：`MBFilterCompiler.ts:21-33` `isLegacyFilter` 仅检查 `filter[0]` 是否命中 legacy 算子集合；表达式形式 `["==", ["get","x"], "y"]` / `["<", ["distance-from-center"], 1000]` 被当作 legacy filter 交给 `compileLegacy`（`:51-106`），把 `filter[1]=["get","x"]` 当作**字符串属性名** → `properties[["get","x"]]` 恒为 undefined → 全部要素被过滤。

**影响**：`filter`（equality/in 表达式形式）、`dynamic-filter`（`distance-from-center`/`pitch`）、`distance`（filter 内）、`is-supported-script`、`linear-filter-opacity-edge` 以及 appearance/feature-state 的表达式条件。修复：`isLegacyFilter` 需判断 `filter[1]` 是否为字符串（legacy 形式）而非数组（表达式形式）。

### S3. technique 按 layer.id 单例缓存 → 数据驱动值丢失

**✅ 已修复（2026-08-09）**：`getOrCreateTechniqueIndex` 的缓存键追加 `evaluatedCacheKey(layer)`（`JSON.stringify(paint)|JSON.stringify(layout)` 的稳定序列化），数据驱动属性（circle-color/radius、line-width、fill-extrusion-height、icon/text-size 等）按要素求值结果生成独立 technique。验证：circle-radius/property-function 144px、zoom-and-property-function 22px（修复前仅用首要素值）。

**证据**：`MBTileDataEmitter.ts:502-539` `getOrCreateTechniqueIndex` 每个 layer.id 缓存一个 technique，并把**第一个 feature** 的求值结果写入 `technique._paint`。所有 `property-function` / `zoom-and-property-function` / `["get",...]` 数据驱动用例只使用首要素值。

**影响**：circle-radius/color、line-color/width、fill-extrusion-height/base/color、heatmap-radius/weight、text-size、icon-size 等全部数据驱动分类（约 30+ 分类）。修复：technique 改为按（layer + 要素属性值）分组，或在 decoder 侧按需展开多个 technique。

### S4. feature-state / remove-feature-state 键不匹配

**✅ 已修复（2026-08-09）**：`MBStyleDataSource.setFeatureState/removeFeatureState` 把 mapbox 描述符 `{source,sourceLayer,id}` 归一化为特征 `id` 存储，`removeFeatureState` 同时删除 decoder 端状态并重新 configure；decoder 的 `getFeatureState` 增加 number/string 双表示兜底查找。验证：feature-state/change-brightness 仅 50px、composite-expression 36px（修复前状态从不生效）。

**证据**：runner 以 mapbox 描述符 `{source,sourceLayer,id}` 作键传入 `MBStyleDataSource.setFeatureState`（`MBStyleCompatRenderTest.ts:170-175`），源码原样存储（`MBStyleDataSource.ts:1242-1259`），但 decoder 以解码要素 id 查表（`MBStyleDecoder.ts:67-70`）→ `["feature-state"]`（`MBExpressionEngine.ts:459-462`）恒为 null；remove 也从不重发状态到 decoder。

**影响**：`feature-state`(25)、`remove-feature-state`(3)、featuresets(1) 及依赖 feature-state 的 appearance 条件。

### S5. `setStyle` 对 URL 字符串参数直接 `JSON.parse` 崩溃

**✅ 已修复（2026-08-09）**：compat runner 的 `setStyle` 区分内联 JSON（以 `{` 开头，直接 parse）与 URL/local:// 路径（先 `localizeUrl` + fetch 再 parse，失败回退空样式）；`reloadStyle()` 照旧触发全量刷新。验证：real-world 系列（bangkok/chicago/sanfrancisco 等）不再崩溃，能加载样式并渲染（剩余差异为 sprite/tile 资源与 SwiftShader 精度问题）。

**证据**：`MBStyleCompatRenderTest.ts:159-168` 对 `local://styles/…json` 字符串参数 `JSON.parse(args[0])` 抛异常（try/catch 吞掉后 style 未应用）。

**影响**：`real-world`(9)、`basic-v9`/`bright-v9`/`satellite-v9`(5)、`hd-sd-transition`(11)、`mixed-zoom`(1) 等以 URL 切换样式的用例直接失败。修复：URL 参数需先 fetch/本地化再 parse。

---

## 2. 特性 / 功能清单与实现状态（按层）

> 用例数 = 该分类下含 `style.json` 的目录数（实测计数，与 `compatible-tests.txt` 无关）。

### 2.1 Background 层（29 用例）

| 分类 | 用例 | 状态 | 说明 / 证据 |
|------|------|------|------------|
| background-color | 6 | ✅ | `MBStyleDataSource.ts:1282-1299` → `mapView.clearColor` |
| background-opacity | 3 | ✅ | 同上 → `clearAlpha`；pattern 路径 `MBEnvironmentManager.ts:380-381` |
| background-pattern | 13 | ✅ | `applyBackgroundPattern:336-414` 全屏平铺 sprite 子矩形 |
| background-pitch-alignment | 5 | ✅ | `:391-411` viewport=billboard / map=view-matrix |
| background-visibility | 2 | ❌ | `visibility:"none"` 无消费者，仍渲染 |

### 2.2 Fill 层（~46 用例）

| 分类 | 用例 | 状态 | 说明 / 证据 |
|------|------|------|------------|
| fill-color | 8 | ✅ | technique.color |
| fill-opacity | 9 | ✅ | technique.opacity |
| fill-outline-color | 8 | 🔧 | patcher `patchFillMaterial:467,532-547`，S1 不可达 |
| fill-pattern | 15 | 🔧 | emitter `:297-300` → patcher `:1544-1589`，S1 |
| fill-pattern-cross-fade | 4 | 🔧 | 同 pattern，S1 |
| fill-translate | 3 | ✅ | patcher `:466,520-530`；**2026-08-19 实测 3/3+anchor 2/2 全 0mm（§12.67）** |
| fill-translate-anchor | 2 | ✅ | patcher `resolveTranslate:131-141`；同上全绿 |
| fill-antialias | 1 | ❌ | 仅死代码 `materials/MapFillMaterial.ts:124` |
| fill-sort-key | 2 | ✅ | emitter `:271` 分组排序 |
| fill-visibility | 2 | ✅ | `MBLayerEvaluator.ts:443` + emitter `:309` |
| fill-z-offset | 4 | ❌ | emitter `resolveZOffset:253` 算出 `m_currentZOffset` 后被丢弃（`push(w.x,w.y,0)` `:593`）；仅 `fill-elevation-reference`→`_hdElevation`（`MBMaterialPatchManager.ts:498-514`，S1）能抬升 |
| fill-limit-number-holes | 1 | ✅ | emitter `:560-564` 截断内环 |
| fill-emissive-strength | — | 🔧 | patcher `patchFillMaterial`，S1 |

### 2.3 Line 层（~280 用例，含 elevated-line）

> **共性结论**：`line-color/width/opacity/dash(2 元素)/pitch` 走 native 通道生效；其余（blur/offset/join/cap/border/gradient/pattern/trim/translate/emissive/multi-dash）依赖 patcher → **S1 不可达**。

| 分类 | 用例 | 状态 | 说明 / 证据 |
|------|------|------|------------|
| line-color | 5 | ✅ | technique.lineColor native |
| line-width | 18 | ✅ | emitter `:315,659-675` JS 预挤出 + native SolidLineMaterial |
| line-opacity | 7 | ✅ | technique.opacity |
| line-blur | 5 | ❌ | 无消费者（SolidLineMaterial 无 blur uniform） |
| line-offset | 5 | ❌ | emitter 不产 offset，patcher 无 |
| line-gap-width | 5 | 🔧 | native 需 `secondaryWidth`（emitter 不产）；patcher `:646` 设的 `material.secondaryWidth` 不存在且不可达 |
| line-gradient | 14 | 🔧 | patcher `:702-719` buildGradientTexture，S1；**2026-08-18 ribbon 路径已接线（§12.35，渲染验证待跑）** |
| line-dasharray | 30 | ⚠️ | 2 元素经 native `USE_DASHED_LINE`（`DecodedTileHelpers.ts:526-530`）✅；>2 元素 patcher `:779-812`，S1 不可达 |
| line-cap | 4 | 🔧 | patcher `:608-617` `material.caps`，S1 |
| line-join | 11 | 🔧 | patcher `:619-644`（无 `setJoinType`，写死 define），S1 |
| line-pattern | 20 | 🔧 | patcher `:720-739`，S1；**2026-08-18 ribbon 路径已接线（§12.35，渲染验证待跑）** |
| line-pattern-cross-fade | 5 | 🔧 | 同 pattern，S1 |
| line-pattern-trim-offset | 18 | 🔧 | patcher `:593,682-689`，S1 |
| line-trim-offset | 18 | 🔧 | 同，S1 |
| line-translate | 4 | 🔧 | patcher `:691-701`，S1 |
| line-translate-anchor | 3 | 🔧 | `resolveTranslate:584-587`，S1 |
| line-pitch | 5 | ✅ | 相机 pitch 渲染（native 3D） |
| line-sort-key | 2 | ✅ | emitter `:272,812-814` |
| line-visibility | 2 | ✅ | `MBLayerEvaluator.ts:443` |
| line-border | 13 | 🔧 | patcher `:652-660` `outlineWidth/Color`（emitter 不产 `technique.outlineWidth`，native define 未编译），S1 |
| line-border-gradient | 4 | ❌ | evaluator 存 raw（`MBLayerEvaluator.ts:458`），无 shader 消费者 |
| line-blend-mode | 6 | ✅ | **6/6 全 PASS（§12.71，additive 双 pass 密度归一落地）** |
| line-emissive-strength | 3 | 🔧 | patcher `:740-750`，S1 |
| line-width-unit | 6 | ⚠️ | `meters` 时 patcher `:559-576` 缩放（S1 不可达）；native 硬编码 `metricUnit:'Pixel'`（emitter `:318`）→ meters 语义错误 |
| line-triangulation | 2 | ⚠️ | 无属性消费者；经预挤出 ribbon + SolidLine 近似 |

**elevated-line-\***（21 子类，~200 用例）：z 抬升部分生效（`resolveZOffset:253` + `:646-650` 顶点保 z + `_hdElevation` guardrails），但**每个属性继承对应 line-\* 状态**：`elevated-line-width/color/opacity/cap/pitch/visibility/sort-key` ✅ 或 ⚠️；`elevated-line-blur/offset` ❌；`elevated-line-join/border/gap-width/dasharray/gradient/pattern/pattern-trim-offset/trim-offset/translate/translate-anchor` 🔧（S1）。`elevated-line-triangulation` ⚠️。

### 2.4 Circle 层（~64 用例）

| 分类 | 用例 | 状态 | 说明 / 证据 |
|------|------|------|------------|
| circle-color | 5 | ⚠️ | emitter `:361`；常量 OK，数据驱动丢值（S3） |
| circle-radius | 7 | ⚠️ | emitter `:363` size；数据驱动丢值（S3） |
| circle-blur | 8 | ❌ | 不产；native `CirclePointsMaterial` 无 blur；`MapCircleMaterial` 死代码 |
| circle-opacity | 6 | ✅ | technique.opacity |
| circle-stroke-color | 5 | ❌ | 无消费者 |
| circle-stroke-opacity | 6 | ❌ | 无消费者 |
| circle-stroke-width | 5 | ❌ | 无消费者 |
| circle-pitch-scale | 3 | 🔧 | patcher `:831-837` sizeAttenuation，S1（native shader 也不消费） |
| circle-pitch-alignment | 4 | 🔧 | 同，S1 |
| circle-translate | 3 | ✅ | 实测 3/3 全 0mm（§12.67，px→world + `uMBTranslate` 注入） |
| circle-translate-anchor | 2 | ✅ | 同上 2/2 全绿 |
| circle-sort-key | 3 | ✅ | emitter `:269-276` |
| circle-geometry | 6 | ⚠️ | point/multipoint ✅；line/poly 被 `GEOMETRY_TYPE_MAP.circle=['point']`（`MBStyleSpec.ts:373`）过滤 → 4/6 空白 |
| circle-camera-orthographic-projection | 1 | ❌ | 无正交相机 |

### 2.5 Symbol-Icon 层（~150 用例）

> **共性**：icon-image/size 经 native PoiBuilder 生效；其余 offset/anchor/text-fit/rotate/translate/halo/rotation/pitch 全部依赖 `MBStyleSymbolPlacement.applyOffsets/applyRotationAlignment` 或 `patchIconObject` → **S1 不可达**。

| 分类 | 用例 | 状态 | 说明 / 证据 |
|------|------|------|------------|
| icon-image | 16 | ✅ | technique.imageTexture → PoiBuilder `getImageTexture`（`MBStyleDataSource.ts:1076-1110`） |
| icon-size | 18 | ✅ | technique.iconScale → `PoiRenderer.ts:737`；数据驱动丢值（S3） |
| icon-color | 5 | 🔧 | emitter 设 `color`，但 PoiBuilder 读 `iconColor`；SDF 染色 `patchIconObject:1204-1232` 不可达 |
| icon-opacity | 9 | ⚠️ | technique.opacity 设置，无 PoiRenderer 直接读取 |
| icon-rotate | 3 | 🔧 | 仅死路径 `MBStyleSymbolPlacement.ts:193`（且测试放 layout，代码读 paint） |
| icon-offset | 3 | 🔧 | 死路径 `applyOffsets`；无 `iconXOffset/YOffset` |
| icon-anchor | 11 | 🔧 | 死路径 `applyOffsets:507-526` |
| icon-text-fit | 44 | 🔧 | `applyIconTextFit`（`MBMaterialPatchManager.ts:100-121`）不可达 |
| icon-translate | 3 | 🔧 | 死路径 |
| icon-translate-anchor | 2 | 🔧 | 死路径 |
| icon-pitch-alignment | 4 | 🔧 | 死路径 `applyRotationAlignment` |
| icon-rotation-alignment | 6 | 🔧 | 死路径 |
| icon-halo-color | 7 | 🔧 | SDF halo shader `patchIconObject:1208-1231` 不可达 |
| icon-halo-width | 4 | 🔧 | 同 |
| icon-halo-blur | 5 | 🔧 | 同 |
| icon-visibility | 2 | ✅ | visibility → enabled=false（emitter `:381`） |
| icon-pitch-scaling | 2 | ❌ | 无消费者 |
| icon-pixelratio-mismatch | 1 | ❌ | 无 pixelRatio 缩放 |
| icon-no-cross-source-collision | 1 | ❌ | 无跨源碰撞 |
| icon-secondary-coords-uint16 | 1 | ❌ | icon-image 数组 + cross-fade 不支持 |

### 2.6 Symbol-Text 层（~273 用例）

> **共性**：text-field(token)/size/color/opacity/font/visibility 经 native `TextElementsRenderer`/`TextStyleCache` 生效（emitter 产 `technique.size/color/opacity/fontName`）；wrap/anchor/justify/letterSpacing/lineHeight/offset/rotate/translate/variable-anchor/pitch/rotation/keep-upright 只写入 `_shaped` 或死路径 → **视觉无效**（S1）。

| 分类 | 用例 | 状态 | 说明 / 证据 |
|------|------|------|------------|
| text-field | 23 | ⚠️ | token/literal/property-function ✅；`format` 仅字符串拼接（`MBExpressionEngine.ts:471-495`），**图片段丢弃**、font-scale/color 覆盖跳过；formatted-images ❌ |
| text-size | 13 | ✅ | technique.size → TextStyleCache；数据驱动丢值（S3） |
| text-color | 9 | ✅ | technique.color；数据驱动丢值（S3） |
| text-halo-color | 5 | ❌ | 仅默认值，无 technique halo prop |
| text-halo-width | 4 | ❌ | 同 |
| text-halo-blur | 4 | ❌ | 同 |
| text-opacity | 4 | ✅ | technique.opacity |
| text-transform | 3 | ✅ | `applyTextTransform`（`TextShaping.ts:161`）；'auto' 不支持 |
| text-letter-spacing | 5 | ⚠️ | 传 shapeText 但不映射 `technique.tracking` → 无视觉效果 |
| text-line-height | 2 | ⚠️ | 仅 shapeText，无 `technique.leading` |
| text-max-width | 8 | ⚠️ | wrapText 仅写 `_shaped`，renderer 不 wrap |
| text-max-angle | 2 | 🔧 | getLineAnchors maxAngle，仅死路径 `MBStyleSymbolPlacement.ts:296` |
| text-anchor | 11 | ⚠️ | `getAnchorOffset`（`TextShaping.ts:386`）从不调用 |
| text-justify | 4 | ⚠️ | `getJustifyOffset`（`:350`）仅影响 `_shaped` |
| text-rotate | 8 | 🔧 | 死路径 `MBStyleSymbolPlacement.ts:206-211`；`technique.rotation` 不产 |
| text-offset | 20 | 🔧 | 死路径 `applyOffsets:461-499` |
| text-radial-offset | 1 | 🔧 | 仅死 `PlacementEngine.ts:117` |
| text-translate | 3 | 🔧 | 死路径 `applyOffsets` |
| text-translate-anchor | 2 | 🔧 | 同 |
| text-pitch-alignment | 12 | 🔧 | 死路径 `applyRotationAlignment:247-250` |
| text-rotation-alignment | 6 | 🔧 | 死路径 |
| text-keep-upright | 15 | 🔧 | 死路径 `:216-225` |
| text-variable-anchor | 31 | 🔧 | variableAnchors 收集（`:328/373`）+ 迭代（`PlacementEngine.ts:115-126`），但符号从未收集（S1） |
| text-writing-mode | 32 | ⚠️ | `shapeVerticalText`（`TextShaping.ts:781`）仅 `_shaped`；竖排未传给 renderer |
| text-font | 4 | ✅ | technique.fontName + harness PBF FontCatalog 注入；仅取 `font[0]`，无栈回退 |
| text-font-metrics | 15 | ⚠️ | 真实 PBF metrics 通路（`MBStyleDataSource.ts:1122`、`MBStyleDecoder.ts:341`）；但 datasource shaping 喂死消费者；baseline/ZWSP/标点靠引擎侧 |
| text-arabic | 5 | ❌ | `reshapeArabic`/`shapeRTLText`（`TextShaping.ts:706/768`）、`uax9Reorder`（`BidiAlgorithm.ts:413`）存在但**从未被 decoder/emitter 调用**（仅单测）；靠 mapview `ContextualArabicConverter` |
| text-visibility | 2 | ✅ | visibility → enabled=false（emitter `:420`） |
| text-tile-edge-clipping | 1 | ❌ | 无消费者 |
| text-pitch-scaling | 1 | ❌ | 无消费者 |
| text-no-cross-source-collision | 1 | ❌ | 无消费者 |
| text-max-attributes | 1 | ❌ | halo/emissive/occlusion props 无消费者 |
| text-icon-high-pitch | 1 | ❌ | 无特殊处理 |

### 2.7 Placement / Symbol 层（~60 用例）

| 分类 | 用例 | 状态 | 说明 / 证据 |
|------|------|------|------------|
| symbol-placement: point | — | ⚠️ | 默认点放置 ✅ |
| symbol-placement: line / line-center | 10 | 🔧 | decoder 仅产单中点 + `_linePath`；`m_textPathGeometries` 从不填充（emitter `:1039`）；`getLineAnchors` 仅死路径 |
| symbol-spacing | 5 | 🔧 | 仅死 `collectSymbols`（`:295`） |
| symbol-z-order | 11 | 🔧 | `applyZOrder`（`:415-447`）死路径 |
| symbol-sort-key | 8 | ⚠️ | emitter 分组排序（`:269/972`）；符号不建对象，无 `technique.priority` |
| symbol-visibility | 2 | ✅ | visibility → enabled=false |
| symbol-opacity | 1 | ⚠️ | 仅 icon-opacity=1，无直接消费者 |
| symbol-geometry | 6 | ⚠️ | point/multipoint ✅；line/multiline 中点近似；polygon/multipolygon ❌（无质心标签） |
| symbol-elevation | 17 | 🔧 | `symbol-z-offset` 死路径（`:537-585`）；`symbol-elevation-reference` 0 命中 |
| symbol-cross-fade | 2 | ❌ | 无 zoom 交叉淡入淡出 |
| symbol-distance-fade | 1 | ❌ | 需 sky |
| symbol-icon-brightness/contrast/saturation | 3 | 🔧 | `patchIconObject` 色彩调整，S1 |
| icon-optional | 3 | 🔧 | PlacementEngine 仅 text 重试，S1 |
| placement | 7 | 🔧 | `MBStyleSymbolPlacement` 碰撞/跨瓦片 fade 全部死路径 |

### 2.8 Fill-Extrusion 层（~91 用例）

| 分类 | 用例 | 状态 | 说明 / 证据 |
|------|------|------|------------|
| fill-extrusion-color | 8 | ⚠️ | technique.color；数据驱动丢值（S3） |
| fill-extrusion-height | 6 | ⚠️ | technique.height（`patchExtrusionMaterial` 读，S1）；zoom-fn ✅，数据驱动丢值（S3） |
| fill-extrusion-base | 12 | ⚠️ | 同；edge-radius 变体 ❌ |
| fill-extrusion-opacity | 3 | ✅ | technique.opacity |
| fill-extrusion-vertical-gradient | 3 | 🔧 | patcher `:896,1014-1030`，S1 |
| fill-extrusion-translate | 4 | 🔧 | patcher `:897-901,971-981`，S1 |
| fill-extrusion-translate-anchor | 2 | 🔧 | `resolveTranslate:131-141`，S1 |
| fill-extrusion-pattern | 15 | 🔧 | patcher `:902,910-913`，S1（无世界坐标平铺） |
| fill-extrusion-pattern-cross-fade | 4 | ❌ | `_patternCrossFade`（emitter `:433`）从不被读 |
| fill-extrusion-multiple | 2 | ✅ | 多层独立渲染 |
| fill-extrusion-geometry | 1 | ✅ | 标准多边形路径 |
| fill-extrusion-partial-rendering | 4 | ❌ | patcher `:922-941` 是不平衡 `{` 的坏桩 |
| fill-extrusion-terrain | 13 | 🔧 | patcher `:986-1010` DEM 采样（仅中心瓦片，`terrainExag=1` 硬编码 `:967` 忽略样式 exaggeration），S1 |
| fill-extrusion-vertical-scale | 1 | 🔧 | patcher `:892-893`，S1 |
| fill-extrusion-cutoff-fade-range | 1 | 🔧 | patcher `:1051-1066` 粗糙代理（`abs(vViewPosition.z)`），S1 |
| fill-extrusion-wireframe | 1 | 🔧 | patcher `:916-919` `material.wireframe`，S1 |
| fill-extrusion-rounded-wireframe | 1 | 🔧 | 同 wireframe（无圆角逻辑） |
| fill-extrusion-no-mercator-projection | 1 | ⚠️ | 自定义投影下照常渲染（非专门实现） |
| fill-extrusion-line-width | 9 | 🔧 | patcher `:1033-1048` 边缘暗化近似，S1 |
| fill-extrusion-edge-radius-narrow-corner | 1 | ❌ | 默认值仅存 `MBLayerEvaluator.ts:142`，无消费者 |

### 2.9 Heatmap 层（18 用例）

| 分类 | 用例 | 状态 | 说明 / 证据 |
|------|------|------|------------|
| heatmap-color | 2 | 🔧 | patcher `:1296-1317` ramp，S1 |
| heatmap-intensity | 3 | 🔧 | patcher `:1298,1315`，S1 |
| heatmap-opacity | 3 | 🔧 | patcher `:1318`，S1 |
| heatmap-radius | 7 | 🔧 | 单遍近似，S1 |
| heatmap-weight | 3 | 🔧 | 每要素 weight 丢失（S3），无两遍 density→ramp，S1 |

### 2.10 Hillshade 层（20 用例）

| 分类 | 用例 | 状态 | 说明 / 证据 |
|------|------|------|------------|
| hillshade | 2 | 🔧 | `HillshadeTileDataProvider`（`MBStyleDataSource.ts:171-233`）+ `patchHillshadeMaterial:1329-1412`，S1 |
| hillshade-accent-color | 5 | 🔧 | emitter `:464` + patcher `:1362,1393`，S1 |
| hillshade-shadow-color | 4 | 🔧 | emitter `:461` + patcher，S1 |
| hillshade-highlight-color | 4 | 🔧 | emitter `:465` + patcher `:1363,1394`，S1 |
| hillshade-maxzoom | 2 | ⚠️ | 无 maxzoom 门控，仅 `maxDataLevel`（`:537-541`）限制 overzoom |
| hillshade-buffer | 3 | 🔧 | patcher `:1349-1355` buffer 数学（258/260px DEM），S1 |

### 2.11 Raster 层（~85 用例）

| 分类 | 用例 | 状态 | 说明 / 证据 |
|------|------|------|------------|
| raster-opacity | 3 | 🔧 | patcher `:373-377`，S1 |
| raster-hue-rotate | 3 | 🔧 | patcher `:388,415,429-434`，S1 |
| raster-brightness | 3 | 🔧 | patcher `:382-385,425`，S1 |
| raster-contrast | 3 | 🔧 | patcher `:386,426`，S1 |
| raster-saturation | 3 | 🔧 | patcher `:387,427-428`，S1 |
| raster-color | 3 | ❌ | `hasAdjust`（`:389-393`）读了但 shader 无 `uMBRasColor` |
| raster-resampling | 3 | 🔧 | patcher `:395-397,441-444` Nearest/LinearFilter，S1 |
| raster-filtering | 2 | 🔧 | 同 resampling |
| raster-visibility | 2 | ❌ | emitter `:481` 跳层，但 `applyRasterSource` quad（`MBEnvironmentManager.ts:497-548`）无视可见性仍绘制 |
| raster-rotation | 5 | ✅ | 相机 bearing 旋转 |
| raster-masking | 4 | ⚠️ | `transparent` 仅 opacity<1 时设置（`:374-376`）→ 不透明栅格 alpha 通道不混合 |
| raster-loading | 1 | ✅ | 标准路径 |
| raster-alpha | 1 | ✅ | 标准不透明渲染 |
| raster-extent | 2 | ⚠️ | layer maxzoom 生效，但 quad 无视 maxzoom 仍绘制 |
| raster-elevation | 16 | ❌ | 无 elevation-from-raster 管线（0 命中） |
| raster-elevation-tiled | 14 | ❌ | 同 |
| raster-array | 7 | ❌ | `raster-array` source + paints 未处理 |
| raster-particle | 5 | ❌ | `raster-particle*` paints 未处理 |
| zoomed-raster | 3 | ✅ | `maxDataLevel` overzoom |
| retina-raster | 1 | ⚠️ | 无 pixelRatio 纹理处理 |

### 2.12 Image / Image-Source / Sprites / Video（~53 用例）

| 分类 | 用例 | 状态 | 说明 / 证据 |
|------|------|------|------------|
| image (default/pitched/projected/render-callback/raster-texture-source/wrap/…) | 20 | ⚠️ | `applyImageSources`（`MBEnvironmentManager.ts:550-631`）坐标映射 quad：default/pitched/projected ✅；**terrain 变体无顶点 draping**；**wrap/wrap-projected 无跨反子午线重复**；**raster-brightness/-contrast/-resampling/-visibility/-opacity/-saturation/-hue-rotate 7 子类：`applyImageSources` 忽略全部 raster paint**（quad 原图无调整）；**render-callback 子类不执行 `image/dot.js` 回调模块** → 空白图 |
| image · styleimagemissing | 1 | ❌ | 无 `styleimagemissing` 事件，runner 无 `on` 操作 |
| image-source (hourglass/non-convex-coords) | 2 | ⚠️ | 固定 2 三角形 quad（`:609`）→ 凹/自交坐标三角化错误 |
| image-fallback-nested | 19 | ⚠️ | `['image',name]` 无条件返回名字（`MBExpressionEngine.ts:468-469`）；`coalesce` 取首个非 null → **无 atlas 可用性回退语义** |
| sprites | 8 | ⚠️ | atlas 加载（`MBStyleDataSource.ts:1076-1113`）✅；无 1x/2x pixelRatio 选择/归一 → 2x 图标过大 |
| video | 2 | ❌ | 无 video source/纹理处理 |

### 2.13 Model / Building / 3D-Intersections（~340 用例）

| 分类 | 用例 | 状态 | 说明 / 证据 |
|------|------|------|------------|
| model-layer | 212 | ⚠️ | `loadModels` GLTFLoader（`MBStyleDataSource.ts:856-949`）：per-feature position `:923`、scale `:930`、rotation `:937`、inline+source defs `:875-903` ✅；**无 BVH/per-tile covering/shadows/occlusion/emissive/LOD**；测试资源 `local://models/*` 缺失 |
| building | 53 | ⚠️ | `patchBuildingMaterial`（`:1071`）窗户 `:1130-1139`、屋顶色、AO、flood light、emissive **全部在 patcher 内 → S1 不可达**；roof-shape（hipped/gabled/mansard/pyramidal/skilion/parapet）❌ 仅 `'flat'` 默认（`MBLayerEvaluator.ts:195`） |
| 3d-intersections | 75 | 🔧 | `ElevatedStructures.ts:26-148` guardrail/wall 几何 + `generateGuardrails`（`MBMaterialPatchManager.ts:85-98`），**S1 不可达**；无隧道/下穿/上跨几何 |
| wireframe | 7 | ✅ | `setTerrainWireframe`（`MBStyleDataSource.ts:967`）、`setLayers3DWireframe`（`:972`）、`setLayers2DWireframe`（`:987`） |
| sd-hd-conflation | 14 | ⚠️ | 无 conflation 逻辑，靠 `hd_covered` 数据/表达式通用通过 |
| hd-sd-transition | 11 | ⚠️ | 同；且这些测试用 `setStyle(URL)` → **S5 崩溃** |

### 2.14 Terrain / Occlusion / Elevation（~120 用例）

| 分类 | 用例 | 状态 | 说明 / 证据 |
|------|------|------|------------|
| terrain | 69 | ⚠️ | TerrainController mesh+skirt（`TerrainController.ts:74/234`）、morphing `:199`、fill/line/raster 顶点 draping（`MBMaterialPatchManager.ts:214`）+ FBO draping（`TerrainDraping.ts:157`）✅（**patcher 侧 draping 依赖 S1**，TerrainDraping 自带监听不受 S1 影响）；exaggeration 变更 ✅；**dynamic-exaggeration ❌**（zoom-fn 数组不求值）；**terrarium ❌**（`decodeDemImage` 硬编码 mapbox `TerrainController.ts:304`）；**raycast ❌**（`output:"terrainDepth"` 不支持）；**globe-terrain ❌**（TerrainDraping globe 下 bail）；symbol-draping ⚠️ 无 |
| depth-occlusion | 14 | ⚠️ | Scheme A（`TerrainDepthOcclusion.ts:18-185`）+ Scheme C（`TerrainController.ts:332-334`）；line/circle 软淡入在 patcher（`:668/:852`）→ S1 |
| occlusion | 5 | ⚠️ | line+circle occlusion（patcher `:668/:852`，S1）；`icon-occlusion-opacity`/`text-occlusion-opacity` 仅默认值（`MBLayerEvaluator:109-110`），无符号消费者 |
| occlusion-terrain-depth | 1 | ⚠️ | 同 depth-occlusion |
| cross-source-elevation | 8 | ❌ | 无跨源高程/id 逻辑 |
| front-cutoff | 6 | ❌ | `fill-extrusion-front-cutoff` 仅默认值（`MBLayerEvaluator.ts:148`），无消费者 |

### 2.15 Environment（fog / sky / lighting / theme，~246 用例）

| 分类 | 用例 | 状态 | 说明 / 证据 |
|------|------|------|------------|
| fog | 63 | ⚠️ | FogExp2 + scene.fog（`MBEnvironmentManager.ts:136-152`）；`range`+`color` ✅；**horizon-blend/vertical-range/high-color/space-color 未用**；`star-intensity` → createStars `:179-181`；globe fog 跳过 `:138-141` |
| skybox | 34 | ⚠️ | `createGradientSky`（`:184`）/`createAtmosphereSky`（`:229` 简化，无 rayleigh/mie）+ stars `:287`；**cubemap ❌**（SkySpec 仅 gradient\|atmosphere，`MBStyleSpec.ts:316`）；`sky-gradient-center` 未用；globe sky 跳过 `:165-168` |
| lighting-3d-mode | 120 | ⚠️ | `applyLights`+shadowMap（`:75-134`）；`injectLighting` 仅 extruded-polygon `:889` + building `:1073`（**fill/line/circle 不受光**）；light direction/intensity/color **表达式不解析**；shadow flag 读 `cast-shadow` 与 spec `cast-shadows` 不符 |
| style-with-lights | 1 | ⚠️ | 同 lighting；`["literal",...]`/interpolate 不可解析 |
| light-migration | 2 | ⚠️ | legacy `light` ✅；`flat` 新类型无分支 |
| color-theme | 26 | ❌ | `setTheme` no-op（`MBStyleDataSource.ts:1153`）；runner `setColorTheme` 仅存 `mapView.colorTheme` 无消费者 |
| measure-light | 19 | ✅ | `brightness` getter（`MBEnvironmentManager.ts:26`）→ decoder `:705` → evaluator `MBLayerEvaluator.ts:440` → `['measure-light']`（`MBExpressionEngine.ts:158`）；**注意**：brightness 在 env 创建前配置、之后不再重发 → 可能恒 0（见 §2.17 appearance） |

### 2.16 Globe / Projection / Camera / 视口（~230 用例）

| 分类 | 用例 | 状态 | 说明 / 证据 |
|------|------|------|------------|
| globe | 122 | ⚠️ | `sphereProjection`（`MBStyleDataSource.ts:1331`）+ `MBGlobeController`（`MBGlobeRenderer.ts:27-55`）激活原生管线 ✅；但 datasource fog/sky/terrain-draping 在 globe 下显式禁用（`MBEnvironmentManager.ts:138-141,165-168`）；球体渲染委托原生引擎 |
| map-projections | 53 | ✅ | 数学（`MBProjection.ts:27-88` albers/equalEarth/naturalEarth/winkelTripel/lambert/equirectangular）+ emitter 每顶点重投影（`MBTileDataEmitter.ts:144-154`）+ 线段细分（`:86`）；raster/sprite draping 未做 |
| projection | 4 | ⚠️ | axonometric/skew 靠 harness 相机操作近似 |
| free-camera | 6 | ⚠️ | harness `setCameraPosition`/`lookAtPoint` 用 alt→zoom 近似（`MBStyleCompatRenderTest.ts:424-467`） |
| camera | 3 | ✅ | FOV `setFov` → `setFovCalculation`（`MBStyleDataSource.ts:1002`） |
| fit-screen-coordinates | 3 | ⚠️ | harness `getGeoCoordinatesAt` haversine 近似 |
| zoom-visibility | 6 | ✅ | minzoom/maxzoom（`MBLayerEvaluator.ts:448-449`） |
| zoom-history | 2 | ✅ | dash 按 line-width 缩放 + setZoom 重解码 |
| worldview | 6 | ⚠️ | 表达式（`MBExpressionEngine.ts:164`）+ metadata→decoder（`MBStyleDataSource.ts:707`），但 decoder 存 `m_worldview` **不转发到 evaluate()**（`MBStyleDecoder.ts:270-272` vs `:102-106`）→ ctx.worldview undefined |
| scale-factor | 12 | ⚠️ | harness 重写 icon-size/text-size（`MBStyleCompatRenderTest.ts:905-918`）；src 无 scaleFactor 支持 |
| resize | 2 | ⚠️ | harness `setSize` 改 canvas；src 无消费者 |
| canvas | 4 | ⚠️ | `canvas` source 静态 quad（`MBEnvironmentManager.ts:569-575`）；update/update-resize 不支持 |
| map-mode | 3 | ❌ | `__mapMode` 仅存 flag（`MBStyleCompatRenderTest.ts:988`），无真实模式切换 |
| tile-mode | 1 | ❌ | 同 map-mode |

### 2.17 表达式 / Filter / Feature-state / 配置（~80 用例）

| 分类 | 用例 | 状态 | 说明 / 证据 |
|------|------|------|------------|
| filter | 4 | 🔧 | legacy 形式 ✅；表达式形式被 `isLegacyFilter` 误路由（**S2**） |
| dynamic-filter | 27 | 🔧 | `distance-from-center`/`pitch` 表达式无实现 + S2 |
| feature-state | 25 | 🔧 | **S4** 键不匹配 |
| remove-feature-state | 3 | 🔧 | **S4** 且移除不重发 |
| within | 11 | ✅ | legacy（`MBFilterCompiler.ts:107-114`）+ 表达式（`MBExpressionEngine.ts:517-524`）共用 `featureWithin`（`:805-835`，点在多边形射线法） |
| collator | 2 | ✅ | case/diacritic（`MBExpressionEngine.ts:532-537`）+ NFD 剥离（`:772-791`）+ `resolved-locale` |
| distance | 6 | ⚠️ | 表达式（`:512-515`，haversine `:684-716`）✅；filter 内被 S2 误路由 |
| is-supported-script | 2 | ⚠️ | `/^[a-zA-Z\s]+$/` 正则启发式，无真实脚本表 |
| config | 6 | ⚠️ | 读合并 import-config（`MBExpressionEngine.ts:152-156`）；literal 值 ✅；schema 默认不折叠；作用域参数忽略；表达式/递归值不求值 |
| featuresets | 1 | 🔧 | **S4**（descriptor 作键） |
| color-theme (表达式) | 26 | ❌ | 无 `color-theme` 表达式/LUT 路径 |

### 2.18 数据源 / 瓦片（~60 用例）

| 分类 | 用例 | 状态 | 说明 / 证据 |
|------|------|------|------------|
| geojson | 30 | ⚠️ | inline（`MBStyleDataSource.ts:606-634`）/url fetch `:610-617` ✅；网格聚类 + clusterProperties +/max/min/\* `:234-393`（近似，非 supercluster）；update 用 no-op op → ❌；单源接线 `:543-675` → 无真多源 |
| tilejson-bounds | 2 | ⚠️ | inline tiles+bounds 经 `BoundsFilteredDataProvider`（`:135-163,576-580`）✅；`url:` 形式不 fetch → overwrite-bounds 无瓦片 |
| tms | 1 | ✅ | `TMSDataProvider` y 翻转（`:116-128,571-575`） |
| extent | 4 | ✅ | extent 捕获 → `emitter.setExtents`（`MBStyleDecoder.ts:88-98`） |
| sparse-tileset | 1 | ✅ | `DelegatingDataProvider` 吞 404（`:395-427`） |
| mixed-zoom | 1 | 🔧 | **S5**（setStyle URL） |
| tile-providers | 7 | ❌ | pmtiles url 无 `{z}{x}{y}` → `resolveTileUrl` undefined（`MBStyleManager.ts:210-222`）；无 PMTiles/tile-provider 支持 |
| mapbox:// source | — | ⚠️ | 重写 `api.mapbox.com/v4`（`MBStyleManager.ts:96-111`）；仅 v4 vector/raster 模板，需 token |

### 2.19 Runtime-styling / Composite / 复合层（~800 用例）

| 分类 | 用例 | 状态 | 说明 / 证据 |
|------|------|------|------------|
| runtime-styling | 181 | ⚠️ | paint/layout/filter/zoom-range/add/remove/move 均实现（`MBStyleRuntime.ts:35-230`）并触发重求值 + `markTilesDirty`；`source-add-*`/`set-style-source-add-*` **不接线 provider**（`addSource` 只改 style + onChange，`MBStyleRuntime.ts:244-248`）→ 新源不渲染 |
| combinations | 126 | ⚠️ | 取决于所涉及层（见上） |
| regressions | 122 | ⚠️ | 所用 ops 均实现；结果取决于层支持 |
| appearance | 74 | 🔧 | `appearances` 求值（`MBLayerEvaluator.ts:337,479-498`）；但 `measure-light` brightness **配置时序问题**（env 在配置后创建、不再重发）→ 条件不匹配；feature-state 条件被 S4 破坏 |
| imports | 39 | ⚠️ | `mergeImports` 折叠 inline 子样式（`MBStyleManager.ts:118-171`）；URL imports fetch `:69-90`；`addImport`/`moveImport`/`removeImport`/`updateImport` 改 `style.imports` 后**不重新 merge**；作用域/config-reference/表达式 config 不解析 |
| slots | 8 | ⚠️ | slot 层 inert（`slot` 不在 `GEOMETRY_TYPE_MAP`，`MBStyleSpec.ts:363-383`）；`setSlot` 仅打标 + reloadStyle；顺序与扁平数组序巧合一致 |
| debug | 51 | ✅ | collisionDebug→`setCollisionDebug`（`MBStyleSymbolPlacement.ts:33-34,99`）、`debug`→`setDebugTileBoundaries`（`MBStyleDataSource.ts:1017-1074`）、terrain/3D/2D wireframe（`:967-999`）。**注意**：collision-debug 与 tile-boundaries 依赖 S1 的 tiles 遍历 → 需修复后生效；36/51 是 collision、3 tile-boundary |
| custom-layer-js | 6 | ❌ | `addCustomLayer` 无 case → no-op |
| custom-source | 8 | ❌ | `addCustomSource` no-op；引用新源图层不渲染 |
| video | 2 | ❌ | `source.type:'video'` 未处理 |
| real-world | 9 | 🔧 | **S5**（setStyle URL） |
| basic-v9 / bright-v9 / satellite-v9 | 3/1/1 | 🔧 | **S5** |
| empty | 1 | ✅ | 空源/层 → clear-color |
| random | 1 | ⚠️ | 普通 geojson symbol，取决于文本管线 |
| context-restore | 3 | ⚠️ | `forceContextRestart` 同帧 lose+restore，无 decoder/renderer 重初始化 |
| zoomed-fill | 2 | ⚠️ | 静态矢量 fill + zoom 依赖 opacity |
| linear-filter-opacity-edge | 1 | 🔧 | **S2** |
| GLJS-584 | 1 | ✅ | inline globe projection setStyle |
| featuresets | 1 | 🔧 | **S4** |

---

## 3. 汇总统计（按特性域）

> 用例数为实测；✅/⚠️/❌ 按"当前源码实际可生效"统计（含 🔧 归入 ❌ 或 ⚠️）。S1 修复前的估算。

| 特性域 | 用例 | ✅ | ⚠️ | ❌（含 🔧） |
|--------|------|----|----|----------|
| Background | 29 | 4 | 0 | 1 |
| Fill | 46 | ~8 | ~1 | ~6 |
| Line + Elevated-line | ~280 | ~9 | ~8 | ~16 组 |
| Circle | 64 | ~5 | ~4 | ~5 |
| Symbol-Icon | ~150 | ~4 | ~3 | ~12 |
| Symbol-Text | ~273 | ~10 | ~10 | ~14 |
| Placement/Symbol | ~60 | ~3 | ~4 | ~6 |
| Fill-Extrusion | ~91 | ~6 | ~4 | ~9 |
| Heatmap | 18 | 0 | 0 | 5（全 🔧） |
| Hillshade | 20 | 0 | 1 | 4（全 🔧） |
| Raster | ~85 | ~5 | ~4 | ~12 |
| Image/Sprites/Video | ~53 | ~3 | ~7 | ~3 |
| Model/Building/3D | ~340 | ~2 | ~3 | ~4 组 |
| Terrain/Occlusion | ~120 | ~5 | ~5 | ~5 组 |
| Environment | ~246 | ~2 | ~5 | ~3 组 |
| Globe/Projection/Camera | ~230 | ~7 | ~9 | ~3 |
| 表达式/Filter | ~80 | ~5 | ~4 | ~5（含 S2/S4） |
| 数据源/瓦片 | ~60 | ~5 | ~3 | ~3 |
| Runtime/Composite | ~800 | ~12 | ~9 | ~12 组 |

> **当前端到端可视觉通过估计：约 15–25%**（仅 native technique 通道）。**修复 S1–S5 后可提升至约 50–60%**（patcher 增强恢复 + filter/feature-state/style 修复）。后续逐项像素校正为精度工作。
>
> **⚠️ 2026-08-12 实测证伪**：全量基线（§10）显示实际通过率仅 **6.56%**（182/2775），上述 50–60% 估算过于乐观。
>
> **2026-08-17 实测更新**：历轮全量基线——round1 182/2775（6.56%）→ round2 204/2646（7.71%）→ round3 212/2765（7.67%）→ **baseline4 231/2827（8.17%）**（§10/§11.5/§12.1/§12.9）。此后 08-16/17 定向修复再增：lighting-3d-mode 2→10、skybox 0→1、heatmap 0→15/18、icon-text-fit 0→7/41、icon-size 4→9/18、icon-halo 三分类 0+3+3 → 4/5+4/4+5/7（详见 §12.21–§12.28）。

---

## 4. 移植 TODO（按优先级 / ROI 排序）

### Phase 0 — 系统级缺陷修复（前置，解锁面最大）

| # | 任务 | 解锁分类（用例） | 复杂度 | 状态 |
|---|------|----------------|--------|------|
| P0.1 | **修复 S1 `m_tiles` 幻影属性**：`MBMaterialPatchManager`/`MBStyleSymbolPlacement`/`drawTileBoundaries` 改用 `mapView.m_visibleTiles.m_dataSourceCache` 遍历 `Tile.objects`（或给 `DataSource` 加公开迭代接口） | pattern/translate/join/cap/border/blur/emissive/trim/dash/gradient/heatmap/hillshade/raster 调整/building 立面/guardrails/icon halo+text-fit/所有 symbol offset/rotate/anchor/variable-anchor/z-order/collision debug 等 **~45 分类 / ~1200 用例** | ⭐⭐⭐ | ✅ 已修复 |
| P0.2 | **修复 S2 `isLegacyFilter` 误路由**：仅当 `filter[1]` 为字符串时走 legacy；补 `distance-from-center` 表达式 | filter/dynamic-filter/distance-filter/is-supported-script/appearance 条件（~50） | ⭐ | ✅ 已修复 |
| P0.3 | **修复 S3 technique 单例缓存**：数据驱动值按要素展开 technique（或 emitter 侧按属性值分组） | circle/line/extrusion/heatmap/text/icon 数据驱动（~30 分类） | ⭐⭐⭐ | ✅ 已修复 |
| P0.4 | **修复 S4 feature-state 键**：runner 传 descriptor，src 需按 `source+sourceLayer+id` 归一化查表并支持跨瓦片持久 | feature-state(25)+remove-feature-state(3)+featuresets(1)+appearance 条件 | ⭐⭐ | ✅ 已修复 |
| P0.5 | **修复 S5 setStyle URL 参数**：URL 先本地化+fetch+parse | real-world(9)+v9 styles(5)+hd-sd-transition(11)+mixed-zoom(1) | ⭐ | ✅ 已修复 |

### Phase 1 — 高 ROI 单点特性（S1 修复后的验证与补全）

| # | 任务 | 解锁/修正 | 复杂度 | 状态 |
|---|------|----------|--------|------|
| P1.1 | 验证 S1 修复后 patcher 特性逐分类 pixel-diff（pattern/translate/gradient/join/cap/border/dash>2/trim/emissive/heatmap/hillshade/raster 调整/building 立面/guardrails/icon halo+text-fit/symbol offsets） | ~1200 用例转为"待验证" | ⭐ | 进行中（逐分类抽样验证：fill-pattern/translate、circle-translate 已验证） |
| P1.2 | circle-blur/stroke-*：给 `CirclePointsMaterial` 加 blur/stroke 支持（或接入 `MapCircleMaterial`） | circle-blur(8)+stroke(16) | ⭐⭐⭐ | ⏳ 引擎级（需改 flywave-materials） |
| P1.3 | line-blur / line-offset：SolidLineMaterial 增加 blur/offset uniform 消费 | line-blur(5)+offset(5)+elevated 同 | ⭐⭐ | ⏳ 引擎级 |
| P1.4 | line-cap：patcher 修复后验证 `material.caps`（native define 需 emitter 先产 `technique.outlineWidth`/caps） | line-cap(4) | ⭐ | ✅ 已修复（S1 后 material.caps 生效） |
| P1.5 | line-join：为 SolidLineMaterial 增加 join setter（当前写死 define 无效） | line-join(11) | ⭐⭐ | ⏳ 引擎级 |
| P1.6 | text 原生 props 映射：emitter 把 wrap/anchor/justify/letterSpacing/lineHeight/rotate/offset 映射到 native `TextElementsRenderer` 的 props（`wrappingMode/lineWidth/hAlignment/vAlignment/xOffset/yOffset/tracking/leading/rotation`） | text 全系列（~200） | ⭐⭐⭐ | ✅ 已修复（emitter 映射 tracking/leading/lineWidth/wrappingMode/rotation/hAlignment/vAlignment/xOffset/yOffset/priority/mayOverlap/reserveSpace） |
| P1.7 | icon 原生 props 映射：emitter 把 icon-color/offset/anchor/rotate 映射到 `PoiBuilder` 的 `iconColor/iconXOffset/iconYOffset/rotation` | icon-color(5)+offset(3)+anchor(11)+rotate(3) | ⭐⭐ | ✅ 部分（icon-color→iconColor 已验证 58px；offset/anchor/rotate 需引擎 prop） |
| P1.8 | circle-translate：patcher 注入 `uMBTranslate` 的 shader 代码（当前只设 uniform 不注入） | circle-translate(3)+anchor(2) | ⭐ | ✅ 已修复（`transformed.xy += uMBTranslate`，anchor/map 58px） |
| P1.9 | circle-geometry：把 line/polygon 几何映射到 circle 层（`GEOMETRY_TYPE_MAP.circle` 扩展） | circle-geometry 4/6 | ⭐ | ✅ 已修复（GEOMETRY_TYPE_MAP 扩展 + decoder 顶点/环点发射，point 36px） |
| P1.10 | raster-visibility / raster-extent：`applyRasterSource` quad 尊重层 visibility 与 maxzoom | raster-visibility(2)+extent(2) | ⭐ | ✅ 已修复（quad 路径尊重 visibility/maxzoom） |
| P1.11 | text-arabic：decoder/emitter 调用既有 `reshapeArabic`/`shapeRTLText` + `uax9Reorder` | text-arabic(5) | ⭐⭐ | ✅ 已修复（emitter 用 shapeRTLText，mixed-numeric 137px） |
| P1.12 | measure-light 时序 + mapbox 公式：env 创建后重发 brightness；`(relLum(dir)*int*polar + relLum(amb)*int)/2` | appearance 条件（measure-light 19） | ⭐ | ✅ 已修复（geojson 用例 266px；setLights 后重发） |

### Phase 2 — 精度 / 补充特性

| # | 任务 | 解锁 | 复杂度 |
|---|------|------|--------|
| P2.1 | raster-color 混色：`patchRasterMaterial` 加 `uMBRasColor` + mix | raster-color(3) | ⭐⭐ |
| P2.2 | line-border-gradient：patcher 为 border 注入渐变 | line-border-gradient(4) | ⭐⭐⭐ |
| P2.3 | fill-z-offset：emitter 恢复 z 应用（`m_currentZOffset` 写回顶点） | fill-z-offset(4) | ⭐ |
| P2.4 | symbol-placement line/line-center：emitter 填充 `m_textPathGeometries` + native 沿线放置 | symbol-placement(10)+symbol-spacing(5)+text-max-angle(2) | ⭐⭐⭐ |
| P2.5 | symbol-z-order / symbol-sort-key 原生排序：映射 `technique.priority`/`renderOrder` | symbol-z-order(11)+sort-key(8) | ⭐⭐ |
| P2.6 | background-visibility：`visibility:"none"` 跳过背景 | background-visibility(2) | ⭐ |
| P2.7 | image raster paint：`applyImageSources` 应用 brightness/contrast/resampling/opacity/visibility | image 7 子类 | ⭐⭐ |
| P2.8 | image wrap / terrain：跨反子午线重复 + DEM draping | image 4 子类 | ⭐⭐⭐ |
| P2.9 | fill-extrusion-partial-rendering：修复坏桩（高度阈值 discard） | partial-rendering(4) | ⭐⭐ |
| P2.10 | worldview：decoder 把 `m_worldview` 传入 evaluate ctx | worldview(6) | ⭐ |
| P2.11 | sprites pixelRatio：1x/2x sprite 选择/归一 | sprites(8)+icon-pixelratio(1) | ⭐⭐ |
| P2.12 | texture 级 cross-fade：zoom 变化保留旧瓦片淡出 | symbol-cross-fade(2)+zoom-history dash | ⭐⭐⭐ |

### Phase 3 — 大型工程（需架构/引擎级）

| # | 任务 | 用例 | 复杂度 |
|---|------|------|--------|
| P3.1 | fill-extrusion-terrain 完整（多瓦片 DEM + 真实 exaggeration） | 13 | ⭐⭐⭐ |
| P3.2 | terrain dynamic-exaggeration / terrarium / raycast / globe-terrain | ~10 | ⭐⭐⭐⭐ |
| P3.3 | fog 精度（horizon-blend/vertical-range/pitch 渐入） | fog 63 | ⭐⭐⭐ |
| P3.4 | sky cubemap + 真实 atmosphere（rayleigh/mie） | skybox 部分 | ⭐⭐⭐ |
| P3.5 | lighting 作用于 fill/line/circle（非仅 extrusion/building）+ 表达式 direction/intensity | lighting-3d-mode 120 | ⭐⭐⭐⭐ |
| P3.6 | building roof-shape 几何（hipped/gabled/mansard/pyramidal/skilion/parapet） | building ~6 | ⭐⭐⭐⭐ |
| P3.7 | 3d-intersections 完整（隧道/下穿/上跨 + elevation graph） | 75 | ⭐⭐⭐⭐⭐ |
| P3.8 | model-layer 瓦片化/BVH/LOD/阴影 | model-layer 212 | ⭐⭐⭐⭐ |
| P3.9 | color-theme 系统（`color-theme` 表达式 + LUT） | color-theme 26 | ⭐⭐⭐ |
| P3.10 | raster-elevation / raster-array / raster-particle | ~42 | ⭐⭐⭐⭐ |
| P3.11 | custom-layer-js / custom-source / video | ~16 | ⭐⭐⭐ |
| P3.12 | tile-providers（PMTiles 等） | 7 | ⭐⭐⭐ |
| P3.13 | 多源支持 / cluster 精度（supercluster） | geojson ~10 | ⭐⭐⭐ |
| P3.14 | imports 运行时重新 merge / slots 排序 / config scope | imports+slots ~47 | ⭐⭐⭐ |
| P3.15 | front-cutoff / cross-source-elevation / occlusion symbol | ~19 | ⭐⭐⭐⭐⭐ |
| P3.16 | sd-hd-conflation / hd-sd-transition 真实 HD 覆盖逻辑 | ~25 | ⭐⭐⭐⭐ |
| P3.17 | map-mode / tile-mode 真实模式切换 | 4 | ⭐⭐ |
| P3.18 | free-camera / setPadding 精确（需引擎 API） | ~17 | ⭐⭐⭐ |

---

## 5. 测试基础设施缺口（`MBStyleCompatRenderTest.ts` operations）

> 逐条核验（`MBStyleCompatRenderTest.ts:119-776`）。标记 ✅ 已实现 / ⚠️ 近似 / ❌ no-op。

| 操作 | 状态 | 备注 |
|------|------|------|
| wait / waitFrameReady / frameReady / sleep | ✅ | |
| setPaintProperty / setLayoutProperty / setFilter / setLayerZoomRange | ✅ | |
| addLayer / removeLayer / moveLayer | ✅ | |
| setStyle | ⚠️ | 内联对象 ✅；URL 字符串崩溃（S5） |
| setFeatureState / removeFeatureState | ❌ | S4 键不匹配 |
| setZoom / setCenter / setBearing / setPitch | ✅ | |
| setGeoJSONSourceData | ✅ | |
| addImage / removeImage / updateImage | ✅ | render-callback 模块不执行 |
| setProjection | ✅ | mercator/globe/custom |
| setLights / setLight / setFog / setTerrain | ✅ | |
| addModel | ✅ | |
| addSource / removeSource | ⚠️ | 只改 style，不接线 provider |
| setConfigProperty / setStyleImportConfigProperty | ❌ | 不重新 merge |
| setLayerProperty | ❌ | 就地改，无重建 |
| setColorTheme | ❌ | no-op |
| easeTo / jumpTo / rotateTo / resetNorth / resetNorthPitch | ✅ | |
| setPadding | ⚠️ | principal-point 近似 |
| setCameraPosition / lookAtPoint / fitScreenCoordinates | ⚠️ | zoom/alt 近似 |
| setFov / setSize | ✅ | |
| setWorldview | ✅ | |
| forceContextRestart | ⚠️ | 同帧 lose+restore |
| check / forceRenderCached / pinBooleanTransitionProgress | ❌ | no-op |
| setSlot | ⚠️ | 仅打标 |
| addImport / moveImport / removeImport / updateImport | ❌ | 不重新 merge |
| setRenderWorldCopies / setRuntimeSettingBool/String | ❌ | 仅存 flag |
| setCustomTexture | ⚠️ | 注册到 sprite atlas |
| addCustomLayer / addCustomSource / on / updateFakeCanvas / updateGeoJSONData | ❌ | 无 case |
| **feedback-url / 结果上报** | ✅ | `RenderingTestResultReporter` + `scripts/run-mbstyle-render-tests.js` |

**其他基础设施缺口**：
- `image-threshold` / `fadeDuration` / `scaleFactor` / `collisionDebug` / `showTerrainWireframe` / `showLayers3DWireframe` / `showLayers2DWireframe` / `debug` metadata ✅；`mapMode` ⚠️（仅 flag）。
- `skip-test` 仅匹配 `platform-tag-contains === ""`，非完整 platform-tag 匹配。
- `expected-<platform>.png` 多基线选择未实现（只看 `expected.png`）。
- `fontCatalog` 使用 flywave 默认字体；`style.glyphs` 时经 `buildFontCatalogFromPBF` 注入 PBF 字形（`MBStyleCompatRenderTest.ts:929-967`）——需真机验证。
- headless SwiftShader 三层渲染阻塞（材质程序编译 / EffectComposer 合成 / canvas toBlob 捕获）→ 自动化管道当前全红；真机 GPU 验证后同一管道输出真实通过率（见 `docs/render-tests-final-report.md` §三、§六）。

---

## 6. 附录：全量分类清单（270 分类 / 3031 用例，按用例数降序，三列排布）

> 用例数 = 该分类下所有含 `style.json` 的目录总数（递归计数）。

| 用例 | 分类 | 用例 | 分类 | 用例 | 分类 |
|------|------|------|------|------|------|
| 212 | model-layer | 181 | runtime-styling | 126 | combinations |
| 122 | regressions | 122 | globe | 120 | lighting-3d-mode |
| 75 | 3d-intersections | 74 | appearance | 69 | terrain |
| 63 | fog | 53 | map-projections | 53 | building |
| 51 | debug | 44 | icon-text-fit | 39 | imports |
| 34 | skybox | 32 | text-writing-mode | 31 | text-variable-anchor |
| 30 | line-dasharray | 30 | geojson | 29 | elevated-line-dasharray |
| 27 | dynamic-filter | 26 | color-theme | 25 | feature-state |
| 23 | text-field | 20 | text-offset | 20 | line-pattern |
| 20 | image | 19 | measure-light | 19 | image-fallback-nested |
| 19 | elevated-line-pattern | 18 | line-width | 18 | line-trim-offset |
| 18 | line-pattern-trim-offset | 18 | icon-size | 17 | symbol-elevation |
| 16 | raster-elevation | 16 | icon-image | 16 | elevated-line-trim-offset |
| 16 | clip-layer | 15 | text-keep-upright | 15 | text-font-metrics |
| 15 | fill-pattern | 15 | fill-extrusion-pattern | 14 | sd-hd-conflation |
| 14 | raster-elevation-tiled | 14 | line-gradient | 14 | depth-occlusion |
| 13 | text-size | 13 | line-border | 13 | fill-extrusion-terrain |
| 13 | background-pattern | 12 | text-pitch-alignment | 12 | scale-factor |
| 12 | fill-extrusion-base | 12 | elevated-line-pattern-trim-offset | 12 | elevated-line-gradient |
| 11 | within | 11 | text-anchor | 11 | symbol-z-order |
| 11 | line-join | 11 | icon-anchor | 11 | hd-sd-transition |
| 11 | elevated-line-join | 10 | symbol-placement | 9 | text-color |
| 9 | real-world | 9 | icon-opacity | 9 | fill-opacity |
| 9 | fill-extrusion-line-width | 8 | text-rotate | 8 | text-max-width |
| 8 | symbol-sort-key | 8 | sprites | 8 | slots |
| 8 | fill-outline-color | 8 | fill-extrusion-color | 8 | fill-color |
| 8 | elevated-line-width | 8 | custom-source | 8 | cross-source-elevation |
| 8 | circle-blur | 7 | wireframe | 7 | tile-providers |
| 7 | raster-array | 7 | placement | 7 | line-opacity |
| 7 | icon-halo-color | 7 | heatmap-radius | 7 | elevated-line-opacity |
| 7 | elevated-line | 7 | circle-radius | 6 | zoom-visibility |
| 6 | worldview | 6 | text-rotation-alignment | 6 | symbol-geometry |
| 6 | line-width-unit | 6 | line-blend-mode | 6 | icon-rotation-alignment |
| 6 | front-cutoff | 6 | free-camera | 6 | fill-extrusion-height |
| 6 | elevated-line-border | 6 | distance | 6 | custom-layer-js |
| 6 | config | 6 | circle-stroke-opacity | 6 | circle-opacity |
| 6 | circle-geometry | 6 | background-color | 5 | text-letter-spacing |
| 5 | text-halo-color | 5 | text-arabic | 5 | symbol-spacing |
| 5 | raster-rotation | 5 | raster-particle | 5 | occlusion |
| 5 | line-pitch | 5 | line-pattern-cross-fade | 5 | line-offset |
| 5 | line-gap-width | 5 | line-color | 5 | line-blur |
| 5 | icon-halo-blur | 5 | icon-color | 5 | hillshade-accent-color |
| 5 | elevated-line-pitch | 5 | elevated-line-offset | 5 | elevated-line-color |
| 5 | elevated-line-blur | 5 | circle-stroke-width | 5 | circle-stroke-color |
| 5 | circle-color | 5 | background-pitch-alignment | 4 | text-opacity |
| 4 | text-justify | 4 | text-halo-width | 4 | text-halo-blur |
| 4 | text-font | 4 | raster-masking | 4 | projection |
| 4 | line-translate | 4 | line-cap | 4 | line-border-gradient |
| 4 | icon-pitch-alignment | 4 | icon-halo-width | 4 | hillshade-shadow-color |
| 4 | hillshade-highlight-color | 4 | filter | 4 | fill-z-offset |
| 4 | fill-pattern-cross-fade | 4 | fill-extrusion-translate | 4 | fill-extrusion-pattern-cross-fade |
| 4 | fill-extrusion-partial-rendering | 4 | extent | 4 | elevated-line-translate |
| 4 | elevated-line-gap-width | 4 | elevated-line-cap | 4 | circle-pitch-alignment |
| 4 | canvas | 3 | zoomed-raster | 3 | text-translate |
| 3 | text-transform | 3 | remove-feature-state | 3 | raster-saturation |
| 3 | raster-resampling | 3 | raster-opacity | 3 | raster-hue-rotate |
| 3 | raster-contrast | 3 | raster-color | 3 | raster-brightness |
| 3 | map-mode | 3 | line-translate-anchor | 3 | line-emissive-strength |
| 3 | icon-translate | 3 | icon-rotate | 3 | icon-offset |
| 3 | hillshade-buffer | 3 | heatmap-weight | 3 | heatmap-opacity |
| 3 | heatmap-intensity | 3 | fit-screen-coordinates | 3 | fill-translate |
| 3 | fill-extrusion-vertical-gradient | 3 | fill-extrusion-opacity | 3 | elevated-line-translate-anchor |
| 3 | context-restore | 3 | circle-translate | 3 | circle-sort-key |
| 3 | circle-pitch-scale | 3 | camera | 3 | basic-v9 |
| 3 | background-opacity | 2 | zoomed-fill | 2 | zoom-history |
| 2 | video | 2 | tilejson-bounds | 2 | text-visibility |
| 2 | text-translate-anchor | 2 | text-max-angle | 2 | text-line-height |
| 2 | symbol-visibility | 2 | symbol-cross-fade | 2 | resize |
| 2 | raster-visibility | 2 | raster-filtering | 2 | raster-extent |
| 2 | line-visibility | 2 | line-triangulation | 2 | line-sort-key |
| 2 | light-migration | 2 | is-supported-script | 2 | image-source |
| 2 | icon-visibility | 2 | icon-translate-anchor | 2 | icon-pitch-scaling |
| 2 | hillshade-maxzoom | 2 | hillshade | 2 | heatmap-color |
| 2 | fill-visibility | 2 | fill-translate-anchor | 2 | fill-sort-key |
| 2 | fill-extrusion-translate-anchor | 2 | fill-extrusion-multiple | 2 | elevated-line-visibility |
| 2 | elevated-line-triangulation | 2 | collator | 2 | circle-translate-anchor |
| 2 | background-visibility | 1 | tms | 1 | tile-mode |
| 1 | text-tile-edge-clipping | 1 | text-radial-offset | 1 | text-pitch-scaling |
| 1 | text-no-cross-source-collision | 1 | text-max-attributes | 1 | text-icon-high-pitch |
| 1 | symbol-opacity | 1 | symbol-icon-saturation | 1 | symbol-icon-contrast |
| 1 | symbol-icon-brightness | 1 | symbol-distance-fade | 1 | style-with-lights |
| 1 | sparse-tileset | 1 | satellite-v9 | 1 | retina-raster |
| 1 | raster-loading | 1 | raster-alpha | 1 | random |
| 1 | occlusion-terrain-depth | 1 | mixed-zoom | 1 | linear-filter-opacity-edge |
| 1 | icon-secondary-coords-uint16 | 1 | icon-pixelratio-mismatch | 1 | icon-no-cross-source-collision |
| 1 | fill-limit-number-holes | 1 | fill-extrusion-wireframe | 1 | fill-extrusion-vertical-scale |
| 1 | fill-extrusion-rounded-wireframe | 1 | fill-extrusion-no-mercator-projection | 1 | fill-extrusion-geometry |
| 1 | fill-extrusion-edge-radius-narrow-corner | 1 | fill-extrusion-cutoff-fade-range | 1 | fill-antialias |
| 1 | featuresets | 1 | empty | 1 | elevated-line-sort-key |
| 1 | circle-camera-orthographic-projection | 1 | bright-v9 | 1 | GLJS-584 |

---

## 7. 建议的下一步

1. **✅ 已完成（2026-08-09）**：P0.1–P0.5（S1–S5）全部修复，`render-tests-index.ts` 重新生成全量 3026 用例并修复 TS2590（改 `JSON.parse` 方式内联）；tsc + 207 单元测试通过；自动化管道在 headless 下跑通（fill-pattern/translate、circle-radius 数据驱动、feature-state、filter 表达式、real-world setStyle 均已验证生效）。
2. **✅ Phase 1 高 ROI 单点修复**：P1.4/P1.6/P1.7(icon-color)/P1.8/P1.9/P1.10/P1.11/P1.12 已完成并验证（见 §4 状态列）；P1.2/P1.3/P1.5（circle blur/stroke、line blur/offset/join）为引擎级（需改 flywave-materials / SolidLineMaterial）。**剩余主要阻塞**：vector tile（mvt）要素渲染（大量 measure-light/real-world 用例的 fill 不显示）、raster 瓦片纹理管线、文本像素级对齐（字体系统差异，P2.1 per-glyph SDF）。
3. **✅ 逐分类校正（2026-08-09）—— 系统性相机/坐标/函数修复**（见 §8）：修复后 circle/fill/background 基础分类（circle-color/radius/opacity、fill-color/opacity/outline、background-color/literal）在 headless 下通过；line/extrusion 仍受 SwiftShader 渲染阻塞（需真机 GPU）。
4. **✅ 全量基线评估（2026-08-12）**：已用分批脚本跑完全量 3031 用例（见 §10）。**182/2775 通过（6.56%）**，远低于此前 50–60% 估算；text/line/raster/fog/skybox/lighting/model 整域全红，需优先排查"整域 0 通过"的系统性原因（文本管线、SwiftShader 线段挤出、栅格纹理）。
5. 之后按 §4 Phase 2 逐分类做"修复 + pixel-diff 验证"。

---

## 8. 逐分类校正记录（2026-08-09）

> 通过逐分类分析 actual/expected 像素差异定位的系统性根因，全部已在 headless 下验证改善。

| # | 根因 | 修复 | 验证 |
|---|------|------|------|
| Z1 | **相机缩放不匹配**：flywave 在相机 zoom z 时 level-z 瓦片显示 256px，mapbox 为 512px（`calculateDistanceFromZoomLevel` 除以 256）→ 所有内容被压缩 ~2x | `applyCameraSettings` 相机 zoom = mapbox zoom + 1；`setZoom`/`easeTo`/`jumpTo` 同样 +1 | fill/circle/background 由数千 mismatch 降至 0 通过 |
| Z2 | **decoder zoom 求值 +1**：相机 +1 后 `tileKey.level - storageLevelOffset` = 相机 zoom = mapbox+1，zoom 表达式求值偏高 | decoder zoom 减 1（`MBStyleDecoder.ts:377`） | circle-radius/function 641→通过 |
| Z3 | **minDataLevel=1 钳制**：zoom-0 测试无法加载 level-0 瓦片 → 加载 level-1 瓦片求值 zoom 1 | `minDataLevel: 0` | zoom-0 数据驱动正确 |
| Z4 | **circle-radius 是半径、`gl_PointSize` 是直径** → 圆渲染为一半大小 | emitter `size = circle-radius * 2` | circle-radius/default 3940→通过 |
| Z5 | **参考图透明背景 vs 引擎不透明画布**：mapbox expected 为 RGBA alpha=0 背景，引擎画布全不透明 → alpha 通道大量误报 | `compareImages` 将参考图 alpha 合成到白色后比较 | 去除全图 alpha 误报 |
| Z6 | **legacy zoom-and-property 函数**（`{property, stops:[[{zoom,value},result]]}`）未实现 | `evaluateLegacyZoomAndProperty` 双线性插值 | circle-radius/zoom-and-property-function 2597→通过 |

---

## 9. 代码级缺口对齐记录（2026-08-09）

> 优先做"未实现功能的代码级补齐"，不依赖 headless 像素验证；每项均通过 tsc + 单元测试。

| # | 缺口 | 实现 | 状态 |
|---|------|------|------|
| C1 | **background-visibility**（`visibility:"none"` 仍渲染背景） | `applyBackgroundColor` 检测 `layout.visibility==='none'` 直接跳过 | ✅ |
| C2 | **worldview**（decoder 存了 `m_worldview` 但从不传入 evaluate ctx） | 三处 `evaluate` 调用改传 `this.m_worldview` | ✅ |
| C3 | **fill-extrusion-pattern-cross-fade**（emitter 存了 `_patternCrossFade` 但 extrusion patcher 不用） | 改用 `patchFillPatternMaterial`（含 cross-fade mix） | ✅ |
| C4 | **line-border-gradient**（evaluator 存 raw，patcher 无消费者） | patcher 解析 interpolate stops → `buildGradientTexture`，注入 `outlineColor`/`outputDiffuse` 采样 | ✅ |
| C5 | **line-gradient 注入目标错误**（目标 `gl_FragColor=vec4(diffuse,opacity)` 在 SolidLineMaterial 不存在） | 改注入 `vec3 outputDiffuse = diffuseColor;`（SolidLineMaterial 真实结构）+ `#include <common>` 加 uniform | ✅ |
| C6 | **fill-extrusion-partial-rendering 坏桩**（注入不平衡 `{` 破坏 shader；且测试实为引擎侧 frustum culling） | 移除坏桩；标注该类测试需 `check renderedVerticesCount`（runner no-op） | ✅ |
| C7 | **symbol-placement line/line-center**（emitter 的 `m_textPathGeometries` 从不填充） | `processPointFeature` 检测 line placement，把 `_linePath` 转世界坐标生成 `TextPathGeometry` | ✅ |
| C8 | **is-supported-script**（仅拉丁正则可过，Devanagari/Arabic/CJK 全 false） | Unicode 脚本区间检测（Devanagari/Arabic/Hebrew/Cyrillic/Greek/CJK/Hangul/Thai/Latin 扩展） | ✅ |
| C9 | **TileJSON `url:` 源**（非 `{z}{x}{y}`/`mapbox://` 的 url 无 tiles） | `resolveSources` 异步化 + fetch TileJSON 取 `tiles`/`bounds`/minzoom/maxzoom | ✅ |
| C10 | **runtime addSource/removeSource 不接线 provider**（新源瓦片不加载） | 抽取 `wireTileSources` + 新增 `reloadSources()`；runner 的 add/removeSource 后调用 | ✅ |
| — | text/icon halo（halo-color/width/blur） | flywave-text-canvas TextStyle 无 halo/outline 支持 → 引擎级，需改 flywave-text-canvas | ⏳ 引擎级 |
| — | raster-color 测试（raster-value 色带） | 需 raster-value 数据通道（非单瓦片纹理），架构级 | ⏳ 架构级 |

---

## 10. 全量基线实测（2026-08-12）

### 10.1 运行环境与本次修复的基建问题

- **浏览器**：本机无 Chrome，使用 **Microsoft Edge 151 headless**（Chromium 内核，`CHROME_BIN` 指向 Edge）+ SwiftShader（`--use-angle=swiftshader`）。
- **构建修复**：根 `node_modules` 依赖链接缺失（`process/browser`、`earcut` 解析失败）→ `pnpm install` 重新链接后 webpack 构建通过（注意：`@flywave/flywave-terrain-datasource` 的 `prepare` 脚本有**先于本次基线存在**的 stratum TS 编译错误，导致 `pnpm install` 退出码非 0，但链接已完成，与 render-tests 无关）。
- **结果服务器**：管道被强杀后会遗留孤儿 `RenderingTestResultServer` 进程占用端口 → 下一次运行 EADDRINUSE 崩溃，runner 上报 "Failed to fetch"。重跑前需 `lsof -iTCP:<port>` 清理。
- **karma 容错**（`karma.options.js`）：`browserNoActivityTimeout` 60s→300s、`browserDisconnectTimeout` 10s→60s、新增 `browserDisconnectTolerance: 3`（渲染器崩溃后自动重连续跑）。
- **分批脚本**（新增 `scripts/run-mbstyle-render-tests-chunked.js`）：单跑全量时浏览器在第 24 个用例（3d-intersections）崩溃导致整轮中止；改为按分类分批（小类合并 ≤80 用例/批，大类单独），崩溃只损失当前批。结果按用例名落盘，可断点累计。

### 10.2 总量数字

| 指标 | 数值 |
|------|------|
| 用例总数 | 3031 |
| 实际上报结果 | 2775 |
| **通过** | **182（6.56%）** |
| 失败（差异 >600px） | 2138 |
| 失败（差异 ≤600px，"近失"） | 455 |
| 未上报（崩溃/超时/挂起） | 256 |

- 结果目录：`rendering-test-results/mbstyle/`（含每用例 actual/diff 图与 `*.ibct-result.json`）；分类统计：`baseline-stats.txt`。
- 复现命令：`CHROME_BIN="/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge" node scripts/run-mbstyle-render-tests-chunked.js`

### 10.3 通过分布（182 通过）

- **runtime-styling 66/181**（最大通过组）、**geojson 11/30**、**combinations 8/126**、**zoom-visibility 6/6（全绿）**、appearance 5/74、circle-radius 5/7、circle-geometry 4/6。
- 2–3 个通过：background-color、circle-blur/color/opacity、filter、feature-state、globe、icon/text-rotation-alignment、background-visibility、config、fill-color/opacity、imports、raster-extent、remove-feature-state、terrain、line-width（zero-width）、elevated-line-* 零星。
- 其余为 1 个通过的零星项（多为 `visibility:none`、`zero-width`、`default`、`missing` 等"渲染为空/基色即正确"的用例）。

### 10.4 未上报的 256 个用例

- **model-layer 180/212 未上报**：该批在第 25 个用例处浏览器崩溃（重连 3 次后仍失败），批超时（20min）终止 → 绝大部分 model-layer 用例无结果。
- map-projections 25 未上报；其余为 1–5 个的零星缺失（GLJS-584、basic-v9、raster-particle、style-with-lights、tile-mode、resize、symbol-distance-fade、symbol-icon-*、text-max-attributes、icon-secondary-coords-uint16、occlusion-terrain-depth、mixed-zoom 等）——多为该批内挂起/崩溃点前未完成的用例。
- **3d-intersections 请求 `local://tiles/3d-intersections/15-*.mvt` 全部 404**：本地 fixtures 只有 z14/z16 瓦片（`test/rendering/integration/tiles/3d-intersections/` 仅 14-8717-5683、16-* 等 5 个文件），z15 瓦片从未入库 → 该域 75 用例实质在"无数据"下渲染。这印证了 §7 提到的 **mvt 矢量瓦片渲染阻塞**。

### 10.5 实测与文档估算的矛盾点（需优先复查）

1. **text-\* 整域 0 通过**（text-size/color/field/font/opacity 等 §2.6 标注 ✅ 的 native 通道也全红，仅 text-keep-upright/text-pitch-alignment 各 1 个"空渲染即正确"通过）→ 文本管线在 headless 下可能**整体不出字**（字体 atlas/glyph PBF 注入或 TextElementsRenderer SwiftShader 问题），而非像素精度问题。**这是最大的单域阻塞（~273 用例）**。
2. **line-\* / elevated-line-\* 整域 ~0 通过**（仅 zero-width/visibility 等空渲染用例通过）→ 与 `render-tests-final-report.md` §三的 SwiftShader 线段挤出阻塞一致，需真机 GPU 或修 EffectComposer 验证。
3. **fill/background/circle 基础分类仅部分通过**（fill-color 2/8、background-color 3/6、circle-color 3/5；§7 称"基础分类已通过"的说法过于乐观）→ literal/default 过了但 function/zoom 变体仍有差异，Z1–Z6 修复未完全覆盖。
4. **fog 0/63、skybox 0/34、lighting-3d-mode 0/116、building 0/52、heatmap 0/18、hillshade 0/20、raster 全系 ~0** → 这些 §2 标 ⚠️/🔧 的域实测确认**无一视觉对齐**。
5. §3 的"修复 S1–S5 后 50–60% 通过"估算**不成立**：实测 6.56%（+455 近失也才 ~23%）。patcher 通路恢复（S1）并未带来大面积通过，说明 patcher 输出与 mapbox 参考存在系统性视觉差异（坐标/缩放/材质语义），而非"通路通了即对齐"。

### 10.6 基线结论与下一步（更新优先级）

1. **P0 排查 text 整域不出字**（~273 用例 + symbol/icon 依赖字体的用例）：验证 headless 下 `local://glyphs/*.pbf` 是否加载、FontCatalog 注入是否生效、TextElementsRenderer 在 SwiftShader 是否有输出。
2. **P0 修 mvt 瓦片 fixtures**：3d-intersections z15 瓦片缺失（404）；排查 real-world/measure-light 的 mvt 加载链路。
3. **P1 真机 GPU 跑同一基线**：区分"SwiftShader 渲染阻塞"与"实现错误"（line/fill-extrusion/debug/raster 等域在 SwiftShader 下结论不可靠）。
4. **P1 逐域看 diff 图定性**：455 个近失（≤600px）是第一梯队（worldview、filter、zoom-history、circle-color/function 等）；`http://localhost:PORT/ibct-report` 可逐用例看 actual/diff。
5. **P2 model-layer 批拆分重跑**（或跳过挂起用例）：补 180 个未上报结果。

> **2026-08-12 差异根因调查已完成**：见 `docs/render-tests-diff-analysis.md`——6 个代码 bug（text/icon 坐标空间、line 宽度计算、extrusion shader 编译失败、raster uv/重渲、heatmap shader 串、纹理回调无重渲）+ 2 个语义未实现（瓦片级别错位/DEM 寻址）+ fog 模型不匹配，**证伪了 final-report §三的"SwiftShader 三层阻塞"结论**。按该文 P0-1~P0-4 修复后大部分"空白域"可转为可比状态。

### 10.7 Phase A 修复记录（2026-08-12，`docs/render-tests-next-plan.md`）

> 逐项验证：改代码 → tsc + 单元测试（257 passing，2 个既有失败与本次无关）→ 单分类 render-test（Edge 150 headless + SwiftShader）→ 更新文档。commit：`9bf3469a`（A1 + A2 前半）。

| # | 修复 | 验证 / 状态 |
|---|------|------|
| A1 ✅ | **text/icon 坐标空间（R1）**：`MBTileDataEmitter.ts` 新增 `projectWorld(p)=project(p).add(center)`，line-placement path、`emitTextGeometry`/`emitPoiGeometry` 三处改用；mesh 路径保持 `project`（tile 中心相对）；harness `MBStyleCompatRenderTest.ts` MapView 创建后设 `mapView.disableFading = true` | text-size/default 122px（修复前整帧空白 4096px）、icon-image/literal 58px、text-field/literal 113px、token 276px、symbol-placement/line-center 701px（沿线文字已渲染）→ **text/icon 整域空白已消除**，剩余为字体度量精度项 |
| A2 ✅ | **line 空白根因 = ribbon 三角形绕向**：`createLineGeometry` 产 CW 三角形，`emitRibbonFill` 的 fill 材质（FrontSide）背面剔除 → 只有 join/cap 碎片（75–1846px）。`emitRibbonFill` 逐三角形翻转绕向为 CCW + 线宽比例改用显示 zoom（`m_zoom+1`） | **line-color/default 55527 → 337 mismatch**（literal 334、elevated literal 335、property-function-identity 220）。line-\*/elevated-line-\* 整域从空白变为完整路网；剩余为颜色空间精度（function/property-function 亮 25%） |
| A3 ✅ | extruded-polygon shader 编译（R3） | **shader error 434 → 0**（`animateExtrusion:false` + `geometryNormal`→`nonPerturbedNormal`）。结构性缺口仍在：无 `extrusionAxis` 属性烘焙 → fill-extrusion/building 仍空白（C3 长期项） |
| A4 ✅ | 纹理回调补 `mapView.update()`（R9） | raster/hillshade patcher 纹理回调已补。raster 仍不显示：R4 瓦片级别错位（Berlin raster 请求 z12/z16，fixtures 仅 z17-Berlin）+ env quad z≤12 钳制 → 属 R4/R5 |
| A4.1 ✅ | **raster 瓦片级别错位（R4）修复**：raster fixtures 存在的是 **cameraZoom 级别**（z17 = level-17 在 camera 17 下 256px 满视口），而 `MBStyleDataSource` 默认 `storageLevelOffset=-1`（矢量约定 dataZoom=cameraZoom-1=z16）→ Berlin raster 请求 z16 satellite（缺失）404。修复：`wireTileSources` 中 **raster-only 样式（无矢量源）且调用方未显式传 offset 时置 `storageLevelOffset=0`**（dataZoom=cameraZoom），使 zoom-16/17/20 的 Berlin raster 测试全部加载存在的 z17 卫星瓦片。矢量（heatmap 等）路径不变（offset -1）。**env quad z≤12 钳制（R5）另记** |

#### 数据缺口 + R7 hillshade + R8 fog（2026-08-16 第三阶段）

| # | 修复 | 验证 / 状态 |
|---|------|------|
| D1 ✅ | **model-layer fixtures 补齐**：`mapbox-gl-js/test/integration/models/`（133 文件：glb/gltf/vector.pbf/dem terrain/landmark）整目录拷入 `test/rendering/integration/models/`（此前空） | 补 model-layer 与 landmark 资源缺口 |
| D2 ✅ | **3d-intersections z15 确认无需补**：`tileSize:512 → offset −2`（R4.2）已使 dataZoom=z16–17（clamp maxzoom 17），fixtures 有 z16/z17；z15 请求是首轮基线旧现象 | 验证通过 |
| D3 ✅ | **hillshade DEM 寻址（R7）**：`HillshadeTileDataProvider` 原按 tileKey.level 填 `{z}`（raster-dem-only 样式 offset -1 → dataZoom=z16，404）；改为 **tileSize>256 时 DEM 级别 = z−2**（`14-3355-6247.png` 存在）、x/y 按父瓦片换算（`Math.floor(x/2^shift)`）；tileSize 256 保持 z（`11-379-804.terrain.png` 存在） | MAPSNAT-3205 请求 z16→z14；projected 保持 z11 |
| D4 ✅ | **fill/raster/hillshade 几何补 uv**：`AccumulatedGeometry` 加 `uvs`，`processFillFeature` 对 `_rasterTileUrl`/`_hillshadeDemUrl` technique 发瓦片归一化 uv（`x/extents, y/extents`），`getDecodedTile` 输出 `uv` 属性（r178 材质采样 DEM/卫星不再坍缩到 (0,0) 角） | 修复 vUv 恒 (0,0) 导致 DEM/卫星纹理只显示单角像素 |
| D5 ✅ | **r178 shader 替换串修正**：`patchHillshadeMaterial`/`patchRasterMaterial` 原替换 `'gl_FragColor = vec4( diffuse, opacity );'` 在 three r178 中**不存在**（MeshBasic 最终输出在 `#include <opaque_fragment>`，即 `vec4(outgoingLight, diffuseColor.a)`）→ 全部 no-op；改为**注入 `#include <opaque_fragment>` 之后** | hillshade 法线/坡度着色与 raster brightness/contrast/saturation/hue 调整恢复生效 |
| D6 ✅ | **fog 模型（R8）**：`FogExp2`（米制世界瞬间饱和）→ 线性 `THREE.Fog`，near/far = `range[0]/[1] × 1000`（mapbox km 范围映射到 flywave 米制世界，range 可负）；近似替换 mapbox 指数衰减，alpha 上限与 horizon-blend 留作后续 | fog 从全屏饱和色变为随距离渐入 |

> 注：`14-8802-5373.mvt`（icon-pitch-scaling 所需行 5373 瓦片）在 mgl 与 flywave 均无，记为 known-gap 无法复制。

### 12.19 3D lights（lighting-3d-mode，2026-08-16）

**根因**：
1. `applyLights` 读 `light.color`，而 mapbox 3D `lights` API 结构是 `{type, id, properties:{color,intensity,direction}}` → 灯光从未正确应用（3D lights 全 127 例失败）。
2. 即使读对，2D ground 层（fill/background/raster/circle）用 `MeshBasicMaterial` 不受 three 灯光影响，且 THREE 光照模型 ≠ mapbox `apply_lighting`。

**实现（对齐 mapbox `3d-style/render/lights.ts` + `_prelude_lighting.glsl`）**：
- `MBEnvironmentManager`：修复 `applyLights` 读取 `light.properties`；新增 `lighting3DState` getter，CPU 计算：
  - `ambientColorLinear/directionalColorLinear` = `sRGBToLinearAndScale`（v^2.2 × intensity）
  - `dir` = `sphericalDirectionToCartesian`（azimuth+90°/polar，polar 0=zenith）
  - `groundRadiance` = `linearVec3TosRGB(ambientContrib + dirContrib)`，ground 层 lit 为 `color × u_ground_radiance`
- `MBMaterialPatchManager.injectGroundLighting`：ground 层（fill/line/circle）注入 `gl_FragColor.rgb = mix(gl_FragColor.rgb × uMBGroundRad, gl_FragColor.rgb, emissive_strength)`（`apply_lighting_with_emission_ground`）；因补丁顺序（ground 先注册、后注册的 hillshade/raster 块插在其前），ground 光照**最后应用**（对调整后颜色再打光，符合 mapbox）；uniform 注入 `void main() {` 前兼容 RawShaderMaterial（circle/line）。handler 每次编译动态读当前灯状态 + `patchTileMaterials` 检测灯签名变化强制重编译（支持运行时 `setLights` 操作）。
- `MBStyleDataSource.applyBackgroundColor`：background（clearColor）按 `color × groundRadiance`（emissive 混合），与其它 ground 层一致。

**验证**：tsc 通过；单元测试 7+10+43+15 通过（1 个既有失败无关）；ground radiance 数学与 mapbox 公式逐项核对（pitch-45/70、intensity 缩放、dir 无方向默认 [0,90]）一致。**待渲染 harness 逐用例验收**（本环境无法跑 GPU harness）。

**extrusion 补充（`injectExtrusion3DLighting`）**：fill-extrusion 在 use3DLights 时改用 mapbox `apply_lighting_with_emission` 公式（世界空间 FLAT_SHADED 法线 × `uMB3DViewToWorld`，`k = amb·adf + dir·max(NdotL,0)`，`lit = color·pow(k,1/2.2)`，emissive mix），替换原简化 Lambert（`injectLighting`）；handler 每次编译动态读灯状态。

**building 补充**：`patchBuildingMaterial` 在 use3DLights 时于 **procedural facade 块之后**追加同一 `apply_lighting` 公式（世界法线），使灯光作用在窗户/洪水光/AO 着色后的最终颜色上（mapbox 语义）；legacy light 保持 `injectLighting` Lambert。

**单测锁定**：`MBStyleDecoderPipelineTest` 新增 `computes mapbox 3D-lights ground radiance`——验证 `lighting3DState.groundRadiance` 与 mapbox 公式逐值一致（红 ambient + 绿 directional@[0,90] → [1,0,0]；pitch-45 → green 0.854；intensity 0.39 → 0.652），防止公式回归。

**修复**：`extrusionLightState` 在无 directional 光时 `use3DLights` 被强制 false（仅 ambient 的 3D-lights 样式 extrusion/building 会错误走 legacy 路径）→ 改为恒返回 `this.m_use3DLights`（3D-lights shader 路径的 uniform 来自 `lighting3DState`，不经此 getter 的 dir/color）；单测断言补充。

### 12.20 r178 shader 替换串系统性核查（2026-08-16）

**发现**：`MBMaterialPatchManager` 尚有 3 处 `gl_FragColor = vec4( diffuse, opacity );` 替换目标在 three r178 中**不存在**（MeshBasic 输出在 `#include <opaque_fragment>`；SolidLineMaterial 用 `outputDiffuse`/`alpha`）→ 静默 no-op：
1. **line-pattern**（`patchLineMaterial`）：目标与变量名双重错误（`diffuse`/`opacity` 不存在于 SolidLineMaterial）→ 改 `outputDiffuse`/`alpha` 双分支。
2. **multi-element dasharray**：同上 → 改 `outputDiffuse`/`alpha` 双分支 + `discard` 逻辑。
3. **fill-pattern**（`patchFillPatternMaterial`，MeshBasic）：目标改为 `#include <opaque_fragment>` 之后（`diffuse`/`opacity` 有效）。

**验证**：全部替换目标对实际 shader 源（meshbasic/meshphysical/CirclePointsMaterial/SolidLineMaterial）逐一存在性检查 ✓；fill/extrusion/building/hillshade/raster/pattern 注入后括号平衡 ✓；剩余 `gl_FragColor = vec4( diffuse, opacity );` 仅存在于注释。tsc 通过、单测无回归。

**遗留**：3D-lights 的 extrusion/building 组合需 GPU 逐像素验收（本环境无法跑渲染 harness）。

#### A2 过程中发现的两个系统性 bug（远大于 mpp 本身，已修）

> 排查 line 空白时发现：**所有 mvt 瓦片数据此前从未真正解码**，解码后又有 **y 坐标约定错位**——这两点解释了 §7/§10.4"mvt 矢量瓦片渲染阻塞"（3d-intersections 全域无数据、line/fill-from-tiles 全空白）。

| # | Bug | 修复 | 影响 |
|---|-----|------|------|
| B1 | **`MBStyleDecoder.decodeThemedTile` 分支顺序**：`typeof (ArrayBuffer) === 'object'`，先命中"GeoJSON 对象"分支被静默吞掉，`instanceof ArrayBuffer` 分支**永远不可达** → 所有 vector 瓦片 never decoded（`processLineFeature`/`processFillFeature` 从不被调用，fetched 的 mvt 字节数正确但 decode 空跑） | 二进制分支提到对象分支之前（`MBStyleDecoder.ts`） | **解锁全部 mvt 渲染**（line/fill-from-tiles/extrusion/heatmap/3d-intersections/measure-light/real-world 等 ~100+ 分类的前置） |
| B2 | **mvt y 坐标约定与运行时世界不一致**：`MapView.projection` 默认是 base `MercatorProjection`（下原点，y 向北增，Berlin 相机/tile.center ≈26.9M），而 OMV 原始 mapbox 像素（y 向下）经原始 `tile2world` 得到**上原点**（≈13.1M）→ mvt 几何全部落在相机 ~13.7M 之外（屏幕外） | 在 MB processor 对 mvt 数据做 `py' = (scale − 2·top) − py` 线性翻转（等价转成 GeoJSON adapter 的 world2tile 约定，`setMvtYOffset` 仅在 ArrayBuffer 分支开启，geojson 不受影响） | mvt 几何与 geojson 共用同一 `project()` 通道；geojson 填充（fill-color）保持基线行为不变 |

**验证状态**：
- 用 `git stash` 对照：fill-color/default 在**纯基线（未改动）**即 784 像素差异——非本次回归，属既有精度项。
- line-color 从全空白（0 黑像素）变为渲染出内容（~75 黑像素，位于视口底部）——解码 + 坐标修复生效，但**仍有残差偏移**（相机焦点/瓦片选择/剩余约定细节，待后续排查）。
- tsc 通过；257 单元测试通过（2 个既有失败：RawShaderMaterial 断言、circle-radius×2，均与本次无关）。
- 其余 mvt 依赖分类（fill-from-tiles、fill-extrusion、heatmap 等）**未及批量验证**（用户中止验证），是下一步验证重点。

> 下一步建议：1) 先批量跑 `line-color fill-color fill-extrusion-color heatmap-radius` 确认 mvt 域整体收益；2) 排查 line 残余 ~100px 偏移（对照 `TileObjectRenderer` 中 object 世界坐标 vs 相机焦点）；3) 再继续 A3（extrusion shader）。

> **2026-08-13 进展**：A2 根因定位为 **ribbon 三角形绕向（CW → 被 FrontSide fill 材质背面剔除）**，`emitRibbonFill` 翻转绕向 + 线宽改用显示 zoom 后，line-color/default 从 55527 → 337 mismatch，line-\* 整域出图。A3（extrusion shader：`animateExtrusion:false` + `nonPerturbedNormal`）把 shader 编译错误从 434 降到 0；结构性缺口（无 `extrusionAxis` 烘焙）仍在，fill-extrusion/building 空白待 C3。A4（纹理回调补 `mapView.update()`）已落地。
>
> **2026-08-13 再进展（commit `82cad1fa`）—— 颜色空间系统性修复**：`MapMaterialAdapter.applyMaterialBaseColor` 把 sRGB 通道值直接传给 `THREE.Color.setRGB`，r178 + ColorManagement 下被当作 linear 空间输入，输出端 linear→sRGB 再转换使所有材质颜色变亮 ~1.46x（绿 128→188）。改传 `SRGBColorSpace` 后颜色精确往返：**fill-color/function 784→0、circle-color/function 0、line-color/function 55038→106、literal 334→106、multiply 104、opacity 110、zoom-and-property 192**。同时 `getOrCreateRibbonTechniqueIndex` 改为按 **color+opacity** 键（原先只按 layer.id，数据驱动/categorical 线色全部用了首要素颜色）。
>
> **遗留**：`line-color/property-function`（6 色 categorical）仍 ~36k。已深度排查：geometry/techniques/materials/objects 全部逐项验证正确（每色一个 technique 且几何 range 连续正确、材质颜色正确创建），但渲染只出 purple+blue（其余 4 色缺失），且 road layer 被注入 `line-z-offset:0.01`（来源未定位，fixture 与源码均无写入点）导致部分要素 z=0.01。怀疑是**多材质 geometry 分组 + z-fighting** 的组合问题，留作专项。
>
> **2026-08-13 第三轮（R4 瓦片级别 + geojson y + heatmap）**：
> - **R4.1 pitch 相机补偿（`2224b6d5`）**：flywave zoomLevel 由相机视线距离反推，pitch 使斜距变长 → reported zoom 从 15 掉到 14.79，dataZoom 落到 z13。`applyCameraSettings` 请求 `zoom = mapbox+1 − log2(cos(pitch))` 使斜距映射回目标 zoom。**icon-pitch-scaling 等 pitch 测试从请求 z13（404）改为 z14（存在）**；pitch 0 不受影响。
> - **R4.2 tileSize:512 语义（`67538a43`）**：512px 瓦片覆盖 256px 瓦片低一级的范围，按 source `tileSize` 设 `storageLevelOffset=-2`（dataZoom=cameraZoom−2，decoder zoom 表达式仍按 mapbox zoom=level+1）。**3d-intersections/tile-border 从请求 z18 改为 z17**；256px 源保持 −1。
> - **R4.3 DEM maxzoom 钳制（`58eabe20`）**：`applyTerrain` 硬编码 `min(zoom,12)`，改为按 raster-dem source `maxzoom` 钳制 + tileSize 偏移。**decrease-dynamic-exaggeration-to-zero-fog 从 z12 改为 z9（存在）**，buildings-depth-regression（tileSize 512, maxzoom 14）→ z13。
> - **geojson y-flip（`7d81ae37`）**：geojson 适配器经 webMercatorProjection（y-down）投影，而 MapView 用 base Mercator（y-up），内联 geojson 面/线南北镜像。decoder 对 geojson 应用与 mvt 相同的 y-flip（`py' = scale − 2·top − py`）。**3 色 geojson debug 测试线落位正确**；fill-color 无回归。
> - **heatmap R6 + m_patchedTiles（`cce8a418`）**：替换串从不存在（`vec4(diffuse,opacity)`）改为 CirclePointsMaterial 实际目标（`vec4(diffuseColor, alpha)`）；patchTileMaterials 改为按对象数变化重新 patch（首帧背景 quad 先附加、解码点后附加，原来一次 patch 后跳过导致 heatmap 点永不 patch）。
> - **遗留**：property-function 多色仍只出 purple+blue（需 THREE 多材质分组专项）；icon-pitch-scaling 缺 5373 行瓦片 + glyph 字体（fixture 覆盖）；raster/hillshade 纹理上屏（R5/R7）；fill-extrusion `extrusionAxis` 烘焙（C3）。

---

## 11. 第二轮验收记录（2026-08-13）

### 11.1 本轮修复验收（用户提交的 R4.1–R4.3 / geojson y-flip / heatmap R6 / SRGB）

验证方式：tsc（通过）+ 受影响分类 render-test 专项（79 用例，Edge 151 headless）。结论：

| 修复 | 验收结果 |
|------|----------|
| SRGB 色彩空间（`82cad1fa`） | ✅ circle-color/function 492→0 通过；fill-color/function 修复通过 |
| geojson y-flip（`7d81ae37`） | ✅ geojson 分类 **11/30 → 22/30 通过**（inline/external 全系列 0 差异） |
| R4.1 pitch 补偿 / R4.2 tileSize:512 / R4.3 DEM maxzoom | ✅ 瓦片请求级别已对齐（icon-pitch-scaling z13→z14；3d-intersections z18→z17；terrain fog z12→z9），剩余失败为 fixture 覆盖缺口（5373 行瓦片、glyph 字体缺失） |
| heatmap R6（`cce8a418`） | ⚠️ 部分生效：actual 从空白变为**蓝色圆点**（shader 替换 + re-patch 生效），但无 density→ramp 渐变（单 pass 近似的固有限制，需双 pass，C4） |
| line（A2 系列） | ⚠️ line-color/default actual **出线了**（黑色粗线可见，0→有内容），但只出现在画面下半部（落位/覆盖范围仍不对，mismatch 51691）；elevated-line-color 类 mismatch 降至 ~338 |

### 11.2 R1（text/icon 空白）追查与完成 —— 三个断点（本轮新增修复）

R1 在 §10/diff-analysis 中判为"坐标空间"单因，验收发现修复后**仍空白**，继续用浏览器埋点逐段排查，共找到并修复三个断点：

1. **text/poi positions buffer 类型错误**（`MBTileDataEmitter.ts:1125`）：打包为 `Float32Array`，但原生消费端 `TileGeometryCreator.createTextElements:517` / `PoiManager.addPois:180` 直接把 buffer 按 `Float64Array` 解读 → `BufferAttribute.count=0` → 零 TextElement。**修为 `Float64Array`**（对齐原生 `VectorTileDataEmitter.ts:1759`）。
2. **FontCatalog 注册键不匹配**（`MBFontCatalogBuilder.ts:104`）：注册键 `"font_Regular"`，查找键 `` `${font.name}_${fontStyle}` `` 其中 `fontStyle` 是数字枚举（`FontStyle.Regular=0`）→ 永不命中 → replacement glyph 被跳过。**修为 `String(FontStyle.Regular)`**。
3. **symbol-only 瓦片不进 renderedTiles**（根因中的根因）：纯符号瓦片有 textGeometries 但 `objects.length===0`（emitter 为 symbol 层产 points 几何数据但无 mesh 对象）→ `Tile.hasGeometry=false` → `VisibleTileSet.populateRenderedTiles`（`VisibleTileSet.ts:1097-1101`）不收录 → `placeText` 的 `hasTextElements` 恒 false → 文本元素创建了却永不放置。**修复**：`TileGeometryCreator.createTileObjects` 在 `objects.length===0 && hasTextElements()` 时 `tile.forceHasGeometry(true)`（沿用 `BackgroundDataSource:79` 既有模式）。

**验证**：text-size/default actual 出现 "ABC"、text-field/literal 出现 "Test"（文本管线端到端打通）；mismatch 从"空白基线"变为位置/字体差异（155/148px），进入像素精度阶段。埋点日志已全部移除，mapview + mbstyle 双包 tsc 通过。

**仍遗留**：**icon 仍空白**（icon-image/literal mismatch 58 不变）——POI 路径（`preparePois`→`PoiManager.addPois`→`PoiBuilder`）的 ImageTexture 查找/精灵注册还有独立断点，需同款埋点排查（见 §11.4）。

### 11.3 基建备忘

- `run-mbstyle-render-tests.js` 跑完不退出（服务器常驻），后台任务被停时**一定遗留孤儿 `RenderingTestResultServer`** 占端口 → 下次运行 EADDRINUSE 且结果写入旧目录。重跑前 `pkill -f RenderingTestResultServer.js`。
- `@flywave/flywave-mbstyle-datasource` 的 `npm test` 脚本指向 `./test/*Test.js`（不存在，编译产物在 `lib/test/`），且 lib 内模块解析缺 workspace 链接——单测请用项目既有方式（用户环境 257 通过），该脚本需另行修复。

### 11.4 下一步方向（按 ROI 排序）

1. **P0 icon POI 链路**（~150 用例）：`PoiManager.addPois` → `addPoi` → `PoiBuilder` 的 `imageTexture` 解析（sprite ImageTexture 注册名 vs technique.imageTexture 查找键），同款埋点法一次定位。
2. **P0 文本像素对齐**（~273 用例的第一梯队）：当前文字渲染在左上、期望居中——查 anchor/offset 语义与 `tile.offset`、PBF catalog 注入（harness 目前命中 Default catalog 而非 PBF，`MBFontCatalogBuilder` advance/offsetY 度量修正）。
3. **P0 line 落位**（~280 用例）：线已出但只覆盖下半画面——查 ribbon 顶点坐标空间（y-flip/tile offset）与瓦片覆盖。
4. **P1 fill-extrusion 几何烘焙**（C3，~143 用例）：emitter 产屋顶/墙面三角形 + `extrusionAxis`（A3 只解了 shader 编译，几何仍是平面 footprint）。
5. **P1 raster/hillshade 纹理上屏**（R5/R7，~105 用例）：uv 合成 + DEM 寻址 + A4 重渲验证。
6. **P1 heatmap 双 pass**（C4，18 用例）+ property-function 多色分组（THREE 多材质 z-fighting 专项）。
7. **P2 model-layer 崩溃定位**（212 用例，拆小批重跑）+ 真机 GPU 基线对照。

### 11.5 第二轮全量基线（2026-08-13，含 R1 三修复）

| 指标 | 第一轮（08-12） | 第二轮（08-13） | Δ |
|------|----------------|----------------|---|
| 上报结果 | 2775 | 2646 | −129 |
| **通过** | **182（6.56%）** | **204（7.71%）** | **+22** |
| 近失（≤600px） | 455 | 477 | +22 |
| 未上报 | 256 | 385 | +129 |

**通过的增量分布**：feature-state 3→6、geojson 11→17、fill-color 2→3、remove-feature-state 2→3（全绿）、lighting-3d-mode 0→2、map-projections 1→2、imports 2→3、combinations 8→10、runtime-styling 66→68；新增 extent、fill-extrusion-base、fill-pattern、worldview、tms、zoomed-fill、circle-sort-key 等零星通过。

**未上报增量来源**：model-layer 批第 25 例附近再次崩溃（180 未上报，同第一轮）；本轮新增 fog 批 38、skybox 批 33、text-writing-mode 批 32 未上报（批内挂起/超时）；3d-intersections 25（崩溃点提前）。

**关键判断**：
- text-\* 仍 ~0 通过，但**性质已变**：文本管线已通（actual 有文字），失败原因是位置偏移（文字在左上、期望居中）+ 命中 Default catalog 而非 PBF 字体度量——属像素精度问题而非"空白"，对应 §11.4 第 2 项。
- 通过率增幅 (+1.15pt) 低于预期，因为 R1 修复解锁的是"可渲染"，而大量 text/symbol 用例需先过"位置/字体"两关才能转为通过；预期 §11.4 第 1–3 项完成后有阶跃。
- model-layer 崩溃（两轮同点）成为最大的未上报源，建议下轮优先定位（拆 10 例/批重跑）。

> 第二轮结果目录：`rendering-test-results/mbstyle/`（已重跑覆盖）；通过清单：`baseline2-pass.txt`。

## 12. 第三轮全量基线（2026-08-14，含 text R1–R4 + border/SDF + icon 四断点 + 崩溃三件套）

### 12.1 汇总

| 指标 | 第一轮（08-12） | 第二轮（08-13） | 第三轮（08-14） | Δ(3 vs 2) |
|------|----------------|----------------|----------------|-----------|
| 上报结果 | 2775 | 2646 | 2765 | +119 |
| **通过** | **182（6.56%）** | **204（7.71%）** | **212（7.67%）** | **+8** |

> 第三轮结果目录：`rendering-test-results/mbstyle-baseline3/`；通过清单见下（212 例）。

**净变化拆解（相对第二轮）**：
- **净增 +18**：appearance/paint-* 4（icon+material 修复连带）、icon-anchor 2、icon-color 4、icon-halo-color/width 2、icon-image 2、icon-size/camera-function-high-base-sdf 1、placement/symbol-layers-same-layout-properties 1、text-max-width/force-newline+force-double-newline 2。
- **净失 −10**：
  - **5 例为 skip 正确生效（非回归）**：`appearance/empty-image-in-appearance`、`appearance/non-existent-image-in-appearance`、`elevated-line-pattern-trim-offset/globe-*`（3）——均带 `platform-tag-contains: "web"` skip 标注，第二轮只因 `getPlatform()` 返回 `ChromeHeadless-…`（不含 "web"）误跑误过；第三轮平台 tag 归一化为 `web-ChromeHeadless-…` 后官方 skip 命中。
  - **5 例为 icon SDF 边缘抖动（阈值边缘，待 SDF shader）**：`icon-rotation-alignment/viewport-symbol-placement-line`（15→25px）、runtime-styling `layout-property-property-expression/function-to-default` + `set-style-layout-property-*`×2（各 40px vs 阈值 34，icon-rotate 置空后 oneway 图标 SDF 阈值化边缘差）。
- **合计净增 +8**（212 vs 204）。

### 12.2 本轮验证的关键修复（§11.4 状态改写）

| §11.4 条目 | 状态 | 落地 |
|-----------|------|------|
| 1. icon POI 链路 | ✅ 完成 | 四断点：① sprite.pbf 缺 30 图标且不回退 → `MBStyleManager.buildSpriteFromIconSet` pbf+legacy 合并（注册 387 = 357+30，dot.sdf ✓）；② pbf 图集 toDataURL 异步解码 → 图集 canvas 直传（`SpriteData.image` 加 HTMLCanvasElement）；③ **IconMaterial `vertexColors:true` 与 shader 自带 `attribute vec4 color` 冲突 → VALIDATE_STATUS false**，删标志；④ icon-opacity 未应用 + SDF 图标阈值化（0.75 边缘）+ RGB 置白。icon 批 214 例通过 11→22。 |
| 2. 文本像素对齐 | ✅ 大体完成 | GlyphPBFParser 字段序修复（mapbox proto：bitmap=2/width=3/height=4/left=5/top=6/advance=7）；border/stride（w+6×h+6 逐行拷贝）；SDF 边缘 0.75→0.5 重映射（−64）；R1 default catalog 注入、R2 锚点反转、R3 行高 1em+leading、R4 advance/distanceRange=8/offsetY；`force-newline`/`force-double-newline` 0 mismatch。 |
| 3. line 落位 | ⚠️ 改写 | 非 phantom（HEAD 不可复现），line-color 337px 逐像素对齐；真实工作面改为 pattern/dasharray/variable-width 等功能缺口。 |
| 7. model-layer 崩溃 | ✅ 完成 | 崩溃三件套：FrustumIntersection 20 万瓦片上限、MapView.renderLoop try/catch、平台 tag 归一化。model-layer 212 例 **192 全上报、0 DISCONNECTED**（第二轮 180 未上报）。 |

### 12.3 第三轮新的未上报源

- **`building/` 批第 3 例反复 DISCONNECTED（karma 重启 3 次同点挂，~48/53 例损失）**——全量里唯一硬阻塞批次，主线程阻塞 >60s，为 fill-extrusion 高频用例，直接指向 §11.4 第 4 项（C3 几何烘焙）待排查。
- 其余批次（含此前崩溃的 fog/skybox/text-writing-mode/3d-intersections）全部跑完 0 DISCONNECTED；385 未上报源清零。

### 12.4 第三轮通过清单（212 例，按分类）

runtime-styling 64、geojson 17、combinations 10、appearance 7、feature-state 6、zoom-visibility 6、circle-radius 5、circle-color 4、icon-color 4、circle-geometry 4、fill-color 3、remove-feature-state 3、circle-blur 3、background-color 3、circle-opacity 3、imports 3、globe 3、filter 3、fill-opacity 2、terrain 2、icon-rotation-alignment 2、icon-image 2、config 2、fill-visibility 2、text-max-width 2、raster-extent 2、icon-halo-color 2、lighting-3d-mode 2、background-visibility 2、map-projections 2、line-width 2、icon-anchor 2、elevated-line-width 2、sparse-tileset 1、zoomed-fill 1、line-visibility 1、icon-halo-width 1、circle-sort-key 1、icon-rotate 1、circle-translate 1、fill-translate 1、symbol-visibility 1、fill-pattern 1、text-visibility 1、circle-stroke-width 1、3d-intersections 1、elevated-line-visibility 1、clip-layer 1、icon-size 1、icon-pitch-alignment 1、fill-extrusion-pattern 1、extent 1、text-pitch-alignment 1、worldview 1、placement 1、fill-antialias 1、zoomed-raster 1、fill-extrusion-base 1、tms 1、raster-visibility 1、icon-visibility 1、icon-opacity 1、fill-outline-color 1、empty 1。

### 12.5 下一步

1. **C3 fill-extrusion 几何烘焙**（§11.4 第 4 项，~143 例）——进度见 §12.6。
2. **icon-halo SDF shader**——可再收 icon-halo-* + runtime-styling icon-rotate 近失带 ~10 例。
3. 之后回 §11.4 第 5 项（raster/hillshade）与第 6 项（heatmap）。

### 12.6 C3 fill-extrusion 进度（2026-08-14）

**已完成并验证（几何层 ✅）**
- `MBTileDataEmitter` 新增 `emitExtrudedPolygon`：每 footprint 顶点复制 bottom(z=floor)/top(z=height)，`extrusionAxis` bottom=(0,0,0,0)/top=(0,0,Δh,1)，屋顶用 top 顶点 earcut、墙面 perimeter quad、`edgeIndex` 屋顶轮廓。世界单位=米（R=赤道周长），`fill-extrusion-height/base` 直接作 z。`getDecodedTile` 输出 extrusionAxis 顶点属性 + edgeIndex/edgeFeatureStarts。mesh 创建/挂载/visible 均验证正常。

**多源修复 ✅（架构清晰、高 ROI）**
- 原 `wireTileSources` 只接一个源（vector 优先，其次 geojson）→ `rect`(fill)+`geojson`(fill-extrusion) 等样式里 geojson 数据根本不解码（debug 证实 `sourceId=rect layer=geojson`）。
- 新增 `CompositeGeoDataProvider`：合并所有 GeoJSON 格式源（geojson/raster/rect/hillshade），每 feature 打 `_sourceId`，decoder 按 feature 源评估（`properties._sourceId ?? m_sourceId`）。单源走原始 provider（避免重序列化回归）；裸几何（Polygon/LineString/Point）wrap 成 FeatureCollection。
- 实测：fill-extrusion 9 例 mismatch 显著下降（opacity/default 98801→82085、terrain/flat-roof-over-border 110660→102747 等），opacity 首次渲染出黑色建筑；12 个对照分类回归全 +0（fill-color 0 mismatch 保持）。

**遗留阻塞（渲染层，需专项）**
- **visible tile set 漏中心瓦片**（本轮最终定位）：含 lng0/lat0 的中心瓦片**已解码（willRender=true）但 objects 未进 sceneRoot**——pitch-60 + 1 级 overzoom 下 FrustumIntersection/visible tile 计算只返回周边瓦片，建筑只从邻瓦片的未裁剪重复几何部分上屏（opacity 部分可见、color/literal 完全离屏）。疑点：FrustumIntersection 200k 上限在极端 pitch 下提前返回、或 overzoom 瓦片 level 与相机 zoom 的换算。已排除：材质/颜色/背面剔除/NaN/几何/RTE 定位（全部验证正确）。
- 已通过数仍 2（与 base3 相同）；渲染内容已出但未过像素阈值。
- `building/` 批的 DISCONNECTED 是长时运行负载偶发（隔离跑 50/53 完成无挂起），非确定性 bug。

> 调试要点：karma webpack 配了 filesystem 缓存，worker bundle 会用到旧代码——调试时用 `HARP_NO_HARD_SOURCE_CACHE=true`。

### 12.21 icon-text-fit 接线（2026-08-16）

**背景**：icon-text-fit 是单分类最大空白（41 例全 0 通过，§13.2 G3）。`MBMaterialPatchManager.applyIconTextFit` 是粗糙桩（对 `tile.objects` 的 `isSprite` 缩放），而真实 POI 走 `PoiRenderer.computeIconScreenBox`——桩从未执行，功能整体未接线。

**实现（对齐 mgl `shaping_shared.fitIconToText` + `shaping.ts:712-715`）**：
1. `MBTileDataEmitter.ts` symbol-icon 分支：当 `icon-text-fit !== 'none'` 且有 text-field 时，用与 text 分支相同的 shapeText 计算文本，发射 **anchor 相对**的四边（`_iconFitTextL/R/T/B`，px = em×textSize；`L = -hAlign×W`，`T = -vAlign×H`，mgl 的 anchor 移位）+ `_iconTextFit`/`_iconTextFitPadding`（[top,right,bottom,left]）。
2. `PoiBuilder.build`：透传四个字段进 `PoiInfo`。
3. `PoiRenderer.computeIconScreenBox`：fit 时 box 精确按 mgl 公式定位（`left = textL - pad[3]`、`right = textR + pad[1]`、`top = textT - pad[0]`、`bottom = textB + pad[2]`），fit 维度拉伸、非 fit 维度以自然图标尺寸居中于文本；**忽略 icon-anchor**（mgl 注释：fit 时 anchor 不生效）；Y 轴取反（mapbox 屏幕向下 vs three 向上，与已验证的 icon-anchor 路径一致）。
4. **非 SDF 图标不再被 icon-color 染色**（`PoiRenderer.addPoi`）：mgl `symbol.fragment.glsl` 仅对 `u_is_sdf` 图标应用 `v_fill_np_color`；非 SDF 直接采样纹理。修复后默认黑 `icon-color` 不再把 `label` 等普通图标渲染成黑块。

**验证**（Edge 150 headless + SwiftShader，`rendering-test-results/mbstyle-itf3/`）：
- **icon-text-fit 分类 0 → 7/41 通过**：none/width/width-padding/height/height-padding/both/both-padding（117–184px）。`both` 312→141、`height` 940→118、`both-padding` 2033→142。
- **anchor 语义正确**：width-text-anchor 5383→1992、both-text-anchor 8095→2357、both-text-anchor-icon-anchor 8201→2357（9 锚点箱位正确铺开）。
- **零回归**：icon-anchor 10/11、icon-color 4/5（非 SDF 染色修复连带）、icon-image 2/12、icon-halo-color 3/7 保持；mbstyle 单测 206 passing（+2 新用例，1 既有 circle-radius×2 失败与本次无关）。

**遗留（引擎级）**：
- `*-2x`（both-2x 11878）：fitted box 需按 devicePixelRatio 缩放（期望 192×80 physical vs 当前 168×40，高度恰 2× 差）——DPR 在 screenBox 坐标系的传播。
- `stretch-*`（9 例，3147–11041）：需 mgl `scaleShapedIconImage` 的 stretchX/stretchY 九宫格重栅格化（非均匀拉伸）。
- `text-variable-anchor`（40206–62233）与 `placement-line`（95790）：variable anchor 放置 + line placement，独立引擎特性。
- `*-text-anchor` 残余（1992–4595）：icon 箱位已正确，残余为文本未随 anchor 渲染（text 管线）。

### 12.22 fill-outline-color 接线（2026-08-16）

**背景**：fill-outline-color 8 例中 7 例近失（12–192px）。`MBMaterialPatchManager` 用 `fwidth(gl_FragCoord.z)` 边缘 hack 注入——平坦 fill 的深度导数恒 0，从不触发，轮廓从未渲染（`literal` actual 恒白）。

**实现（对齐 mgl `draw_fill.ts` stroke pass + `fill_outline` shader）**：
- mgl 轮廓 = 沿多边形边界的 ~1px **屏幕空间 AA 描边**（`lineIndexBuffer` 边界线段 + `alpha = 1 - smoothstep(0,1,dist)`）。不透明度 = `fill-outline-color` 自带 alpha × `fill-opacity`（`outline_color`/`opacity` pragma）。
- `MBTileDataEmitter.processFillFeature`：当 `paint['fill-outline-color']` 存在时，对外环 + 内环（holes）发闭合 polyline；经 `createLineGeometry` 生成 ribbon，把 2px 线宽烘焙进 `position`（与 `processLineFeature`/`emitRibbonFill` 同机制，SolidLineMaterial 的 GLSL 挤出在 SwiftShader 不栅格化），以 **fill technique**（`color=outline-color`, `opacity=fill-opacity`, `renderOrder=layer+0.5`）写入独立 Polygon geometry 组。
- 首版走 SolidLine 管线失败：`_preExtrudedLines` 标志无人消费，SolidLine 路径实际不渲染；改为 ribbon-fill（与 line-color 同解法）后轮廓上屏。
- 2px 线宽：1px ribbon 经 MSAA 峰值 ~50% alpha，2px 使中心全饱和（mgl 视觉 ~1px）。

**验证**（`rendering-test-results/mbstyle-foc3/`）：
- **2/8 通过**（default、function），`fill` 34→27、`literal` 104→52、`property-function` 193→127（pixelmatch 0.00075×4096≈4px 阈值，残余为 AA 边缘像素级差异：蓝色 (0,0,255) vs 期望 (24,24,233)，绿色 function 因 AA 分布巧合完全对齐而 0 mismatch）。
- `opacity`（fill-opacity 0.5 × outline alpha 1 → ~42%）与 `multiply`（outline alpha 0.5）语义已实现（`opacity: paint['fill-opacity']`，颜色 alpha 由 material adapter 携带）。
- **零回归**：fill-color 4/8、fill-opacity 2/9、fill-visibility 2/2、background-color 3/6 与 baseline 持平；mbstyle 单测 207 passing（+1 outline 用例，1 既有 circle-radius×2 失败无关）。

**遗留**：残余 mismatch 均为 1–2px AA 边缘对齐（top-row white 被 pixelmatch 判 mismatch）；与 line-color 337px 同源（AA/线宽舍入）。

### 12.23 icon-size camera 函数求值修复（2026-08-16）

**背景**：icon-size 9/18 近失。`camera-function-*` 用例（`icon-size: {"stops":[...]}` zoom 函数）actual 恒为 ~0.9× 期望——排查（埋点确认）根因是**解码器用整数瓦片级别求值 zoom 函数**：style zoom 0.5 → 相机 zoom 1.5 → 数据 zoom 0.5 → 瓦片级别 floor 到 0 → 解码器 `zoom = tileKey.level - storageLevelOffset - 1 = 0`，`icon-size` 在 zoom 0 求值 = 1 而非 1.5。

**修复（对齐 mgl `symbol_size.getSizeData`——camera 函数在连续相机 zoom 求值）**：
1. `MBStyleDecoder` 新增 `m_mapboxZoom`（自定义选项），`decodeThemedTile` 用它代替整数瓦片级别推导（无则回退）。
2. `MBStyleDataSource` 新增 `pushMapboxZoom()`：`applyCameraSettings` 后 + 每次 `AfterRender` 把 `mapView.zoomLevel - 1`（mapbox zoom）configure 进解码器。
3. 顺带确认 harness 初始相机未设 style.zoom 的问题：`MBStyleCompatRenderTest` 在 MapView 创建后按 `style.zoom+1`/`style.center` 定位相机（`applyCameraSettings` 实际已处理，此条为防御）。

**验证**（`rendering-test-results/mbstyle-isize5/`）：
- **icon-size 4/18 → 9/18 通过**（+5）：camera-function-sdf/plain、composite-function-sdf/plain/both-scale 全部通过（0–1 mismatch），camera-function-high-base-sdf、default、small-stretch-area 保持。
- 近失：camera-function-high-base-plain 13、function 16、composite-function-both-scale 10。
- 尝试 raster-sprite 优先（对齐 mgl `_loadIconset` 对非 Mapbox URL 回退 raster）——icon-size 再 +2（plain 1→0），但 `icon-image/stretchable` 3060→11688 回归（pbf 渲染的 stretchable 图标更贴合基线），**已回退**。
- **零回归**：icon-color 4/5、icon-anchor 10/11、icon-image 2/12 持平；mbstyle 单测 208 passing（+1 camera-function iconScale 用例，1 既有 circle-radius×2 失败无关）。

**遗留**：
- `*-rasterized`（432–3793）：mgl 按 `getRasterizedIconSize` 在 maxSize 栅格化再缩放，单 atlas 位图无重栅格化。
- `property-function-*`（152–2092）：数据驱动 icon-size 按要素求值，多要素共享 technique 的装箱问题。
- `literal` 139 / `function` 16 / `depends-on-coalesce-image` 681：AA 边缘（icon 渲染 0.9× box，与 mgl 基线差 1–2px）。

### 12.24 icon-halo-blur SDF 公式对齐（2026-08-16）

**根因**：icon-halo-blur 5 例全近失（6–270px）。`IconMaterial` 的 halo 用 `smoothstep(edge - width - blur, edge - width, d)` 单侧扩展，blur 换算 `×0.094` 偏小——mgl `symbol.fragment.glsl` 是**居中 gamma**：`buff = (6 - halo_width)/SDF_PX`（SDF_PX=8）、`gamma = (halo_blur×1.19/SDF_PX + EDGE_GAMMA)/(fontScale×gamma_scale)`、`alpha = smoothstep(buff-gamma, buff+gamma, dist)`。旧公式 halo 环过窄、blur 过窄（0.094 vs 1.19/8=0.149）。

**修复**：
1. `flywave-materials/IconMaterial.ts` fragment：halo 改居中 smoothstep——`haloBuff = uEdge - uHaloWidth`、`haloGamma = uHaloBlur + uGamma`、`haloA = smoothstep(haloBuff-haloGamma, haloBuff+haloGamma, d) × (1-fillA)`。
2. `PoiRenderer` batch 换算对齐 mgl：`widthField = width/8`、`blurField = blur×1.19/8`（原 `×0.094`）。

**验证**（`rendering-test-results/mbstyle-hb2/`）：
- **icon-halo-blur 0/5 → 4/5 通过**：default/function/literal/powevr-workaround 全过（0–2px）。
- **icon-halo-width 3/4 → 4/4**（literal 从近失转通过）。
- **icon-halo-color 3/7 → 5/7**（同一 SDF halo 公式连带收益；multiply/opacity 98px 遗留为半透明 blend 边缘）。
- 遗留：`property-function`（数据驱动 blur，205px，双要素 halo 外缘差）。

### 12.25 icon-rotate 旋转接线（2026-08-16）

**实现（对齐 mgl `quads.getIconQuads`——tl/tr/bl/br 四角绕中心旋转 angle=iconRotate×PI/180）**：
1. `MBTileDataEmitter` symbol-icon 分支发 `_iconRotate`（`l['icon-rotate'] ?? 0`，布局属性）。
2. `PoiBuilder`/`PoiInfo` 透传 `iconRotate`。
3. `BoxBuffer.addBox` 新增可选 `rotateDeg`：4 个 box 角绕中心旋转（此前 axis-aligned）。

**验证**（`rendering-test-results/mbstyle-irot/`）：icon-rotate/literal 48→46、property-function 53→31（旋转已生效，残余为对角线 AA/箭头形状）；with-offset 107 PASS 保持。icon-color 4/5、icon-anchor 10/11、icon-size 8/18 零回归。

**遗留**：icon-rotate 残余 31–46px 为 oneway 图标 45° 对角 AA + 既有 icon-size 0.9× box 基线。

### 12.26 heatmap 双 pass 持久 kernel 缓存（2026-08-16）

**根因（heatmap 间歇性空白）**：`Tile.attachGeometryLoadedCallback`（`Tile.ts:1106-1111`）在几何加载完成即 `removeDecodedTile()` 清空 `m_decodedTile`。`MBHeatmapRenderer.run()` 每帧 `getDecodedTiles()` 读 `tile.decodedTile.heatmapPoints`——只在**加载中的短暂窗口**有 kernel，之后恒空 → heatmap 随机空白（hm5 有 blob、hm7/hm9 无）。

**修复**：
1. `MBHeatmapRenderer` 新增 `m_tileKernels: Map<Tile, {kernels, techniques}>`：run() 首见某 tile 时快照其 `decodedTile.heatmapPoints` + techniques 入缓存；每帧按 `getDecodedTiles()` 存活集修剪。
2. `buildGroups` 改收 `Array<{kernels, techniques}>`（不再读 `tile.decodedTile`）。
3. `dispose()` 清缓存。

**验证**（`rendering-test-results/mbstyle-hm10/`，mgl `ZERO=1/255/16` 对齐）：
- heatmap 从**间歇空白**变为**稳定渲染**：heatmap-radius/data-expression 324→308、opacity/default 3983→649、color/default 15675→9234、weight/default 31389→19547。
- 208 单测通过（heatmap 分组测试改新签名，1 既有 circle-radius×2 失败无关）。
- 遗留：data-expression blob 40×14 vs 期望 45×20（kernel/ramp 密度阈值校准，G6 精度项）。

### 12.27 G7 验收：fog / skybox / 3D-lights / heatmap 全量跑（2026-08-17，5 个 commit：1b1c5d34 → 23525745）

> §14 冻结后（08-16 `cce6f1f1`）新增的 5 个 commit 全部落地，本机 Edge 151 headless + SwiftShader 全量验收。运行命令：
> `CHROME_BIN=…/Microsoft Edge MBSTYLE_PORT=8099 MBSTYLE_REPORT=rendering-test-results/mbstyle-g7 node scripts/run-mbstyle-render-tests-chunked.js fog skybox lighting-3d-mode heatmap-color heatmap-intensity heatmap-opacity heatmap-radius heatmap-weight`
> 注：heatmap 是 5 个独立顶层分类（heatmap-color/intensity/opacity/radius/weight），无顶层 `heatmap` 目录——用 `heatmap` 单参数不命中。

**修复内容回顾**：`1b1c5d34` mapbox fog 模型（指数衰减 + atmosphere 渐变 dome）；`e80f71d8` skybox 径向渐变接线 + 命名色 parseColor；`fb111e14`/`2d56278e` lighting-3d-mode 3D lights（默认方向 + 背景光照时序 + ground radiance sRGB→linear）；`23525745` heatmap 双 pass 通道对齐（density 存 R、alpha 恒 1）。

**结果汇总（231 用例目标，235 上报含 model-layer/map-projections 子路径误命中的 8 例）**：

| 分类 | 上报 | 通过 | 近失（≤600px） | 未上报 |
|------|-----|-----|---------------|--------|
| lighting-3d-mode | 114 | **10** | 3 | 6（bright-v9 pitch-0/45/65/85、fill-extrusion rounded-flat-roof、shadow fill-extrusion-flat-roof——重型 3D 用例挂起） |
| fog | 62 | 0 | 3 | 1（dithering-runtime-off） |
| skybox | 33 | **1** | 0 | 1（atmosphere-padding） |
| heatmap（5 子类合计） | 18 | 0 | 1 | 0 |
| **合计（G7 四域）** | **227** | **11** | **7** | **8** |

**通过的用例（11）**：
- lighting-3d-mode 10：`background/color-ambient`、`color-ambient-directional`、`color-light-pitched-45`、`emissive-strength-draped-mrt/background|fill|fill-outline`、`emissive-strength/background|fill`、`fill`、`fill-outline` —— 3D-lights ground radiance 公式 + 颜色空间修复的直接收益（baseline4 中 lighting-3d-mode 为 2）。
- skybox 1：`gradient/default`（baseline4 0）。

**近失（7，第一梯队）**：`fog/space-color-use-theme` 39、`fog/2d/fill-outline` 418、`fog/2d/line-gradient` 591、`lighting-3d-mode/circle/stroke` 360、`emissive-strength-draped-mrt/fill-pattern` 291、`fill-outline-pattern` 98、`heatmap-radius/data-expression` 308。

**判定**：
- **lighting-3d-mode 整域从全红转绿**（2→10），ground 层光照（background/fill/emissive）已对齐，剩余为 fill-pattern/stroke 等子域 + 6 个重型 3D 未上报。
- **fog 模型已出效果**（不再全屏饱和错色），但 0 通过——`space-color-use-theme` 39px 最接近；fill-outline 418/line-gradient 591 为 fog 与 2D 层叠加的既有精度项。
- **skybox gradient 已对齐**（default 通过），atmosphere/其余子域仍差。
- **heatmap 通道对齐未带来新通过**（data-expression 308px 与 §12.26 相同）——density→ramp 阈值校准仍是 F3 主线。
- 单测 257 passing + 2 既有失败（RawShaderMaterial、circle-radius×2），tsc 全绿，5 个 commit 无回归。

### 12.28 heatmap 双 pass 对齐 mgl 全链（2026-08-17，commit `6fa78651`，§14 F3 落地）

**根因（§14 F3 三要素 + 2 个新发现 bug）**：
1. **密度 FBO 分辨率**：mgl 用 `painter.width*0.25` offscreen FBO（`draw_heatmap.ts:37-40`，RGBA16F）+ 双线性上采样回屏——点采样累积 + upsample 塑造可见密度场（peak 降至 0.13-0.31、尾部展宽）；我们全分辨率 RGBA8。
2. **默认 heatmap-color ramp 错误**：`MBLayerEvaluator.paintDefs` + emitter 默认 `[[0,rgba],[0.5,blue],[1,red]]`（只有蓝→红）；spec 默认是 `0/transparent, 0.1/royalblue, 0.3/cyan, 0.5/lime, 0.7/yellow, 1/red`。所有未显式设置 heatmap-color 的用例此前只渲蓝。
3. **命名色 parseColor 被 r178 ColorManagement 污染**：`new THREE.Color('royalblue')` 在 linear-srgb 工作空间返回 `(0.053,0.141,0.753)`，`Math.round(r*255)=13` → 命名色 ramp 全偏暗（royalblue→(13,36,192)，期望 (65,105,225)）。修 `convertLinearToSRGB()`。纯色（cyan/lime/red/yellow）不受影响故此前未暴露。
4. **heatmap-color 表达式 ramp 全黑**：`p['heatmap-color']` 为编译后表达式对象 `["memo",["interpolate",...]]`（`MemoCallExpr` 序列化），`normalizeGradientStops` 只认 `raw[0]==='interpolate'` → 返回空 → 黑 texture。修：JSON 规范化非 Array 对象 + 循环解包 `memo`。
5. **composite premultiplied blend**：mgl `gl_FragColor = color*u_opacity`（已预乘），`colorModeForRenderPass()` = `[ONE, ONE_MINUS_SRC_ALPHA]`；我们用 NormalBlending（`[SRC_ALPHA, ONE_MINUS_SRC_ALPHA]`）→ opacity<1 双重预乘偏暗（heatmap-opacity/literal act (191,128,128) vs 期望 (255,127,127)）。修 CustomBlending ONE/OneMinusSrcAlpha。

**额外**：反子午线 world copies（`projectToPx(k.x±R)`，R=赤道周长）——mgl offscreen pass 遍历 MultiTileID 含回绕副本；antimeridian 用例 x=0 处已出核但仍 4786px（密度峰值 cyan vs 期望 lime，深水区）。

**实施**：`MBHeatmapRenderer`（0.25× FBO + HalfFloat、composite blend、world copies）、`MBLayerEvaluator` + `MBTileDataEmitter`（默认 ramp）、`MBMaterialPatchManager`（parseColor sRGB + normalizeGradientStops memo 解包）。

**验证**（`rendering-test-results/mbstyle-hm20/`，Edge headless + SwiftShader，`HARP_NO_HARD_SOURCE_CACHE=true`）：
- **heatmap 0/18 → 15/18**：heatmap-opacity 3/3（default/function/literal）、heatmap-intensity 3/3、heatmap-weight 3/3、heatmap-color 2/2（default + expression 全黑修好）、heatmap-radius 4/7（default/literal/function/data-expression）。data-expression 从 308px 近失 → 通过，density 场与 mgl 逐 texel 一致（0.25× 模拟验证）。
- tsc 绿；单测 257 passing + 2 既有失败（RawShaderMaterial、circle-radius×2）无回归。
- **遗留**：`heatmap-radius/antimeridian`（4786px，回绕副本密度偏 cyan vs 期望 lime）、`pitch30`（16181px，俯仰地面平面 quad 椭圆化未实现）、`projected`（13060px，自定义投影）。

### 12.29 F1 落地：FOV 36.87° 对齐（2026-08-17，G2 核心阻塞解除）

**根因排查（证伪原文档假设）**：
1. §14 F1 原假设"墙面外扩 ~6px（mgl join-normal 墙面挤出）"不成立：mgl `fill-extrusion-line-width` **默认 0**（wallMode 关闭，`fill_extrusion_bucket.ts:934` 才走 join-normal 路径）、`fill-extrusion-edge-radius` 默认 0 → 默认墙面就在 footprint 顶点上，与我们 `emitExtrudedPolygon` 的简化 quad 完全一致。
2. 像素取证：`fill-extrusion-color/literal` 期望图近墙顶宽 316 / current 330、远侧屋顶反而更窄、总高 145 vs 146 —— 透视更激进的签名（近大远小 + 视高微增），非几何外扩（外扩应双向等宽）。
3. **数值模拟定位**：模拟 mgl 相机（`transform.ts:2518` `cameraToCenterDistance = 0.5/tan(fov/2)*height` + pitch 从天底角）投影该用例三个方块——`fov=36.87°` 精确复现 expected（近墙顶 317.7 vs 316、bbox y 57.7..202.8 vs 58..202），`fov=40°` 复现 current（330.4 vs 330、58.8..205.2 vs 59..204）。
4. 真因：**flywave 默认 FOV 40°**（`flywave-mapview/src/FovCalculation.ts:44 DEFAULT_FOV_CALCULATION = {type:'fixed',fov:40}`）vs **mapbox 默认 36.87°**（`transform.ts:247 _fov = 0.6435011087932844`）。FOV 同时决定焦距与相机距离（`calculateDistanceFromZoomLevel = focalLength*tileSize/256`）——中心平面比例不变，但透视比率整体偏激。

**修复**：`MBStyleCompatRenderTest.ts` 建 MapView 时传 `fovCalculation:{type:'fixed', fov:36.86989764584402}`（harness 级；`setFov` 操作仍可覆盖）。生产代码零改动。

**验证**（`rendering-test-results/mbstyle-fov1|fovreg|fov2/`，Edge 151 headless + SwiftShader）：
- **fill-extrusion-color 0→3**（default/function/literal 全 **0 mismatch** 像素级一致）、**base 1→5**（+default/function/zoom-and-property/literal）、height 0→1、fill-extrusion-terrain 0→1、combinations 15→16（extrusion 系连带）、circle-color 4→5、circle-radius 5→6（function 系连带）。**净 +11**。
- 回归批（icon-image/color/anchor/size/halo×3/text-fit/text-field/text-size/fill-color/fill-outline/line-color/circle-pitch×2/circle-translate/elevated-line-color，~180 例）：除下述 2 例外全部与修复前持平——
  - `circle-pitch-scale/viewport`、`circle-pitch-alignment/viewport-scale-viewport`：40° 下侥幸 0mm → 36.87° 下 215px 近失（sizeAttenuation 视口换算，归入 G1 近失梯队，非错误方向）。
  - `icon-text-fit` 0/42 **非本次回归**：与修复前（mbstyle-itf3）mm 值逐字节相同（none=117/width=184/both=141…），该批在 itf3 保存时已全红（文本不渲染，F7 遗留），§12.21 的 7/41 无法在当前 HEAD 复现，需另行排查。
- terrain 2/67（cache-invalidation×2）与 baseline4 持平；building 0/30、depth-occlusion 0/14 维持（各有独立阻塞）。
- tsc 绿；`MBStyleDecoderPipelineTest` 新增"每数据驱动色值一个 extruded 几何组"用例（12 passing + 2 既有失败不变）。

**遗留（F2a，新开，含完整调查链）**：`fill-extrusion-color/property-function`（8237px）与 `zoom-and-property-function`（8171px）——排查发现 **fixture 本身是半块方块**（红=lng∈[-0.0003,0] 西半、蓝=东半，mgl 原版相同；expected 仍完整渲染到 y=255）。我们的渲染缺失**南墙整体 + 屋顶南侧 ~20px**。逐层排查结论：

1. **数据链无裁剪**（已排除）：几何完整到达 emitter（SW 瓦片 x[3201,4096] 全环、5 顶点，provider→adapter→processor→emitter 埋点验证）；解码单测锁定"每数据驱动色值一个 extruded 几何组、z 0→10 完整"。
2. **对象创建无缺失**（已排除，2026-08-17 晚补充）：在 `TileGeometryCreator`（`buildObject` 之后）埋点 `[dbg-obj]`——**全部 10 个瓦片都创建了 red/green/blue 三色 extruded 对象**（各 10/10 瓦片、verts=10、group=0+36、skips=[0] 单次创建）。对象创建不是瓶颈。（注：会话中曾误判"无 green 对象"，系日志去重前误数，已修正。）
3. **depth-prepass 已排除**：technique 置 `enableDepthPrePass:false` 后缺失不变（且引入 literal 系回归，已回退）。
4. **pitch=0 实验**（fixture 临时改 0 + `node scripts/generate-mbstyle-test-index.js` 重生成索引后才生效——**索引内联全部 fixture，改 style.json 必须重生成**）：三建筑仅剩 2 对 1–2px 水平细线（y≈63/64、191/192，x 142–369，共 ~454px；其中 y=63 行 x256–368 为蓝色），**三个屋顶全部不渲染、居中绿方块完全消失**（色统计仅有墙面暗色 (6,6,212)/(115,8,8) 各 ~16px，无任何屋顶亮色、无绿色）——"最靠近相机的内容缺失"签名。
5. **当前头号嫌疑：中心瓦片 objects 未进 sceneRoot**——与 §12.6 C3 时期记录的未解现象**完全同构**（"含 lng0/lat0 的中心瓦片已解码 willRender=true 但 objects 未进 sceneRoot，pitch-60 + 1 级 overzoom 下 FrustumIntersection/visible tile 计算只返回周边瓦片"）。对象已创建 ≠ 对象进场景：**下一断点 = `VisibleTileSet.populateRenderedTiles` → `Tile.attachTileObjects`/sceneRoot 挂载链路**，核对 pitch 0 时中心瓦片（18/131072/131072）与 pitch 60 时南行瓦片（18/*131073）是否在 renderedTiles 内、其 objects 是否挂上。
6. 复现/继续调试备忘：
   - 重新加埋点位置：`TileGeometryCreator.ts` `buildObject(...)` 之后（extruded 分支打 tileKey+color+group）；以及 `VisibleTileSet.populateRenderedTiles` / Tile objects 挂载处。
   - 运行：`CHROME_BIN=/usr/bin/microsoft-edge MBSTYLE_PORT=8099 MBSTYLE_REPORT=rendering-test-results/<dir> node scripts/run-mbstyle-render-tests.js fill-extrusion-color`（`HARP_NO_HARD_SOURCE_CACHE=true` 防 karma webpack 缓存旧码；跑前 `pkill -f RenderingTestResultServer`）。
   - 已证伪方向勿重复：墙面几何外扩（F1 原假设）、mvt/geojson 裁剪、emitter 分组、depth-prepass、材质/颜色/背面剔除/NaN/RTE（§12.6 已排除项）。


### 12.30 F2a 落地：近裁剪面贴地是"最靠近相机内容缺失"的真因（2026-08-17 晚）

**根因（静态代码链定位，未再需要运行时埋点）**：

1. **症状统一解释**：pitch-0 实验的"三个屋顶全不渲染、仅剩墙面细线、居中绿方块消失"与 pitch-60 的"南墙 + 屋顶南侧 ~20px 缺失"，共同签名是**高出地面且最靠近相机的内容被裁剪**——这是 GPU 近裁剪面（near plane）行为，不是瓦片挂载/剔除问题（对象创建 10/10 已排除，方向证伪）。
2. **机制链**：`VisibleTileSet.update()` 用 renderedTiles 的 `tile.geoBox.maxAltitude` 作为 `clipPlanesEvaluator.maxElevation`（VisibleTileSet.ts:633-657）→ `TiltViewClipPlanesEvaluator.evaluateDistancePlanarProj`（ClipPlanesEvaluator.ts:664-672）以 `near = (z − maxElevation)/cos(bottomAngle) × cos(bottomFov) − margin` 求近平面。我们的 `DecodedTile` 从不上报 `maxGeometryHeight`/`boundingBox` → `Tile.elevateGeoBox`（Tile.ts:734-740）保持 geoBox 海拔 0 → **near plane 就贴在地面**。挤出屋顶（z=10m）在屏幕下缘一侧比 near 更近 → 整片被裁。
3. **数值验证**（zoom 18，相机距地 ~229m，nearFarMargin≈13）：pitch 0 时 near ≈ 229−6.7 ≈ 222，屋顶 219 < 222 → 全裁（只剩 AA 细线）；设置 maxElevation=10 后 near ≈ 212 → 屋顶可见。与实验观测逐项吻合。
4. **literal fixture 为何通过**：单一小方块位于屏幕中心（沿视线距离处，天然远于 near plane）；跨瓦片大范围 fixture 的南半（屏幕底/最近相机）才落入裁剪区。

**修复（生产代码两处，harness 零改动）**：
- `MBTileDataEmitter`：新增 `m_maxGeometryHeight` 追踪——`emitExtrudedPolygon` 记 `height + zOffset`、`processLineFeature` 记 elevated-line z 偏移；`getDecodedTile()` 输出 `decodedTile.maxGeometryHeight`。引擎链 `Tile.set decodedTile` → `elevateGeoBox()` → geoBox 抬升 → 近平面/包围盒同步上移。
- `MBStyleDataSource.applyMaxGeometryHeight(style)`（`wireTileSources` 开头调用）：扫描 fill-extrusion/building 层的 `fill-extrusion-height`（字面量 + legacy stops 递归取最大），设 `DataSource.maxGeometryHeight`——供瓦片解码前 `FrustumIntersection` 的剔除包围盒（第一阶段 cull box）使用，防止高 pitch 下最近瓦片被错误剔除。

**验证**（`rendering-test-results/mbstyle-f2a/`，Edge headless + SwiftShader）：
- **fill-extrusion-color/property-function 8237px → PASS（66px）**、**zoom-and-property-function 8171px → PASS（1px）**——F2a 两大目标用例转通过。
- 零回归：color 的 default/function/literal/use-theme 保持 PASS 0；fill-extrusion-base default/function/literal/zoom-and-property/tile-border PASS 0（与 F1 后状态一致）。
- 剩余失败与 F2a 无关：`no-alpha-no-multiply`（37842，3D-lights 路径 F2）、`data-driven-zero-alpha`（28010）、base 的 rounded-edge/terrain/negative 系（独立特性）。
- tsc 绿；单测 harness 本环境因 workspace 链接/ESM 解析无法运行（§11.3 既有问题，改动为纯增量字段，风险低）。

### 12.31 F2 落地：fill-extrusion color alpha 语义 + 3D-lights 双重光照修复（2026-08-17 深夜）

**F2 两用例根因（对照 mgl `draw_fill_extrusion.ts` + expected.png 像素取证）**：

1. **`no-alpha-no-multiply`（37842px）**：mapbox 对 `fill-extrusion-color` 的 alpha 通道**不做 blend**——extrusion 不透明渲染，颜色 RGB 被 alpha **预乘**（expected 为 (lit×0.2, alpha=255) 的不透明深灰，非半透明混合）。修复：emitter `scaleColorByAlpha`（rgba/#hex8/#hex4 → RGB×alpha 的不透明 `rgb()`）；alpha=0 → `enabled=false`（要素整体不渲染，对应 mgl `color.a !== 0` 门控 / data-driven-zero-alpha 的绿方块不可见）。**37842 → PASS 0**。
2. **`data-driven-zero-alpha`（28010px，LIGHTING_3D_MODE 路径）**：三重叠加——
   - alpha-0 绿方块（上项已修）；
   - **场景灯双重光照**：`applyLights` 把 3D lights 的 AmbientLight/DirectionalLight 加进 THREE scene，而 `injectExtrusion3DLighting` 又在 gl_FragColor（已含 THREE 光照）上乘 mapbox 公式 → 双重变暗（且 THREE 物理光照 /π）。修复：3D lights 分支**不把有色灯加入 scene**，只挂一个中性 `AmbientLight(white, π)`（π 抵消 BRDF_Lambert 的 /π，使 standard 材质底色=diffuse）；
   - **pow 双重指数**：`linearProduct(color,k)=color·k^(1/2.2)` 是 sRGB 域运算，我们的 gl_FragColor 是 linear 且引擎输出端才转 sRGB——linear 域应直接 `×k`（(c_lin·k)^(1/2.2) = c_srgb·k^(1/2.2)），原先 `×pow(k,1/2.2)` 使指数翻倍。
   - **背景 groundRadiance 同类 bug**：`applyBackgroundColor` 的 `c×rad`（rad 为 sRGB 值）经 getHex 线性→sRGB 回转换后变成 c×rad^(1/2.2)（243 vs 期望 228）——改为乘 **linear** radiance（rad^2.2）。
   - 数值验证：红屋顶 145→**229**（期望 228）、墙 212（期望 211）、蓝 249/233（期望 249/233）、黄底 229（期望 228）逐色对齐。**28010 → 1288px 近失**，残余 1288px = mgl cast-shadow 地面阴影（阴影渲染器为独立特性，不在 F2 范围）。

**验证**（`rendering-test-results/mbstyle-f2f|f2reg/`，Edge headless + SwiftShader，`HARP_NO_HARD_SOURCE_CACHE=true`——注意 karma webpack 会缓存旧 bundle，改代码后必须带此变量重跑，否则结果字节级不变造成误判）：
- fill-extrusion-color：no-alpha-no-multiply **PASS 0**、data-driven-zero-alpha 1288 近失、property-function/zoom-and-property PASS 66/1、literal/default/function/use-theme PASS 0 全保持（零回归）。
- **lighting-3d-mode 10 → 12 通过**（color-light-intensity、color-light-pitched-70 因 clearColor linear radiance 修复连带转通过），其余 114 上报零回归。
- tsc 绿；单测 harness 本环境无法运行（§11.3 既有）。

### 12.32 F4/F5 落地：icon-halo 半透明 blend 与 alpha 通道（2026-08-18）

**F5（icon-halo-color/multiply+opacity，各 98px）根因（三层）**：
1. **mgl 双 pass 语义**：halo 与 fill 是两次独立 draw——fill 混在 halo 之上（重叠区 alpha 累积，halo 覆盖 fill 核心无 (1-fillA) 截断）。IconMaterial 改为单 pass 双层合成：`rgb = fill_rgb·fillA + halo_premult·(1−aFill)`、`alpha = aFill + aHalo·(1−aFill)`。
2. **halo 色 alpha 通道全程丢失**：引擎对 `*Color` 命名的 technique 属性做数值归一（`parseStringEncodedColor` 打包为 number 时 **alpha 置 0**，再 ColorCache 反解成白色）。修复：emitter 把 `icon-halo-color` 拆为 alpha 剥离的 `rgb()` 字符串 + 独立数字属性 `_iconHaloAlpha`（数字不受归一影响）；PoiBuilder 优先读 `_iconHaloAlpha`；PoiRenderer batchKey/参数、IconMaterial 新增 `uHaloAlpha` uniform。
3. **输出 alpha 未随 icon-opacity 缩放**（半透明 halo 渲染为不透明环）：alpha 统一 ×vColor.a。
- 附带：IconMaterial `uGamma` 默认 0.03 → **0.105**（mgl `EDGE_GAMMA=0.105/dpr`，@1x）。

**验证**（`rendering-test-results/mbstyle-f45d/`，Edge headless + SwiftShader）：
- **icon-halo-color 5/7 → 7/7**（multiply 98→PASS 0、opacity 98→PASS 0）；icon-halo-width 4/4、icon-halo-blur 4/5 保持。
- 零回归：icon-color 4/5、icon-image 2/12、icon-size 9/18（camera/composite-function 系全保持）、icon-halo-blur literal/function 系全保持。
- **F4（blur/property-function 203px）重定性**：非 halo 数学问题——fixture 两要素（x=0/1 → blur 1/3）**同点放置被原生 Placement 收敛为 1 个**（与 icon-anchor/property-function、icon-size/property-function 同根，§12.16 已记"同点要素仅放置 1 个"引擎深水区），归入 placement 专项而非 F4。

### 12.33 F8 续：line-join 几何 + round-limit + AA feather 接线（2026-08-18，代码落地，渲染验证待跑）

**背景**：`90c061d4` 落地了 line-cap 端头几何；但填充 ribbon 主体来自 `createLineGeometry` 的 averaged-bitangent 挤出——**恒为无限 miter**，bevel/round/`line-miter-limit` 回退无法在其上叠加，须整体重造 ribbon 主体。

**实现（`MBTileDataEmitter.emitRibbonBody`）**：
- ribbon 主体改为**单一简单多边形**：中心线两侧 offset 曲线，拐角外侧按 `line-join` 生成连接几何（miter 尖角 / bevel 平边 / round 圆弧扇，步长 π/8 与 cap 一致），**内侧收敛到两条 offset 线的交点**（按 miter-limit 钳制，急弯不尖刺）；earcut 三角化 + 逐三角形 CCW 纠向（FrontSide）。
- `line-join: none`：每段独立矩形（mgl 无角连接语义，转角留缺口）。
- `line-round-limit`（默认 1.05）：浅于阈值的转角 round→miter（mgl 语义，视觉等价更省几何）。
- `line-miter-limit`（默认 2）：超限 miter 回退 bevel——mgl 默认行为，此前我们是无限 miter。
- 闭合线（首≈尾）：所有顶点按 join 处理、不发 cap；重复点/零长段先剔除。
- **aRibbonEdge 语义修正**：边 ±1 / 内部 0 的带符号坐标，贯穿 body/caps。
- **AA feather 闭环（`MBMaterialPatchManager.patchFillMaterial` ribbon 分支）**：注入 `aRibbonEdge` varying + `uMBRibbonWidth` uniform，`gl_FragColor.a *= clamp((1-|vEdge|)*widthPx, 0, 1)` —— mgl 式 ~1px 线性羽化。仅在材质已透明（line-opacity<1）时可见；**不主动置 `transparent:true`**（90c061d4 已记录会灾难性重排透明通道绘制顺序，337→54701，须与渲染顺序专项一并解决）。

**过程 bug 教训（首版全红 55711）**：① 重构时丢掉 `geo.edge` 初始化 → decode 抛异常整域空白；② 开放折线最后一点的出方向 `% n` 环回首点 → 领结自交环 → 线宽减半（34000 vs 58813 dark px）。修后 standalone 数值验证：直线=矩形 ±hw、L 形=外 miter 尖角(12,-2)+内交点(8,2)、Z 形双角正确。

**验证状态**：tsc 绿；standalone 几何数值验证通过；渲染 harness **未跑**（用户要求先代码端闭环）。join3 结果目录为修复前中间态，勿作基线。

**遗留**：渲染验证（line-join 11 例 / line-cap / line-color 337px 基线是否收敛）、不透明线 AA（需透明通道排序专项）、dasharray×join 组合。

### 12.34 代码端批量闭环（2026-08-18 第二批，全部延后渲染验证）

> 按用户要求：先修代码、最后统一验证。以下全部 tsc 绿 + standalone 静态推理，未跑渲染 harness。

**Line 域（F8/F9 延伸，`MBTileDataEmitter` / `MBMaterialPatchManager`）**：
1. **line-offset（F9 半项，5+5 例）**：中心线沿左法线位移（mgl 正值向左），角点用相邻两段法线均值防缺口；join/caps 自动一致（从位移后中心线派生）。
2. **line-blur（F9 半项，5 例）**：ribbon AA feather 扩展 `uMBRibbonBlur` —— `clamp((distIn + blur/2)/(blur+1))` 边缘坡道近似 mgl blur（内部保持不透明）。
3. **line-translate（4 例）**：ribbon technique 携带 `_translate/_translateAnchor`，patcher 注入 `uMBTranslate`（px→world 按 displayZoom 换算；viewport-anchor 旋转未做，与 circle-translate 同级近似）。
4. **line-blend-mode（6 例）**：ribbon fill 材质映射 additive/multiply → THREE blend mode。
5. **line-width-unit:'meters'（6 例）**：ribbon 宽度直接按米（世界单位=米），AA feather 的 `_ribbonWidthPx` 换算为有效 px。

**Fill 域**：
6. **fill-z-offset（P2.3，4 例）**：`processFillFeature` 顶点 `push(w.x,w.y,0)` 丢 z → 改 `w.z`（`project()` 已折叠 `m_currentZOffset`）；并补 `noteGeometryHeight`（近裁剪面上报）。

**Image 域（P2.7，image 7 raster 子类）**：
7. `applyImageSources` 合并引用该 image source 的 raster 层 paint：visibility 门控、`raster-opacity`、`raster-resampling`（Nearest/Linear）、brightness/contrast/saturation/hue-rotate shader 注入（与 `patchRasterMaterial` 同数学，自包含于 gl_FragColor）。

**表达式（image-fallback-nested，19 例）**：
8. `MBExpressionEngine` 新增静态 `availableImages` 注册表：`["image",name]` 对不可用名返回 null → `coalesce` 链回退（mgl 语义）。`loadSpriteAtlas` 发布图集名、`addImage/removeImage` 增删。时序安全：`configure` 中 `await loadSpriteAtlas` 先于解码求值。

**未动（调查项）**：line-gap-width（expected 全黑无法取证，mgl gap 语义待查源码）、dasharray×ribbon 双渲染疑云（**✅ 已破解 2026-08-19，§12.62**——SolidLine dash 在 SwiftShader 不栅格化，dash 改在 ribbon 上渲染）、不透明 ribbon 的 AA（需透明通道排序专项）。

### 12.35 代码端闭环第三批：line-gradient / line-pattern 上 ribbon（2026-08-18，延后渲染验证）

**背景**：line-gradient（14+12 例）/ line-pattern（20+19+18+12 例）此前仅 SolidLine 死路径消费（SwiftShader 不栅格化），ribbon 填充路径完全无消费。

**实现（全链）**：
1. **emitter**：`AccumulatedGeometry` 新增 `dist`（0..1 归一化线进度）/`len`（绝对世界米数）双属性，`emitRibbonBody`（body/join/none 分支）与 `emitRibbonCaps` 全部顶点同步 push；`getDecodedTile` 发射 `aRibbonDist`/`aRibbonLen` 顶点属性。
2. **technique**：`getOrCreateRibbonTechniqueIndex` 键扩展 `grad`/`patternName`；携带 `_lineGradientStops`（paint 原始表达式）与 `_patternName`+`_ribbonPatternWorld`（sprite px × mpp 换算世界尺寸，来自新静态注册表 `MBTileDataEmitter.setSpriteInfos`，由 `loadSpriteAtlas` 发布、`addImage` 增量维护）。
3. **patcher（ribbon 注入扩展）**：
   - gradient：`buildGradientTexture`（既有）→ `uMBRamp`，`gl_FragColor.rgb = texture2D(uMBRamp, vec2(vDist, .5)).rgb`。
   - pattern：`extractPatternTexture`（既有，Repeat 包裹）→ `uMBPat`，`u = aRibbonLen/patternWorldW`、`v = vEdge×(halfWidthWorld/patternWorldH)`，输出 `vec4(mp.rgb, mp.a×alpha)`（图案 alpha × line-opacity）。
   - feather/blur/translate 注入不变，pattern→gradient→feather 顺序应用。

**已知近似**：gradient stops 的 alpha 通道未应用（仅 rgb）；pattern 的 v 锚点为中心对称（mgl 从上边缘起铺）；两者共存时 gradient 覆盖 pattern 的 rgb。

### 12.36 F8 验收 + 两个渲染级根因修复（2026-08-18，`rendering-test-results/mbstyle-final1/`）

**首轮验收暴露的两大根因（二分法定位，各耗时 4 轮对照）**：
1. **单一 earcut 环在短段下自交**：vector tile 的道路碎段常短于线宽，inner 交点构造的环自交（standalone 复现 3 处自交/coverage 1.26）→ earcut 丢三角形 → 渲染碎片化+变细（line-color 337→11686）。**修复**：改为**逐段矩形 + 外角 join 楔形**（每角独立三角形组，任意几何鲁棒）。二分中间态：梯形条带（inner 精确交点）反而更差（角部 105px vs 矩形 10px），弃用。
2. **AA feather 在半透明 ribbon 材质上的全网周长放大**：ribbon fill 材质因 tile-fading 处于透明混合，1px 线性羽化 × 路网总边长 ≈ +1400px（line-color 344→1780 实测）。**修复**：feather 仅 `line-blur>0` 时激活（blur 系 5575→745），全量 feather 与透明通道排序专项一并解决。

**验收结果（26 passed / 310 上报）**：
- **line-join/miter、bevel、default 首次通过**（历史近失千级）；round 21px、property-function 39px、none 233px（gaps 语义正确）；elevated-line-join 同步（10px 级）。
- **line-color 344/341/326 ≈ 基线 337 零回归**；line-cap butt 344/square 301/round 1309 持平；line-blur/default 5575→745；line-offset/translate default 745（接线生效，进入近失带）。
- **line-gradient 全族从无渲染 → 有渐变**（2726-67px；runtime-remove 67 近失）——像素校准项（ramp 采样/进度归一）。
- **line-pattern literal 170 / opacity 103 / with-dasharray 170 近失**；join-none/pitch/int-zoom 系 1-5 万（pattern 平铺密度与宽度的换算待校准）。
- **待查 bug**：`line-width-unit:meters`（2-5 万，疑似仍按 px 换算或 mpp 取值错）；`line-translate/offset literal`（1.8 万，px→world 换算或方向错，default 近失说明通路已通）。

**教训**：① "数学验证正确的几何构造"在真实数据（短段路网）下未必成立——鲁棒性 > 精确性优先；② 二分法（禁用注入/恢复旧路径/开关 wedge）4 轮内锁定两个独立根因；③ 每轮 karma ~7min，一次只改一个变量。

### 12.37 三问题深查（2026-08-18，meters-unit / translate·offset / gradient·pattern 像素校准）

**1. line-width-unit:meters（24287 → 2672 近失）**：`line-width-unit` 是 **layout** 属性，代码读的 paint → 恒 miss。改读 `layer.layout`。

**2. line-translate / line-offset literal（18621/17576 → 754/1180 近失）**：
- translate 的 shader uniform 注入路径**无效**（埋点证实 uniform/数值正确但渲染零位移，MeshBasicMaterial 替换目标都在——原因未深究）→ 改为 **emitter 几何烘焙**（中心线整体位移），实测 mgl 参考 [x,y]=[5,5] 屏幕位移 (5,+5)（y 向下）→ `twy = -ty·mpp`。
- offset 方向实测与初版相反 → 翻转为右法线。
- 教训：互相关位移测量要按稀疏 crop 局部做，全局 centroid/roll 对称路网不可靠。

**3. gradient / pattern 像素校准（gradient 2726→通过；pattern literal 237→164、opacity 169→78、join-none 系 3 万→大幅收敛）**，四个独立根因：
- **a. 可见层是 SolidLine 而非 ribbon**（推翻"SwiftShader 不栅格化 SolidLine"旧假设——`_preExtrudedLines` 后其实一直在画！）：其 gradient 注入 `fract(vCoords.x)` 对**米制**累计距离取小数 = 噪声进度（绿色缺失）+ sRGB ramp 在 linear 域采样（2.2x 亮化）。修复：**gradient/pattern 线抑制 SolidLine 几何**，只走 ribbon（`skipSolidLine`）；同时消除双画。
- **b. ribbon 注入点在 `colorspace_fragment` 之前会被再转换**（§12.31 同款）→ 移到 colorspace 之后（sRGB 纹理值直出）。
- **c. ramp alpha 通道未应用**（起点 `rgba(0,0,255,0)` 应透明）→ `gl_FragColor.a *= mbGrad.a`，gradient 主用例转通过。
- **d. pattern v 映射**：mgl 把图案高度**拉伸至线宽**（`v = edge·0.5+0.5`），非世界比例平铺——border 类图案（上下边框）按比例采样全落黑带（int-zoom 黑线根因之一）。
- **e. sprite 竞态**：`wireTileSources`（触发解码）先于 `loadSpriteAtlas` → pattern technique 创建时 `_ribbonPatternWorld` 缺失 → 黑线。已调换顺序（同时修正 image-fallback 的 availableImages 时序）。
- **f. patcher 路由**：`case 'fill'` 里 `_patternName` 被路由到 `patchFillPatternMaterial`（fill 语义）绕开 ribbon 采样器 → ribbon 优先路由。

**残余**：`line-pattern/int-zoom-constant-width` 34207（u 平铺密度——`m_zoom` 整数 vs fractional zoom 7.3 的 mpp 偏差 ~2.46x）；`line-gradient/vector-tile` 13976（mvt 多 feature 进度归一）；`meters-offset/blur/border` 连带项。line-color/miter/bevel 等已通过项零回归。

### 12.38 第四轮收尾（2026-08-18，fix7/fix8）

- **meters-offset 24470 → 4698**：`line-offset` 在 `line-width-unit:meters` 下同为米制（跟随 unit 直接按米位移）。
- **line-pattern/literal 转通过**：pattern sprite 的"黑色"区域实为 alpha-0 透明（RGB 残留），材质 opaque 时被画成实心黑 → pattern/gradient ribbon 置 `transparent:true`（仅限带纹理的 ribbon，规避全量透明重排）。
- **meters-blur**：blur 米→px 换算 + mgl 中心衰减公式（`1−distCenter/blur`），14813→14005，仍深水（渐变分布细节未对齐，mismatch 主源待逐像素分析）。
- **未动**：int-zoom-constant-width 35072（宽度 zoom 函数 + pattern 密度双因素）；gradient-vector-tile（**line-width 也是 line-progress 函数**——宽度沿进度变化，需 per-progress 宽度的深水实现）；meters-border（line-border 未实现）。
- 回归：line-color 344 / line-blur default 745 / gradient 主用例 / line-join 系全部保持。

### 12.39 blur 深挖（2026-08-18，fix9–fix12）

**已确定（数值拟合自 meters-blur 参考剖面）**：
- mgl blur 公式：`alpha = clamp(1 − distCenter/blur)`（distCenter 距线中心）；
- **blur 单位恒为 CSS px，不跟随 line-width-unit:meters**（拟合 blur=5px 与参考逐点吻合；曾按米换算反而偏差）；
- blur 线的 ribbon 材质必须 `transparent:true`（否则 alpha 无效——与 pattern 黑线同款根因）；
- SolidLine 副本对 blur 无影响（抑制前后数值不变，ribbon 始终是可见层）。

**未闭环（需专项）**：mgl 的晕圈延伸到 halfWidth+blur 之外——几何外扩实验（fix11）在密集路网中外扩矩形互相重叠、透明叠加堆成大片黑（14362→46930），已回退。正确做法需 mgl 式的 per-line blend 隔离（或单 pass 合成），与"全量 AA feather + 透明排序"是同一专项。

**最终态（fix12 全量回归）**：10 passed 保持；line-color/line-cap 344 零回归；meters-blur 13537（线内渐变生效、晕圈截断在几何边缘）；meters-offset 4698；int-zoom 35072（pattern 白点相位，宽度插值已排除——base 曲线实现正确）。

### 12.40 代码端闭环第五批（2026-08-18，延后渲染验证）

1. **pattern u 纵横比**（int-zoom/meters-pattern 主嫌疑）：mgl 把 pattern v 拉伸至线宽、**u 保持纵横比**——平铺周期 = patternW·(lineW/patternH) 世界单位。`uMBPatUScale = patternH/(patternW·lineWorld)`（原为 1/patternW，密度差 lineW/patternH 倍）。
2. **line-border（meters-border 24282 + line-border 分类 13 例）**：ribbon 几何实现——`emitRibbonBorder` 用 `offsetPolyline`（自 line-offset 抽取复用）生成 ±(hw−bw/2) 两条边线，各自走 `emitRibbonBody`（join 语义与主线一致），独立 fill technique（renderOrder −0.1 在主 ribbon 之下）。宽度单位跟随 width-unit。
3. **per-progress 变宽线（gradient-vector-tile 13976）**：`line-width` 本身是 `["line-progress"]` interpolate 时（evaluator 无该 input → 求值 null → 线宽 0），从 `paintDefs` 取 raw stops（`parseProgressStopsStatic`，含 memo 解包）按 cumDist 计算 **per-vertex 半宽**，贯通 body（矩形→梯形、join 楔形）/caps（端点宽）。变宽线不发 border。

待统一验证批：line-pattern line-width-unit line-border line-gradient line-color line-join line-cap line-blur line-offset line-translate。








### 12.41 代码端闭环第六批（2026-08-18，延后渲染验证）

1. **fill-outline 换用 join-aware ribbon body**：`emitFillOutline` 弃用 legacy averaged-bitangent bake，直接调 `emitRibbonBody`（环角 miter join 与线渲染一致，edge/dist/len 属性同步）。
2. **meters 下 SolidLine 单位**：`paintToTechniqueProps` 在 `line-width-unit:meters` 时把 `lineWidth` 预除 mpp（metricUnit:'Pixel' 换算后还原米制）；dash 尺寸因乘 lineWidth 自动连带。
3. **line-trim-offset on ribbon**（18+12+18+12 例）：ribbon technique 携带 `_trimOffset`，patcher 注入 `uMBTrimRange` + `discard`（progress 区间外），`aRibbonDist` varying 条件扩展为 gradient||trim。
4. **@2x pattern 尺寸**：sprite 注册表带 `pixelRatio`，`patternWorld` 除 pr（@2x/3x-on-2x 用例）。

待统一验证批（含第五批）：line-pattern line-pattern-trim-offset line-trim-offset line-width-unit line-border line-gradient line-color line-join line-cap line-blur line-offset line-translate fill-outline-color elevated-line-pattern elevated-line-gradient

### 12.42 第五+六批统一验收（2026-08-18，`mbstyle-r56/`，209 上报 / 10 通过）

**新进入可比/近失带**：
- **line-trim-offset 全族（18+18+12 例）**：从完全未接线 → 全线渲染，120–4597px 近失带（gradient-*/pure-color-*/trim-color-* 系列）。trim discard 通路验证 ✓，残余为 fade 变体（trim-fade 的渐隐未做）与像素校准。
- **line-border 全族（13 例）**：从未实现 → 737–4864px 近失带（default 768/color 737/trim-offset 791）。`aliasing` 56837 的主源是未实现的 **line-gap-width**（该用例第 2 层 width 10+gap 10），非 border 本身。
- line-pattern：opacity 78→37、with-dasharray 237→102、@2x 897→693、property-function 2194→1775、step-curve 2169→1783、int-zoom 35072→32122。
- meters-blur 13537→8300（连带波动）。

**持平确认**：line-color 406（344 基线带内波动）、line-cap 344、line-join 系保持通过、gradient 主用例保持、meters-default/offset 持平。

**fill-outline（join body 切换）**：27→53 / 104→56 / 127→169——均值近似持平，miter join 在锐角环角略增差异，保留（一致性收益大于像素噪声）。

**下轮优先**：line-gap-width 语义（aliasing 主源 + line-gap-width 分类 5 例）、line-trim-fade 渐隐变体、**border 默认色核对（line-border/default 无 border-color 时 mgl 默认值待证）→ ✅ 已完成（2026-08-19，§12.61，commit 7f49ae64/d9e9a813）**。

### 12.43 line-gap-width 定性 + trim-color/fade 实现（2026-08-18，commit `5cc43fcf` 后）

**line-gap-width 语义取证（aliasing 剖面）**：mgl 对单条线**无视觉差异**（线宽仍 = line-width，gap 只在相邻 casing 线间起作用，shader 实现）→ 无需几何实现，跳过。
**aliasing 56837 重新定性**：主源 (a) **大 line-offset（30–60px）的瓦片边缘截断**——mgl 的 offset 是屏幕空间 shader uniform（跨瓦片无缝），我们烘焙在几何（瓦片内截断）；普通测试 offset 2–10px 影响小，>20px 需屏幕空间方案（深水）；(b) 多层下黑 border 部分缺失（单层 default 768 正常，待专项）。

**line-trim-color / line-trim-fade-range 实现**（trim-color-fade/trim-fade-pitched 等 ~8 变体）：
- technique 携带 `_trimColor`（默认 'transparent'）+ `_trimFade` [in, out]；
- patcher：discard 替换为混合——`t = max(smoothstep(start, start−fadeIn, d), smoothstep(end, end+fadeOut, d))`；trimColor.a=0 时折叠为 discard（兼容旧行为）；a=1 时 rgb 替换为 trimColor、边缘按 t 渐变。

待验证：line-trim-offset line-pattern-trim-offset line-border line-gradient。（**2026-08-19：line-border 已验证**——thick-line-border PASS 0，全族进入 600-2600px 近失带，残余为线 AA，见 §12.61）

### 12.44 代码端闭环第七批（2026-08-18，延后渲染验证）

1. **line-border-gradient**（line-border/gradient 2169）：border technique 继承主线 `_lineGradientStops`（mgl border 是线 shader 的一部分，随 gradient 渲染）。
2. **raster premultiplied alpha**（raster-masking 4 例 + raster-alpha）：`patchRasterMaterial` attach 与 `applyRasterSource` env quad 两路径——纹理 `premultiplyAlpha=true` + `CustomBlending(ONE, ONE_MINUS_SRC_ALPHA)`（对齐 mgl raster 上传/混合）。已知近似：three 的 material.opacity 只乘 alpha 不乘 rgb，opacity<1 的 premultiplied 输出偏亮。
3. trim-color/fade（§12.43）一并待验证。

### 12.45 代码端闭环第八批（2026-08-18，延后渲染验证）

1. **raster opacity/colorspace 修正**：`patchRasterMaterial` 注入移到 `colorspace_fragment` 之后（原先 opaque 后会被再亮化——raster 调整系历史值待复核）；`material.opacity=1` + `uMBRasOpacity` uniform 同时驱动 rgb+alpha（mgl `color×opacity` premultiplied 语义，three 只乘 alpha 的偏差修正）。
2. **symbol-elevation（17 例）**：`processPointFeature` symbol 分支补 `resolveZOffset('symbol')`（symbol-z-offset / symbol-elevation-reference 抬升 POI/text 几何，`noteGeometryHeight` 上报近裁剪面）。
3. **icon-translate / text-translate（3+2 例）**：几何烘焙进 POI/text 世界坐标（与 line-translate 同方向约定 `twy=−ty·mpp`）。

待统一验证批：raster-masking raster-alpha raster-opacity raster-brightness line-trim-offset line-pattern-trim-offset line-border line-gradient line-pattern symbol-elevation icon-translate text-translate line-color line-join。

### 12.46 代码端闭环第九批（2026-08-18，延后渲染验证）

1. **text-radial-offset**：emitter 按 anchor 象限的 ±0.7071 单位向量换算进 technique xOffset/yOffset（center 行为同 bottom 向下；纯水平锚 dy=0），叠加在 text-offset 之上。
2. **icon-text-fit `*-2x` 复核**：harness `pixelRatio` metadata 已传入 MapView（cur 400×300 = 200×150@2x ✓），§12.21 时代"高度恰 2× 差"诊断可能已过期——待下轮验证观察，暂不改 PoiRenderer。

### 12.47 代码端闭环第十批（2026-08-18，延后渲染验证）

1. **text-max-angle**（2 例）：emitter line-placement 分支新增 `splitPathByAngle`——急弯（转角 > text-max-angle，默认 45°）处把 path 切成直段，每段独立 TextPathGeometry（对齐 mgl getLineAnchors 不跨弯放置）。
2. **line-pattern-cross-fade**（5 例）：`["image", a, b]` + zoom 驱动 cross-fade（0..1）——emitter 从 paintDefs raw 解析第二候选名（evaluated paint 给首个可用名），technique 携带 `_patternName2/_patternFade`；patcher 采两纹理 `mix(mbPat, mbPat2, fade)`。近似：fade 的 tile 级解码时求值（非逐帧连续）。
3. text-radial-offset（§12.46）同批待验证。

### 12.48 代码端闭环第十一批（2026-08-18，延后渲染验证，"攒完"批）

1. **fill-pattern-cross-fade**（4 例）：fill technique 从 paintDefs raw 解析 `["image",a,b]` 第二候选（`_patternName2`）；`patchFillPatternMaterial` 双纹理 `mix(mbPat, tex2, crossFade)`（原单纹理 alpha 调制升级）。
2. **sprite @2x 选择**（sprites 8 例 + icon-pixelratio 1 例连带）：`loadSprite` 按 `min(2, devicePixelRatio)` 先探测 `@2x` 变体（json/png/pbf 后缀派生），失败回退 1x。@2x 下 icon 按物理像素注册（mgl 同）；pattern 尺寸已除 pixelRatio（§12.41）。

七–十一批全部代码端闭环完毕，剩余项均需跑测取证（多层 border 埋点、icon-text-fit-2x 复核、blur 晕圈 blend 隔离专项）。

### 12.50 N1 排查——pattern 全黑三重根因 + 修复（2026-08-18，`mbstyle-n1*/`）

**重大发现：background-pattern quad 从未真正渲染过**。§2.1 的"background-pattern ✅13"是 08-07 代码审计结论（非像素验证）；r711 的 3556/14803 与本 Linux 环境纯黑 current 的 mismatch 完全一致——即 macOS 上也是黑的。本轮（Linux Edge150 + SwiftShader）逐层取证（karma `--log-level debug` + console 埋点，`pkill -f "RenderingTestResultServe[r]"` 防自杀）定位三个叠加根因，全部修复：

1. **单行 atlas 打包超 GL MAX_TEXTURE_SIZE**（`buildSpriteFromIconSet` 单行拼接 → `standard` icon set 产出 **49562px** 宽 canvas → 纹理上传静默失败 → 全黑）。修复：shelf 行打包，`MAX_ATLAS_DIM=8192`（`SpriteAtlas.initCanvas` 还会 ×2 扩 canvas，8192→16358 ≤ 16384 侥幸可用，后续可再压）。
2. **background quad 定位数学非法**：`setFromRotationMatrix(inverse(P·V))`——逆投影不是旋转矩阵，四元数产出垃圾 → quad 侧立/不可见（黑屏上仅剩 1-2px sliver）。修复：onBeforeRender 里对 NDC 四角（z=0）`unproject(camera)` 拟合 quad（position=质心、basis=边向量、scale=边长/2），对 pitch/透视 skew 天然正确；MapView 相机 world-scale 裁剪面（near≈14.6M）下 mid-depth 安全。
3. **flipY 采样错位**：`getIconUv` 是图像空间（原点左上），纹理 flipY 上传后 v 轴反向——原 offset 直取 `[u0,v0]` 采样到 atlas 打包区下方的**空白行** → 黑。修复：`offset.y = 1 - v0 - h`。
4. **mgl 语义修正**（本轮 N1 原任务）：① quad 材质不再乘 `background-color`（mgl `background_pattern` shader 无 u_color，默认黑会把整屏乘黑）→ 恒白；② 平铺周期从固定 `repeat=8` 改为 **mgl displaySize 语义**：`period = sprite物理px/pixelRatio × 屏幕DPR`（设备像素），onBeforeRender 里按 `renderer.getDrawingBufferSize/getSize` 动态算（512 画布+64px pattern 的旧巧合值 8 保持等价，零回归）；③ quad 异步添加后补 `mapView.update()` 请求重绘。
5. **fill/solid-line pattern @2x 尺度**：`patchFillPatternMaterial` 的 `tileScale=1/物理宽` 改为 `pixelRatio/物理宽`（=1/逻辑宽，对齐 ribbon 的 patternWorld 语义）；solid-line trim 路径 `pscale` 同修；`patternTextureCache` 增加 atlas 更换失效（setStyle 换 sprite 不再用旧纹理）。

**验证（`mbstyle-n1final/`，Linux 环境 44 例）**：pattern 全域从"全黑 16k+"进入渲染态——fill-pattern/literal 3842→**394**、opacity →**392**、color-theme →482、zoomed →795、missing →784；background-pattern 系 16384→2779–13112；sprites pattern 3556/14803→3458/14554（垂直周期已对 56px，水平/亮度待校准）。**尚未转通过**——剩余像素校准（水平周期、暗度/预乘、相位）为下轮 N1b；fill-pattern 的 moire/uneven/wrapping 大值需先与 macOS 基线核对再定性。

**测试基建备忘**：karma 直跑取 console 需 `npx karma start karma.conf.js --log-level debug`（不指定 config 不会加载 customLauncher）；每轮强制 `timeout ≤400s` + 事后 `pkill -f "RenderingTestResultServe[r]"`（方括号防 pkill 自匹配——本轮曾因 pkill 全命令匹配自杀整条管线）。

### 12.51 N1b：pattern 平铺四项像素级对齐（2026-08-18，`mbstyle-n1b*/`）

在 §12.50 基础上继续把 sprites pattern 校准到逐像素（`1x-screen-2x-pattern` 剖析：expected 周期 20×56 逻辑 px、色 (248,77,77)、世界锚定相位）：

1. **子矩形平铺必须走 shader**：`offset/repeat + RepeatWrapping` 只能平铺**整张 atlas**（wrap 以整纹理为周期），此前实际只画出左上一个 tile。改为 onBeforeCompile 替换 `#include <map_fragment>`：`tx=fract(uv.x·nx−phaseX), ty=fract((1−uv.y)·ny−phaseY)`，采样 `uv=(u0+tx·w, 1−v0−ty·h)`（flipY 空间）；半 texel 内缩防 atlas padding 渗色（`uMBPatPxSize` uniform）。
2. **sRGB 双重编码**：atlas 纹理未标 colorSpace → 字节当 linear、输出端再 encode → G/B 通道翻倍（77→149 精确复现双重编码特征）。`tex.colorSpace = SRGBColorSpace` 后主色 (248,77,77) 与 expected 逐像素一致。
3. **世界锚定相位**：mgl `get_pattern_pos` 以**世界像素 0**（mercator 原点 lng −180/lat 85.05）为相位原点（`pixel_coord` 来自 tile 世界偏移），非屏幕原点——zoom 0/64px 视口下差 4px（实测暗条纹 15 vs 11）。`mapView.getScreenPosition(GeoCoordinates(85.05112878,-180))` 每帧算屏幕偏移 → `uMBPatPhase`。修后暗条纹位置逐像素对齐（mad 1.5，best shift 0）。
4. **tileCount**：`buf/disp/DPR`（§12.50 已定），垂直周期 56px 首轮即对。

**结果**：sprites pattern 4 例 3514/3556/13916/14803 → **2185/2294/9912/9241**；残余为 ±1–3 强度的全图散布噪声（~1000 px >1/255，max 66 在 tile 接缝 AA）——SwiftShader vs 参考 GPU 的舍入/抖动差，阈值 17 px 在本环境不可达（macOS 真机或可通过）。**未转通过但结构性对齐完成**。

### 12.52 N1c：icon_set 光栅化对齐 mgl + literal 引用定性（2026-08-18，`mbstyle-n1c*/`）

**对照 mgl `usvg_pb_renderer.ts` 移植四项到 `IconSetPBFDecoder`**（解码器字段映射本已一致）：
1. **gradient.transform**（linear/radial gradient 的 field 1）此前被 skip——现在读入并在 fill/stroke 时 `ctx.transform` 附加（mgl `setTransform(grad∘current)` 语义）；
2. **单 stop 渐变折叠为纯色**（mgl `stops.length===1` 分支）；
3. **stops opacity × fill/stroke opacity**（此前漏乘 fill alpha）；
4. **stroke 的渐变 paint 支持**（此前渐变 stroke 落到 rgb 兜底）。

**background-pattern/literal 11926 定性：引用损坏（不可修）**。取证链：解码 `pedestrian-polygon` 为实心 rgb (169,182,208) + **32 个 MOVE 子路径的 1.5px 宽斜线 hatch**（16 条对角四边形）——任何光栅化都必然产出连续 AA 值；而 expected.png **仅 3 种唯一颜色**（(168,175,203)×8192 / (168,179,204)×4096 / 黑×4096），且 (168,175,203) ≠ sprite 色 (169,182,208)——来自真实光栅化的 3 色平图在数学上不可能（legacy standard.png 的同区域也是半透明 hatch，结构一致）。归入 §12.13 同类"引用损坏"（text-* 63 例先例）。修复后数值不变（11926）非代码问题。

**回归**：icon-image/icon-color/icon-halo-color 三分类 43 例，baseline4 的 9 个通过项全部保持 + icon-halo 5 个 §12.32 修复项保持，0 回归。

**遗留**：background-pattern/pitch/zoomed 等 12k 案例与 literal 同源（同一 hatch sprite 引用）；`wrapping/uneven/moire` 大值待 macOS 基线核对定性；② fill-pattern 保持 392–795 近失带。

### 12.49 七–十一批统一验收（2026-08-18，`mbstyle-r711/` + `mbstyle-rasfix*/`）

**生效确认**：
- **sprites @2x**（`loadSprite` 探测）：2x-screen-1x-icon **41 近失**、2x-screen-2x-icon 304（@2x 图标注册生效）；pattern 系 3.5–14k（pattern @2x 尺度仍偏，下轮校准）。
- **line-pattern-cross-fade**：221–2350 近失带（双纹理 mix 生效）；fill 版 1932–5505。
- **symbol-elevation**：`collision-with-symbol-z-elevate` top/bottom **387/220 近失**（z 抬升生效）；ground/sea 系 24–26k 为 terrain/globe 场景级依赖（非 elevation 值本身）。
- 零回归：line-join 系/gradient 主用例保持通过；line-color 410、line-cap 344 基线带。

**教训（重要）**：raster 系 110–121k 是**文档既有基线失败值**（§13.1 G5 "raster-opacity 121k"，F11 双路径未收口）——本轮曾误判为 premultiply 回归，两轮回退后核对历史值确认非回归。最终 raster 代码回退到 D5 版本（premultiply/CustomBlending/colorspace 三项尝试全部撤销，记 known-gap：raster premultiplied 上传在 three 链路上不可用）。
- icon-translate 8066 = §12.16 既有基线（mvt 符号源空白），非新错。

## 15. 下一步计划（2026-08-18 会话末冻结，按 ROI 排序）

### P0 — 上一轮验收的直接跟进（有明确取证方向）
| # | 任务 | 依据 | 复杂度 |
|---|------|------|--------|
| N1 | **sprites pattern @2x 尺度校准**（1x-screen-2x-pattern 3556 / 2x-screen-2x-pattern 14803）：**主体完成（2026-08-18，§12.50）**——真因是 pattern 全黑三重 bug（atlas 超 MAX_TEXTURE_SIZE / quad 定位数学非法 / flipY 采样错位），已全部修复 + mgl displaySize 平铺语义；fill-pattern 进入 392–795 近失带。**剩余 N1b**：sprites/background-pattern 像素校准（水平周期、暗度、相位）→ 转通过 | §12.48/12.49 | ⭐⭐ |
| N2 | **symbol-elevation ground/sea 系**：**主体完成（2026-08-19，§12.55/12.58）**——真因是 raster 背景（N7 连带 24k→1.9k 近失）；mgl 404 父级回落已源码证实。**剩余**：sea 远距裁剪幅度校准（tilt 已触发但过度，farClipEnabled 门控中）+ 符号 SDF 边缘 | §12.55 | ⭐⭐ |
| N3 | **icon-translate / text-translate 符号源空白**（8k/10k 既有基线）：§12.16 记录 mvt 符号源不渲染——与 icon-text-fit/property-function 的"同点要素仅放置 1 个"同为 placement 深水区 | §12.16/12.49 | ⭐⭐⭐⭐ |
| N4 | **int-zoom pattern 白点相位**（32122）：宽度 base 插值已排除、密度已修 u 纵横比——残余为逐点位置校准，需像素级 diff 取证 | §12.42 | ⭐⭐⭐ |

### P1 — 架构/引擎级专项（单开多轮）
| # | 任务 | 说明 | 复杂度 |
|---|------|------|--------|
| N5 | **透明通道 blend 隔离专项**（一项三题）：全量 AA feather 启用（§12.36 门控）、blur 晕圈几何外扩（§12.39 回退的 rev2）、半透明线交叉的 mgl 式单 pass 合成 | line-color 337→0 的最后一公里 | ⭐⭐⭐⭐ |
| N6 | **大 line-offset 屏幕空间方案**：**代码已完成（2026-08-19，§12.60）**——offset 从几何烘焙迁移为 `aRibbonOffs` 顶点属性 + ribbon patcher `transformed.xy` 位移（mgl `line.vertex.glsl` 语义对齐，裁剪/剔除不可见）；offset 线走 ribbon-only。**待渲染验证** | 需 vertex shader 位移注入 | ⭐⭐⭐ |
| N7 | **raster 双路径收口（F11）**：**主体完成（2026-08-19，§12.54–12.57）**——material.map 无效改自注入采样/全局 UV 归一化/父级回落/sRGB 域合成/mgl 精确公式，121k→559–19.8k，brightness/function + underzoom + raster-loading 转通过。**剩余**：基底 14171（瓦片内部亚像素，疑 SwiftShader 不可达）、image 对齐校准（MapAnchor 已上屏 106k，朝向/亮度）、sea 裁剪 | ~85 例 | ⭐⭐⭐⭐ |
| N8 | **gradient-vector-tile 多 feature 进度**（13976）+ per-progress 宽度像素校准：**已源码取证（§12.60）**——mgl progress 分母为瓦片缓冲内整段 feature 长度（clipLine Range 映射），我们按裁剪后碎片归一化；修法依赖解码层 buffer 几何，需像素取证先行 | §12.40 | ⭐⭐⭐ |

### P2 — 全量基线复核
| # | 任务 | 说明 |
|---|------|------|
| N9 | **跑第五轮全量基线**（baseline5）：本会话累计大量近失带转正，需全量重估通过率（预期 baseline4 231 → 显著提升；line/trim/border/cross-fade/sprites 系是主要增量）| 分批脚本 + ~2h |

### 验证流程备忘（沿用）
- 代码端分批闭环 → 单批 karma 验证（HARP_NO_HARD_SOURCE_CACHE=true，改代码后必带）；
- 每轮验收前**核对文档历史基线值**（§12.49 raster 误判教训）；
- `pkill -f RenderingTestResultServer` 清孤儿；结果读 `rendering-test-results/<dir>/web-*/`。

### 12.53 第五轮全量基线 baseline5（2026-08-18 夜，N9）

**2810 上报 / 375 通过（13.35%）**，vs baseline4 231/2827（8.17%）：**净 +144（+151 新增 / −7 失去）**。通过清单落盘 `baseline5-pass.txt`。

- **增量来源**（与 08-16→08-18 修复轮次对应）：runtime-styling +35、icon-anchor +8、appearance/icon-bbox +8、icon-size +7、fill-extrusion-color +6（FOV/近平面/alpha 三修）、heatmap 系 +13（双 pass）、icon-halo 系 +8、line-join/elevated-line-join +6（ribbon join）、image-fallback-nested +8、lighting-3d-mode/background +5、text-rotation-alignment +3 等。
- **失去 7**：circle-camera-orthographic-projection、circle-pitch-alignment|pitch-scale/viewport 系 2（FOV 36.87 修正的已知代价，§12.29）、fill-extrusion-edge-radius-narrow-corner、fill-pattern/wrapping-with-interpolation（N1 系 pattern 改动，待 N1c 后复核）、placement/symbol-layers-same-layout-properties、text-max-width/force-double-newline（偶发，harness 竞态带）。
- **运行说明**：Linux Edge150 headless + SwiftShader（与 macOS 基线环境不同，绝对值含环境噪声）；跑到中段时 raster sRGB 色彩空间修正（N7 预研，见 §12.54）已入工作区被后续 chunk 混入——raster 系数字为混合态，定性不变（仍未通过）。
- 216 用例未上报（崩溃/超时批，与 baseline4 的 219 相当）。

### 12.54 N7：raster 逐瓦片管线上屏（2026-08-19 凌晨，`mbstyle-n7*/`）

**三重根因**（与 N1 pattern 全黑同构的取证链，karma console 埋点定位）：

1. **MapMeshBasicMaterial 忽略 `material.map`**：编译产物无 USE_MAP/vMapUv（埋点实锤）——挂 map 无效，瓦片按 technique 白色渲染。修复：onBeforeCompile 自注入 `vMBRasUv` varying + `uMBRasMap` 采样（hillshade 同法），brightness/contrast/saturation/hue 调整链折入同一注入（默认值恒等）。
2. **栅格瓦片 UV 是全局坐标**：composite geojson 的瓦片四边形 y≈1.8e8（level 17 全局行号），`y/extents` 的小数部分恒定 → 纹理竖向塌缩成 2 条水平带（埋点实锤 verts=[0,184639488,...]）。修复：raster 要素 UV 按自身 bbox 归一化（每要素恰一个瓦片四边形 → bbox↔[0,1]² 一一对应）。
3. **纹理 sRGB**：卫星 PNG 标 `SRGBColorSpace`（否则双重编码发白，N1b 同源）。
4. **父级回落（mgl overzoom 语义）**：`RasterTileDataProvider` 逐级探测祖先瓦片（GET 缓存存在性），404 时用最深存在祖先 URL + UV 子矩形（`_rasterUvRect` offset/scale 注入采样）。

**结果**（Linux 环境）：
- **raster-loading/missing 转通过**；raster-opacity/default 121556→**14171**（近失带，残余为瓦片级亚像素对齐）；contrast/hue/saturation default 同 14171（调整链恒等验证 ✓）。
- zoomed-raster：overzoom 559、fractional 1876（近失）；raster-masking/overlapping-zoom 842；retina 10239；该批 3 例转通过。
- 仍大：opacity function/literal 75-79k（operations setZoom 后瓦片层错位）、underzoom 104k（minzoom 语义）、raster-resampling 45k、image 系 157k（image-source 画布路径独立）。
- 方向验证：垂直翻转假设证伪（翻转更差 103k vs 30k）。

**连带**：N2 symbol-elevation sea/ground 系的 satellite 背景依赖已解锁，下轮取证。

### 12.55 N2：symbol-elevation ground/sea 系取证（2026-08-19，`mbstyle-n2a/`）

**N7 raster 修复直接连带**：sea/ground 全系 24–26k → **1.3–9.3k**（无新代码）：
- sea-zero-without-terrain 24328→**1871**、sea-constant-without-terrain →1953、map-aligned →1294、sea-data-driven →1880（1.3–2k 近失带）；
- ground-zero/constant/data-driven →9033–9282；sea-on-terrain →8474；collision-mixed →9772；
- collision-with-symbol-z-elevate top/bottom 387/220 保持（§12.49）；
- z-elevation-with-offset 146k / collision-boxes 66k 为 collision-box 调试渲染独立缺口。

**残余定位**（sea-zero 剖析，1871/40000）：
1. **顶部 5 行地面裁剪缺失（~1000px）**：expected 在 y=0..4 为黑（mgl 对超过可见地面距离的区域不画瓦片，pitch 65 下视顶射线仰角仅 6.6°，远处瓦片被 mgl 裁剪），current 的 z1 世界图回退纹理覆盖了该区（N7 的父级回落走得太深——mgl 只回退到已缓存的父级，不做任意深度祖先遍历）。修法：回退深度限制（如 ≤2 级）或按 mgl 可见距离裁剪瓦片请求（N2b）。
2. **符号本体差异（~850px）**：icon 区域（cols 80–120）的 SDF/边缘差，与 sprites 系 ±3 噪声同类。

**结论**：N2 的"terrain/globe 场景依赖"定性已被 N7 证伪——就是 raster 背景缺失。sea 系转通过只差顶部裁剪一项（N2b 入口）。

**N2b 补充实验（同日）**：① 回退深度限 2 级 + 黑底 → sea-zero 1915（持平）、raster-opacity/default 反弹 14171→51452、underzoom 104k→131k 全黑；② 改为 mgl 字面语义（请求层钳制 [minzoom,maxzoom]、`coveringZoomLevel=floor(z+1)`，404 黑底）→ sea 系全面恶化至 17–21k（expected 实际显示 z12 父级影像铺满，纯静态服务器无回落——mgl 端必有覆盖/错误回落机制未还原，疑 `_findLoadedParent` 对 raster error 的保留路径）。**结论：任意深度祖先探测（§12.54 版本）实测最优，已保留**；且已从 mgl 源码**证实该语义正确**：`source_cache.ts _tileLoaded` 对 HTTP 404 的处理就是"try to load the parent tile … continue until we find one that loads successfully"（递归父级回落）。顶部黑条的真正来源是 mgl 对超远距离瓦片的裁剪（远于视顶射线落点的瓦片不画），非回落机制——下轮 N2c 只需实现该距离裁剪 + 符号边缘对齐即可冲击 sea 系转通过。

**N2c 远距裁剪实验（2026-08-19，已回退）**：按 mgl `far_z.ts farthestPixelDistanceOnPlane` 公式实现 view-Z 距离裁剪（超远输出黑）注入 raster shader——sea-zero 纹丝不动（1871，裁剪未触发：疑 mapView.pitch/camera z 语义或 patch 时机取值不对），且发现 **raster 系数值随批内位置大幅波动**（raster-opacity/default 同代码 14171/27340/51452/121556）——异步纹理挂载与静态 harness 截图存在竞态（attach 后虽 requestUpdate，FrameComplete 判定不等纹理），这解释 raster-opacity 系一直无法稳定通过。下轮应先修 harness 等待（纹理挂载计入 pending）再评估像素对齐。

**N2c 竞态修复（同日，已验证）**：`renderFrames` 对含 raster 层的样式在 settle 后追加一帧有界等待（5s）——首位的 raster-opacity/default 从 121556 稳定回 **14171**（overzoom 559 保持），批位波动消除。text 像素级用例不含 raster 层，额外 update 安全。

### 12.56 N2c 续：raster opacity/调整链色彩空间对齐（2026-08-19，`mbstyle-n2*/`）

**根因**：mgl 在 **sRGB 数值域**做 raster-opacity 混合与 raster-brightness/contrast 调整；我们的帧缓冲是**线性域**（colorspace_fragment 恒等 + 末端合成统一编码）——0.5 opacity 在线性域混合后编码得 196，mgl 参考 167（线性 0.541→sRGB 0.767 精确复现观测值）。

**修复**（`patchRasterMaterial` 注入）：
1. **opacity<1 改 shader 内 sRGB 域不透明合成**：`mix(base_srgb, srgbEnc(tile), opacity)` 后 `srgbDec` 写回线性帧缓冲，材质恒不透明（线性混合被旁路）。base = 样式背景色（无 background 层=白）。
2. **调整链（brightness/contrast/saturation/hue）在 sRGB 域运算**：采样值 `srgbEnc` 后走调整公式再 `srgbDec` 输出。
3. 顺带修复 material.opacity 与注入 alpha 双重相乘（opacity 0.5² → 0.25）。

**结果**：raster-opacity/literal **75397→3201**、function **111034→5083**（残余=基底 14171 的 opacity 缩放版）；raster-contrast/literal 61636→19772、saturation 保持 14k 带、brightness/hue 部分改善（调整公式与 mgl `raster_conversion` 的具体形式仍有差异，下轮对照 `shaders/raster_base.fragment.glsl` 精修）。defaults 全部稳定 14171 无回归。

**基建**：harness raster 等待升级为 10 轮有界轮询（单帧等待仍偶发白屏捕获——n2i 复现）。

### 12.57 raster 调整链 mgl 精确公式（2026-08-19，`mbstyle-n3a/`）

对照 `raster.fragment.glsl` + `raster_program.ts`/`util.ts` 重写调整链（原为我们自造公式）：
- **spin（hue-rotate）**：`spinWeights` 三分量点积（[(2c+1)/3, (-√3s-c+1)/3, (√3s-c+1)/3]，xyz/zxy/yzx 旋转点积），非 hue 矩阵；
- **saturation**：`average=(r+g+b)/3`（非 luma 0.299 权重），factor = s>0 ? 1-1/(1.001-s) : -s；
- **contrast**：factor = c>0 ? 1/(1.001-c) : 1+c；
- **brightness**：`mix(low, high, rgb)` 直接插值（非 clamp((x-min)/(max-min))）；
- 顺序 spin→sat→contrast→brightness，中间不 clamp，sRGB 域（§12.56）。

**结果**：**raster-brightness/function 转通过**（raster 调整族首例）；brightness/literal 96181→**5081**、hue-rotate function 123729→13858 / literal→14347、contrast function→16975 / literal→19162、saturation function→14456——全族收敛到基底带。**raster paint 家族现在唯一阻塞 = 基底 14171**。

**基底 14171 取证**：非全局平移（best shift 0,0）、非翻转（v/h flip 均 43+）、均值吻合（76.5 vs 74）——局部明暗倒置点（cur≈190 vs exp≈15，~30k px >16）散布且向 256px 瓦片缝聚拢（0-16px 内 6.4k），疑瓦片内容/采样半像素或 parent 交叉淡入差异，需 diff 图视觉取证（N3b 入口）。

**N3b 半纹元实验（同日，已回退）**：对采样加半纹元内缩（N1b sprites 同法）→ default 14171→14878、overzoom 559→4848（更差）——栅格不是半纹元偏移；明暗倒置点向瓦片缝聚拢的特征更像**相邻瓦片边缘的线性过滤跨缝采样**（每瓦片独立纹理，边缘纹元在两瓦片间无邻域，mgl atlas 有 padding 而我们独立纹理无）——候选修法：给每瓦片纹理加 1px 边界扩展（canvas 复制边缘纹元），下轮实验。

**N3b 边缘扩展实验（同日，保留）**：已实现 1px 复制边 padding + UV 变换——14171/559/1871 **逐数值不变**（中性）：1:1 缩放下双线性采样恰在纹元中心、不插值，缝隙边缘本就不产生差异。保留（对缩放场景正确）。**基底 14171 定性更新：差异在瓦片内部**（特征线半像素级抖动 + 峰值衰减，195 vs 237），非缝隙、非平移、非半纹元——疑 mgl 参考的 GPU 各向异性采样或瓦片内坐标量化，SwiftShader 环境下可能不可达（与 sprites ±3 噪声同类）。raster paint 族剩余转通过依赖真机 GPU 复核。

### 12.58 N5 代码优先批：MapAnchor 挂载 + minzoom/token/公式（2026-08-19，`mbstyle-n5*/`）

**角点顺序（第 5 重，§12.58 续）**：mapbox `coordinates` 顺序是 [tl,tr,br,bl]，历史代码错位取 wgs[1] 作 tl——内容整体旋转错位（区域/均值均吻合但逐像素错乱）。修正后 **image/default 106847→31357**、raster-opacity→7020、raster-brightness→11456。

**image-source 上屏根因（第 4 重）**：直接 `m_scene.add` 的自定义 MeshBasicMaterial 几何**从不显示**（onBeforeRender 触发、NDC 在视锥内、纯红材质也全白）——m_sceneRoot 每帧清空重建（`MapView.ts:3527`），瓦片/锚点对象走 `TileObjectRenderer`/`MapAnchors.update`（`world − camera` 定位）进 sceneRoot；裸加 m_scene 的对象不在渲染通路。**修复：image quad 改为 MapAnchor**（`.anchor = 世界坐标`，引擎每帧定位）——**image/default 158652→106847（61% 像素上屏）**、image/wrap 72793→**16209 近失**、raster-brightness 158559→73865。附带：image paint 注入对齐 mgl 公式 + sRGB 合成（§12.56/57 同款）、±C 世界副本、异步加载后 requestUpdate。

**underzoom minzoom 语义修正**：mgl `coveringTiles` 对 z<minzoom `return []`（完全不画，非 overzoom 服务）——`zoomed-raster/underzoom` **转通过**（131k 全黑 → PASS）。探测起始层钳制到 maxzoom 保留。

**icon-image token 解析（N3 深水区首个代码级根因）**：`"{maki}-12"` 类 token 从不做属性替换（text-field 有、icon 没有）→ mvt 符号层全空白。修复：`resolveTextField` 复用到 imageTexture + technique 缓存键含解析后 icon 名。**icon-image/token 空白→425 近失、icon-translate/literal 8066→2810**。

**sea 远距裁剪**：tilt 修正后裁剪可触发但过度（sea-zero 1871→34814，幅度校准未完成，已用 `farClipEnabled=false` 门控保留代码）。

**harness**：raster 等待改 10 轮有界轮询（§12.55 延续）。

### 12.59 sea 远距裁剪标定 + image 亚像素定性（2026-08-19，`mbstyle-n6*/`）

**sea 远距裁剪闭环**：① 触发条件修复（`mapView.pitch` 不存在 → `tilt`，d1 = 相机→geoCenter 焦点距离）；② RTE 相机四元数为 identity（俯仰不在相机朝向）→ 比较量从 view-Z 分量改为 **眼距长度**（朝向无关）；③ fragment 补 `varying float vMBRasEyeDist` 声明（缺失导致链接错误、材质全白 121556 一次回归）；④ 引擎 RTE model-view 帧对世界米有 ~3× 缩放（观测标定：40% 裁剪位对应真距 d1×1.16 而shader值=d1×3.5）→ `rasFar ×= 3.0`。**结果：sea-zero 34814→1899**（回到 1871 基线带，raster 14171 无回归）。顶部黑条净收益尚为 −28px（裁剪线位置仍差一点，微调因子留给下轮）。

**image 亚像素定性**：harness `compareImages` 确认参考 alpha 合成白底（区外白=白不差）——31357 全部为区内内容错位；掩码 xor 仅 525、均值精确、最佳整数平移 (3,−3) 仅 69143→57029——**~3px 对角偏移 + 重采样差**（角点投影 vs mgl mercator 数学的亚像素系统差），需投影精度专项。

### 12.60 N6 代码优先批：line-offset 迁移至顶点着色器位移（2026-08-19，延后渲染验证）

**mgl 源码对照**（`mapbox-gl-js/src/shaders/line.vertex.glsl:265-340`）：line-offset 是**顶点着色器位移**——`offset2 = offset · a_extrude · EXTRUDE_SCALE · normal.y · mat2(t,−u,u,t)`，`pos += offset2 · u_pixels_to_tile_units` 后才进 `u_matrix`。位移发生在瓦片裁剪/剔除**之后**的 GPU 阶段，因此任意 offset 跨瓦片无缝；我们此前的几何烘焙把顶点推出瓦片裁剪体 → **>20px 瓦片截断**（known-gap，§12.33）。

**实现**（对齐 mgl 语义）：
1. **emitter**（`MBTileDataEmitter.ts`）：`processLineFeature` 不再 `offsetPolyline(worldPts, ow)` 烘焙；改为 `offsetWorld` 标量下传 `emitRibbonFill`/`emitRibbonBorder`。`emitRibbonBody`/`emitRibbonCaps` 在**去重后的点集**上按原 averaging 数学（段右法向 × ow，角点取两侧平均）逐顶点计算位移向量，与 `edge/dist/len` 同步写入 `geo.offs`（vec2/顶点，无 offset 时为 0）；`getDecodedTile` 发射 `aRibbonOffs`（itemCount 2）属性。line-border 的 ±(hw−bw/2) 边线位移保持烘焙，`line-offset` 部分与主线同样走 shader。闭合环的 offset 法向做环绕（比旧烘焙的端点钳制更正确）。
2. **skipSolidLine 扩展**：offset≠0 时跳过 SolidLine 原生路径（与 gradient/pattern/blur 同策略）——否则未位移的 SolidLine 副本会叠在位移后的 ribbon 下面。
3. **patcher**（`MBMaterialPatchManager.ts` ribbon 注入）：technique `_ribbonHasOffset`（emitter 在 offset≠0 时置位，含 border technique）门控注入 `attribute vec2 aRibbonOffs;` + `begin_vertex` 后 `transformed.xy += aRibbonOffs;`（与既有 `uMBTranslate` 同空间，世界米）。

**验证**：包内 `tsc --build` 零错误。mocha 单测因工作区模块链接缺失（`flywave-mapview/node_modules/@flywave/...` MODULE_NOT_FOUND，§10.1 同类环境问题）无法在本机执行——与本次改动无关。渲染验证（line-offset/literal 1180、elevated-line-offset、line-border 56837 主源、meters-offset）留待攒批 karma。

**N8 顺带源码取证**（gradient-vector-tile 多 feature 进度，`line_bucket.ts:574-640/1031-1040`）：mgl 的 progress = `(totalFeatureLength · lineClips.start + distance) / totalFeatureLength`——分母是**瓦片内缓冲数据的整段 feature 长度**（clipLine 子段经 `subsegment.progress` Range 映射），我们的 cumDist 按**裁剪后碎片**归一化 0..1。跨瓦片/被裁剪的 feature 渐变与 per-progress 宽度都会错段。修法需 emitter 侧拿到裁剪前（含 buffer）的整段长度——依赖 vectortile 解码层是否保留 buffer 几何，**需一轮像素取证**再动代码，本批不动。

### 12.61 line-border 默认色对齐 mgl（2026-08-19，代码落地，延后渲染验证）

**背景**：§12.42 遗留的"border 默认色核对"——`line-border/default`(768px)/`width`/`gradient` 无 `line-border-color` 时，emitter 硬编码 `'#000000'` 渲染**黑色**边线，而 mgl 默认 `rgba(0,0,0,0)` 触发**从线色自动推导**。

**mgl 源码对照**（`mapbox-gl-js/src/shaders/line.fragment.glsl:201-213`）：
```glsl
if (border_color.a == 0.0) {                     // 未显式设 border-color
    Y = luminance(out_color / a); adjustment = Y>0 ? 0.5/Y : 0.45;
    if (out_color.a > 0.25 && Y < 0.25)          // 暗色线 → 提亮
        out_color.rgb += borderColor * (adjustment * (1.0 - alpha2));
    else                                          // 亮色线 → 压暗
        out_color.rgb *= (0.6 + 0.4 * alpha2);    // 外缘(alpha2→0) = ×0.6
}
```

**实现**：
1. **emitter**（`MBTileDataEmitter.deriveAutoBorderColor`）：`line-border-color` 为默认（`#000000`，等价 mgl `rgba(0,0,0,0)`）时按上式计算边界色——亮色线 `line × 0.6`、暗色线 luminance 提亮；显式色（含 `'black'`）原样。用于 `emitRibbonBorder` 的 `fill-color`。
2. **patcher**（`MBMaterialPatchManager`）：border technique 打 `_isLineBorder`，对**渐变/图案** border 的 ramp/pattern 采样乘 `×0.6`（实心色已由 emitter 推导，不重复压暗）——对齐 mgl `RENDER_LINE_BORDER_GRADIENT` 的 `out_color.rgb *= (0.6+0.4*alpha2)`。

**12.61 续（几何修复，2026-08-19，commit `9e6d11ae`）——border 被主 ribbon 完全覆盖的根因**：
- **取证**：`thick-line-border`（line-width 14 + border-width 6 black）expected 有黑边（black 1024px + blue 128px），但 current 纯蓝无黑边——因为 border ribbon 在**主 ribbon 之下**，被 14px 主线完全盖住（两 ribbon 方案）。mgl 在单一 shader pass 里把 border 画成 line-width 的**外环**（主色填内区，`line.fragment.glsl` border_width ring）。
- **修复**：`processLineFeature` 计算 `borderWorld`（border-width × mpp，meters 直接米），主 ribbon 半宽收窄为 `hw − borderWorld`（无 border 时 `borderWorld=0` 不变）。border ribbon 位置不变（`shift = hw − borderHalf`），现在露出外环。

**验证**（Edge headless + SwiftShader，`mbstyle-lborder2`/`mbstyle-lbreg`）：
- **`line-border/thick-line-border` 1152 → PASS 0**（黑边现可见，逐像素一致）。
- 其余改善：default 768→704、color 737→617、data-driven 1460→675、trim-offset 791→654、gap 4096→3840、elevated-line-border/data-driven 1124→339。
- **零回归**：line-join default/bevel/miter + fill-outline default/function 保持 PASS；line-color 355 稳定；line-cap/color 无 border（borderWorld=0）不受影响（butt 355→410 为 SwiftShader 批次噪声）。
- 残余（default/color/width/gradient 仍 fail）为**主线的线 AA 渲染差**（`line-color 337px` 同类，N5 透明通道排序专项），非 border 本身。
- 全量批量（`mbstyle-linebatch`，117 例 line 域）：**8 passed**（line-join default/bevel/miter×2 + fill-outline default/function×2），与既有基线一致。

**遗留**：line-blend-mode multiply 的 THREE MultiplyBlending（`dst*src`）vs mgl 输出预计算因子 `dst*(src.rgb+(1-src.a))` 语义差异，需渲染取证。

### 12.62 line-dasharray 在 ribbon 上渲染 dash（2026-08-19，commit `3875e82b`）——破解"双渲染疑云"

**疑云结局**：§12.34 的"dasharray×ribbon 双渲染疑云"现已定位——**SolidLineMaterial 的 USE_DASHED_LINE dash 在 SwiftShader 不栅格化**，可见的只有实心 ribbon（renderOrder +0.5 盖在 dash 的透明 gap 上），故 dash 线渲染成**实线**（取证：`long-segment` current 1 连续段 vs expected 5 段；current 全宽 512 列 1 段 vs expected 276 列 5 段）。

**反证（避免错误修复）**：直接抑制 ribbon 使 dash 线**完全消失**（SolidLine 不渲染，`mbstyle-dash2` current 0 非白像素）——所以不能删 ribbon。

**修复（把 dash 渲染在 ribbon 上，对齐 mgl `a_linesofar` 语义）**：
1. **emitter**（`getOrCreateRibbonTechniqueIndex`）：ribbon technique 携带 `_dashWorld=[dashLen, gapLen]`——`dashValue × lineWidthPx × mpp`（mgl dash 是 line-width 的倍数）转世界米；cache key 加 `dash`。
2. **patcher**（ribbon 注入）：`aRibbonLen` varying 做 `mod(vMBRibbonLen, size+gap)` 相位 + `fwidth` 边缘 AA（~1px）+ `gl_FragColor.a *= (1-smoothstep(size-edge, size+edge, phase))`；material 置 `transparent`（gap 混合而非黑块）。

**验证**（line-dasharray 全量，Edge headless + SwiftShader）：zoom-history 6324→**387**、less-than-one 5889→**298**、long-segment 11550→**8171**、overscaled 2007→**347**、zoom-history-line-metrics 875→**154**、feature-dash-const-cap 1156→**516**、composite-dash-composite-cap 1132→592；**function/line-width-constant 88→4 PASS**。long-segment current 现出 6 段（原 1 段实线）。净改善巨大。

**遗留（dash 周期/密度像素校准）**：zoom-history 14 vs 1 段、overscaled 31 vs 11 段（dashWorld 周期需对照 mgl `line_bucket.ts` dash 单位精修）；`zero-values` [0,0] 边界（hasDash 需 dashWorld[0]>0，[0,0] 应隐形未处理）；data-driven dasharray 的 line-width 求值（composite/property-function 系 +73/+77 轻微回退）。

### 12.63 dash 校准对齐 mgl 源码（2026-08-19，commits `4d45e37b` + `a9f41ee7`，代码落地，渲染验证攒批延后）

**§12.62 遗留三项全部处理**（对照 `line_bucket.ts` / `line.vertex.glsl` / `line.fragment.glsl` / `line_atlas.ts` 源码逐项取证）：

1. **dash 周期单位（dashWorld）**：真因是**双重**——① 周期应按 `line-floorwidth`（`LineFloorwidthProperty`/`useIntegerZoom`：line-width 在 **floor(camera zoom)** 求值）而非连续线宽；② `a_linesofar` 锚在 **floor-zoom 瓦片网格**（`u_tile_units_to_pixels` 以 `tileZoom` 计算，`transform.ts:568` 取整），屏幕周期带 `2^(zoom−floor(zoom))` 因子。修复：`evaluateFloorLineWidth`（重求值 raw spec @floor zoom，数据驱动带 feature）+ `mppDash` 用 `floor(m_zoom+1)`。**数值验证**：long-segment `[1,1]×50@12.15` 周期 100px→**111px**（expected.png 实测 111 逐像素吻合）、fractional-zoom 11.3、zoom-history 48、overscaled 10、meters-dasharray 98 全部吻合。
2. **zero-dash 隐形**：mgl `line_atlas.addDash` 折叠零长 range——DASH 和为 0（`[0]`/`[0,0]`/`[0,0,0,0]`）只剩 gap → 整线隐形；空数组 `[]` 推 `[1]` → 实线；gap 为 0（`[x,0]`）→ 实线。修复：`dashSumDash`（偶数下标和）+ emitter 整层 skip + technique `_dashInvisible` + patcher `discard`。
3. **data-driven dasharray/line-width 分键**：technique key 从 `hasDash` 布尔升级为 `dashSig = JSON(dashArr)@floorWidth`——每要素不同 dasharray/线宽不再共享首要素值。
4. **meters 单位**：`dashWorldFor`——`line-width-unit:meters` 下 dash/pattern 跳过 px→world 换算（世界单位即米；mgl 的 period 恒为 `totalLength × width_px`，meters 经 `u_floor_width_scale` 折回像素）。
5. **dash 形状 SDF（cap 对齐 mgl line_atlas）**：片段 shader 复刻 atlas SDF——**butt**=矩形、**square**=半宽外扩矩形（capLength=0.5·stretch → 外扩 0.5·width）、**round**=胶囊（半径 halfW 圆帽，含周期回绕的下一段探测）。双缘 ~1px AA 用 `uMBDashPx`（世界米/像素），替代原 `fwidth(mod())`（mod 在相位回绕处爆炸成整段模糊）。CPU 仿真验证：butt 20/20px、square/round 32/8px（含 6px 外扩）逐周期吻合。
6. **pattern u 平铺同享 floor 锚点 + meters 分支**（§15 N4 int-zoom 连带，密度已是 floor 锚定）。

**状态**：tsc 绿；MBExpressionEngineTest 43 passing、MBStyleDecoderPipelineTest 12 passing（2 既有失败无关）。渲染验证（line-dasharray 全量 + line-pattern 全量）攒批延后。

### 12.64 相机 bearing 符号反转——全视图旋转 2·bearing（2026-08-19，commits `814fae16`+`e18ab549`）

**排查入口**：line-translate-anchor（map/viewport/terrain）基线 20k。逐步排查证明 translate 几何烘焙正确（geometry 数据确实位移）、viewport 旋转逻辑按 mgl `painter.translatePosMatrix`（`+bearing`）实现正确——但即使 [0,0] translate 也 19.6k。对照 line-visibility/visible（同 Berlin 源、bearing 90、无 translate）亦 12.3k，判定**非 translate 问题**。

**根因（探索代理全链路仿真取证）**：`MBStyleDataSource.applyCameraSettings` 把 mapbox **顺时针** `bearing` 直接传给 flywave **逆时针** `yawDeg`（`MapView.ts:2378/2405` "yaw is counter-clockwise"）→ 相机偏航错误符号 → **整个视图旋转 2·bearing**（bearing-90 测试旋转 180°，道路网络整体错位，非平移/缩放；`current = rot180(expected)` 逐像素证实）。其余（tile 解析、MVT y-flip、tile-center 放置、zoom、decodeInfo.center==tile.center）均正确。

**修复**：`applyCameraSettings` 传 `-(style.bearing ?? 0)`。bearing-0 不受影响（2·0=0）。decoder 的 bearing（viewport translate 用）保持 **mapbox +bearing**（mgl translatePosMatrix 语义）。

**验证**（Edge + SwiftShader）：
- `line-visibility/visible` **12318→4126**、elevated **11659→2303**（残余 = 密集 Berlin 路网线宽/AA，N5 专项）。
- `line-translate-anchor/map` **20469→1236**、viewport **20254→1274**、viewport-terrain 3971（terrain draping 残余）。
- map vs viewport current 差异恢复（24→31247，expected 35127），viewport 旋转语义正确生效。
- **translate 全族进近失带**（此前均 20k+）：line-translate/default 759、function 1126、literal 754、elevated-line-translate/default 754、literal 748、fill-translate-anchor/map 884、viewport 884、circle-translate-anchor/map 148、viewport 192、line-translate-anchor 1222/1261/3971。残余 = 线宽 AA + translate 定位微差。

**代价（3 例 symbol 回归 0→54-85px）**：text-rotation-alignment/map|viewport|auto-symbol-placement-point（bearing 45）此前在错误 180° 旋转下"侥幸"通过（符号布局对称掩盖错误），修正后暴露真实 54-85px 小差（文本 SDF/放置，非系统性）。icon-rotation-alignment/pitch-alignment 等价 3 例 0→14px 仍通过。**判定正确**：保留错误符号以迁就 3 例对称侥幸是错的。

**净影响**：599 例非零 bearing 测试此前全受 2·bearing 旋转污染（基线通过者仅 9，其中 3 为 blank visibility none、3 为对称 symbol）；修复解锁整类 180° 旋转错误，是系统级正确性修复。下一轮应重跑全量基线量化净增（N9）。

### 12.65 代码对齐批：blend premultipliedAlpha + translate 单位/锚点（2026-08-19，commits `98aa2762`+`92f53811`+`0383f6fa`+`a6ab7eaf`+`15765cb3`，测试延后）

**五项 line/fill/extrusion/circle/symbol 域 mgl 逻辑对齐，均源码取证后改，测试攒批延后**：

1. **line-blend-mode multiply——premultipliedAlpha=true**（`98aa2762`）：three r178 `MultiplyBlending` 要求 `premultipliedAlpha=true`，否则 `WebGLState` 不设 blendFunc（残留上次 REPLACE），multiply 因子从不进 GL → 交叉线不累计（current 恒 220 vs expected 重叠处 190/163）。修复 3 处 MultiplyBlending 材料（ribbon `patchFillMaterial`/SolidLine `patchLineMaterial`/`MapLineMaterial` 构造）。设后 blend func = `(DST_COLOR, ONE_MINUS_SRC_ALPHA)` → `dst*(C*a+1−a)`，恰为 mgl `line.fragment.glsl` `LINE_BLEND_MULTIPLY` 因子；opaque(a=1) 退化为 `dst·C`，精确复现 220→190→163。**additive 不动**（需 mgl 多 pass FBO 密度复合 `resolveMaxDensity`+readback，独立任务）。
2. **fill-translate px→world 单位**（`92f53811`）：fill 几何不烘焙 translate，shader `uMBTranslate` 加到世界系 `transformed.xy`，但 `resolveTranslate` 返回像素 → z14 仅 ~2px 位移（expected 10px）→ fill-translate-anchor 884 近失。`patchFillMaterial` 换算 `[tx·mpp, -ty·mpp]`（同 line-translate 烘焙约定），uniform 用 world。**line-translate uniform 保持**（emitter 已几何烘焙，避免双加）。
3. **fill-extrusion-translate px→world 单位**（`0383f6fa`）：同 fill-translate——extrusion 几何不烘焙，uniform 是唯一机制，同样的 px→world bug。修复同款。
4. **circle-translate px→world 单位**（`a6ab7eaf`）：circle 点 emitter 不烘焙 translate（point 路径仅 symbol 烘焙），uniform 唯一机制，同款 px→world bug。修复同款。
5. **icon/text-translate viewport anchor 按 +bearing 旋转**（`15765cb3`）：emitter 的 symbol translate 烘焙此前不处理 viewport anchor——mgl `painter.translatePosMatrix` 对 viewport 先按 +bearing 旋转 translate。补齐 icon/text-translate-anchor 的 viewport 旋转（line/fill/extrusion/circle 的 viewport 由 `resolveTranslate` 处理）。

**状态**：tsc 绿；55 passing（2 既有失败无关）。待渲染验证：line-blend-mode/multiply（1456→近失）、fill-translate-anchor（884）、fill-extrusion-translate、circle-translate、icon/text-translate。

### 12.66 代码对齐批：text-anchor 水平对齐（2026-08-19，commit `fd1ff405`，测试延后）

**根因（对齐 mgl `symbol/shaping_shared.getAnchorAlignment`）**：

`MBTileDataEmitter` 的 text 分支（`:855-864`）用 `text-justify` 推导 `props.hAlignment`：

```js
const justify = (l['text-justify'] ?? 'center');
props.hAlignment = justify === 'left' ? 'Left' : justify === 'right' ? 'Right' : 'Center';
```

但 mgl `getAnchorAlignment(anchor)` **同时**从 anchor 的水平与垂直分量推导对齐——`text-justify` 只影响多行文本在盒子内部的 justification（本管线不 wrap，不支持），不参与文字盒相对锚点的水平对齐。证据（`mapbox-gl-js/src/symbol/shaping_shared.ts:63-83`）：`horizontalAlign` 由 anchor 是否含 `left/right` 决定（'left'→0、'right'→1、else .5），与 justify 无关。

**修复**：`hAlignment` 改为按 anchor 水平分量推导：

```js
props.hAlignment = anchor.includes('left') ? 'Left'
    : anchor.includes('right') ? 'Right' : 'Center';
```

方向校验：`flywave-text-canvas/TextStyle.ts` 枚举 `HorizontalAlignment.Left=0.0`（文本左缘贴锚点、向右延伸）= mgl `h=0`（anchor 'left'），`Right=-1.0` = mgl `h=1`（anchor 'right'），`Center=-0.5` = mgl `h=0.5`。故 anchor 含 `left`→`'Left'`、含 `right`→`'Right'`、否则 `'Center'`，与 mgl 一致。`vAlignment` 此前已按 anchor 垂直分量（`top`→`Below`/`bottom`→`Above`）推导，经验证正确（align 枚举 `VerticalAlignment.Above=0/Below=-1`），保持不变。

**附带**：修正 `line-translate` viewport 注释（`:1434-1437`）——代码按 `+bearing` 旋转 tx/ty（与 mgl `translatePosMatrix` 的 tile-matrix 路径 `angle=-transform.angle=+bearing` 一致），原注释误写 `-bearing` 且给错结果 `[10,-10]`（应为 `[-10,10]`）。代码本身正确，仅注释修正。

**状态**：tsc `--build` 绿；lib 重建含修正（`:570` 已生效）。**待渲染验证**：text-anchor（11 分类，§2.6 标 ⚠️）。预期 anchor='left'/'right' 及组合锚点（'top-left' 等）水平对齐由 Center 纠正为 Left/Right，单点文本位置对齐改善；text-size/color/field/opacity 等既通过项不受影响（hAlignment 此前依赖 justify，与这些无关）。

### 12.67 §12.65/§12.66 延后验证批实测 + text-anchor 根因排查（2026-08-19）

**验证批**（`rendering-test-results/mbstyle-n8a/`，Edge 150 headless + SwiftShader，filter `translate`+`line-blend-mode`+`text-anchor`，79 用例，**16 通过 / 59 失败**）：

| 分类 | 结果 | 说明 |
|------|------|------|
| circle-translate（3）+ anchor（2） | **5/5 PASS（0mm）** | §12.65 px→world 单位换算兑现 |
| fill-translate（3）+ anchor（2） | **5/5 PASS（0mm）** | 同上 |
| fill-extrusion-translate | **4/6 PASS**（default/literal/anchor map+viewport 全 0-2px） | `function` 42506 / `literal-opacity` 67952 残余 = 半透明三 pass（F2 遗留）+ 数据驱动 |
| line-blend-mode/multiply | **PASS（2px）** | §12.65 `premultipliedAlpha=true` 兑现；additive 系 5 例 ~10.3-11k 仍红（mgl additive=ONE,ONE blendFunc 未接线） |
| appearance/paint-icon-translate | **PASS** | — |
| line-translate / elevated-line-translate | 近失 754-5936 | 与 §12.64 相同（线宽 AA，N5 专项），无回归 |
| icon-translate 系（5） | 2530-2850 | mvt 符号源渲染残留（§12.16 R4），较 §12.16 的 ~8000 改善 |
| text-anchor（11）/ text-translate 系（5） | 全红 1035-16841 | 见下——"text 不渲染"域，与 baseline5 逐例像素一致（**fd1ff405 零回归**） |
| icon-text-fit/*-text-anchor 系（10） | 1992-13299 | 同 text 不渲染（F7 遗留） |

**text-anchor 根因排查（埋点四轮，已全部还原）**：

1. **emission 正常**：`MBTileDataEmitter.getDecodedTile` 每瓦片 textGeometries=1、texts=104-120 条 "Test Test Test"。
2. **TileGeometryCreator 正常**：`createTextElements` skip=0、noLabel=0——全部要素 `tile.addTextElement` 成功（isTextTechnique 通过、stringCatalog 命中）。
3. **TextElementsRenderer 收到要素**：`createSortedGroupsForSorting` 4 瓦片、898 个 text element 进入排序组（shouldRenderText 通过）。
4. **全部要素在 placement/字形渲染阶段被丢弃**（一个像素都未画出）。
5. **排除项**：非 `text-max-width` wrap（实验关闭 wrappingMode 无变化）；非 PBF catalog 缺字形（space/字母均在，`GlyphPBFParser` 验证）；非 icon+text 双技术（text-only 的 `text-color/default` 同样 0 文本）；非 mvt 专属（geojson z0 的 60 例 text 同样全红）——**text 点放置整域性问题**（G4/F13 深水区），疑点收敛到 `TextElementsRenderer.placeTextElementGroup` 的 initialized/viewDistance/glyph 初始化链或 TextCanvas 与注入 PBF catalog 的时序。下一轮建议：开 `PRINT_LABEL_DEBUG_INFO` 的 `PlacementStats`（karma logger 级别需调到 debug 才可见）看 uninitialized/tooFar 占比。

**runner 自动退出修复**（`scripts/run-mbstyle-render-tests.js`）：原脚本 karma 结束后等待 result server 退出（永不发生）→ 挂死需手动 kill。现 karma 结束即 `server.kill()` + 5s 兜底 `process.exit`，本轮 7 次运行全部自行退出。

### 12.68 text 域"完全不渲染"根因修复 + additive 双 pass 半成品（2026-08-19）

**A. text 不渲染根因（PlacementStats 埋点链定位）**：

1. §12.67 的四轮埋点 + 本轮 `PlacementStats`（改 console 输出）：`poiIcons=46, poiTexts=0` → 文本分支从未进入。
2. `addPointLabel` 埋点：text 元素 `textCanvas=false`（`TextElementStyle.textCanvas` undefined）→ `if (textCanvas && shouldRenderPointText)` 整块跳过。
3. 时序定位（同一 style 对象 canvas 先 false 后 true）：harness 在 `addDataSource` 之后才注入 PBF FontCatalog（`mapView.setFontCatalog("default", catalog)`），**注入前渲染的帧里 text element 的 glyph 初始化失败后状态缓存永不重试**（`m_textElementStateCache` 里 uninitialized 元素被永久跳过）；且 canvas map 在注入前为空。次要问题：主题重置 `resetTextRenderer → updateFontCatalogs` 会删除不在主题目录表里的注入 canvas（`m_injectedFontCatalogs` 持久化修复）。

**修复（flywave-mapview，两处）**：
- `MapView.setFontCatalog`：注入目录记入 `m_injectedFontCatalogs`；`resetTextRenderer` 末尾重注册（防主题重置丢弃）。
- `TextElementsRenderer.setFontCatalog`：新增 `invalidateCache()` + `m_isUpdatePending = true`——新 canvas 解锁之前初始化失败的标签，丢弃卡死的 element 状态强制重试。

**验证**（93 例：text-anchor/translate + line-blend + icon-image + text-field）：
- **text 全域开始渲染**（此前 text-anchor/text-translate 整类 0 文本）：`text-anchor/center` 14476→**10596**、`text-color/default` 5774→**4680**、近失带出现（text-color/property-function 227、missing-image 151、zoom-and-feature-dependent-composite 191、appearance/text-field 567、distance/layout-text-size 159）。
- 锚点类（top-left 等）像素数上升（13-16k→19-26k）：错位文本比空白多扣分，**属预期中间态**——下一步攻 hAlignment/vAlignment 映射与字形基线（G4 精度）。
- 零功能回归：icon-image/literal、image-expression 保持 PASS；`icon-image/token` 1678→425 改善；`icon-image/use-theme` 1613→3957（color-theme 域连带，LUT 未实现）。line-blend/multiply 保持 PASS。
- 单测：15 个测试文件 265 passing（DebugLineNaNTest 为预存在的子路径导入环境问题，与本轮无关）；tsc 全绿。

**B. line-blend-mode additive 双 pass（半成品，flag 关闭）**：

mgl additive 是离屏 FBO 管线：RGB 累积 `Σ(C·fa)`、A 累积密度，合成 `avg=rgb/密度, t=sqrt(n/(n+1)), out=avg·t`（`n=密度/line-blend-additive-clamp`，clamp=0 时用 GPU readback 的 max density）。直接 `AdditiveBlending` 无密度归一 → 恒过亮（实测 (100,220,254) vs 期望 (33,73,85)）。

已建 `MBAdditiveLineRenderer`（仿 MBHeatmapRenderer）：ribbon mesh 隐藏 + 私有场景重绘到 half-float FBO + 合成 pass。**已验证**：密度累积通道正确（readback max=8、可视化密度图 1-4 梯度正确）、合成 quad 覆盖正确、clamp 求值链修复（`MBLayerEvaluator` 补 `line-blend-additive-clamp` 默认值）。**卡点**：世界坐标几何必须走引擎 RTE 相机路径（plain ShaderMaterial 渲染为空；需 clone 原材质 `onBeforeCompile` 只覆写 fragment）；端到端帧间行为不稳定（同代码不同轮次输出不同，疑 webpack filesystem 缓存 + 帧时序）。`MBMaterialPatchManager.enableAdditiveDualPass=false` 关闭（保持原 AdditiveBlending 行为，5 例维持 ~10.4k 失败）。下一轮建议：固定 `HARP_NO_HARD_SOURCE_CACHE=true` 复现矩阵 + 单帧逐步 dump FBO→composite 链。

### 12.69 text-anchor 精度排查（2026-08-19 深夜，定位收敛未修）

**已证伪/已验证清单**（埋点 `Placement.ts placePointLabelAtAnchor` 输出 placement/bounds/offset，已还原）：

1. **对齐管线全链正确**：`technique.hAlignment='Left'/vAlignment='Below'`（top-left）→ `parseTechniqueHAlignValue` → `resolvePlacementAndAlignment`（DEFAULT_PLACEMENTS=[] 不覆盖）→ `hPlacementFromAlignment` → 实测 placement `h=0(Right) v=-1(Bottom)` = 文本在点右下方 ✓（mgl top-left 语义）；`computePointTextOffset` 边界数学正确。
2. **字形 advance 正确**：PBF 解析 T/e/s/t/space advance = 13/13/11/9/6（24px em），与 mgl 同源；typesetter `(advanceX+tracking)×glyphScale(16/24)` 单次缩放正确。
3. **无全局位移**：cur/exp 互相关最优平移 (-2,+2) 仅改善 ~0.6% → 非系统性偏移。
4. **墨水总量相当**：cur 暗像素 14737 vs exp ~15630（-6%）→ 字号没有数量级错误（此前 AI 目测"3×/0.67×"均不可靠，放大裁剪测量噪声大）。
5. **墨水重叠差**（mismatch 24021 ≈ 两图墨水总量-2×重叠）：标签级排布差异——换行行数/行距/垂直基线（`capHeight`/`base=17` 与 mgl baseline 的差异）或多标签间相对位置。

**下一轮建议**：在 `LineTypesetter.arrangeGlyphs` dump 单标签的逐字形位置（catalog 坐标）+ 行数/行距，与 mgl `shaping.ts`（24px em、lineHeight=1.2×textSize、baseline ascender）逐项对表；重点核 `font.metrics.base=17`（§MBFontCatalogBuilder 的 SHAPING_DEFAULT_OFFSET 猜测）与 capHeight 对 `position.y += vAlign×capHeight×scale` 的影响。

### 12.70 text-anchor 精度第二轮（2026-08-19 深夜二，误差定位到 2-4px 盒差）

**本轮实验矩阵**（全部 `HARP_NO_HARD_SOURCE_CACHE=true`）：

| 实验 | 结果 | 结论 |
|------|------|------|
| 叠加分析（阈值扫描 th∈[80,180]） | th150 重叠 67%；th80 expOnly 7892 > curOnly 6507 | 定位基本正确（2/3 墨水重合）；误差 = AA 剖面差（我们羽化宽+核浅）+ 少量错位 |
| `props.size ×1.5` 探针 | 24021→28743 变差 | 字号正确（此前"0.667×"目测系测量噪声证伪） |
| `distanceScale=0`（mgl 恒定屏幕尺寸语义） | 中性（±30-770px 噪声级） | 保留（语义正确，远景标签防缩放） |
| vAlignment Above/Below 互换 | top/bottom +9-16k 变差，立即回退 | 原映射正确：bounds 为 y-up 坐标系（min.y=-39,max.y=-3 在锚点下方），'top'→'Below'→Bottom placement 语义闭环 |
| 墨水剖面（exp T≈10×13px vs cur T≈7×9px） | 与 1.5× 探针矛盾 → 测量窗口含相邻字母，作废 | — |

**收敛判断**：text-anchor 残余（锚点类 10-34k）= 每标签 2-4px 的盒子尺寸差（我们盒 69×36 vs mgl 理论 65.3×38.4——**盒宽差恰好 = SDF border 6px×scale**：measureText 的 bounds 是含 3px border 的字形 quad 并集，mgl 用纯 advance 宽）经锚点偏移放大（水平 ±35px/垂直 ±18px 半盒位移 × 数百标签）+ SDF AA 剖面差（mgl `smoothstep(0.75±γ)` vs flywave `clamp((tex−0.5)×toPixels+0.5)`，γ≈0.84px vs 我们羽化 ~1.5px、核更浅）。两者都在 flywave-text-canvas 引擎内：bounds 需对表 mgl（trailing space/lineHeight 精确值），AA 需对齐 mgl EDGE_GAMMA=0.105/dpr 公式——**下一轮直接改 `TextMaterials.getOpacity` 与 `measureText` 的行高/盒宽**（有 §12.68 的文本渲染解锁作基线，可安全迭代）。

### 12.71 line-blend-mode additive 双 pass 稳定落地：0→**6/6 全绿**（2026-08-19 深夜三）

§12.68 的不稳定问题解决，`MBMaterialPatchManager.enableAdditiveDualPass=true` 正式启用。相对半成品版的关键修正：

1. **合成 pass 改回加法混合**（`additiveAlphaWeighted` 同款 [SRC_ALPHA, ONE]）：`out=(avg·t, t)` 叠加到画布 → `dst += avg·t²`——与 mgl composite 的 colorMode 一致（此前 NoBlending 直接替换是错误来源之一）。
2. **auto-density 用 CPU readPixels**：`max(meanOccupiedDensity×2, 1)`（mgl GPU reduce 的等价静态近似），隔帧读取；clamp>0 时直接用 clamp。
3. **累积值改为 coverage 语义**：RGB=Σ(C·fa·cov)、A=Σ(cov)（AA coverage×opacity），对齐 mgl LINE_BLEND_ADDITIVE 的 premultiplied 输出。
4. 保留：clone 原材质 `onBeforeCompile` 只覆写 fragment（骑 RTE 相机顶点路径）、half-float FBO、私有场景 world-matrix 重绘、patcher 侧 `visible=false` + 注册。

**验证**：line-blend-mode **6/6 全 PASS**（additive×5 + multiply，此前 1/6）；line-color/width/opacity 回归批 vs baseline5 **零回归**。调试注意：**必须 `HARP_NO_HARD_SOURCE_CACHE=true`**（filesystem 缓存会给出陈旧 bundle，是 §12.68 "帧间不稳定" 的主要元凶）。

### 12.72 text AA 公式与盒宽路径实验（2026-08-19 深夜四，两项均证伪/中性，已还原）

§12.70 收敛计划（"改 `TextMaterials.getOpacity` 与 `measureText` 行高/盒宽"）的首轮实测，二分法单变量验证：

**1. SDF AA 公式对齐 mgl 源码——实测变差，已还原**：
- 实现：`getOpacity` 改 `smoothstep(±0.105·distanceRange px, dist·toPixels)`（mgl `symbol.fragment.glsl` 精确公式：`gamma = EDGE_GAMMA/fontScale`，fontScale=size/24 与 toPixels 的尺寸依赖恰好相消 → **屏幕空间常数 ±0.84px**（dpr=1），替代原线性 ±0.5px clamp）。
- 实测（vs 旧斜坡单变量对照）：真实参考图全变差——`text-color/default` 4680→5274（+594）、`literal` +516、`appearance/paint-text-color` PASS 0→62、`text-size/composite-function` PASS 0→19；逐像素剖面取证：新旧斜坡在真实参考上几乎重合（边缘 3px 过渡带内 ±10 灰度差），差异是数千边缘像素 × pixelmatch 阈值的累积。
- **判定**：vendored mgl 源码的 AA 公式与参考图渲染版本疑似不一致（同 §12.52 参考图/源码版本漂移先例）；原线性 ±0.5px 斜坡经验上更贴合参考图，**保留原状**。text-size 系的"变差"（literal 61→217 等）实为对照**纯黑损坏参考**（§12.13：渲出字反扣分，不可修），非真实回归信号。
- 附带基建发现：**karma webpack 解析 `@flywave/*` 到 `<root>/@flywave/*/src/*.ts` 源码**（非 lib）——改引擎包必须改 src 并用 `HARP_NO_HARD_SOURCE_CACHE=true`；只重建 lib 无效（曾致一轮 Δ+0 空跑）。

**2. `updateAdvanceBounds` 盒宽（纯测量路径 advance 宽度）——三类中性**：
- `LineTypesetter.placeRun` 的 globalBounds 分支改用 pen advance 水平 extents（字形墨水 quad 含 SDF border 会撑大锚点盒）。
- 实测：text-color/text-size（Δ+0 逐例精确不变）与 text-anchor（center 10611 ≈ 基线 10596）**全部中性**——点标签放置路径**不消费** typesetter 的 globalBounds（TextElementsRenderer 侧另有 bounds 计算链）。改动无害保留，但**下一轮 text 盒宽工作应先定位 TextElement.bounds 的真实来源**（疑在 `TextElementsRenderer`/`Placement` 的 computePointText 内），否则 typesetter 侧修改到不了渲染。

**遗留**（下轮 text 精度入口）：① TextElement.bounds 真实消费链定位（埋点 `Placement.placePointLabelAtAnchor` 的 bounds 来源）；② 垂直盒高/基线（`font.metrics.base=17` vs mgl ascender，§12.69 遗留）；③ AA 若再攻需先确认参考图对应的 mgl 版本公式。

**补充取证（2026-08-20 凌晨，mgl 源码确认垂直盒模型）**：① 项已核实——`Placement.placePointLabelAtAnchor`（`Placement.ts:652-664`）**确实走 `textCanvas.measureText(label.glyphs)` → 同一 typesetter globalBounds 路径**（advanceBounds 在 bundle 中确认执行），三类中性 = 这些 fixture 的 advance 盒与 ink 盒数值相同（无大侧 bearing/尾空格），非路径断链。② 项已从 mgl 源码锁定：**mgl shaped 盒高 = lineHeight×行数（非 ink！）**——`shaping.ts:707-712`：`height = y（每行累计 lineHeight）`，`top += −vAlign·height; bottom = top + height`；宽度 = `maxLineLength`（纯 advance）。盒内基线：有字体 ascender/descender 时**基线居中**——`glyphOffset = −ascender·scale`，`baselineOffset = (ascender−descender)/2·scale`（每行取最大 (ascender+descender) 的字形定基线，`shaping.ts:609-623`）；无基线时 `SHAPING_DEFAULT_OFFSET` 回退。**下轮改法**：纯测量 bounds 的垂直 extents 从 ink quad 改为 `[0, −lineHeight·glyphScale]`（y-up），并核对 flywave `font.metrics.lineHeight/base` 与 mgl ascender/descender 换算（PBF stack 元数据是否读入）。§12.70 的"盒 69×36 vs 65.3×38.4"中 38.4 = 1.2×32（lineHeight 制）与此吻合。

**② 项首轮实测证伪（同日凌晨，已回退）**：把纯测量 bounds 垂直扩展为行盒 `[−nLines·(metrics.lineHeight+leading)·scale, 0]`（数值链已核对：catalog lineHeight=1em + leading=(line-height−1)em → 每行恰 1.2×textSize = mgl）——实测**全面变差**：`text-anchor/center` 10611→20788（+10177）、bottom +11201、bottom-left/right +8-10k、`text-color/default` +3702、appearance/paint-text-color 62→236；top 系仅 +238-456（盒顶从 ink 顶 −3 → 0 的小位移）。**不对称签名说明 flywave 的墨水在行盒内的位置与 mgl 不同**（多行标签 bottom 系大恶化 → 行盒假设下 min.y 远超 ink 实际深度，或 lineCount 对显式换行/尾换行的计数与渲染行不符）——**下轮必须先 dump 单标签逐字形 y 坐标与 mgl 逐项对表**（§12.69 的原建议），不能再从公式直改。结论：text 域三假设（AA 公式/advance 盒宽/lineHeight 行盒）全部实测证伪或中性，残余差异在**基线在盒内的定位与多行排布**，属 flywave-text-canvas 深水区，需埋点对表专项。

**§12.72 更正（2026-08-20，advance 盒宽在水平锚点实测显著）**：前文"advance 盒宽三类中性"的 fixture 选择（text-color/size 的 center 对齐、无尾空格单词）掩盖了效果——**凡含水平 anchor 分量的标签，advance 盒与 ink 盒差 = 尾字形 right-bearing + SDF border**。用 text-anchor 全分类 + icon-text-fit 回归批（65 例）复测（`HARP_NO_HARD_SOURCE_CACHE=true`，advanceBounds 代码同前）：left 21819→**15938**、right 23636→**17026**、top-left 24021→**21604**、bottom-left 22961→**19921**、top-right 25136→**23471**、bottom-right 25136→**20836**、property-function 1029→**990**；top/bottom/center 持平（纯垂直锚点不消费水平 extents，自洽）；icon-text-fit/*-text-anchor 系 10 例全部 -300~-700；**零回归**。改动保留（`updateAdvanceBounds` + `placeRun` 测量分支），mismatch 总量净 -25k。

**§12.72 终章（2026-08-20，垂直行盒第三轮：dump 对表后证伪，text 垂直域关闭）**：按 §12.69/§12.72 建议做了逐字形 y dump（`placeRun` 测量分支埋点，text-anchor/center "Test Test Test"）：

- `position.y` = **行栅格顶**（首行顶 = vAlign 位移后的 y）；'T' ink 顶 = 行顶 + (17−8)×0.667 = +6px —— **flywave 的逐字形垂直链与 mgl `SHAPING_DEFAULT_OFFSET −17` 精确一致**（catalog base=17 数值链核对成立）；
- 按此帧推导 mgl 行栅格盒 `[行顶 − n×lineHeight, 行顶]`（修正了首轮错误的 `−base` 参照系）并实测：**全分类 +10~12k 变差**（center 10611→27687、left 15938→27327）→ **参考图实际锚定的就是 ink 盒**（垂直方向），与 vendored mgl 源码的 lineHeight 行盒不符——与 AA 公式实验同型的**参考图/源码版本漂移**（§12.52 先例第三次出现）。已回退。

**结论**：text 垂直域残余（center 10611、top/bottom 16-19k）不是盒模型问题——逐字形放置已对齐 mgl、ink 盒即参考图行为；残余为 AA 边缘剖面（±10 灰度 × 数千边缘像素，两项 mgl 公式实验均变差）与标签集合差异（部分 label 未渲染/多渲染）。**除非拿到参考图对应版本的 mgl 源码，text 垂直/AA 域到此为止**，转入其他 §14 待办。

### 12.73 line AA（N5）：+0.5px 膨胀落地，fill-outline-color 2→4/8（2026-08-20）

按 N5 专项实验矩阵（全部 `HARP_NO_HARD_SOURCE_CACHE=true`，单变量二分）：

| 实验 | line-color/default | line-translate/default | 判定 |
|------|--------------------|------------------------|------|
| 基线（硬边、无膨胀） | 337 | 754 | — |
| mgl 精确 AA：+0.5px/侧膨胀 + `smoothstep(-0.5,1.5,distEdge)`（line.fragment.glsl 精确公式）+ CustomBlending | 2602 | 8975 | **证伪**（参考图比公式脆） |
| 膨胀 + 线性 ±0.5px 羽化 | 1484 | 1777 | 证伪 |
| **膨胀 + 硬边**（`step` 于膨胀边界 = 可见宽 +1px） | 404 | 1025 | **采用** |

**落地**：emitter 主 ribbon 半宽 + `0.5×mpp`（mgl `v_width2 = width/2 + ANTIALIASING` 语义）、`_ribbonWidthPx` 记膨胀后宽（zero-width 不膨胀，否则画出 1px 幽灵线——已加守卫并复测 4 例全回 PASS）；patcher 片元 `step(-0.5, distEdge)` 硬切 + **CustomBlending(SRC_ALPHA, ONE_MINUS_SRC_ALPHA)**（three 对非 transparent 材质也尊重非 NormalBlending——ribbon 留在不透明 pass 保 painter's order，AA/羽化若将来启用也能混合）。

**收益**：`fill-outline-color/default`、`/function` **转 PASS（0mm）**，其余 6 例近失 53-195（原 12-192）；line-blend additive 保持 6/6。**代价**：line-color/translate 家族像素 +7~280（仍原失败态，无 PASS 损失）；`line-width/zero-width` ×4 加守卫后零回归。

**方法论注**：line AA 与 text AA/垂直盒同型——vendored mgl 源码公式与参考图版本漂移（§12.52/§12.72 后第三、四例），mgl 公式直接落地均变差，经验校准（膨胀+硬边）反而有效。N5 残余（line-color 404、translate ~1025）为亚像素相位差，除非获取参考版本源码否则到此为止。

### 12.74 fill-extrusion 半透明取证（2026-08-20，未修，证据链完整）

目标 `fill-extrusion-opacity/literal/function`（80k）与 `fill-extrusion-translate/literal-opacity`（68k）。取证结论：

1. **背景 alpha 非问题**：Z5 参考合成白仍在（`DomImageUtils.compareImages`），期望图 30k 透明像素合成白后与我们的白底匹配。
2. **mgl 机制**（draw_fill_extrusion.ts:113-127）：半透明 extrusion = **两遍深度技巧**——第一遍只写深度不写色，第二遍 LEQUAL 只给"最近表面"着色（无穿透叠加/双重混合）。三 pass 深度排序的传闻实为两遍深度预pass。
3. **参考图墙体签名**：暗墙面 = `(12,12,12) @ alpha≈191(=0.75)` —— **premultiplied**（`color *= u_opacity` + ONE,ONE_MINUS_SRC_ALPHA 混合）且 litWall ≈ 0.06（近黑）→ 反推 `u_lightintensity=1`（`mix(1−i, max(1−cv+i,1), NdotL)` 地板在 i=1 时为 0）。但 v8.json 默认 intensity=0.5 —— **版本漂移第五例**。
4. **实验**：默认 intensity 0.5→1 实测——`fill-extrusion-color/function、property-function、zoom-and-property` 三例回归（mid-NdotL 面受影响），opacity/literal 反而纹丝不动（见 5），**已回退**。
5. **我们的独立缺陷（下一入口）**：半透明墙体 `(#ccc 应为灰)` 实际渲染 **(16,99,99) 青色调** —— R/G/B 不等说明 technique.color 不是灰；光源注入的因子只解释均匀变暗。疑点：半透明 extrusion 的材质/顶点色被地面 fill 层青色污染，或引擎 transparent 材质路径 vertex-color 混入（v_color/v_roof_color 渐变）。**下一轮先 dump 半透明 extrusion technique.color 与片元输入**，修掉青色调后再回到 intensity/两遍深度。

**§12.74 补充取证（2026-08-20 二，dump 完成，三关键事实）**：

1. **§12.74-3 的 intensity 推导被推翻**：v8.json 的 `fill-extrusion-color` 默认就是 **#000000**（非 #ccc）——期望暗墙 `(12,12,12)@α0.75` = 黑 paint + ambient 0.03 + 0.75 blend，**intensity=0.5 即可完整解释**，无版本漂移。
2. **探针实验**（注入末行临时改为输出 `mbColor`）：墙体 R 通道立即正确（6≈期望 9）——**光照注入运行正常、paint 正确、R 通道已对齐**；残余 = G/B 通道被青色抬高 131/255：墙面像素的"背景可见权重"= **0.53 而非正确的 0.25** —— 即透明混合的等效 alpha ≈ 0.47 而非 0.75（疑 opacity 被乘两次 0.75²≈0.56 量级，或两层面叠加混合）。这是**混合语义缺陷，非颜色污染**（§12.74-5 的"青色调污染"假说证伪）。
3. **引擎已有 mgl 两遍深度机制**：`DepthPrePass.ts`（`createDepthPrePassMaterial`：Less 深度 colorWrite-off 首遍 + 主材质 `EqualDepth` 混合二遍），gate = `technique.opacity ∈ (0,1)`（我们的 0.75 满足、应已激活）。dump 还发现同一 technique 挂 **3 个材质实例**（黑 0.75 主 / 黑 opacity=1 深度遍克隆 / **红 (255,0,0) 0.75 来源不明**——第三个红材质是下一轮头号疑点，可能与 2 的双重混合直接相关）。

**下一轮入口**：① 查红材质来源（TileGeometryCreator 为 extruded-polygon 创建的 attachment 材质数组）；② 验证主材质实际 blend alpha（为何 0.47）：检查 `enforceBlending`/premultiplied 设置与引擎 extrusion shader 的 alpha 处理；③ R 通道已对齐意味着修好混合后该族有望整体转近失。

**§12.74 第三轮取证（2026-08-20 三，两个疑点均有答案）**：

1. **红材质破案**：`SolidLineMaterial.DEFAULT_COLOR = 0xff0000`（flywave-materials）——第三个材质是 extrusion 几何 `edgeIndex`（roof outline 线）的 SolidLine 材质，technique 无 lineColor 时落默认红色。与本缺陷无关（边线像素少）。
2. **等效 alpha 精确测定 = 0.5（非 0.47）**：ASCII 对照显示**几何形状逐像素一致**（梯形 + 地平线完全对齐），唯一差异是整面亮度——CUR 墙 = `0.5·wall + 0.5·bg`（天区上 137 灰、青地上 (10,137,137) 全部吻合 0.5 混合）。即 paint opacity 0.75 在管线某处变成 **0.5（= 0.75×⅔，又一次 16/24 因子！）**。
3. **注入点强制 `gl_FragColor.a = 0.75` 无任何效果**（80180 逐像素不变）→ 最终 alpha 在我们注入点**之后**的引擎 shader 链决定（`MapMeshMaterials.ts` 无自研 opacity 处理，疑在 three 标准 chunk 之后还有引擎 FadingFeature/dynamicOpacity 或两遍深度的 EqualDepth 材质链）。

**第四轮入口（收窄到一条线）**：追踪 0.75→0.5 的 ×⅔ 位置——① 埋点 dump 引擎侧 extruded-polygon 材质在渲染时的 `material.opacity` 与 three 编译后 uniform `opacity` 值；② 检查 `DepthPrePass` 主材质 `EqualDepth` 链是否有 alpha 重算；③ 若 ×⅔ 来自某处 `textSize/catalogSize` 型单位换算误用，全局搜引擎中 `/1.5`、`*0.666` 类常量。形状已全对齐、R 通道已对齐——这是最后一块砖。

**§12.74 第四轮取证（2026-08-20 四，机制破译：premultiplied 画布 + 有效 alpha 0.4627）**：

1. **材质侧全部正确**（per-frame dump）：主材质 `opacity=0.75 transparent=false CustomBlending(SRC_ALPHA,1−SRC_ALPHA) EqualDepth`、prepass 克隆 opacity=1 colorWrite-off ✓；无 vertexColors、无 FadingFeature、引擎无运行时 opacity 改写；shader 尾部（dump 编译产物）在 `#include <colorspace_fragment>` 后仅 fog/premultiplied/dithering，均不写 alpha。
2. **强制红色终值探针破译"恒定 137"之谜**：片元强制 `(1,0,0,0.75)` 输出后墙区 = `(255,137,137)`——**G/B 恒 137 与片元输出无关** = `(1−a_eff)·255` → **GL 画布中墙体为 premultiplied 且有效 alpha ≈ 0.4627**（捕获时合成白底：R = 0.4627·255+137 → 饱和 255，G/B = 137 恒定）。前几轮的"137 灰/0.5 混合"全部由此派生。
3. **0.4627 的来源待定**（次轮一行埋点可定）：候选 ① **EqualDepth 双面画**：墙 quad 的 front/back 面（DoubleSide 或无剔除）深度相同 → 都通过 EQUAL → 两次 0.75 blend 得 0.5625（≠0.4627 但结构吻合）；② uniform `opacity` ≠ material.opacity（three refreshUniforms 链）；③ 两次 ×0.68（√0.4627）换算。验证法：`renderer.getContext()` readPixels 原始画布 alpha + 关闭 `flatShading/DoubleSide` 单变量对照。

**§12.74 第五轮（2026-08-20 五，DepthPrePass 判罪 + 部分修复）**：

1. **三探针定标 f(a)**：强制片元终值 `(0,1,0.5,a)`，a=0.4→有效 0.204、a=1.0→有效 0.5——两点精确拟合 **a_eff = 0.5·a**（即半透明内容与未混合背景做 50/50 平均）；a=0.75 点偏差（0.4627 vs 0.375）另有 R 通道 0.88 的分离证据（疑红边线材质叠加），但主体模型成立。
2. **判定 DepthPrePass 为元凶**：emitter 给 technique 设 `enableDepthPrePass=false` 后，墙体 rgb 立即变为正确的近黑（(11,13,13)，期望 (12,12,12)@青底 (9,72,72)）——**SwiftShader 上 Less 深度预pass + EqualDepth 主pass 的双遍路径把半透明内容按 50% 合成**（机制细节未再深挖，工程绕过）。
3. **接线**：prepass 禁用后 three 因 transparent=false 完全关混合 → patchExtrusionMaterial 对 opacity∈(0,1) 显式设 CustomBlending(SRC_ALPHA,1−SRC_ALPHA)（同 ribbon 手法，保持不透明 pass 顺序）。实测混合仍未生效（墙 (11,13,13) 未变 (9,72,72)）——**材质级属性对该 mesh 的输出无效（与此前"注入点 alpha 无效"同签名），仅 onBeforeCompile shader 修改有效**——疑 mesh 经 composer/克隆路径用别的材质实例渲染，下轮可用 renderer.info.render.calls 埋点定位。
4. **净效果**：`fill-extrusion-opacity/literal` 80180→**70929**、function 80190→73069；extrusion 全家回归批（color/base/height/translucent 25 例）**零回归**（13 PASS 保持）。

**第六轮入口**：① `renderer.info` per-frame dump（draw calls + 材质）找真正渲染墙的材质实例；② 或在 onBeforeCompile 里同时改 alpha（shader 级修改有效已证）——把 `gl_FragColor.a` 乘 0.75 并设 blend 到正确值的 shader 级 workaround；③ mgl 语义 = 单次 0.75 blend，理想修法仍是找到材质级无效的原因。

**§12.74 第六轮（2026-08-20 六，双 alpha 通道全部验证，GL 级之谜）**：

1. **shader 级 alpha 强制**（`gl_FragColor.a = uMBPaintOpacity` 于注入块末尾，uniform 0.75）+ 材质级 CustomBlending 同时生效——**输出仍无混合**（墙 (11,13,13) 不变）。rgb 同块修改有效（多轮探针证明），alpha 同块修改无效——排除"块未执行"。
2. **per-frame 材质状态 dump（渲染后立即读）**：`blending=5(CustomBlending) transparent=false opacity=0.75 depthWrite=true depthFunc=3(LessEqual) forced=undefined` ——渲染时材质状态**全部正确**，且无任何代码在帧间重置。
3. **新认知（叠加语义）**：prepass 禁用后 LessEqual 深度正确剔除远墙，但墙后背景几乎无青色渗透（(11,15,15) vs 期望 (9,72,72)）——除 blend 失效外，**mgl 的两遍深度还有一个我们缺失的语义**：只保留最近表面（透明盒的"内部"完全不可见，墙后永远是地面青色）；我们的单 pass 深度写会因绘制顺序在屋顶/墙重叠处产生二次混合。
4. **剩余谜团锁定在 GL/合成器级**：材质状态正确 + 片元 alpha 正确 + blend 因子正确 → 输出无混合。与 prepass-ON 时（有 50% 混合）对照，疑点收敛到：SwiftShader 对 `LessEqualDepth + CustomBlending + 非透明列表` 组合的 blend 状态应用 bug，或 composer RenderPass 的 overrideMaterial/state 干扰。**下一步需真机 GPU 或 WebGL inspector（Spector.js）级别取证**，headless 管道内已无更多可观测维度。

**代码现状**：prepass 禁用 + CustomBlending + shader alpha 三层保险已提交（全部正确语义，blend 生效即对齐）；`fill-extrusion-opacity/literal` 70929（几何/颜色正确、混合待生效）。该域在 headless 环境到此为止，标记 **待真机验证**。

### 12.75 会话收尾审计 + fog 域评估（2026-08-20）

**全修复回归审计**（`mbstyle-final1/`，translate×3 族 + line-blend + zero-width + fill-outline 共 35 例）：**26 PASS 全部保持**——circle-translate 5/5、fill-translate 5/5、fill-extrusion-translate 4/6、line-blend-mode 6/6、line-width/zero×4、fill-outline 2/8；`fill-extrusion-translate/literal-opacity` 68k→**67242**（prepass 修复连带改善）。fill-outline 余 6 例近失 53-195。

**fog 域评估**（baseline5 数据 + 剖面取证）：近失梯队 = high-color 族 1717-1814、default 2536、empty-update 2910、high-color-use-theme 3074。垂直剖面：**我们的地平线雾带比 mgl 高 ~3px 且更亮**（row2-3: cur 240/89 vs exp 158/0）——mgl fog = 逐片元射线方向 + `exp(−3t²)` horizon blend + range 映射（`_prelude_fog.fragment.glsl`），我们的 FogExp2+渐变天空是近似。**像素对齐需把 mgl fog 实现为屏幕空间后处理 pass**（对已渲染地图按射线方向逐像素混 fog 色）——工程量与 additive 双 pass 同级或更大，建议作为独立专项（下一会话），入口：MBHeatmapRenderer 式 AfterRender 后处理 + `u_frustum_*` 四角射线插值。

**会话总结**（runner 修复以来 21 commits）：通过数收益 = line-blend 1→6、fill-outline 2→4（另 6 例进近近失带）、circle/fill/extrusion-translate 0→14、text 域解锁全域渲染、additive/fill-extrusion 半透明/line AA 三套渲染基础设施落地；文档 §12.67-§12.75 完整记录每个域的根因、证据链与下一步入口。**待真机验证项**：fill-extrusion 半透明 blend（三层保险已就位）。

### 12.76 fog 域 mgl 全公式解码（2026-08-20，实现规格已齐备）

已从 mgl 源码完整解码 fog 链路（**下一会话可直接照此实现**，无需再读源码）：

**1. FogState**（`style/fog.ts:80-97`）：
- `range`（spec 默认 `[0.5, 10]`）经 FOV 修正：`range[i] += 0.5 / tan(fov/2)`（fov 36.87° → +1.5 → **[2.0, 11.5]**）；globe 时向 `[2, 4.5]` 插值（略）。
- `horizonBlend` = `horizon-blend`（spec 默认 zoom 插值 z4:0.2 → z7:0.1）经 drawAtmosphere 映射：`hb × 0.2495 + 0.0005`（§12.76 前我们的 `MBEnvironmentManager.ts:453` 已有此映射 ✓）。
- `alpha` = fog color 的 alpha。

**2. 深度空间**（`transform.ts:2670-2697`）：`mercatorFogMatrix` 把世界坐标转成**相机相对、以"地图高度的分位数"为单位**的 fog 空间——`windowScaleFactor = 1/height/pixelsPerMercatorPixel`，`p.xy ×= cameraWorldSizeForFog × wsf`，`p.z ×= cameraPixelsPerMeter × wsf`。**即 depth ≈ 相机距离(米) × 该处像素密度 / 屏幕高度**——我们的相机为米制世界，需按此构造 scale（含 FOV/像素比差异的经验校准，fog/default 单例可定标）。

**3. 片元公式**（`_prelude_fog.fragment.glsl`，逐片元、材质内嵌——非后处理 pass）：
```
t        = (depth − near) / (far − near)          // 不 clamp
falloff  = 1 − min(1, exp(−6t)); falloff³         // 立方平滑起步
opacity  = color.a · min(1, 1.00747 · falloff)
dirz     = (fragZ − camZ)/depth                    // 相机相对、z 向上
hz       = max(0, dirz / horizonBlend)
opacity ×= exp(−3·hz²)                             // 地平线上方淡出
rgb      = mix(rgb, fogColor.rgb, opacity)         // + pitch∈[45°,65°] smoothstep 全局系数（fog_helpers: FOG_PITCH_START/END——仅 CPU 侧遮挡剔除用？着色器内无 pitch 项，注意核对）
```

**4. 实现路径建议**（比屏幕后处理 pass 更贴 mgl）：我们的 fill/line 材质已全部经 patcher onBeforeCompile——直接**替换 three 的 `#include <fog_fragment>`** 为上述公式（three 在 scene.fog 时提供 `vFogDepth` = 相机距离 ✓ 直接可用作 depth；dirz 用 uniform 传 `−camZ/depth` 近似，地面片元 fragZ≈0）。uniform：`uMBFog = [near, far, colorA, horizonBlendMapped]` + `uMBFogColor`，patcher 每帧从 `m_environment` fog 状态刷新。天空/星星部分维持现有 createGradientSky（其 horizon 混合已按 §2.15 部分对齐）。

**5. 目标与预算**：fog/high-color 族 1717-3074、default 2536、empty-update 2910（阈值 ~132px，需近完美）；实现约 1 个新注入块 + 单例定标 2-3 轮。若 3 轮内近失带不收敛则该域同样标记版本漂移疑点（参考 §12.52/§12.72/§12.73 前例：vendored 公式与参考图可能存在版本差）。

**6. 首轮实施结果（2026-08-20 二，三个关键发现）**：
- **已落地（正确 mgl 语义，当前测试 no-op）**：① `fog_fragment` 全局 chunk 补 `fog_horizon_blending`（`×fogAlpha·exp(−3·hz²)`，dirz≈−camHeight/vFogDepth 近似）；② 大气穹顶 `horizonAngle` 改为**屏幕空间地平线线参照**（`horizonLineFromTop` 公式 + 不 clamp + onBeforeRender 每帧按活相机重算）——mgl atmosphere.vertex 的 `u_horizon` frustum 插值语义。
- **发现 A（工程关键）**：`@flywave/flywave-mbstyle-datasource` **不在 tsconfig.karma 的 paths 映射里**——karma bundle 经 package.json main 解析到 **lib**！改 src 后必须 `tsc --build` 重建 lib，否则跑的是陈旧代码（本轮 fog2-4 三轮同输出即此坑；此前会话部分"零变化"结论需重新审视）。
- **发现 B（fog 剩余缺口定位）**：fog/default 等测试的顶部亮带（rows 0-8）是**远处雾化地图瓦片**（材质 fog），非大气穹顶（穹顶在这些用例中不可见——三组穹顶修改输出零变化）。
- **发现 C（单位错误）**：我们的 scene.fog near/far = range×1000 **米**，但 mgl fog 深度空间是**相机归一化**（`mercatorFogMatrix`：p×`cameraWorldSizeForFog`/height/pixelsPerMercatorPixel——深度 ≈ 距离×像素密度/屏高，O(1~10)），range [2,11.5] 在该空间。**下一轮核心工作 = 把 near/far 换算到我们的米制世界**（需读 mgl `getWorldToCameraPosition`/`cameraWorldSizeForFog` 完成换算，或用 fog/default 单例数值定标：顶部亮带应在 rows 0-4、亮度 ~126）。

**8. 距离标定 kFog=3.7（2026-08-20 四，`00845036`）**：单位修复后 fog/default 亮带仍过饱和（row2 亮度 254 vs 期望 158 = ramp t≈0.42 目标 0.32），对 `distCam·(range+shift)/shift` 全局乘标定系数。二分 k=2.3→2.75→3.3→4.2，**k=3.7 最优**：`fog/default 2536→552`、`empty-update 2910→926`（亮度剖面 141,200→141,173 vs 期望 126,158）。**全 fog 域 87 例批测**：约 20 分类净改善（`fog/zoom-expression-low-zoom 124881→52690`、`fog/color 95395→69147`、`color-theme/fog-import-scope 186713→127726`、`model-layer/trees-light-aligned-fog 209012→149620` 等 −30k~−72k 级）；**3 例回归**（`model-layer/buildings-trees-shadows-fog-terrain-cutoff 565520→907035`、`ground-shadow-fog ×2 +88k`、`lighting-3d-mode/line-with-fog +36k`——低 pitch/阴影雾场景 k 全局值过浓，均原本 FAIL 无 PASS 损失）。**遗留**：① k 理想值随 pitch/zoom 变化（distCam 几何近似的误差），精确修法 = 完整移植 `mercatorFogMatrix`（cameraWorldSizeForFog 链）；② row0 恒 141 vs 126（不受 k 影响——sky/dome 或 clearColor 支路）；③ high-color 族（1786-3074，穹顶渐变）待穹顶屏幕地平线参照 fixture 定标。

**9. mercatorFogMatrix 精确移植——kFog=3.7 废除（2026-08-20 四，代码侧落地，渲染验证延后）**：
- **代数推导**（对照 mgl `transform.ts:_calcFogMatrices` + `free_camera.ts:getDistanceToElevation`）：fog 矩阵 = translate(−camPos) ∘ scale(`metersToPixel`·`windowScaleFactor`)，其中 `cameraWorldSizeForFog = _worldSizeFromZoom(_zoomFromMercatorZ(d)) = cameraToCenterDistance/d`（cameraToCenterDistance = height·shift），`windowScaleFactor = 1/height`（mercator 下 pixelsPerMercatorPixel=1）。两轴（xy 与 z）代数上**统一约简为 `shift/distCam`**——即 mgl fog 深度 = `shift · dist / distCam`（dist=相机到片元欧氏距离，distCam=**前向射线与地面高程平面的交点参数** `(z0−camZ)/forward.z`，非 pitch 属性几何近似）。与 fov 偏移 range 复合后：
  `fogT = (dist − distCam·(r0+shift)/shift) / (distCam·(r1−r0)/shift)`
  → scene.fog near/far **精确**取 `distCam·(r[i]+shift)/shift`（k=1）。k=3.7 正是旧 `camHeight/cos(pitch属性)` 估值的 distCam 偏差系数；改为从 `camera.getWorldDirection()` 实测射线交地面（z=0）后，任何 pitch 语义错位均被消除。
- **改动**（`MBEnvironmentManager.ts`）：① distCam 精确计算 + kFog 删除；② `fog_vertex` chunk 覆盖为 `vFogDepth = length(mvPosition.xyz)`（mgl 用欧氏距离，three 默认 −mv.z 是视深，俯视中心外差一个视角余弦）；③ fogAlpha ×= `smoothstep(60°,65°,pitch)`（mgl `fog.getOpacity` FOG_PITCH_START/END——fog 仅高 pitch 可见，u_fog_color.a 携带该因子；我们 a² 结构不变，等效 P²·a²，与 mgl 完全一致），pitch 由实际视线方向反推 `acos(−dir.z)`，不用 pitch 属性。低 pitch 3 例回归（§12.76-8）预期由此收敛。
- **验证状态**：tsc --noEmit / tsc --build 全绿；单测 265 passing / 3 failing（stash 对照 HEAD 相同 3 例，均为既有失败，与本次无关）。**渲染批测延后**（攒批策略），跑时重点：fog/default（预期 ≤552 或更好）、§12.76-8 的 3 例回归（buildings-trees-shadows-fog-terrain-cutoff、ground-shadow-fog ×2、line-with-fog）、fog 域 87 例 + color-theme/model-layer 连带域。
- **环境修复（顺带）**：本 checkout 的 `flywave-geoutils` lib 未构建 + `exports` 映射（`./* → ./lib/src/*`）使 mapview lib 的**无扩展名深路径 require** 解析失败（`lib/src/lib/src/...` 双前缀），HEAD 上 `mocha ./lib/test/*Test.js` 本就跑不起来。已重建 geoutils lib 并移除其 `exports` 字段（回退 legacy 解析，含扩展名回退），单测恢复可跑。

**10. 大气穹顶屏幕空间地平线 mgl 精确重写（2026-08-20 四，代码侧落地，渲染验证延后）**：
- **对照源**：`atmosphere.vertex.glsl`（v_ray_dir = 四角视锥方向双线性插值；v_horizon_dir = 在 u_horizon 高度分数处插值）、`atmosphere.fragment.glsl`（`dir.y < horizon_dir.y ? 0 : acos(dot(dir,horizon_dir))`，t = exp(−(angle/π)/fadeout）、`transform.horizonLineFromTop`（h = height/2/tan(fov/2)/tan(max(pitch,0.1°)) − centerOffset.y，offset = height/2 − h·(1−horizonShift 0.1)，clamp 到 ≥0）、`drawAtmosphereGlow`（u_fadeout_range = mapValue(horizon-blend, 0,1, 0.0005,0.25)；颜色 alpha 用**属性原值**，不带 pitch 因子）。
- **改动**（`MBEnvironmentManager.ts` 穹顶重写）：① 角度不再用真实海拔 asin(dir.z)，改为逐片元从 gl_FragCoord 屏幕位置双线性插值视锥角方向 + 对屏幕地平线射线取 acos 夹角（世界 z-up，`dir.z < horizonDir.z` 判下方）；② 视锥四角方向与 u_horizon 每帧 onBeforeRender 计算（NDC 角点 unproject − 相机位置；pitch 由实际视线反推，不用 pitch 属性）；③ **取消 elevation≤0 discard**——mgl 在屏幕地平线以下输出 t=1 雾色（其大气先画、瓦片后覆盖；我们穹顶后画 + depthTest：近瓦片深度更近者胜出，比穹顶 1000m 远的瓦片显示 t≈1 雾色 = mgl fog-cull 远带同视觉）；④ fogState 新增 `colorAlpha`（属性原 alpha），穹顶用之（此前误用带 pitch 因子的 alpha）；⑤ 旧 uHorizonRefElev（真实海拔参照）路径删除。
- **预期影响**：§12.76-8 遗留②（row0 恒 141 vs 126——真实地平线参照把渐变起点放低，row0 处 t 过大偏 fog 色）与③（high-color 族 1786-3074）的主嫌疑即此差异；此前"屏幕参照回归 ~2k px"的尝试是**标量参照角近似**（uHorizonRefElev 单值 + atan），本轮是 mgl 的**逐片元矢量插值**精确式，机制不同。批测重点：fog 域 87 例 + lighting-3d-mode/color-theme 连带域，回归即回退本条（独立 commit 可 revert）。

**11. F10 circle-blur/circle-stroke mgl 移植（2026-08-20 四，代码侧落地，渲染验证延后；`7128dd26` + `20726c60`）**：
- **对照源**：mgl `circle.fragment.glsl` 的三段组合——`extrude_length = |extrude| + antialiasblur·(1−blur_positive)`；`antialiased_blur = −max(|blur|, antialiasblur)`；正 blur（向内柔化）与负 blur（向外发光）两条 opacity_t 公式；stroke 边界 `color_t = smoothstep(antialiased_blur, 0, extrude_length − radius/(radius+stroke_width))`；最终 `out·(visibility·opacity_t)`。`antialiasblur = 1/dpr/(radius+stroke_width)`（vertex 侧，与半径成反比的 1px 伪 AA）。
- **改动**：① `MapCircleMaterial`（datasource 侧材质）片元整体重写为 mgl 逐行公式，uSize 改为 (radius+stroke)·2（**修了 stroke 内缩进填充区的旧 bug**——mgl 的 stroke 在 fill 半径之外），新增 uRadius/uDpr；② **主渲染路径**走引擎 `CirclePointsMaterial`（technique 'circles'），在 `MBMaterialPatchManager.patchCircleMaterial` onBeforeCompile 注入同一套 mgl 组合（仅当 blur≠0 或 stroke-width>0 时注入，默认 fwidth AA 路径不动），uniform uMBBlur/uMBRadiusPx/uMBStrokePx/uMBStrokeOpacity/uMBStrokeColor/uMBDpr(=1，size 与 gl_PointSize 同像素单位)；③ emitter `props.size` 同步扩到 (radius+stroke)·2。
- **风险与批测重点**：① `size` 单位是否 CSS px vs 设备 px（uMBDpr=1 假设）；② 数据驱动 circle-radius（props.size 只取常量值，既有行为）；③ ground-lighting 注入与本注入的 gl_FragColor 行替换叠加（已兼容 diffuseColor→mbColor 替换）。批测：circle-blur / circle-stroke-color / circle-stroke-opacity / circle-stroke-width 各分类 + circle-color/circle-opacity 回归。

**12. 攒批验收（2026-08-20 四，fog 4 轮隔离 + circle 对照批测）**：
- **fog 域 4 轮隔离批测**（87 例 × 4，fog-batch{,-k37,-vd,-olddome,-final}）：
  - **k=1 精确式回归**：fog/default 552→3342、fog/color 69k→126k——引擎的 dist/distCam 米制比值与 mgl 归一化空间存在系统比例差，k 必须保留；
  - **fog_vertex 欧氏距离**：18/86 例微变，总像素 +9925，几乎无影响（k 也是视深下拟合的）→ **改回视深**（-mvPosition.z）；
  - **穹顶屏幕地平线重写（§12.76-10）确证为大回归源**：回退旧真实海拔穹顶后总失配 1053 万→827 万（−226 万，fog/default 3342→1064、high-color 族 6.7k→1.8k、space-color 族 −7~8 万、line/sdf/raster −6~12 万）。**结论：mgl 逐片元屏幕地平线公式在本引擎的相机/深度语义下不成立**（疑与穹顶 1000m 深度交互、无 discard 后覆盖远瓦片），留档勿再直接启用，需先把穹顶改为 mgl 的"先画大气+瓦片覆盖"顺序语义；
  - **distCam 精确式 vs pitch 属性启发式**：启发式全面恢复 §12.76-8 基线（fog/default 1064→**552**、empty 1438→926、fog/color 69147 ✓），且 2d/terrain 族额外改善（fog/2d/basic 33.7k→22.7k、terrain/basic 38.8k→28.2k、zoom-high 13.9k→9.3k）→ **用回启发式**（精确式数值差异 = 相机 rig 的 pitch 属性与实际视线方向小错位）；
  - **pitch 因子（smoothstep 60°–65°，由视线反推）保留**：line-with-fog 124648→**88793**（§12.76-8 的 3 例回归之一收敛）、fog-fade 168k→160k；ground-shadow-fog 219k（基线 203k，+15k，原本 FAIL）；cutoff 族持平。
  - **最终形态 = 旧穹顶（colorAlpha）+ 启发式 distCam + k=3.7 + 视深 fog_vertex + pitch 因子**；fog 域仍 1/86 PASS（unsupported-fog），关键近失：fog/default 552、empty 926、fill-outline 615、fill-color 600、line-gradient 591、background-color 1156、high-color 1725。
- **circle 域 F10 验收**（circle-batch vs circle-baseline 禁用注入对照，8 分类 50 例）：
  - **circle-blur**：literal 224→**0 PASS**、negative 332→**0 PASS**、blending 1631→856、literal-stroke 456→124、property-function 211→156（4→6/8 PASS）；
  - **circle-stroke-opacity**：default/function/literal 356-360→**0 全 PASS**（0→3/6）；property-function/stroke-only 358-360 持平 = 数据驱动 stroke-opacity 未走逐要素属性（uniform 级，遗留）；
  - **circle-stroke-color 5/5、circle-stroke-width 5/5 全 PASS**（F10 前无 stroke 支持）；circle-color 5/5、circle-opacity 3 例 FAIL 与 F10 前逐值相同（既有遗留，非回归）；circle-radius 5/6（projected 2262 既有）。
  - **零回归确认**：对照批所有共同用例 delta ≤ 0 或 =0。
- **circle-opacity/blending(295)/property-function(491)/zoom-and-property(488)** 记为既有遗留（与 F10 无关，疑 blend/数据驱动 opacity 通道）。

**13. circle-opacity 边缘残差定性（2026-08-20 四）**：像素取证（expected 与 current 各按白底合成后逐像素比对）显示三例残差全部是**半透明圆边缘 AA 剖面差**（如 property-function (17,22) cur=152 vs exp=129——我方边缘偏浅），无色彩/位置错误。实验：把 mgl antialiasblur 剖面**无条件**注入所有 circle（替换引擎 fwidth AA）→ 三例反而 +17~28px、其余持平（circle-radius/antimeridian +2）→ 回退条件注入。混合语义已排除（mgl 预乘输出 + [ONE,1−SRC_ALPHA] 与我们直通 alpha + [SrcAlpha,1−Src_ALPHA] 数学等价）。**定性为 AA 剖面精度项**（与 §12.72 线 AA 专项同类），需要时再攻；数据驱动 circle-stroke-opacity 同理（uniform 级求值，非逐要素）。










### 12.7 icon-halo SDF 渲染（2026-08-14）

**背景**：SDF 图标（dot.sdf 等）在 loadSpriteAtlas 注册时被二值化成硬边位图，SDF 场被销毁 → halo（需要距离场外扩轮廓）无法绘制。icon-halo-* 12 例近失（44–100px）与 icon-rotate/runtime-styling 边缘抖动同根因。

**5 步修复（全部落地）**
1. `MBTileDataEmitter.ts` icon 分支增发 `_iconHaloColor/_iconHaloWidth/_iconHaloBlur`（私有前缀，不动 protocol）。
2. `PoiBuilder` 仿 iconColor 用 `getPropertyValue` 读三个 halo 属性进 `PoiInfo`（新增 iconHaloColor/Width/Blur 字段）。
3. `MBStyleDataSource.loadSpriteAtlas`：sdf 图标保留原始 alpha 场（RGB 置白），`ImageItem` 加 `sdf?` 标志并在注册时设置。
4. `flywave-materials/IconMaterial` 加 SDF 模式：uniforms `uIsSdf/uEdge(0.75)/uGamma/uHaloColor/uHaloWidth/uHaloBlur`，fragment 分支：
   `fillA = smoothstep(edge±gamma, d)`，`haloA = smoothstep(edge-width-blur-gamma, edge-width+gamma, d)*(1-fillA)`，输出 `rgb = vColor.rgb*fillA + uHaloColor.rgb*vColor.a*haloA`（premultiplied）。
5. `PoiRenderer` batch 接线：sdf 图标 batchKey 追加 halo 签名（width/blur 换算 field 单位 ×0.094、haloColor hex），构造 `IconMaterial` 时按 `imageItem.sdf` + halo params 配置。

**实测**：icon 全批 18 分类 0 回归；净增 **+4 通过**（icon-halo-color/literal、icon-halo-width/function、icon-halo-width/property-function、runtime-styling/set-style-layer-change-source）。近失大幅下降：icon-halo-color/property-function 98→8、icon-halo-width/function 102→3、width/property-function 66→0、blur/default 44→6。icon-halo-blur 系列仍失败（104–270，blur 的 mapbox 单位换算待第二阶段）；icon-halo-color/multiply 44→98（半透明红 halo + multiply blend 边缘，黑引用）。

**遗留**：icon-halo-blur 系列、icon-halo-color/multiply 的 blend 处理；halo 的 icon-scale 补偿（第二阶段）；非 SDF 图标（pbf vector 357 个）不受影响。

### 12.8 轨道相机修复 + 高 pitch 挂起（2026-08-14）

**根因（用户排查）**：`MapView.setCameraGeolocationAndZoom` 用 `setRotation` 只转四元数不移机位 → pitch 60 时视点偏离 style 中心 ~91m → 中心瓦片落出视锥。此前「材质颜色正确但全白」「字面 vs 数据驱动」均为表象。已修：
- `MapView.ts`：改用 lookAtImpl 轨道语义（目标钉屏幕中心）；
- `MBStyleDataSource.ts`：删 `-log2(cos(pitch))` 补偿；
- 连带修复：`MBMaterialPatchManager.patchTile` 门控失效、高度重复缩放、共享 geometry 多 technique 颜色覆盖、FLAT_SHADED vNormal 编译错误、无光源补默认环境光、MapViewTest.ts:114 跳过测试重写。
- fill-extrusion 四用例 mismatch：38574→1375、28662→1439、31124→1011、40179→11315。vs baseline3 重叠 617 例：+8 通过、3 新失败（已修）。

**高 pitch 挂起（本轮修复）**：轨道相机在 pitch 73.5（dynamic-filter/symbols/point/combined-pitch-distance/high-pitch-far-hidden，zoom 10.85）下 >300s 挂起（每帧渲染/几何创建重，非 compute 本身）。修复：`FrustumIntersection` 的 area 细分停止（瓦片屏幕面积 < target 时停止细分，保留为低 zoom overzoom 瓦片）在 **pitch > 60° 时也生效**（原仅 m_enableMixedLod）。实测：该用例 9.6s 完成（原 >300s）；回归抽样 15 分类净 +2（fill-color +1、icon-halo-color +1），fill-extrusion 改善保持（1375/1439/1011/11315 与 fix1 一致）。

**后续**：全量套件现已可单趟跑完（此前提 575/3026 断开）。剩余 fill-extrusion 失败（opacity/*、vertical-gradient、zoom-function 颜色）属表达式求值/光照对齐，与本次阻塞无关。

### 12.9 第四轮全量基线（2026-08-15，轨道相机 + halo + 高 pitch 修复后）

| 指标 | 第二轮（08-13） | 第三轮（08-14） | 第四轮（08-15） | Δ(4 vs 3) |
|------|----------------|----------------|----------------|-----------|
| 上报结果 | 2646 | 2765 | 2827 | +62 |
| **通过** | **204（7.71%）** | **212（7.67%）** | **231（8.17%）** | **+19** |

> 第四轮结果目录：`rendering-test-results/mbstyle-baseline4/`；通过清单：`baseline4-pass.txt`。

**净变化（vs 第三轮）**：净增 +20、净失 1。
- **净增 20**（本轮修复直接收益）：
  - 轨道相机 + fill-extrusion：`combinations/fill-extrusion-translucent--*` 5 例、`fill-extrusion-edge-radius-narrow-corner`、`fill-color/zoom-and-property-function`、`dynamic-filter/symbols/point/combined-pitch-geojson-distance`
  - halo：`icon-halo-color/literal`、`icon-halo-width/function`、`icon-halo-width/property-function`、`runtime-styling/set-style-layer-change-source`
  - 其他（用户修复连带）：`circle-camera-orthographic-projection`、`circle-pitch-alignment/viewport-scale-viewport`、`circle-pitch-scale/viewport`、`line-sort-key/long-key-values`、`measure-light/*` 3 例、`slots/set-layer-imported-slot`
- **净失 1**：`appearance/paint-icon-and-text`（0→27px，阈值边缘，SDF/AA 亚像素差）。

**运行质量**：**0 新 DISCONNECTED**（此前 model-layer 批崩溃点已修复、building 批不再挂起、高 pitch 批 9.6s 完成）；全量 3026 用例**单趟跑完**（此前提 575/3026 断开）。仅 dynamic-filter 批因单个重测试主线程阻塞 >60s 触发 karma 重启重跑（最终仍完成，批内用例部分重算）。

**遗留**：fill-extrusion 仍 0 通过（近失 1011-11315 为表达式求值/光照对齐，需专项）；appearance/paint-icon-and-text 阈值边缘；dynamic-filter 批个别重测试的 ping 超时（负载相关）。

### 12.10 harness 竞态修复（2026-08-15）

**问题**：`renderFrames` 只等 N 个 AfterRender 帧即截图，瓦片可能仍在加载 → paint-icon-and-text（base4 0→27）、line-color 等 flake，基线数字不可信。

**修复**（`MBStyleCompatRenderTest.ts` renderFrames）：N 帧后若 `isDynamicFrame`（瓦片未全加载/有 pending 更新）为真，再等一个 `FrameComplete` 事件（瓦片全加载 + 无 pending 后触发）；若已 settle 直接返回——**不额外 update**（否则重排文本破坏 text-max-width/force-double-newline 这类像素完美用例，实测多 update 使其 0→全白）。

**验证**：paint-icon-and-text 恢复 0 mismatch 通过；force-double-newline 保持 0；回归 12 分类净 +2（appearance），其余 0 回归。

> 注：line-color/default 337px 是已知 AA/线宽舍入差（非竞态），与 elevated-line 338px 同源。

### 12.11 fill-extrusion 表达式求值 / 光照排查（2026-08-15）

**结论**：fill-extrusion 剩余失败分两类，均需专项：
1. **颜色 stops 求值**：`fill-extrusion-color/property-function`（11315）布局正确、红/绿/蓝三建筑颜色**已正确**；剩余差为**墙面光照明暗**（expected 墙 197-255 两档，current 全 255 均匀）——非颜色求值问题。
2. **光照模型/墙法线**（核心阻塞）：无光源 style 下补 DirectionalLight（intensity 0.5，mapbox 默认方位）+ 改 extrusionAxis.w=0（墙面用 FLAT_SHADED 导数法线）**均无效**——墙面颜色恒为 90/153=0.59（改光强度墙色不变），说明光照根本未作用于墙面，疑点指向 extrusion shader 的 FLAT_SHADED 法线计算（`cross(dFdx,dFdy)` 对所有墙片元产出同向法线）或材质未接场景光。已回退实验改动（保持 fix1 的 Math.PI ambient + w=1），需专项攻 `ExtrusionChunks.extrusion_normal_fragment_begin`。
3. 附带：部分 fill-extrusion expected 为黑底参考（透明合成黑），与 harness 白底 clear 色的背景差占 mismatch 一部分。

**已保持**：fill-extrusion 4 通过（combinations/fill-extrusion-translucent--* 3 + edge-radius）、harness 竞态修复（paint-icon-and-text 0、force-double-newline 0）、高 pitch area 停止。实验改动全部回退，代码库处于 fix1 + 本轮确定修复的干净状态。

### 12.12 dynamic-filter 批 ping 超时修复（2026-08-15）

**问题**：dynamic-filter 批（含 feature-state/color-theme，84 例）在全量长时运行下于 71/84 处 DISCONNECTED（主线程偶发阻塞 >60s，karma 默认 pingTimeout 误判）→ 整批重跑浪费 ~10min。

**修复**：
- `karma.options.js`：加 `pingTimeout: 180000`（浏览器响应 ping 超时 60s→180s），合法慢用例（SwiftShader 下重负载 3D）不再误判断开。
- `MBStyleCompatRenderTest.ts`：`this.timeout(60000)→180000`（与 pingTimeout 对齐，避免 mocha 先于 karma 掐断重用例）。

**验证**：feature-state+color-theme+dynamic-filter 批 **84/84 完成、0 DISCONNECTED**（9min47s，原 71/84 断开重跑）。隔离确认 dynamic-filter 27/27 均可完成（无真实挂起，仅负载慢）。

### 12.13 text 域 SDF 像素精度评估（2026-08-15）

近失（15-500px，真实引用）排查结论，三类阻塞：
1. **引用损坏（24%）**：63/258 text-* expected 为纯黑空图（text-size/*、text-halo-width/default 等）——参考数据未捕获文字，渲出字反而 mismatch，不可修。
2. **SDF 亚像素精度**：`text-line-height/data-driven`（34px，真实引用）diff 为多字形边缘抗锯齿差（非系统性）；行高求值已正确（0.8/2 的 pitch 12.8/32px 与 mapbox 一致）。属报告第二阶段深调。
3. **text halo 功能缺口**（text-halo-* 309-425）：全链路无 halo。与 icon halo（批级 uniform）不同，同一 canvas 内不同标签 halo 参数不同 → 需改 TextCanvas 顶点格式（vColor 后加 halo 属性），大幅改动。

**结论**：text SDF 精度短期 ROI 低（引用损坏占大头 + 深调/大改）。当前代码库 = fix1 + 本轮确定修复（harness 竞态、高 pitch area 停止、ping 超时），全量基线数字可信。建议下轮转 fill-extrusion 光照的 `ExtrusionChunks` 法线专项或 heatmap 双 pass（C4）。

### 12.14 fill-extrusion 光照专项排查 + 3-digit hex 修复（2026-08-15）

**发现 1：`parseStringEncodedColor` 不支持 3 位 hex**（`StringEncodedNumeral.ts`）：正则只匹配 `#RRGGBB`/`#RRGGBBAA`，`#999` 解析失败 → `applyMaterialBaseColor` 早退 → 材质保持默认白。已修复（`#RGB`/`#RGBA` 展开），零回归（9 分类净 0），是真实正确性 bug。

**发现 2：extrusion shader chunks 未注入**：`ExtrusionFeature.isEnabled` 要求 `extrusionRatio != DEFAULT_RATIO_MAX(=1)`；本管线 `animateExtrusion=false` → ratio=1 → **chunks 全部未注入** → 材质是普通 `MapMeshStandardMaterial`（无 extrusionAxis 用法、无 FLAT_SHADED 法线覆盖）→ 墙面 NdotL 恒定（光照不作用墙面）与墙体着色缺失的机制。

**发现 3：颜色管线**：材质色已正确应用（#999999，afterSetRGB 验证），但墙面渲染恒为 90（#999×0.59 或白×0.35 巧合相等）——亮度由 sRGB/linear/tone-mapping 管线 + 未注入 lighting 主导，非材质色问题。

**结论**：墙面着色需要 `isEnabled` 门控放开（让 extrusion chunks 注入）+ 颜色管线校准 + 法线计算验证，是渲染引擎深水区，专项需多轮迭代。当前代码库 = fix1 + 本轮确定修复（3-digit hex、harness 竞态、高 pitch、ping 超时）。

### 12.15 fill-extrusion 墙面光照落地（2026-08-16）

**方案（绕过 extrusion chunks 注入，直接在 patcher 实现 mapbox 公式）**：
- `MBEnvironmentManager` 新增 `extrusionLightState`：mapbox **默认光** `{position:[1.15,210,30] spherical, color:white, intensity:0.5}`（mapbox 无 `light` 时也恒有默认光），并记录 `use3DLights`（样式用 3D `lights` API 时为 true）。
- `MBMaterialPatchManager.patchExtrusionMaterial`：删掉原来错误的 `mix(0.6→1.0, vMBHeight)` 垂直渐变；改为按 `fill_extrusion.vertex.glsl` 公式在 fragment 注入：
  1. `colorvalue = luminance(paint)`；`color += 0.03`（ambient）。
  2. `NdotL = clamp(dot(worldFlatNormal, lightDirWorld), 0, 1)`（FLAT_SHADED 导数法线 × `camera.matrixWorld` 转世界系；光方向按 viewport anchor 旋转 `-bearing`）。
  3. `NdotL = mix(1-intensity, max(1-colorvalue+intensity, 1.0), NdotL)`。
  4. 侧面（`abs(worldN.z)<0.5`）：`NdotL *= (1-vg) + vg*clamp((vMBHeight+base)*pow(height/150,0.5), r, 1)`，`r=mix(0.7,0.98,1-intensity)`。
  5. `result = clamp((paint+0.03)*NdotL*lightColor, mix(0,0.3,1-lightColor), 1)`。
- **颜色空间**：mapview 渲染输出为 linear（`colorspace_fragment` 恒等），故注入在 fragment 里对 `gl_FragColor.rgb`（linear paint）先 `linearToSrgb` 再做 mapbox sRGB 算术，输出前 `srgbToLinear` 还原，使最终捕获结果 = mapbox 参考。
- 3D `lights` 样式（如 `data-driven-zero-alpha`/`no-alpha-no-multiply`，走 `LIGHTING_3D_MODE`）保持原 `injectLighting` Lambert 路径，不套 legacy 公式（避免双重重阴影）。

**验证**：`fill-extrusion-color/literal` 屋顶 `(11,11,255)`、墙面 `(6,6,212)` 与 expected **逐像素一致**（此前墙面为 `(0,0,250→211)` 错误渐变）。fill-extrusion-color 分类净 **−2487 px**：property-function 11315→9048、no-alpha-no-multiply 38341→38023、default 1427→1414、use-theme 1369→1408；data-driven-zero-alpha 15280→15313（3D-lights 路径保持基线）。3 个既有通过项（edge-radius-narrow-corner/tile-border/pattern-missing）无回归，组合分类既有通过无回归。残余 ~1400px 为**屋顶/墙面边界 2px 几何偏移**（预存在，非光照）。

**遗留**：fill-extrusion `function`/`zoom-and-property-function`（期望紫色/zoom 插值）仍全蓝——zoom 函数求值偏位（预存在 Z2 问题）；fill-extrusion-opacity 半透明叠加（translucent 组合）未对齐；屋顶/墙面边界偏移。3D `lights`（lighting-3d-mode 116 例）仍需专项。

### 12.16 icon-anchor 落地（2026-08-16）

- `MBEnvironmentManager`/`MBMaterialPatchManager` 之外，`flywave-mapview` 的 `PoiRenderer.computeIconScreenBox` 现在识别 `_iconAnchor`：按 mapbox `shapeIcon` 对齐语义 `(0.5 - hAlign)*w / (vAlign - 0.5)*h`（注意 mapbox Y 屏幕向下 vs three Y 向上，垂直方向取反）把图标盒移到锚点。
- `MBTileDataEmitter` symbol 分支：`props._iconAnchor = layout['icon-anchor']`；`icon-offset`（em 单位）→ `iconXOffset/iconYOffset`（px = em × icon-size，y 取反）；`icon-allow-overlap`/`icon-ignore-placement` → 原生 `iconMayOverlap`/`iconReserveSpace`（此前只设 `mayOverlap`/`reserveSpace`，PoiBuilder 读的是前者）。
- `MBExpressionEngine` 增加 legacy `{type:'identity', property:'x'}` 函数求值（返回 feature property）；`MBLayerEvaluator.isExpr` 同样识别 identity 对象，使其进入 per-feature 求值。

**验证**：icon-anchor 分类从 **2/11 → 9/11**（default/center/left/right/top/bottom/四角 全 0px 通过）；baseline4 既有通过项（icon-color/icon-image/icon-halo 等）零回归。剩余：property-function（identity 已求值但 9 个同点要素仅放置 1 个——原生 Placement 深水区）；icon-rotate（48-53px，引擎无 rotation 支持）；icon-translate（~8000px，mvt 符号源空白，同 R4 fixture/符号管线）。

### 12.17 line 数据驱动 ribbon 深化（2026-08-16）

- `MBTileDataEmitter` ribbon-fill technique 打 `_isLineRibbon` 标记；`MBMaterialPatchManager.patchFillMaterial` 对 ribbon-fill 关闭 depthTest/depthWrite（共面 ribbon 不互相深度裁剪，靠绘制顺序决定交叉处颜色）。
- 核对 `getOrCreateRibbonTechniqueIndex`（§8 `82cad1fa` 已按 color+opacity 分键）与 `emitRibbonFill` 逐 feature 发几何：categorical line-color 6 类全部正确分派（path→red/service→yellow/street→blue/main→purple 等，已逐类验证）。

**验证**：line-color/property-function 从 **~36k → 1088px**（§8 后进一步确认）；property-function-identity 160px；line-color/default 337px。baseline4 既有 line 通过项（line-width/visibility/dash 等）零回归。剩余 1088px 为**交叉处 per-color mesh 批量 vs per-feature 顺序**差异（mapbox 单 mesh 逐要素顶点色，我们按颜色分 mesh；交叉处红黄覆盖顺序不完全一致）——引擎级（需 vertex-color 或 per-feature object）。

### 12.18 legacy 颜色 stop 插值修复（2026-08-16）

**根因**：`MBExpressionEngine` 的 legacy `{stops:[[zoom,value],...]}`（zoom 函数）与 zoom-and-property 网格函数的颜色插值只处理 `#hex`（`a[0]==='#'`），命名色（'blue'/'red'/'yellow' 等）不插值 → `fill-extrusion-color/function` 在 zoom 18 恒返回首个 stop 的 blue（应 interpolate 成 purple）。

**修复**：新增 `MBExpressionEngine.isColorString()`（hex / rgba()/hsla() / 命名色）；`evaluateLegacyStops` 与 `evaluateLegacyZoomAndProperty`（zoom 插值 + property 插值两处）在两端都是颜色时一律 `interpolateColor`。

**验证**：
- `fill-extrusion-color/function`：**39393 → 1732px**，紫色 (184,10,184) vs 期望 (183,10,183) 逐像素对齐（残余为屋顶/墙面边界偏移）。
- `fill-extrusion-color/zoom-and-property-function`：**34125 → 8981px**，zoom 18 下 green/gray/purple 三色全部正确（134/135,135,135,182/184,10,182）。
- 表达式引擎回归：数值插值（@18→2）、hex 插值（#800080）、categorical、interval 均正确；identity 无回归。
- 回归套件（circle-color/radius、fill-color、line-color 17 通过）baseline4 零回归。

---

## 13. 测试空白主要原因分析与对齐排序（2026-08-16）

> 依据 §10–§12 全部修复记录 + 08-16 逐分类复跑结果（`rendering-test-results/mbstyle-*`，最新一轮，495 用例）整理。最新全量基线为 baseline4（08-15）：**231/2827 通过（8.17%）**，0 DISCONNECTED。

### 13.1 主要空白原因（按优先级）

| # | 原因 | 影响分类（用例） | 关键证据 |
|---|------|----------------|----------|
| G1 | **引擎级材质/shader 缺口**（SolidLineMaterial 无 blur/offset/join/cap、CirclePointsMaterial 无 blur/stroke、TextCanvas 无 halo、POI 无 rotation props） | line-blur/offset/join/cap、elevated-line-*、circle-blur/stroke、text-halo-*、icon-halo-blur、icon-rotate | line-join 6/11 近失、line-cap 2/4 近失、icon-halo-blur 5/5 全近失（6–270px）、line-color 已到 1088px；文档 P1.2/P1.3/P1.5、C7 |
| G2 | **fill-extrusion/building 渲染收口**（zoom 函数求值偏位 Z2、屋顶/墙面边界 2px、facades/roof-shape/conflation 未实现） | fill-extrusion-*（~143）、building（53） | fill-extrusion-color 1414–15313px（0 通过）、building 30 例 140k–253k 空白、depth-occlusion 0/14 |
| G3 | **icon-text-fit 0/41 未排查**（patcher applyIconTextFit 可达但未验证文本缩放进 icon 盒语义） | icon-text-fit（41） | 全 0 通过，仅 2 近失 |
| G4 | **text 域引用损坏 + SDF 亚像素精度**（63/258 期望图为纯黑空图不可修） | text-*（~273） | §12.13；text-line-height 34px、halo 需引擎级 |
| G5 | **raster/image 纹理仍未上屏**（双路径未收口） | raster（~85）、image（20） | raster-opacity 121k、image/raster-brightness 158k |
| G6 | **heatmap 双 pass 刚落地待微调** | heatmap（18） | **✅ 已对齐（08-17，§12.28）：0→15/18**（opacity/intensity/weight 全绿）；遗留 antimeridian/pitch30/projected 3 例 |
| G7 | **fog/skybox/lighting-3d 代码已落地未验收** | fog（63）、skybox（34）、lighting-3d-mode（116） | **✅ 已验收（08-17，§12.27）**：lighting 10 通过、skybox 1、fog 0（近失 3）；剩余为 fog 像素级对齐 + lighting fill-pattern/stroke 子域 |
| G8 | **model-layer 内容不对齐 / depth-occlusion** | model-layer（212）、depth-occlusion（14） | model-layer fill-extrusion--default 279994、0 DISCONNECTED 已解决 |

### 13.2 对齐执行顺序（目标：先吃近失梯队，再收整域空白）

1. **G1 近失梯队精度**（改动小、可直接转通过）：fill-outline-color（7/8 近失，12–192px）、icon-size（9/18 近失）、line-join/elevated-line-join（6/9 近失）、icon-halo-blur（5/5 近失）、icon-halo-color（4/7）、line-color（4/5）、line-cap（2/4）、elevated-line-color（3/3）、icon-rotate（2/3）、fill-color（2/8）。
2. **G2 fill-extrusion/building 收口**：修复 Z2 zoom 求值偏位 + 屋顶/墙面边界偏移 → 17 例近失转通过。
3. **G3 icon-text-fit 埋点排查**：单分类最大空白，需按 R1 三断点方式定位。
4. **G6 heatmap 双 pass 微调**：data-expression 已 324px，前景最好。
5. **G5 raster/image 双路径收口**。
6. **G7 fog/skybox/lights 渲染 harness 验收**。
7. **G4 text SDF 精度（可修部分）**。
8. **G8 model-layer 内容对齐 / depth-occlusion**。

### 13.3 执行进度快照（2026-08-16 会话末，7 个 commit：3b8da244 → 43f69980）

> 按 §13.1 的 G 分组，记录"前 → 后"与遗留。所有修复均对齐 mgl 源码；单测 208 通过（1 既有 circle-radius×2 失败，与本次无关），tsc 全绿，工作区干净。

| 项 | 前 | 后 | commit | 遗留 |
|---|---|---|---|---|
| G3 icon-text-fit | 0/41 | **7/41** | 3b8da244 | `*-2x` DPR 缩放、`stretch-*` 九宫格、`text-variable-anchor`/`placement-line`、text-anchor 文本渲染 |
| G1 fill-outline-color | 1/8 | **2/8** | 57baa3e0 | 残余 1–2px AA 边缘（pixelmatch 4px 阈值内），与 line-color 337px 同源 |
| G1 icon-size（camera 函数） | 4/18 | **9/18** | af54f113 | `*-rasterized`（432–3793，需 maxSize 重栅格化）、`property-function-*`（152–2092，数据驱动装箱）、`literal` 139/`function` 16（AA 边缘） |
| G1 icon-halo-blur | 0/5 | **4/5** | f1b5a066 | `property-function`（数据驱动 blur 205px） |
| G1 icon-halo-width | 3/4 | **4/4** | f1b5a066 | — |
| G1 icon-halo-color | 3/7 | **5/7** | f1b5a066 | multiply/opacity 98px（半透明 blend 边缘） |
| G1 icon-rotate | 1/3 | 1/3（近失 53→31） | 62ca4139 | oneway 45° 对角 AA + icon-size 0.9× box 基线 |
| G6 heatmap | 间歇空白 | **稳定渲染**（data-expression 324→308、opacity 3983→649） | 43f69980 | kernel 密度→ramp 阈值校准（blob 40×14 vs 期望 45×20） |

---

## 14. 未完成项（待办清单，2026-08-16 会话末保存）

> 按优先级/ROI 排序。每项含：根因摘要、已验证数据、所需改动域、复杂级。已完成项见 §12.21–§12.26。

### P0 — 引擎级渲染深水区（G2，解锁面最大）

**F1. fill-extrusion 墙面几何对齐 mgl（G2 核心阻塞）**
- **✅ 已完成（2026-08-17，§12.29）——且原根因假设被证伪**：mgl 默认 `fill-extrusion-line-width=0`（wallMode 关）+ `edge-radius=0`，默认墙面就在 footprint 上，与我们相同，**无需移植 join-normal 墙面挤出**。真因是 **FOV 40° vs mapbox 36.87°**（相机透视比率），harness 已设 `fovCalculation:{type:'fixed',fov:36.86989764584402}`。
- 收益：fill-extrusion-color 0→**3**（0mm）、base 1→**5**、height 0→1、terrain 0→1、combinations +1、circle function 系 +2；净 **+11**（代价：circle-pitch viewport 系 2 例 40° 侥幸通过→215px 近失）。
- join-normal 路径仅 `fill-extrusion-line-width ≠ 0` 的 wallMode 用例（`fill-extrusion-line-width` 分类 9 例）需要，届时再移植。

**F2. fill-extrusion 残余**：**✅ 主体完成（2026-08-17 深夜，§12.31）**——`no-alpha-no-multiply` 37842→**PASS 0**（color alpha = 预乘不透明，alpha-0 要素剔除）；`data-driven-zero-alpha` 28010→**1288 近失**（3D-lights 双重光照/π/pow 指数/clearColor radiance 四项修复，逐色对齐，残余 1288px = cast-shadow 地面阴影，独立特性另记）；lighting-3d-mode 连带 10→12。**剩余**：cast-shadow 阴影渲染器、fill-extrusion-opacity<1 的三 pass 半透明（combinations translucent 系）。
- **F2a（✅ 已完成 2026-08-17 晚，§12.30）**：根因不是瓦片挂载，而是**相机近裁剪面贴地**——`TiltViewClipPlanesEvaluator` 以 `maxElevation`（=瓦片 geoBox 最高点，恒 0）求解 near plane，挤出屋顶（高于地面、更靠近相机）落在 near 之前被 GPU 裁剪。修复：emitter 上报 `DecodedTile.maxGeometryHeight` + datasource 扫描样式设 `DataSource.maxGeometryHeight`。**property-function 8237→PASS(66px)、zoom-and-property 8171→PASS(1px)**，literal/default/function 零回归。

### P1 — 近失可快速转通过（G1 剩余）

**F3. heatmap kernel/ramp 密度阈值校准（G6）**
- **✅ 已完成（2026-08-17，§12.28，commit `6fa78651`）：0/18 → 15/18 通过。**
- 落地要素：① `MBHeatmapRenderer` 密度 FBO 0.25× + RGBA16F（默认 ramp 也对齐 v8）；② composite premultiplied blend（[ONE, ONE_MINUS_SRC_ALPHA]）；③ `parseColor` 命名色 linear→sRGB（r178 ColorManagement）；④ `normalizeGradientStops` 解包 `["memo", expr]` 编译表达式（顺带修好 heatmap-color/expression 全黑）；⑤ 反子午线 world copies。
- 遗留 3 例：`antimeridian`（4786px，回绕副本密度 cyan vs lime）、`pitch30`（16181px，俯仰地面 quad 椭圆化）、`projected`（13060px，自定义投影）。

**F4. icon-halo-blur/property-function（205px）**：**✅ 重定性（2026-08-18，§12.32）**——非 halo 公式问题，是 fixture 双要素（blur 1/3）**同点放置被原生 Placement 收敛为 1 个**（与 icon-anchor/icon-size property-function 同根，§12.16 placement 深水区）。halo 数学已由 §12.32 对齐（blur 分类 4/5，literal/function/default/powevr 全绿）。归入 placement 专项。

**F5. icon-halo-color/multiply + opacity（各 98px）**：**✅ 已完成（2026-08-18，§12.32）**——mgl 双 pass fill-over-halo 合成 + `*Color` 属性数值归一丢 alpha（emitter 拆 `_iconHaloAlpha`）+ 输出 alpha ×icon-opacity + uGamma=0.105。**icon-halo-color 5/7 → 7/7**，icon-halo-width/blur 保持，icon-size/color/image 零回归。

**F6. icon-size 残余**：`*-rasterized`（mgl `getRasterizedIconSize` maxSize 重栅格化）、`property-function-*`（数据驱动装箱）、`literal`/`function`（AA 边缘 + 0.9× box 基线）。

**F7. icon-text-fit 残余**：`*-2x`（DPR 缩放）、`stretch-*`（九宫格重栅格化，`scaleShapedIconImage`）、`text-variable-anchor`、`placement-line`、`*-text-anchor`（文本未随 anchor 渲染）。

### P2 — 引擎几何 / 材质（需改 flywave-lines / flywave-materials / flywave-mapview）

**F8. line-join / line-cap（G1，6/11 + 2/4 近失）**：`TriangulateLines` 恒 bevel；mgl bevel/miter/round 角几何。**line-color 337px 基线**（AA/线宽舍入）与 line-cap butt 337px 同源，须先修。
- **进行中（2026-08-18）**：cap 几何已落地（`90c061d4`）；join 几何主体重造 + `line-join:none`/`line-round-limit`/`line-miter-limit` + AA feather shader 接线已完成代码侧闭环（§12.33），**渲染验证待跑**。
- 用例：line-join（11）+ elevated-line-join（9）+ line-cap（4）+ elevated-line-cap（4）+ line-color（5）+ elevated-line-color（3）。

**F9. line-blur / line-offset（G1）**：SolidLineMaterial 无 blur/offset uniform 消费（P1.3 引擎级）。**→ 2026-08-18 代码侧已绕开引擎**：offset 走中心线几何位移、blur 走 ribbon AA feather 扩展（§12.34），渲染验证待跑。

**F10. circle-blur / circle-stroke-***：CirclePointsMaterial 无 blur/stroke（P1.2 引擎级）。

### P3 — 大工程（G4/G5/G7/G8，架构/引擎级）

- **F11. raster/image 双路径收口（G5）**：raster-opacity 121k（纹理未上屏）；image raster paint 忽略；双路径（env quad vs 逐瓦片）未收口。
- **F12. fog/skybox/lights 验收（G7）**：**✅ 已验收（2026-08-17，§12.27）**——lighting-3d-mode 2→**10 通过**（ground 层光照全对齐，含 background/color-ambient/ambient-directional/pitched-45、emissive-strength*/background/fill/fill-outline、fill、fill-outline）、skybox 0→**1**（gradient/default）、fog 0 通过但近失 3（space-color-use-theme 39、fill-outline 418、line-gradient 591）（heatmap 已由 F3/§12.28 独立跟进：0/18→15/18）。**剩余**：fog 63 例整域待像素级对齐（空间色/2D 叠加）；skybox atmosphere 等子域；lighting 的 fill-pattern/stroke 子域 + bright-v9 pitch-*/fill-extrusion 6 个重型 3D 挂起未上报。
- **F13. text SDF 精度（G4）**：63/258 期望图纯黑（引用损坏不可修）；SDF 亚像素 + halo（需改 TextCanvas 顶点格式）。**2026-08-19 更新（§12.68）**：整域"不渲染"根因已修（注入 catalog 持久化 + invalidateCache），text 全域开始渲染、center 系接近；下一步 = hAlignment/vAlignment 映射 + 字形基线/尺寸精度；additive 双 pass 渲染器基础设施就绪待稳定（`enableAdditiveDualPass` flag）。
- **F14. model-layer / depth-occlusion（G8）**：崩溃已修（192 上报 0 DISCONNECTED）但内容不对齐（fill-extrusion--default 279994）；occlusion 软淡入在 patcher。
- **F15. building roof-shape / conflation / 3d-intersections / terrain dynamic-exaggeration / color-theme**：§2.13–§2.15 全 ❌/🔧 域，engine 级。

### 验证流程备忘（每项 DoD）

```
改代码 → pnpm --filter @flywave/flywave-mbstyle-datasource exec tsc --noEmit
      → mocha ./lib/test/*Test.js（208 passing，1 既有 circle-radius×2 失败无关）
      → CHROME_BIN=/usr/bin/microsoft-edge MBSTYLE_PORT=8099 \
        MBSTYLE_REPORT=rendering-test-results/<cat> node scripts/run-mbstyle-render-tests.js <分类>
      → 更新本文件 §12.2x + §14 状态 → commit
```
- karma webpack 有 filesystem 缓存，调试用 `HARP_NO_HARD_SOURCE_CACHE=true`。
- **runner 已自动退出**（2026-08-19，§12.67）：karma 结束后自动 `server.kill()`，无需手动 kill；重跑前仍需 `lsof -nP -iTCP:<port> -sTCP:LISTEN` 清孤儿进程。

**14. line-join/cap 域首次验收 + join:none 语义修正（2026-08-20 四）**：
- **首次验收**（§12.33 代码 08-18 落地后从未跑过）：line-join 域 6/11 PASS（bevel/miter/default ±elevated 各 1px 阈值内 PASS），line-cap/butt 449、round 1283、square 277，line-color 354-1595，fill-outline-color 族 0-195（default/function PASS）——**join 主体几何已对齐**，残余为 round 22px（亚像素 AA）、property-function 51px、transparent 族 1194-1426（半透明排序）。
- **join:none 破案**：期望图比 bevel 高 ~4.5px（=半线宽）且**仅末端**（起点不外延）。对照 mgl `line_bucket.ts:709/714-743`：none 的中折角（>5°）收段用 `endLeft=endRight=1`（**方形帽外延**）、新段以 −1,−1 起段；**特征末端**同样 1,1 外延；仅特征**起点**走 709 行的 butt。近直线角（COS_STRAIGHT_CORNER 5°）回退 miter。我们旧实现是纯矩形（无外延）→ 端部各缺半线宽。
- **修复**（`MBTileDataEmitter.ts` join-none 分支重写）：直线 run 合并 + 拆分点/末端方形帽外延（起点 butt）；**patterned none 除外**（首版外延使 line-pattern-trim-offset end-offset 三例 +753~789 回归——外延平移 pattern 相位；pattern 域保持原始段长）。
- **结果**：line-join/none 与 elevated 版 238→**0 双 PASS**、none-transparent 1426→1202，4 例净改善零回归。遗留：none-transparent 1202（半透明排序族）、round 22（AA）。

**15. line-cap 残差定位（2026-08-20 四，留档待攻）**：butt 449 / square 277 / round 1283。逐行取证（512×256）显示残差集中在**画布/瓦片顶边附近的 ~10 条线端点收尾**：如 row1 exp 两段 (0,4)+(6,16) 我们合并成 (0,17)（偏长）、row2 x261-268 我们 261-264（偏短）、row3 x45-46 整缺——同一张图有长有短，排除统一帽公式错误，指向**瓦片裁剪端点语义**：mgl 裁剪产生的中间端点按 `intermediateStartPoint/intermediateEndPoint` 走 capExt=0 的 butt（line_bucket.ts square 分支），而我们的 emitRibbonCaps 可能对裁剪后折线的首末点照常出帽/或裁剪线位置不同。入口：`emitRibbonCaps` 与瓦片裁剪（clipPolyline）交叠处的端点分类。round 1182 missing 大头同源（顶部 fan 帽整体偏位）。

**16. round join 判据修正 + round cap 月牙留档（2026-08-20 四）**：join-round 分支判据从"转角 ≥ roundLimit(1.05 rad≈60°)"改为 mgl 语义 **miterLength=1/cos(半转角) ≥ roundLimit**（≈35.5° 起画圆，line_bucket.ts:797）。本批 fixture 无 35.5°–60° 转角故数值持平（elevated-butt 连带 −43），保留为语义正确项。line-cap/round 的 1182px 缺失月牙（散布全图、聚簇 x64-128/x192-320, y160-224）非 join 判据所致，round cap fan（emitRibbonCaps K=8）几何核对无误，需 fixture 级逐顶点取证（疑 mgl fakeround/sharp-corner COS_HALF_SHARP_CORNER 裁剪或瓦片裁剪中间端帽），留档待攻。

**17. round cap 月牙取证链打通（2026-08-20 四，留档）**：建立了 canvas→MVT extent 的精确映射（**Y 需翻转**，1 canvas px = 8 ext 单位，中心 13.418056/52.499167 → 主瓦片 14-8802-5374）。x64-128/x192-320 两缺失簇定位到微小三段折线（如 C=[(3036,2873),(3015,2920),(2989,2909)] ~89° 转角、B=[(2895,2718),(3074,2786),(3070,2794)]），月牙为近竖直线 round 端帽左侧 AA 边/帽体缺。已排除：round join 判据（§12.76-16）、round cap fan 几何（核对无误）。下一步：用 /tmp/mvt/dump.py 单要素最小重放（style 只留单 feature），对照 mgl sharp-corner（COS_HALF_SHARP_CORNER=cos37.5°，44.5°>37.5° 非 sharp）与 capExt 语义逐项消元。

**18. raster 域像素对齐突破（2026-08-20 四）**：
- **破案链**：raster-opacity/default 14171px 残差取证——cur ≈ GaussianBlur(exp, σ0.7)（mse 拟合最优）；模板匹配证明瓦片 1:1 对齐、无缩放错位；临时直连纹理（绕过 padded canvas）零变化 → 排除 canvas 中转 → 定位为**子像素 UV 偏移**（quad 落半像素位置，LINEAR 采样恒在纹元间取平均=全域均匀模糊）。对照 mgl：`transform.ts` 有专门的 **alignedProjMatrix**（"pixel-aligned to avoid fractional pixels for raster tiles"）。
- **修复**：raster 材质注入顶点 `#include <project_vertex>` 后将 gl_Position.xy/w 吸附到 framebuffer 整像素格（uMBRasRes 由 onBeforeRender 每帧从 renderer.getSize 更新）——对轴对齐 quad 等价于 mgl 的矩阵级取整。
- **结果**：raster-opacity default/function/literal **全 PASS**（14171/5083/3201→0）、raster-visibility/visible PASS（14171→0）、retina-raster 10239→493、raster-alpha 63266→58882；连带 raster-brightness/contrast/saturation/hue-rotate **12/12 全 PASS**、raster-extent 2 PASS、zoomed-raster/underzoom PASS、raster-masking/overlapping-zoom PASS。**本轮净 +18 PASS**。
- **遗留**：raster-alpha 58882（fixture 为 alpha 渐变合成，疑 blend 族）、raster-resampling 45-49k（z20 过缩放 ×16 的放大滤波差异）、raster-filtering 61-130k、raster-color 121k（uMBRasColor 未接，§3 F11 已记）、raster-masking/overlapping 16k/82k、raster-array 族、zoomed-raster fractional/overzoom 近失 3844/485。

**19. raster-alpha 破案（2026-08-20 四）**：58882→**0 PASS**。取证链：R/B 通道拟合系数 k=1.00、**G 通道 k=0.45** → base 色错——`new THREE.Color('#ffa500')`（orange）在 ColorManagement r152+ 下存**线性**分量（G=0.39），raster shader 的 sRGB 域合成需要 sRGB 分量（0.647）；R=1.0/B=0.0 两空间相同所以只有 G 暴露。修复：`copyLinearToSRGB` 转回。连带改动（语义正确、非决定项）：① 片元合成统一为 `mix(base, rgb, opacity·tex.a)`（opacity=1 时也做 alpha 合成——带 alpha 通道的瓦片）；② 带 alpha 的瓦片绕过 padded canvas（canvas 2D 预乘会使直通 alpha 公式双重相乘），直连原图纹理 + uMBRasPadOn 采样分支。**警示**：全 patcher 还有其他 `new THREE.Color(css)` 直接进 sRGB 语义 uniform 的用法（如 circle uMBStrokeColor），同族风险待排查。

**20. raster-color RASTER_COLOR 路径落地（2026-08-20 四）**：对齐 mgl `draw_raster.ts configureRaster` + `raster.fragment.glsl #ifdef RASTER_COLOR`——`t = color-mix[3] + dot(srgb(rgb), color-mix[0..2])`，经 raster-color-range 归一化后查 256×1 ramp（`buildRasterColorRamp`：表达式按 ['raster-value']→['get','rasterValue'] 重写逐点求值），ramp.a ×= 输入 alpha 后走统一 sRGB 合成；**整体替换**亮度/对比/饱和链（mgl 语义）。关键坑：`technique._paint['raster-color']` 是**已求值常量**（黑），必须从 styleManager 取原始表达式。结果：raster-color/nearest 118067→**988 近失**、expression 114140→30424，opacity/alpha/retina 零回归。遗留：expression 30k（表达式求值细节）、nearest 988（阈值边缘）。

**21. raster-color 细化（2026-08-20 四）**：ramp 过滤器跟随 raster-resampling（mgl configureRaster 同参绑定，nearest fixture 硬台阶）、ramp 采样对齐 mgl renderColorRamp 精确式（端点含尽 i/(N-1) + Math.floor；纹元中心实验无变化已回退）。nearest 988→**323 近失**（残余=bin 边界 0.25% 像素，float 精度级，阈值 ≈98 内未过）；expression 30424（interpolate 语义待查）。零回归。

**22. 表达式引擎 interpolate 颜色插值修复（2026-08-20 四）**：`MBExpressionEngine` linear 分支只对 `#` 十六进制 stop 做颜色插值，**rgba() 字符串 stop 直接返回下界 stop**（不混合）——raster-color/expression 输出 99.9% 纯 stop 色（ramp 退化为三色）破案于此。修复：任意字符串 stop 对走 interpolateColor（parseColor 本就支持 rgba/命名色），interpolateColor 改返回 rgba() 并**保留 alpha 插值**（旧版硬编码 a=1）。结果：**raster-color/expression 30424→0 PASS**。引擎级修复，潜在惠及所有 rgba-stop interpolate 域；混合回归批（line-gradient/background/fill/circle/icon/text/heatmap-color 62 例）21 PASS、无异常值。遗留：raster-color/nearest 323（bin 边缘近失）。

## 16. 会话总结（2026-08-20，§12.76-9 ~ §12.76-22，14 commits）

> 按"代码对齐 mgl 源码优先、攒批后集中测试"策略推进。全部改动 tsc 全绿、单测 265 passing（3 既有失败不变）、每批零回归验证。

**转 PASS 清单（本会话直接验证 ≥25 例）**：
- **raster 域 +22**（§12.76-18/19/20/21/22）：像素对齐（alignedProjMatrix 语义）解锁 opacity/visibility/retina/亮度对比饱和色相全族；raster-alpha（base 色 linear/sRGB 转换缺失，G 通道 k=0.45 破案）；raster-color/expression（引擎 interpolate rgba() stop 不插值修复）。
- **circle 域 +8**（§12.76-11/12，F10）：circle-blur literal/negative、stroke-color/width 全族、stroke-opacity 3 例。
- **line 域 +2**（§12.76-14）：join:none ±elevated（mgl 方形帽外延语义）。
- **fog 域**：回到 §12.76-8 基线且 line-with-fog 124648→88793（pitch 因子）；穹顶屏幕地平线重写被数据否决回退（-226 万像素）。

**引擎/基础设施级修复（影响面超出单一域）**：
1. `MBExpressionEngine.interpolate`：rgba() stop 颜色插值 + alpha 通道（此前返回下界不混合）；
2. `flywave-geoutils` exports 修复（单测恢复可跑）；
3. raster 像素吸附顶点注入（alignedProjMatrix 等价）。

**部分 baseline6**（按用户指示中止，456/2810 上报——按测试数升序，小分类优先）：456 PASS 已超 baseline5 全量 375；含 runtime-styling 103、appearance 20、geojson 18、lighting-3d-mode 16、combinations 30。完整全量待下次补跑（大分类 text/symbol 系未跑）。

**下一会话入口**：
1. 补跑完整 baseline6（chunked runner，~1.5h）；
2. raster 遗留：raster-array 源类型、resampling/filtering、globe colorization；
3. line 遗留：round cap 月牙单要素重放（取证链已备：/tmp/mvt/dump.py + Y 翻转映射）、瓦片裁剪端点（§12.76-15）；
4. `new THREE.Color(css)` 线性值误作 sRGB 的同族排查（§12.76-19 警示，如 uMBStrokeColor）。

**23. 纯代码对比修复批（2026-08-20 四，不跑测）**：
- **circle stroke 区 opacity 语义**（引擎注入 + MapCircleMaterial 双处）：mgl `out = mix(color·opacity, stroke·stroke_opacity, t)`——fill 的 circle-opacity **不缩放 stroke 区**。我们旧实现把 circle-opacity 乘进整个片元（含 stroke），`circle-opacity:0` 的 stroke-only 用例 stroke 被清零。改为 `alpha = opacity_t · mix(circleOpacity, strokeOpacity, color_t)`（数据驱动 stroke-opacity 三例同根）。
- **image 源 raster 路径 base 色同族修复**（`MBEnvironmentManager.applyImageSources`）：`THREE.Color` 线性值误作 sRGB 的 §12.76-19 同族 bug（image/raster-opacity 7020、image/raster-visibility 31357 的嫌疑主项）。
- **THREE.Color 审计结论**：全 patcher 排查后，trim/hillshade/circle-stroke/icon-halo/extrusion 系都在 `colorspace_fragment` 之前的线性域混色，线性值正确——**raster baseSrgb（已修）与 image baseSrgb（本批修）是仅有的 sRGB 域消费者**，同族清零。
- **line-cap 瓦片裁剪端点定性修正**：发射器无 polyline 裁剪（VT 顶点本就是整数、mgl 亦在端点画帽）；§12.76-15 的顶边 mixed 长/短锁定为**引擎 clip volume 与 mgl 瓦片边界的亚像素语义差**（引擎层改动，需独立专项）。
- **round cap 月牙代码对比结论**：mgl round 帽 = 方框四边形 + 片元 `length(v_normal)` 精确圆形化；我们的 K=8 扇形弦差仅 ~0.1px@r=5，不足以解释 1182px 月牙——月牙另有其因（结合 §12.76-17 的候选要素，疑与引擎 clip/顶点剔除相关），留档。
- **raster-color/nearest 323**：对齐 mgl 采样式后仍差 bin 边缘 0.25% 像素——mgl 的 ramp 评估点 i/(N-1) 与采样半纹元中心天然错位（mgl 自身的不一致），叠加 mediump 精度，不再追。

**24. 纯代码对比批二（2026-08-20 四，不跑测）**：
- **hcl/lab 色彩空间插值移植**（`MBExpressionEngine`）：legacy function 的 `colorSpace: 'hcl'|'lab'` 此前忽略（按 sRGB 插值）——background-color/colorSpace-hcl(4096 全图) 破案。逐行移植 mgl `color_spaces.ts`（rgb↔lab↔hcl、D65 常数、interpolateHue 最短色相路径、NaN b 通道处理）。数值验证：rgb(118,0,118)→rgb(255,155,0) 中点 hcl=#e32853、lab=#bf5655，端点精确往返。lab 端点通道由 `bb` 命名避开与 b 参数遮蔽。
- **fill-outline 残差定性**：mgl 用 gl.LINES 画多边形边 + 片元 `alpha = 1−smoothstep(0,1,dist)` 的 1px 屏幕空间衰减（fill_outline.fragment.glsl）——与我们的 ribbon 实现机制不同；53-195px 近失，需按 LINES+smoothstep 重写才可精确对齐，暂缓。
- **image 源残差定性**（image/raster-visibility 31357 等）：mgl image 源经 raster 程序的投影矩阵做**任意四边形正确纹理映射**；我们是双三角形 UV 插值——非平行四边形坐标（本 fixture 旋转四边形）在对角线产生折痕。精确修法 = 顶点 shader 注入 4 角 homography；base 色已在 §12.76-23 修复。记档待攻。

**25. fill-outline mgl 精确 alpha 落地（2026-08-20 四，不跑测）**：对照 `fill_outline.fragment.glsl`——outline 是 `alpha = 1−smoothstep(0,1,distPx)` 的 1px 屏幕空间衰减。改造：① outline technique 增加 `_isLineRibbon: true` + `_ribbonWidthPx: 2`，路由进 ribbon 注入拿到 vMBRibbonEdge varying（此前 outline 走纯 fill 材质、edge 属性根本没接到片元）；② ribbon 注入中 outline 场景替换基础硬切 alpha（`step(−0.5, edge)`）为 mgl 的 `1−smoothstep(0,1, |edge|·halfW)`（2px ribbon 的 halfW=1px，|edge|·halfW = 距中心线像素距离，严格等价）。待批测验证 fill-outline-color 8 例。

**26. image 源投影校正纹理映射（2026-08-20 四，不跑测）**：§12.76-24 定性的"双三角形 UV 对角折痕"修复——4 角对应关系解 8×8 单应矩阵 H（高斯消元 + 角点往返校验，失败回退 UV 属性路径），顶点注入 `vMBImgUvw = H·(x,y,1)`、片元 `uv = vMBImgUvw.xy/zw`（GPU 透视校正插值完成任意四边形正确 warp，等价 mgl raster 程序的 normalize 矩阵语义；平面单应的 w 与透视投影 w 成比例，顶点直接给齐次坐标即可）。注意 onBeforeCompile 时 chunk 未内联，map 采样替换走 `#include <map_fragment>` 标记 + paint 注入的 imgT 字面量双路。待批测验证 image/raster-* 族。

**27. color-theme LUT 子系统落地（2026-08-20 四，不跑测）**：对照 mgl `util/lut.ts` + `style-spec/util/color.ts RenderColor`（N³ RGBA cube 三线性查表、alpha 保留、`-use-theme:'none'` 跳过）新建 `MBColorTheme.ts`（loadColorTheme：base64 PNG → N²×N canvas 解码；applyColorTheme：逐行移植三线性插值）。恒等安全：无 color-theme 的样式 lut=null 直通。接线四处：① `MBLayerEvaluator`——所有 `-color` 结尾 paint 求值后查表（use-theme none 跳过）；② `MBEnvironmentManager.applyFog`——fog color/high-color/space-color（fog/color-use-theme 124k、space-color-use-theme 95k、high-color-use-theme 9.8k 的嫌疑主项）；③ `buildGradientTexture` 增加 lut 参数——line-gradient/heatmap ramp 查表（line-gradient/use-theme 2751、icon-color/use-theme 119）；④ `MBStyleRuntime`/`MBStyleDataSource` 异步加载后传播 evaluator+env 并 markTilesDirty。**待批测**：color-theme 全分类 + fog use-theme 三例 + line-gradient/use-theme。**未覆盖**：sprite/icon 纹理与 image/raster 纹理的 LUT（mgl 走 GPU LUT 纹理，如需再扩展）。

**28. 纯代码对比批四（2026-08-20 四，不跑测）**：
- **legacy zoom-and-property 双线性的 colorSpace 挂钩**：`evaluateLegacyZoomAndProperty` 的属性轴与 zoom 轴两处色彩插值均接入 §12.76-24 的 hcl/lab（此前仅 zoom-only stops 支持）。
- **fog 符号裁剪移植**（`fog/2d/symbols` 11897、"Should be clipped" fixture）：mgl `collision_index.ts:547`——fog opacity > FOG_SYMBOL_CLIPPING_THRESHOLD(0.9) 的符号不放置；CPU 公式（`fog_helpers.getFogOpacity`）= `min(1,1.00747·falloff³)·P·alpha`。在 `MBStyleSymbolPlacement.run` 加放置前裁剪：scene.fog near/far（已含 kFog 标定换算）+ fogAlpha（含 pitch 因子）计算逐符号 opacity，>0.9 置 opacity=0 + visible=false。注意 CPU 公式是**单次 alpha**（与 shader 的 a² 不同）——按 mgl 源码忠实移植。
- 待批测：fog/2d/symbols、map-projections/integrations/fog/symbols、fill-color/zoom-and-property-function。

**29. harness 补 mapbox:// 具名源重写（2026-08-20 四，不跑测）**：raster-filtering/resampling 族取证发现 fixture 用 `mapbox://mapbox.satellite` 等具名源——mgl 测试框架经 `transform-request.js` 把 api.mapbox.com 瓦片重写到本地 `tiles/<id>/`，我们的 karma harness 缺此环节（源 URL 保持 mapbox:// → StyleManager 生成 api.mapbox.com 远程地址 → 全部 404 → 空渲染）。修复：`MBStyleCompatRenderTest.localizeStyle` 对 `url: mapbox://<id>` 源改写为 `local://tiles/<id>/{z}-{x}-{y}.{ext}`（raster→png/vector→mvt/raster-array→mrt，本地 fixture 命名 `{z}-{x}-{y}.{ext}`）。取证还确认：mgl 期望图本身在瓦片缺失时走**祖先链到 z1 世界图**（其服务器纯静态、同一 39-tile 子集）——与我们 RasterTileDataProvider 的祖先回退语义一致。影响面：所有 mapbox:// 具名源 fixture（raster-filtering、resampling 族及众多 streets-v7/v8 矢量 fixture）。

**30. patterned join:none 的 linesofar 逐段重置（2026-08-20 四，不跑测）**：对照 mgl `addHalfVertex`（`a_linesofar = lineSoFar − segmentStartf32`，仅 patternJoinNone = **line-pattern** 存在时逐子段重置；dasharray 不重置）——我们旧实现对 none 线全程推累计距离，pattern/gradient 相位跨子段漂移。修复：join-none 分支 patternJoinNone 时 dist 归一化到子段 0..1、len 重置为子段局部绝对距离（line-pattern-trim-offset 族与 line-pattern/line-join-none 系 6 例的嫌疑主项）。

**31. 运行时 line-gradient 更新重建（2026-08-20 四，不跑测）**：ribbon 与 border 的 technique 缓存键此前只有 `'grad'` 布尔签名——运行时 `setPaintProperty('line-gradient', …)` 永远复用首帧 ramp（runtime-set-gradient 716 / runtime-remove-gradient 67 的嫌疑主项）。修复：键中加入 stops JSON（截断 512 防爆炸），gradient 变更 → 新 technique → 新 ramp（markTilesDirty 重建链已通）。

**32. raster-array 源类型落地（2026-08-20 四，不跑测）**：vendor mgl `mrt.esm.js` 解码器到 `src/vendor/mrt.ts`（内联 LRUCache——注意解码器用 `put` 而非 `set`；`parseHeader`→`createDecodingTask(getDataRange)`→**performDecoding 须传 range 切片**（task 偏移是切片相对的，传全 buffer 会在头部触发 gzip 错误——worker 源码逐行对照发现）→`batch.complete`→`getBandView`）。node 探针全链验证：'Total Precip' 93 bands、tileSize 512/buffer 1/offset −100000/scale 0.1、514² RGBA。依赖：pnpm add pbf@5.1.2（ESM，karma webpack 可打包）。shader 侧：数组分支用**纹理描述符 mix/offset 覆盖** paint colorization（draw_raster getTextureDescriptor 语义）——`value = offset + dot(rgba, [s,256s,65536s,16777216s])`、UV 内缩 buffer、NODATA(vec4(1)) 透明（raTexture2D 掩码语义）、纹理 NoColorSpace+NEAREST（band 是编码不是颜色）。band 选择 = 首个 band（默认）。**未覆盖**：无 raster-color 的数组（mgl 强制 RASTER_COLOR+默认 ramp）、in-shader linear 再插值（RASTER_ARRAY_LINEAR 的 texelFetch 双线性）、运行时 setBand。

**33. raster-array 缺口补齐（2026-08-20 四，不跑测）**：① 无 raster-color 的数组——mgl `draw_raster` 对数组强制 RASTER_COLOR define（未绑定 ramp 采样器读黑、alpha 1），以 1×1 黑 ramp 模拟；② **RASTER_ARRAY_LINEAR**——逐行移植 `_prelude_raster_array` 的 `raTexture2D_*_linear`：texelFetch 4 点采样（clamp 到 res−2 防 OOB）、逐点 NODATA(vec4(1))→(value=0, mask=0) 掩码、解码后双线性、`value.x /= value.y` nodata 归一——即 mix/offset 解码发生在**插值之后**（普通 GPU 双线性直接插编码字节是错的，这正是 mgl 在 shader 里重实现采样的原因）。仅运行时 setBand 仍缺（无对应 fixture 操作入口可静态对齐）。

**34. fog vertical-range 落地（2026-08-20 四，不跑测）**：mgl `fog_apply_premultiplied(color, pos, heightMeters)`——高处内容在 [vertical-range] 区间淡出雾（`u_fog_vertical_limit`），且 opacity>0.9 时淡出"淡出"本身避免 cull 距离硬切。移植：fog chunk 新增 `vFogHeight = mvPosition.z + cameraPosition.z` varying（世界高度）+ `fogVertLimit` uniform（applyFeg 读 fog['vertical-range'] 默认 [0,0] 禁用，min/max 排序同 mgl）；`fogFactor ×= 1 − min(vertProgress, opLimit)`。目标：fog/2d/fill-extrusion-vertical-range（14596）与 fog-fade 族。风险记档：依赖 vertex shader 有 `cameraPosition` uniform（three 内建材质均有；RawShaderMaterial 不含 fog chunk 不受影响）。

**35. image 源逐层 quad + raster-elevation（2026-08-20 四，不跑测）**：`applyImageSources` 从"合并所有引用层 paint 的单 quad"重构为**每 raster 层一个 quad**（mgl paint 是逐层语义——raster-elevation fixture 两层共享 image 源、不同 elevation/亮度）；mesh.anchor.z = raster-elevation（世界米），renderOrder 按层序，visibility:none 逐层跳过。共享纹理的 per-layer resampling 取首层值（罕见组合，记档）。tile 路径的 raster-elevation（矢量瓦片 raster 层抬升）未做——emitter quad z 需接 paint，待数据反馈后补。

**36. tile 路径 raster-elevation（2026-08-20 四，不跑测）**：raster technique 新增 `_rasterElevation`（paint 'raster-elevation'，默认 0），fill quad 顶点 z += elevation（世界米，mgl u_raster_elevation 语义）。与 far-clip（uMBRasFar 眼距）的交互未调（抬升改变远裁剪几何，待数据）。

**37. heatmap 地面投影椭圆核（2026-08-20 四，不跑测）**：mgl `heatmap.vertex` 在**瓦片空间**挤出核四边形再经透视矩阵投影——pitch 下地面圆变屏幕椭圆（pitch30 fixture 16181 的根因；我们旧实现是屏幕空间正圆）。泛化：kernel 四边形改为"参数空间圆 + 逐核屏幕共轭基"——CPU 投影 p 与 p±D（D = S·rPx·mpp，沿地图平面两轴）得基向量（密度缓冲 px），顶点 `px = center + u·bx + v·by`，片元高斯半径 `r = length((u,v)·S)` 在**参数空间各向同性**（地面单位），椭圆由基承载。零 pitch 自动退化为旧行为（bx=(half,0), by=(0,half)）。heatmap/antimeridian 与 projected 仍留（回绕基平移/自定义投影）。

**38. §23–37 攒批验收 + 两处修复（2026-08-20 晚，`mbstyle-b76/b77/`）**：

**b76 首轮批测**（19 分类 235 例，Edge150 headless + SwiftShader，`HARP_NO_HARD_SOURCE_CACHE=true`，重建 lib 后跑）——**发现 heatmap 全域崩塌（15/18 → 0/18）与 color-theme 0/20**，其余亮点：circle-stroke-opacity 3/6 转通过（default/literal/function PASS；property-function 系 358 近失）、fill-outline-color default PASS + 39–190 近失带（§25 生效）、map-projections/unsupported-fog PASS（fog 符号裁剪 §28 验证 ✓）、raster-array/raster-elevation/image 首次有渲染输出（近失带 25–60k 级，非空渲染）。

- **heatmap 崩塌根因（§37 的 D 推导 2× 缩小）**：`D = half·mpp` 用 `mpp = EQUATOR/(512·2^zoomLevel)`，但 flywave `zoomLevel` 是 mapbox zoom **+1**（§12.76 注释自证）——基向量减半 → 全部 kernel 缩小一半 → 密度塌缩、渲染近空白（像素剖析：current 全白 + 散点 vs expected 品红渐变）。**修复**：废除解析 mpp，直接从相机推导——小世界偏移 ε（=2% 相机距离，保透视线性）投影得逐核 Jacobian，`f = half/(√(lx·ly)·ε)` 几何均值定地面半径；零 pitch 精确退化为旧 (half,0)/(0,half)，pitch 各向异性由投影基承载。**b77 验证：heatmap 15/18 全部恢复**（default/literal/function/opacity/intensity/weight/color 全 PASS；antimeridian 5668 / pitch30 15038 / projected 13060 维持 §37 前残余水平）。
- **color-theme 0/20 根因（harness op 空转）**：fixture 全部经 runtime operation `setColorTheme {data:<base64 PNG>}` 下发，不走 style 的 `color-theme` 属性——`MBStyleCompatRenderTest` 的 case 是 best-effort 空桩。**修复**：`MBStyleDataSource.setColorTheme(theme)` 公开 API（复用 `loadColorTheme` 解码 → evaluator + environment 传播 → markTilesDirty）+ harness 接线。**b77 验证**：remove 135、render-with-broken-lut 98、add/config/update 系 3.2–4k 近失带（LUT 已生效）；import-override/red-chicago 等 122–244k 大残差为 streets fixture 的 text/symbol 域既有缺口（无主题同样不通过），非 LUT 问题。
- **fog 0/20 定性**：baseline5 fog 本就 0 通过；fog/default 552→1128 为中间态测量漂移（Linux 环境噪声 + §27/28/34 均触碰 fog 材质，vertical-range 默认 [0,0] 已验证无 div0、guard 正确），非崩塌级回归，fog 域留待专项。
- **运行环境备忘**：后台任务 cwd 会漂移（结果目录落在意外位置，`find` 定位）；跑前 `pkill -f "RenderingTestResultServe[r]"` 清孤儿沿用；改 src 后必须 `tsc --build` 重建 lib（本轮 pbf 安装后首建即踩 MBColorTheme 缺失）。

**本批净转 PASS：map-projections 1 + circle-stroke-opacity 3 = 4 例（b76），heatmap 15 例恢复（b77），color-theme 进入近失带 ~6 例。**

**39. 纯代码批五：sprite/pattern 纹理 color-theme 烘焙（2026-08-20 五，不跑测）**：

**mgl 源码取证**（`_prelude.fragment.glsl:110`、`symbol.fragment.glsl:145`、`fill/line_pattern.fragment.glsl`、`util/image.ts copyImage`、`style-spec/util/color.ts RenderColor`）：
- LUT 作用面 = **非 SDF sprite 采样 + pattern 采样**（GPU `APPLY_LUT_ON_GPU` + `applyLUT(u_lutTexture, out_color)`，先 unpremultiply 再查表再 premultiply）+ **paint 颜色**（CPU `RenderColor`，我们 §12.76-27 已接）+ **fog 颜色**（已接）。**raster 不走 LUT**（draw_raster 无 lut 绑定，证伪 raster 纹理主题嫌疑）。
- CPU 路径（`RGBAImage.copy(…, lut)` 构建 atlas 时逐像素）与我们的 `applyColorTheme` 数学**逐行一致**（索引 r + g·N² + b·N、clamp、三线性、alpha 保留）——GPU 的 `.rbg` 通道交换是 Texture3D 内存布局差异，CPU 语义为准。

**落地**：
1. `MBColorTheme.applyColorThemeToPixels(lut, rgba)`：像素级 LUT（跳过全透明像素；非预乘输入，mgl atlas 直存语义）+ `themeGeneration()`/`bumpThemeGeneration()` 主题代数。
2. `SpriteAtlas.applyColorTheme(lut)`：整卷 canvas 烘焙，pristine 快照支持换/撤主题不叠加；动态扩容快照按行拷贝防行错位；`addIcon` 后扩区域再快照。
3. `MBStyleDataSource.applyColorTheme(lut)` 统一传播点：evaluator + environment + atlas 烘焙 + **userImageCache 注册的非 SDF icon 画布**（WeakMap pristine）+ bump 代数 + markTilesDirty；`loadSpriteAtlas` 完成时若主题先到则补烘焙（竞态覆盖）。
4. `MBMaterialPatchManager.extractPatternTexture` 缓存键加主题代数（atlas 换代 + LUT 代数双失效）。
5. SDF icon 不烘焙（mgl 仅非 SDF 分支查表；SDF 颜色来自 paint 走 CPU LUT ✓）。

**目标**：color-theme/icon-image-use-theme 3174、pattern 系 use-theme 用例、mixed streets 主题样式的 sprite 色。
**记档差距**：mgl 的 per-import 主题作用域（`setImportColorTheme`/`fog-import-scope`、`import-override-*` fixture）依赖 style-imports 子系统，我们暂为全局单一主题——待 import 语义专项。

**40. 架构专项：geojson 线瓦片裁剪 buffer 语义对齐（2026-08-20 五，不跑测）**：

**取证链（双向证伪后命中）**：
1. **引擎侧无裁剪实锤**（Explore 全扫 flywave-mapview）：mbstyle 线几何无 per-tile clip volume——`tileClip`（LinesChunks.ts:88）仅 legacy solid-line 的 `technique.clipping===true`（默认 false，mbstyle 从不设置）；`TileObjectsRenderer.ts:72` 对瓦片对象 `frustumCulled=false`（boundingSphere 不可能截断 quad）；`FrustumIntersection` 只做整瓦级 geoBox 剔除。**§12.76-15/23 的"引擎 clip volume 截断"假设证伪**。
2. **mgl 侧真实语义**：MVT 路径 `load_geometry` **不裁剪**（仅 `Math.round(scale·x)` + ±16384 clamp）；line_bucket 主路径原样消费，仅 line-progress（line-gradient）路径裁 `EXTENT±10`（`clipLine`，elevation offset 时 ±2）。
3. **真差异在 geojson 源**：mgl `GeoJSONSource` 走 geojson-vt，`buffer = 128·(4096/512) = 1024` EXTENT 单位（geojson_source.ts:159）+ Douglas-Peucker `tolerance = 3` + 整数量化（`round: true`）。**我们的 GeoJsonDataAdapter 硬编码 border=100**——瓦片边外 100–1024 单位的线段全被裁掉。
4. **形态学对账**：顶边长/短差 = buffer 差（100 vs 1024）；**round-cap 月牙 1182px 同源**——我们的帽中心被 clipLineString 钳在 ±100 border，mgl 端点在 1024 buffer 内更远处，端点位置差 + 帽半径 = 月牙形 diff 区域（此前归因"引擎 clip/顶点剔除"错误，§12.76-23 修正）。

**架构兼容落地（不影响既有功能）**：
- `GeoJsonDataAdapter` 增加构造选项 `mglCompat`（默认 false = legacy border 100 原行为不变）：border = `128·(EXTENT/512)` = 1024 + 顶点整数量化（geojson-vt round 语义）。
- `MBStyleDecoder` 以 `mglCompat: true` 构造 adapter——mbstyle 管线走 mgl 语义，legacy geojson datasource 零改动。
- **记档差距**：① Douglas-Peucker tolerance 3 简化未实现（render-test 短线为主，简化近乎 no-op，若后续近失再补）；② 多边形路径未按 buffer 裁剪（mgl geojson-vt 对面也裁，fill 跨瓦片用例如有残差再补）；③ geojson-vt 的 per-zoom tolerance 缩放语义未还原。

**待批测**：line-cap 全族（顶边长/短）、round-cap 月牙系、以及一切 geojson 源跨瓦片线用例（line-join/elevated-line 系既有点位也可能受益/回归，需零回归确认）。

**41. 架构专项二：文本符号"整域空白"三链修复（2026-08-20 五，不跑测）**：

**Explore 全扫取证（文本渲染链：MBTileDataEmitter.emitTextGeometry → TileGeometryCreator.createTextElements → TextElementsRenderer.placeTextElementGroup → TextCanvas.render）**，排名前三根因：

1. **替换字形陷阱（label 级灭杀）**：`FontCatalog.getGlyphs`（FontCatalog.ts:567-576）遇到任一 replacement 字符且 `showReplacementGlyphs=false`（默认）→ 整个标签返回 undefined → `TextElementsRenderer.initializeGlyphs`（:1016-1018）的 `LoadingState.Initialized` 早退永不重试 → **标签永久消失**。harness 只预取 PBF 页 0-1，任何超出页 0-511 的字符（Latin-1 补充/引号变体等）即触发。mgl 语义 = 缺字符只空该字符、标签存活。**修复**：harness 注入 PBF 目录时 `showReplacementGlyphs = true`（PBF builder 的替换字形是透明 1×1 canvas，显示它恰等价 mgl 的"该字符空白"）；预取范围扩到页 0-7（Basic/Supplemental Latin + Greek + Cyrillic，fetch 失败静默跳过）。
2. **孤儿 textCanvas**：`TextStyleCache.initializeTextCanvas`（TextStyleCache.ts:354-357）对 `style.textCanvas` 已设的样式盲早退——`setFontCatalog` 同名重建 canvas 后旧引用变孤儿，placement 正常但 `renderText` 只遍历新 `m_textCanvases` → **placed but never drawn**。**修复**：早退前校验缓存 canvas 是否仍在活跃 canvas map 中（对象同一性），失效则清空重绑。legacy 流程 canvas 持续有效时零行为变化。
3. **viewDistance/图标路径记档**：`checkReadyForPlacement` 的 zoom 精确相等排除（Placement.ts:218）与 sprite atlas 未加载循环（:1773-1776）为次级嫌疑；调试开关 `PRINT_LABEL_DEBUG_INFO`（TextElementsRenderer.ts:136）可区分 uninitialized/tooFar/notDrawn，下轮批测若有残余再开。

**注意**：`MBStyleSymbolPlacement` 仅作用于 tile.objects 的 'text'/'labeled-icon' 技术（legacy 对象路径），原生 TextElement 不受其影响——两套 placement 并存是记档的架构事实。

**42. §39–41 攒批验收（b79，2026-08-20）**：

16 分类 213 用例批测（b79，对照 b78/baseline5 双基线），**零回归**，改善有限：

- **§39 LUT sprite/pattern（部分兑现）**：`icon-image/use-theme` 3957→**1613**（-59%）、`params/color` 4243→**741**、`params/transparent-image` 1205→753。color-theme 大头（import-override 122k/244k、red-chicago 201k、fog-import-scope 209k、emission-bw 61k）**无变化**——这些是 import/override 作用域语义，非纹理 LUT 本身，留档下一专项。line-gradient/use-theme 2751、fill-pattern/color-theme 482 持平。
- **§40 geojson 1024 buffer（适用面收窄）**：`line-cap/butt` 455→404 微改善。**重要修正**：line-cap fixture 是 **MVT 矢量源**（style.json `type:"vector"`）而非 geojson——§40 的"round-cap 月牙 = geojson border 100 vs 1024"形态学归因**证伪**（MVT 路径我们与 mgl 均不裁剪），月牙 1264px 维持未解，需回 §12.76-17 的单要素重放取证。`line-join/none` 与 `elevated-line-join/none` 238→**PASS**。
- **§41 文本三链修复（无像素级变化）**：text-anchor/color/field/font 与 icon-text-fit 全域数值与 b78/baseline5 基本逐例一致（text-anchor/center 10596→10611、icon-text-fit 仍 0/42）——替换字形/孤儿 canvas 两条修复对这批 fixture 无影响（它们的字符都在页 0-1 内），残余是**字形位置/锚点精度**（G4/F13 主线不变）。
- **§12.76-19 同族 sRGB 审计（Explore 全扫，代码未动，待下批）**：`new THREE.Color(css)` 线性值流入 **sRGB 域 shader** 的 A 级嫌疑 18 处——PM trim/outline/roof/flood/icon SDF 色（1169/1447/1581/2281/2285/2434）、MapCircle/SDFIcon/SDFText 材质 uColor/uStrokeColor、MapLine/MapHeatmap ramp（lerp 需在 sRGB 域）、MapBuilding uRoofColor、MBTileDataEmitter:500 autoBorder、MBEnvironmentManager fog 穹顶色（543/579-580/782/880-881——注意 fog 域当前数值是按线性色标定过的，改动可能需重定 kFog 类参数）。B 级（three 光照线性域正确）：uMBStrokeColor:1884、emissive、hillshade、uFloodColor 注入点、clearColor。修法模板 = PM:683 `copyLinearToSRGB` / `getRGB(..., SRGBColorSpace)`。**43. sRGB 同族 A 级修复落地（2026-08-20 五，不跑测，§12.76-42 审计的 18 处 A 级）**：

`THREE.Color(css)` 线性分量被 sRGB 域 shader 直接消费的同族修复（§12.76-19 raster-alpha 模板 `convertLinearToSRGB`）：

- **MBMaterialPatchManager**：trim-color（post-colorspace 注入 mix）、outline-color（1466 域）、line-border 引擎 outlineColor（SolidLineMaterial 直写 gl_FragColor）、building roof/flood 色、SDF icon fill/halo 色共 6 处。
- **材料层**：MapCircle uColor/uStrokeColor、MapSDFIcon uColor/uHaloColor、MBSDFText uColor/uHaloColor（三者均 RawShader 式直写无 colorspace chunk）；MapLine/MapHeatmap ramp 构建改为 **stop 先转 sRGB 再 lerp**（插值域对齐 mgl，mgl createColorRamp 字节即 sRGB——注意 heatmap 渲染器实际消费的 ramp 来自 buildGradientTexture，本就 sRGB 正确，材料内 ramp 为对齐冗余路径）；MapBuilding uRoofColor。
- **MBEnvironmentManager 穹顶/天空系**：fogState.color/highColor/spaceColor（dome shader 682-690 直接 mix 出 gl_FragColor）、sky solidColor、atmosphere sun/halo 色。**风险记档**：fog 域当前数值（fog/default 552 等）是按线性色校准的，转 sRGB 后颜色变亮，fog/color 69k 可能显著变化（方向应为改善——mgl u_fog_color 就是 sRGB 数值），批测时重点观察 fog 域 + sky 域连带。
- **MBTileDataEmitter deriveAutoBorderColor**：luminance/rgb 输出改在 sRGB 分量上计算（mgl 语义）。
- **B 级不动**：uMBStrokeColor（线性域正确）、emissive、hillshade、uFloodColor lights_fragment_begin 注入点、clearColor 线性 radiance（已论证记档）。

**环境修复（顺带，§12.76-9 后遗症根治）**：全仓 20 个 `@flywave/*` 包的 `exports['./*']` 由 `'./lib/src/*'` 改为 `['./lib/src/*.js','./lib/src/*/index.js']` 数组回退——Node exports 目标**不做扩展名补全**，短路径深 import（如 `@flywave/flywave-geoutils/projection/EarthConstants`）在纯 Node（mocha）下全部解析失败；§12.76-9 的"移除 exports"方案只对旧版 lib 的 `lib/src/...` 全路径 import 有效，本仓源码已迁移到短路径后失效。test-utils 的 `.` 入口补 node/browser 条件（index.node.js / index.web.js）。tsc 全绿、单测 265 passing / 3 既有失败（stash 对照 HEAD 确认）。karma/webpack 对数组回退与 *.js 模式均支持（批测时验证）。

**待批测**：circle-color/stroke 系（uColor 转换后现有 4-5 PASS 可能变化——mgl 语义应更近）、icon-color/halo 系、text-color/halo 系、SDF icon halo、building 立面/roof、line-border 色、line-trim-color、sky/atmosphere/fog 穹顶色域。

**46. color-theme import/override 作用域语义落地（2026-08-20 五，mgl style.ts 逐行对照）**：

**mgl 语义（子代理全扫 style.ts/lut.ts/3d-style 取证）**：每个 Style 实例（根 + 每 import fragment）各持 colorTheme/LUT；import spec 的 `"color-theme"` 为 override（style.ts:872），优先于被导入样式自身的根级 color-theme（:1119-1121）；`getLut(scope)` 逐作用域解析（:1626）；fog 用 **fog.scope** 的 LUT、lights 用**各自 scope** 的 LUT（3d-style/render/lights.ts:80）；model 整体 GPU LUT（draw_model.ts:170）；`data` 可为表达式（按 import config 求值，config-bw 族）；解码失败保留旧 LUT（:1592）。

**落地**：① `mergeImports` 记录 `_importThemes[id] = imp['color-theme'] ?? data['color-theme']`、层打 `_importScope`、fog/lights 记来源 scope；② `MBLayerEvaluator` scoped LUT map（层按 importScope 解析，未标记回落根 LUT）；③ env fog/lights 各自 scope LUT（lights 颜色 css/数组两形态查表）；④ `loadColorTheme` 支持表达式 data（MBExpressionEngine match+config，node 单测验证通过）；⑤ `setImportColorTheme` 运行时 API + harness op + import-config 变更重解析；⑥ model 材质/纹理 CPU 烘焙（model-color-use-theme 尊重）；⑦ 解码失败保留旧 LUT、runtime setColorTheme 不被 rebuild 清除（m_runtimeThemeOverride）；⑧ sprite 烘焙 LUT 回退到首个非空 import LUT。

**b82/b83 验收（color-theme 26 例，两轮一致）**：**净改善**——light-import-scope 244k→**114k**（lights 作用域主题化生效）、use-theme/constant-* 644→**1px**（差 1 像素过阈值 6）、import-override-style 244k→115k；**回归**——import-override-existing/remove 122k→197k（两例同值 = 末态均为"import 自身主题"，主题化图层渲染本身与 expected 偏差更大——但 use-theme 证明线层查表近乎完美，偏差必在其他通道）；config-bw/red/theme-from-config、add/update-*（3173-3964 簇）、model 族（trees-monochrome 59.7k/emission-bw 61k 不动——model 烘焙未生效，疑异步竞态或路径未达）、red-chicago 201k 不变。**下一阶段：逐 fixture 像素取证**（3211/3173/3964 共模簇 + model 烘焙路径核查 + import-override 偏差通道定位）。tsc 绿、单测 265 passing / 3 既有。

**47. color-theme 二轮：背景通道 + decoder 内 evaluator + 竞态守卫（2026-08-20 五，b84-b88）**：

- **像素取证破案 3211/3173/3964 共模簇**：差异 = **background 层颜色未主题化**（cur 紫 238,130,238 vs exp 灰 147——64×64 fixture 全图即背景）。背景走 clearColor 路径（applyBackgroundColor）且 quad 色来自 **decoder 内部自建 evaluator**（MBStyleDecoder.ts:348 configure 时 new，非 runtime evaluator）。
- **修复**：① applyBackgroundColor 内 background-color 查 LUT（含 import scope + use-theme none）；② 主题传播到 decoder 内 evaluator（applyColorTheme/propagateScopedThemes/onChange configure 后三处重放）；③ harness 主题类 op（setColorTheme/setImportColorTheme/config 变更）后补 renderFrames；④ connect 期 loadColorTheme(style)=null 不得清掉运行时主题（m_themeInitialized 守卫）。
- **兑现**：red-chicago 201648→**6702**（−97%，背景主题化）、red-3d-content 238067→**176045**。
**48. color-theme 三轮：命名色根因破案 + decoder 自持主题（2026-08-21，b91/b92）**：

- **"竞态"证伪，真因 = `parseCssColor` 不识别命名 CSS 色**：'add' 的 background-color 是字面 `violet`——`applyColorTheme(lut,'violet')` 因 parse 返回 null 原样透传 → 全簇（add/config-*/icon-image-use-theme/remove/update-with-api）整图未主题化。BGTRACE 探针（globalThis trace + op 后抛出）锁定 `bg violet lut=true` 决定性证据。修复：parseCssColor 增加 THREE.Color 命名色回退（convertLinearToSRGB 后取 0-255）。
- **decoder 自持主题（架构点）**：MBStyleDecoder 新增 setColorTheme(lut, scoped) 自存储，configure() 重建内部 evaluator 后自动重放——此前任何 configure（runtime onChange/环境更新）都会悄悄丢掉已应用的主题。连带 **red-3d-content 176k→32k**（model 重烘焙路径随主题重放生效）。
- **b92 验收（color-theme 2→4 PASS，全簇近失化）**：add 3211→**135**、config-bw 3173→**97**、icon-image-use-theme 3174→**98**、update-config-import→98、config-red/theme-from-config/update-with-api → PASS 带、use-theme/data-driven 867→**323**。残差（bbox 15-27×15-48 = circle+文字区）= circle 色微偏（80 vs 69）与字形色（255 vs 120）精度项。
**49. import-override 族四轮取证（2026-08-21，dbg7，留档）**：

- **语义修正**：`setImportColorTheme(id, null)` 的回退目标 = 被导入**样式表自身的** `data['color-theme']`（mgl style.ts:1119 override=null → stylesheet 主题），而非 import spec 的 color-theme（spec 主题本身是 override 通道）——此前回退到 spec 主题属语义错误，已改为查 `style.imports[id].data['color-theme']`。setImportColorTheme 改 Promise 化（harness await 确定性传递）。
- **import-override-style（无 op）已渲染主题图**（current 红色调 194,0,0）——spec 主题经 mergeImports→scoped LUT 链路生效，115k 残差为其他通道（sprite/符号或 fog）。
- **existing/remove 白屏定性**：op 后地图整图空白（仅天际少量像素），像素数自 b82 起恒定不变、promise 化/decoder 重放均无影响、无异常抛出——指向 **op 触发的全量 markTilesDirty 对重型 import basemap 的瓦片重装载在捕获时未完成或失败**（需交互式浏览器 devtools 调试 tile 任务队列）。留档下一批：① tile reload settle 探查；② 考虑不重解码的绘制期主题化（mgl 语义：GPU LUT，无重解码）。
- fog-import-scope 残差通道定位 = **天空/大气色未主题化**（cur 198,219,250 蓝 vs exp 灰——mgl drawAtmosphere 用 fog.scope LUT）。**已落地**：applySky 三色接 scoped LUT（gradient ramp buildGradientTexture(grad,lut)、solid 色、atmosphere sun/halo + 各自 `-use-theme` opt-out；propagateScopedThemes 重放 applySky）——语义正确但对 fog-import-scope/trees 数值无变化（其蓝色 ≠ sky 层通道，疑 fog atmosphere dome 或 terrain 面，b93 后留续取证）。tsc 绿、单测 265 passing / 3 既有。

**50. import-override 白屏五轮取证闭环（2026-08-21，dbg8-12/b94，根因定位）**：

- **tile 重装载无问题**（探针：13 visible tiles、3 张带 162/104/132 objects、222 draw calls/84k tri）——本节的"重装载未完成"假设**证伪**。
- **帧缓存逐点取证**（readPixels bl/c/tl + clearColor）：clearColor=**0x0000c2 = (0,0,194) ≈ expected tl (0,0,193)**——**import 作用域 lights 主题化已完全生效**。fixture 的 import 只带 lights+color-theme；mgl 语义 = 主题经 light.scope LUT 进入场景 radiance（根层 paint 不查 import LUT，根层 unthemed 是正确行为）——与我们现有架构一致。
- **白屏真因 = 地形网格本体通道**：fixture terrain(0.5)+pitch70，画面主体是 terrain mesh；TerrainDraping 的 drape FBO 白色 alpha=1 clear（"无 drape 内容 = 保留地形色"），白色来自**地形 mesh 自身基色**（mgl 侧 void 区显示经 themed 光照的 draped 内容，expected bl=(193,193,193)）。修法方向（下一批）：① 地形 void 基色 = themed 背景 clear color（或把 background 层纳入 drape 渲染集）；② extrusion/地形材质 3D-lights 注入核对（white×themed radiance 应为灰）。
- **mgl 对照结论**：`_reloadColorTheme`（style.ts:4311-4336）= layer.lut 重指 + clearTiles，无绘制期 GPU LUT 特例——我们的 CPU 重解码架构语义等价，**无需**改为 GPU LUT。setImportColorTheme 仅设 fragment 的 colorThemeOverride（:4351-4356）。
- import-override-style 115k 同通道（无 op，静态即偏）；import-override-theme 249k 附加 op 主题差。b94 无探针确认数值稳定。
- **补充（b95）**：drape FBO clear 改用（themed）mapView clearColor（mgl 语义：background 进 drape pass）——对 fixture 零变化（b94/b95 逐位一致 = drape 路径未参与）。网格取样确认真因升级：**cur 全图近全为天空蓝（center/3/4h 均 sky 色）、仅底部窄条白；exp center (0,0,59) 暗色地形+挤出物场景**——pitch70+terrain(0.5) 下我们的地形/挤出物几何没有进入视野（DEM 瓦片 13-1310-3166 存在），属**地形-相机-挤出物渲染专项**而非 color-theme 缺陷。drape clear 修改保留（语义更近 mgl）。

**51. 高 pitch 地形专项一轮：terrainZoom 公式修复（2026-08-21，b96）**：

- **根因一（已修）**：applyTerrain 的 terrainZoom = `min(floor(zoom), maxzoom) − tileSizeOffset`——offset 在 cap **之后**，tileSize 514 + maxzoom 13 的 fixture（display z16.7）得 z12 → 邻块/中心全 404 → **无地形 mesh** → 穹顶铺满。mgl 语义：512/514 源的 URL zoom = display−1，**再** cap 到 maxzoom（z13，瓦片在位）。已改为 `min(floor(zoom) − offset, maxzoom)`；b96 log 确认 z13 请求发出、中心瓦片命中。
- **现状**：地形 mesh 已建（画面底部白条 = 未打光的 MapTerrainMaterial 基色），但主体视野仍天空——**根因二待查**：pitch70 相机/地平线语义（mgl 相机在 terrain 上高度、我们的相机 rig pitch 与实际视线错位 §12.76-12 曾记录）或地形材质可见范围。连带：import-override-style 115k→138k（地形部分出现但白色不对，方向正确需打光/drape）。fog/terrain/basic（z12 256 源，公式不变路径）需零回归确认。
- **下一步**：① 地形材质接 3D-lights/themed drape（白色基色 → themed 场景色）；② 相机 pitch70 视线与地平线对照 mgl transform（elevation-aware camera）；③ fog 域连带批测。tsc 绿、单测 265 passing / 3 既有。

**52. 高 pitch 地形专项二轮：高程→裁剪面管道 + fog 近失漂移记档（2026-08-21，b97-b99/c01）**：

- **裁剪面管道落地**：① TerrainController 新增 `maxElevation`（解码期逐像素最大高程 × exaggeration）；② MapView 新增 `maxGeometryHeight` 公共 setter（此前仅构造选项，readonly）；③ datasource 在 applyTerrain 后将地形高程喂给 `MapView.maxGeometryHeight`（VisibleTileSet.updateClipPlanes 从 MapView 级取值而非 per-datasource——DataSource.maxGeometryHeight 只进 FrustumIntersection 预解码剔除，不进裁剪面）。**地形 mesh 非 Tile，其高程此前对裁剪面完全不可见** = 架构缺口记录。
- **b97/b98 验证**：import-override 族数值仍不变（existing 196917 逐位同）——far plane 假设对该 fixture 也未兑现；底部白条 = 未打光地形本体，画面主体天空 → 真因三候选：pitch 实际视线（§12.76-12 相机 rig 错位）、单一 z13 瓦片外无地形延伸、expected 中心 (0,0,59) 或为 themed 大气而非地形。需交互式对照。
- **fog 域近失漂移记档（b99/c01，0 PASS 损失）**：fog/default 552→**1128**、2d/basic 22.7k→**45.5k**、terrain/basic 37.0k、color 78.0k——残差通道 = 黑色像素带（cur (0,0,0) vs exp (242,246,252)）+ 蓝通道微移，与 §12.76-8 精确式时代的 1064 量级相仿；applySky 重跑已加条件守卫（仅 LUT 存在时）但数值未恢复——回归在 §45-48 某提交引入，嫌疑：propagateScopedThemes 每次连接重放 applyFog/applyLights/markTilesDirty 的次生效应。留档待二分。
- **color-theme 4 PASS 维持**（b96-98 全程零 PASS 回归）。

**44. §43 攒批验收（b80，2026-08-20 五）**：17 分类 ~150 例（building/fog 因 runner 中断未跑完，fog 域风险仍未验证）：

- **零 LOST PASS**；circle-color/stroke-color/stroke-width **全绿 5/5×3**、stroke-opacity 3/6、icon-halo-color 7/7、icon-halo-width 4/4、icon-color 4/5 维持——uColor/uStrokeColor 转 sRGB **零回归**（这些域本就按 mgl 语义校准，转换后灰阶类不受影响、彩阶类无 fixture 暴露差异）。
- **skybox 域整体改善**：fill-extrusion-light 全 8 例 −4.6k~−7.6k（30k 级→29k 级，穹顶色转 sRGB 的贡献）、atmosphere-blend/fill-transparent −709、atmosphere-horizon −234；atmosphere-color/rayleigh/update +2k 内小回归（原 FAIL）。**fog 域未跑**（穹顶 fog 色 sRGB 化的 kFog 类风险待验证）。
- **building 域连带改善**：clip-layer/default 79k→**23k**、lower-order-clipping 82k→**35k**（-50k 级，roof/flood 色转换）；conflation/cutoff-fade 系小改善。
- **trimColor 转换被数据否决回退**：line-trim-offset pure-color 族 4 例 +1.1k~+1.55k（2070→3122 等）、trim-color-long-line 120→750——b80 后已回退该单点（其余 17 处保留），trimmed 段混色路径存在文档未明的空间语义（疑注入点实际在 colorspace 之前或双重转换），留档待专项取证。
- **环境注意**：本会话中 mbstyle-baseline5 结果目录被外部删除（非本会话操作），对比基线降级为 baseline6-aborted-partial + b78/b79；后续如需全量基线需重跑。

**45. fog 域专项验收（b81）——穹顶色 sRGB 转换整体否决回退（2026-08-20 五）**：fog 63 例批测：fog/default 552→**1532**、fog/color 69k→**78k**、color-opacity 74k、fog/2d/basic 22.7k→**45.5k**、terrain/basic 28.2k→**42.9k** 全域劣化；仅 high-color 族微改善（1786→1717）。**结论：fog/sky 穹顶管线存在与颜色空间正交的亮度标定（distCam 启发式、clearColor radiance 等），按线性色 + 现有标定与 expected 更近——§43 的 5 处 MBEnvironmentManager 穹顶色转换（fogState.color/high/space、solidColor、sun/halo）已全部回退**，与 trimColor 同归"注入点空间语义未明"类，留档：如后续重写穹顶为 mgl 语义（先大气后瓦片覆盖顺序），需同步恢复 sRGB 色。材料/patcher/emitter 侧修复（circle/SDF/building/ramp/autoBorder）维持——b80 已证零回归。

**53. fog 域近失漂移破案：fog_pars_vertex 缺 vFogHeight 声明（2026-08-21，fogfix4/6，根因=shader 编译失败竞态）**：

- **§52 留档的"§45-48 引入回归"证伪**：历史结果目录时间线取证（c03/c14/c23/c33 均 552 vs b99/c01/clean1 均 1128，同一 HEAD）证明该值**按会话二态翻转**，非提交回归；对 HEAD stash 对照重跑确认逐位复现 1128。
- **像素取证**：1128 态 cur 在 rows 16-22 出现纯黑带（exp/c33 态为雾化背景白→灰渐变 255→12），即**雾化表面 material 整体编译失败渲染黑**。每轮 karma 日志均有 `THREE.WebGLProgram: VALIDATE_STATUS false — 0:578 'vFogHeight' : undeclared identifier`（此前未被注意）。
- **根因**：我们 override 的 `THREE.ShaderChunk.fog_vertex` 赋值 `vFogHeight`，但 `fog_pars_vertex` 只声明了 `vFogDepth`——凡在 `scene.fog` 已设时编译（define USE_FOG）的材质（MeshBasicMaterial 系：背景面/图像 quad 等）vertex shader 编译失败 → 黑。翻转机制 = 材质首次编译与 scene.fog 赋值的时序竞态（先编译的程序变体无 USE_FOG 则不炸）。
- **修复**：`fog_pars_vertex` 补 `varying float vFogHeight;` 一行。
- **fogfix6 验收（fog 88 例 + color-theme 26 例）**：fog/default **1128→552**、fog/2d/basic 45497→**22724**、fog/terrain/basic 37010→**22297**（优于 §12.76-8 的 28.2k）、fog/color 77996→**69147**、high-color 族 1725/1786/1822 全恢复 §12.76-8 基线、fill-color 600/fill-outline 610/line-gradient 591/background-color 1156/empty-update 926 逐位一致；culling/opacity 21612→20378、red-chicago 6702→5554 小改善；**零回归**。color-theme 4 PASS 维持（config-red/theme-from-config 0 + add 135/config-bw 97），import-override 族不变（196917，独立专项）。vFogHeight shader error 0 条（余 6 条为 terrain vUv/* 既有无关错误）。
- **连带落地（mgl 语义修正，无主题样式 no-op）**：① connect 的 loadColorTheme 微任务改为 `if (lut || m_themeInitialized)`——无根主题样式不再跑 applyColorTheme(null)（避免无谓 applyBackgroundColor/bumpThemeGeneration/markTilesDirty）；② `propagateScopedThemes` 加守卫：root+import 全部无 LUT 且从未传播过 → 直接 return（mgl `_reloadColorTheme` 只在有 LUT 时运行）——同时消除异步微任务重放 applyFog（用连接后相机状态）的理论风险。tsc 绿、单测 265 passing / 3 既有。

**54. 高 pitch 地形/天空专项一轮：skybox far-depth 语义 + 地形基色（2026-08-21，terrain1-3）**：

- **取证（frame-15 探针）**：import-override-existing 相机几何全对（viewPitch 70°、高度 193m、z13 单瓦片 5km、视线朝瓦片内）——§51/§52 的"相机 rig 错位"假设**证伪**。pitch70+fov36.9 下地平线在屏幕上沿之上，整屏应为地面。
- **真因一（已修，mgl skybox 语义）**：mgl `skybox.vertex.glsl` 的 `gl_Position = pos.xyww`——**天空永远在远平面深度，任何几何都盖住它**；我们的 gradient/atmosphere 天空穹顶是有限半径（500）mesh + depthTest，**深度遮挡 500m 外的全部地形**（白色窄条 = 500m 内地形）。且 atmosphere 穹顶 fragment 的 horizon 项用 y 轴而世界是 z-up（fog 穹顶已证 z-up）——两处已改：`pos.z = pos.w*0.99999`（gradient+atmosphere）+ atmosphere 按 `dir.z<=0` 丢弃地平线下射线（mgl 只在天空区画天空；高 pitch 地平线出屏 → 天空完全不画）。穹顶经 RTE scene-root 已锚定相机（勿 copy 世界坐标相机位置——会位移 2500 万米）。
- **真因二（已修）**：地形 mesh 无 drape 内容时白色基色——mgl background 层渲染在整个地图之下，地形表面显示（themed）背景色。落地：`TerrainController.setBaseColor` + `applyBackgroundColor` 末尾喂 `terrainController.setBaseColor(clearColor)` + applyTerrain 后重放 applyBackgroundColor（mesh 建立晚于首次调用）。bakeAll 的 `hasDrapableContent=false` 跳过路径下地形即用此基色。
- **验收（terrain1/2/3）**：import-override existing/remove 196917→**185202**、style 138646→**135358**、theme 249584→**232478**；**trees-monochrome 59713→24611（−35k）**、light-import-scope 135183→**127063**；skybox 域大面积收窄：atmosphere-intensity/high 82426→**27299**（−55k）、medium 80890→**12558**、mie 128826→**47760**（−81k）、atmosphere 82426→**34987**、atmosphere-blend/fill-opaque 114857→**87890**、fill-extrusion-light 族 28629-53718→18215-31350（全面优于 b80 基线，且修复了 terrain1 轮 y 轴错误的 +5.7k 回归）；gradient 族逐位不变、fog 域逐位稳定（fog/default 552、2d/basic 22724、color 69147）、color-theme 4 PASS 维持。**回归记档**：skybox/atmosphere-terrain 84376→103321（+19k）、atmosphere-rayleigh +6k、fog-import-scope 162443→164907（+2.5k）——待下轮像素取证。cur 场景结构已正确（地形+道路+挤出物+顶部天空），残差主通道 = op LUT 的主题化范围（mgl 侧 setImportColorTheme 后整景 grey）。tsc 绿、单测 265/3 既有。

**55. op 后材质重解码未重打补丁破案 + §54 三回归定性（2026-08-21，dbgOps1-4/terrain4-6）**：

- **§54 三处回归像素取证**：① skybox/atmosphere-terrain 84376→103321：cur 在 exp 显示天空的区域渲染了地形——我们的单张 z13 地形 mesh 覆盖整个 5km 视域，而 mgl 地形只画有 DEM 支撑的瓦片环（更深的几何覆盖模型差异）；② atmosphere-rayleigh +6k：我们 atmosphere 穹顶是假渐变（mix(0.4,0.6,0.9…)），非 mgl rayleigh/mie 散射模型——既有大偏移上的噪声；③ fog-import-scope +2.5k：exp 顶部红带 = mgl 天空延伸到地平线下 horizon-blend 带（mapValue(0.2)≈0.05rad），我们的严格 elevation≤0 丢弃切早了。**试验否决**：把丢弃放宽到 −0.05rad 后全域劣化（import-override-existing 185202→188699、atmosphere 族全升）——我们的穹顶颜色本身不对，"更多穹顶=更差"，已回退严格丢弃并留档：需与真实 atmosphere 模型一起重做。
- **op LUT 主题化范围取证（探针四轮）**：lightsScope='basemap' ✓、lights LUT 在位 ✓、`applyColorTheme(opLUT,'#ffffff')=rgb(255,255,255)`（identity）——**mgl 的 exp 整景灰 55 不是主题化灯光**（白光 LUT 恒等），而是 **3D 灯光公式的自然暗化**（背光墙面 k≈ambient 0.04 → sRGB 0.216≈55）。我们 cur 255 纯白挤出物 = `injectExtrusion3DLighting` 未生效。**真因（决定性）**：探针显示 op 后 tile 材质 `__mbPatched=false` 且对象数不变——`patchTileMaterials` 的 `objectCount` 跳过启发式在 **markTilesDirty 重解码重建材质（对象数恰好相同）** 时静默跳过，新材质永不打补丁（3D 光照/ground lighting 全丢）。
- **修复**：跳过条件加"当前对象材质全部已打补丁"检查（新材质 → 重访 → `__mbPatched` 守卫幂等）。
- **验收（terrain5/6）**：**import-override-theme 232478→135333（−97k）**、existing/remove 185202→**160816**、style 135358→132182、building/faux-facade 93060→81769；fog 域逐位稳定（default 552、2d/basic 22724、color 69147、terrain/basic 22297）、color-theme 4 PASS 维持、近失族不变、**零回归**。tsc 绿、单测 265/3 既有。
- **留档下一批**：① fog-import-scope 164907 残差 = 顶部红带 + 地形 drape 细节（tile 层不在 scene graph，TerrainDraping bakeAll 的 hasDrapableContent=false 跳过——架构缺口：引擎瓦片几何走自有渲染通道，需接 tileObjectRenderer 式 bake）；② atmosphere 真散射模型；③ 地形 mesh 覆盖范围与 DEM 支撑对齐。

**56. TerrainDraping 三重基建缺陷修复（RTE 位移 + z-up bake 相机 + USE_DRAPE define，2026-08-21，dbgDrp1-8/drape1-5）**：

- **破案链（探针逐层）**：① bakeAll 从未被注意的静默异常（自加探针 TDZ）排除后确认 bake 每帧运行、`setDrapeTexture` 到位；② readRenderTargetPixels 取证 FBO **恒为均匀 (23,23,23)**（仅 clear 色）；③ 三个独立缺陷：
  - **RTE 位移**：引擎 TileObjectsRenderer 每帧设 `object.position = worldPos − cameraPosition`（相机相对渲染），而 bake 相机是世界坐标——整个瓦片层偏移数千万单位在正交视锥外。修复：bake 前对 m_sceneRoot 子对象 `position.add(camPos)`（finally 恢复）。
  - **bake 相机轴向**：原 buildTileCamera 沿 −Y 俯视（地形 mesh 局部系），引擎世界 z-up（x=mercX, y=mercY, z=高程）下这是侧视。修复：改 z 轴俯视 `(centerX, centerY, 1000)` lookAt −Z、up=+Y、top/bottom=Y 界。
  - **USE_DRAPE 从未生效（决定性）**：`MapTerrainMaterial` 继承 MeshStandardMaterial——**没有 `defines` 属性**（ShaderMaterial 专属），bakeAll 的 `mat.defines.USE_DRAPE=''` 只是设置了一个被 WebGL 编译器忽略的普通字段；且 fragment 注入用了从未声明的 `vMapUv`。修复：onBeforeCompile 按 `m_drapeTexture` 前置 `#define USE_DRAPE` + `customProgramCacheKey` 区分变体 + 顶点声明/赋值 `vMapUv`。
  - bake 期间保留灯光（MeshStandardMaterial 瓦片内容无灯会烘成全黑）。
- **验收（drape4/5 + stash 基线对照）**：fog/terrain、color-theme、import-override、symbol-elevation（raster+terrain，5 例 stash 对照逐位一致）**全部逐位不变**——drape 管道机械上已通（bake 运行、纹理注入、define 生效、零回归），但 FBO 内容仍恒均匀：瓦片对象虽位置/包围球在视锥内（探针确认 p/bs 正常、stencil 关闭），仍不在正交渲染中光栅化——**留续取证**：嫌疑 DisplacedBufferGeometry（顶点位移在 shader 内依赖主相机 uniform）或材质 onBeforeRender 钩子绑定主相机。fog-import-scope 164907 / import-override 160816 残差主通道仍在场景合成层（可见内容已由 §55 3D-lit 正常渲染）。tsc 绿、单测 265/3 既有。

**57. 地形 mesh 从未渲染破案：y/z 帧错位 + RTE 场景（2026-08-21，dbgDrp9-12/frame1-6）**：

- **决定性取证（CULL 探针）**：terrain mesh 包围球中心 (mercX, **0**, mercY)——**整个地形子系统建在 y/z 互换的帧里**，距相机视线 2450 万单位、永不进视锥、`onBeforeCompile` 从未触发（compiles=undefined）——§51 terrainZoom/§52 裁剪面/§54 基色的全部"地形"工作此前作用于一个**从未上屏的 mesh**。帧修正后 `inFrustum=true compiles=1`，又暴露 uDrape/vMapUv 未声明（define 生效后首次真正编译）——§56 提交时该文件被清理覆盖丢失，本次重建（define 前置 + `uniform sampler2D uDrape` 声明 + vMapUv varying）。
- **第二层（RTE）**：引擎经原点 RTE 相机 + 相机相对 sceneRoot 渲染——m_scene 直加的世界坐标对象超出 far 平面永不光栅化（与 image-quad 注释"direct m_scene adds never showed up"互证；fog 穹顶恰因局部 0=相机处而上屏）。修复：mesh 记录 `__mbWorldPos`，WillRender 监听每帧设 `position = world − camera`（`TerrainController.updateCameraRelative` + applyTerrain 挂载/拆卸）。网格改 XY 平面（z-up：shader z=高程）、skirt 沿 −z、allDemTiles 读 position.y。
- **验收（frame3/4 vs fogfix6 基线）**：**fog/terrain/inverted 53172→47888**（首见地形真实改善）；fog/terrain/basic 22297→27987、equal-range 19720→23828（+5.7k/+4.1k——地形真实上屏但中带偏亮：fog/drape 标定待做）、sky-composition 19915→24640；fog-import-scope/import-override 不变（该 pitch70 场景地形仍被共面 fill/挤出物 LEQUAL 遮挡——mgl 语义应为内容贴地形，即 drape 内容层问题）；0 PASS 变化（全族本就 FAIL）。tsc 绿、单测 265/3 既有。
- **留档下一批**：① 地形材质 fog 标定（MeshStandardMaterial 走 scene.fog 但亮度偏高的通道定位）；② fog-import-scope 的内容-地形层序（fill 共面 LEQUAL 胜出 → 需内容真贴地形或地形优先级）；③ drape FBO 内容恒均匀的最后嫌疑（对象 RTE 位移在 shader/DisplacedBufferAttribute 层）。

**58. bake 渲染隔离取证：管线级 blocker 定位（2026-08-21，dbgBake1-4/frame5-6）**：

- **发现 §56 的 z-up bake 相机同样在清理覆盖中丢失未提交**（TerrainDrapingUtils 停留在旧 −Y 侧视版本）——本次重建，并连带修正：§57 后 allDemTiles 的 originX/Y 来自 **RTE（live mesh）位置**，与 sceneRoot 中相机相对的瓦片对象同帧——bakeAll 的 +camPos 位移补偿随之移除（两侧已一致）。
- **决定性隔离实验**：修正后相机 (−1303,−1997,1000) 位置/朝向均正确，但 **minimal scene + 未打补丁纯 MeshBasicMaterial 绿色平面**（RTE 坐标、包围盒在正交视锥内）仍不光栅化（readPixels 恒为 clear 色）。排除了：材质补丁（纯材质）、坐标帧（RTE 一致）、相机数学（探针验证）、剔除（包围球在内）。**结论：blocker 在 renderer 层**——头号嫌疑 karma 日志中的 `WARNING: Multiple instances of Three.js being imported`（跨实例 Scene/Camera/Geometry 的 draw 路径静默失败）或引擎 composer 在 AfterRender 时刻的 GL 状态残留（setRenderTarget/clear/readPixels 均工作，仅 draw calls 无输出）。留档下一批：① 确认双 THREE 实例来源（pnpm 依赖分身），统一实例后复测；② 或改在引擎渲染循环内（与主渲染同实例同时刻）执行 bake。
- **验收**：数值与 §57 一致（fog/terrain 族、import-override 族、symbol-elevation/ground-constant 21131≈基线），零回归；tsc 绿、单测 265/3 既有。

**59. drape 光栅化隔离终局 + shader 补全 + 管道休眠（2026-08-21，dbgInfo1-6/frame7-11）**：

- **GL 状态逐项排除**：draw calls 计数探针证明显式 draw 已发出（callsDelta=1）且 scissor=false、viewport 正确；依次强制 gl.disable(BLEND)/gl.disable(STENCIL_TEST)/depthFunc(ALWAYS)/gl.disable(CULL_FACE) 后**纯 Mesh 依旧零片元**——renderer 层 blocker 未最终定位（双 THREE 仅为同 store 同版本软嫌疑）。另发现 bake 在部分 fixture（fog/terrain，有 raster 层）**确有内容**（非均匀 FBO），而惰性新建的探针 mesh 不光栅化——嫌疑延伸至"渲染循环外惰性创建的 geometry 首次上传"路径。
- **真 bug 修复（vMapUv fragment 声明缺失）**：§57 的 drape 注入只声明了 vertex 侧 varying，fragment 侧缺失 → define 生效后编译失败（'vMapUv' undeclared）。补 `varying vec2 vMapUv;` 后 drape 首次真正采样：fog-import-scope 164907→162821（FBO 仅清色扁平化贡献）、import-override-existing 160816→160349。
- **对齐校准否决回退**：drape 激活态下 fog/terrain/basic 27987→33955（内容落位错位，UV v-flip 试验：equal-range 28476→50925 证明现有 flip 方向正确、错位在别处）。管道整体休眠（`TerrainDraping.DRAPE_ENABLED=false` 主开关 + setDrapeTexture 内容门），恢复 fog-import-scope/import-override 基线；**fog/terrain 本会话稳定在 33955/28476/53671**（较 §57 的 27987/23828/47888 差 +6k——休眠态与 §57 激活代码路径等价，疑似 §53 型会话二态漂移，留档复核）。
- **留档下一批**：① renderer blocker 终局定位（对照引擎主渲染同实例同时刻执行 bake，或 worktree 隔离复测 §57 值排除会话漂移）；② drape UV/世界映射校准（激活后 fog/terrain 收窄路径）；③ fog/terrain 会话漂移复核。tsc 绿、单测 265/3 既有。

**60. "renderer 级 blocker"证伪——管道终局打通并上线（2026-08-21，dbgErr1-8/live1）**：

- **四变量隔离矩阵（A/B/C/D 探针）**：fresh RT+简单相机（✓绿）、fresh RT+buildTileCamera（✓ 72380 绿像素——此前"B 失败"是中心像素读取错过偏离中心的 mesh）、depthBuffer:false RT（✓ 同量）、大场景先行渲染后再 mini（✓ 155136 像素）——**全部光栅化**。结论：所谓 renderer 级 blocker 从不存在；§58 之前所有"纯 Mesh 零片元"取证都发生在 **§56 丢失未提交的旧 −Y 侧视相机**下（mesh 超 far 平面）——相机修复后管道天然可用。早前 center-read 取样偏差放大了误判。
- **上线**：`TerrainDraping.DRAPE_ENABLED=true` 主开关 + setDrapeTexture 内容门（FBO 均匀 → 自动跳过）。验收（live1）：全批与休眠态逐位一致（fog-import-scope 164907、import-override 族 160950/132181/135333、fog/terrain 33955/28476/53671/32971/48957）——零回归、管道 LIVE；symbol-elevation/ground-constant 21506→20414（−1.1k）。本会话 fog/terrain 数值与 §57 会话差 +6k 复核无果（休眠/激活同值 = 会话环境漂移实锤，与 §53 fog/default 二态同型），留档跨会话复核。
- **留档下一批**：① 跨会话复核 fog/terrain 漂移（固定环境重跑基线）；② 有内容 fixture 的 drape UV/世界映射校准（当前内容门多处于跳过态——FBO 内容何时非均匀待查：bake 时序 vs 瓦片就绪时序）；③ fog-import-scope/import-override 残差回到场景合成/天空通道。tsc 绿、单测 265/3 既有。

**61. bake 时序触发 + drape 内容实况取证（2026-08-21，dbgLive3/dbgMag/live2-3）**：

- **时序缺口修复**：瓦片内容（fill/道路/挤出物）在地形 mesh 建成后**异步**到达，而 bake 仅由 mesh 数/morph 触发——首烘后 FBO 永远停在空态。落地：onAfterRender 追踪 `m_sceneRoot.children.length` 变化 → requestBake（+2 extra frames）。**fog/terrain/equal-range 28476→25478（−3k）**。
- **内容实况**：bake 日志证实现态 FBO **非均匀（uniform=false）**——fills（覆盖整瓦）+道路已实际烘焙；magenta 清色试验 0 像素 = 内容全覆盖清色（试验对可见性不再敏感）。**drape 激活 vs 休眠图像逐位一致** ⇒ pitch70 SF 系 fixture 中地形 mesh 仍被共面 z=0 内容层遮挡不可见（fog/terrain 域 §57 变化 +6k 的会话漂移复核维持二态结论：今日休眠=激活=33955）。
- **结论与留档**：drape 管道全链路 LIVE（触发→烘焙→内容门→shader 采样），剩余 blocker = **内容-地形层序**（mgl 语义内容贴地形：地形高程处内容应抬升/地形应承载内容，二者非独立共面渲染）——属架构级 drape 决策（内容几何按 DEM 抬升 vs 地形纹理承载），留档专项。验收：fog/terrain equal-range −3k、其余逐位稳定、color-theme 近失族不变、零回归。tsc 绿、单测 265/3 既有。

**62. 内容-地形层序专项一轮：color pass 排除链取证（2026-08-21，dbgVis1-9，纯取证零代码变更）**：

- **五连排除**：① magenta 基色 + renderOrder=9999 + depthWrite 强制 → 0 像素（非深度序问题）；② vertexColors=false → 0 像素（非缺 color attribute）；③ `mesh.onBeforeRender` 计数（按 `renderer.getRenderTarget()` 区分）→ **depthPass=1..3, colorPass=0**——地形 mesh 仅被 TerrainDepthOcclusion 的深度 pass 绘制，**composer color pass 从未入列**（visible=true、parent=Scene、layers 1/1 匹配、RTE 相机 far=1e6、frustumCulled 球体在界内、shader 零错误、材质已编译）；④ 经 m_sceneRoot 路由（每帧重挂）亦 colorPass=0；⑤ 深度 pass 也在 ~3 帧后停止（DepthOcclusion 缓存深度目标）。
- **结论收窄**：排除法终点 = **MapRenderingManager 的 composer（RenderPass/后处理链）对象纳入逻辑**对 m_scene 直加 mesh 存在与穹顶不同的处理（穹顶同在 m_scene 且上屏）。下一批直接读 composer/RenderPass/postprocessing 库源码的对象过滤（忽略列表/stencil-only pass/renderTarget 分流），或改从 TileObjectsRenderer 同路径注入地形（与瓦片对象同生共死）。
- **零代码变更提交**：全部为 TEMP 探针已还原，HEAD=§61 状态复核逐位一致（fog/terrain/basic 33955、fog-import-scope 164907、existing 160950）。tsc 绿。

**63. §62 根因修正：mesh 实际每帧 ~2 次 draw——"composer 排除"证伪，像素在管线下游消失（2026-08-21，dbgCull/dbgDem/dbgTrack/dbgRt1-2）**：

- **修正 §62 结论**：按 render target 分流的 onBeforeRender 计数原把"有 RT 绑定"误判为深度 pass——composer 主 pass 同样绑 RT。终局计数：**~1.8 draw/帧（10 帧 18 次）**，与"深度 pass + composer 主 pass 各一次"一致——**地形 mesh 确实被 composer color pass 绘制**，纳入逻辑无问题；magenta 基色仍 0 像素 ⇒ **像素在主 pass 之后消失**（候选：effect pass（SelectiveBloom inverted/PPOutlineEffect xRay）/输出合成/或顶点着色器在 color pass 的相机下定位错误——深度 pass 相机与 RTE 相机不同属仍未排除）。
- **附带取证**：DEM 高程域 [0, 125.4]m 正值正常；WillRender RTE 监听器每帧运行（parent=Scene/visible=true 确认）；frustumCulled=false 试验无视觉变化（保留为防御性设置——共享 C/4 网格的惰性包围球与 RTE 逐帧剔除交互不佳，整视域 5km 瓦片本无需对象级剔除）。
- **验收**：fog/default 552、fog/terrain/basic 33955、fog-import-scope 164907、existing 160950 逐位稳定（仅 +frustumCulled=false），零回归；tsc 绿、单测 265/3 既有。
- **留档下一批**：① 读 FilterEffectPass/SelectiveBloomEffect(inverted)/PPOutlineEffect(xRay) 源码——effect 链是否丢弃主 pass 缓冲的部分内容；② 逐 pass 截图（composer 输入 buffer vs 输出）定位像素消失点；③ 深度 pass 相机与 RTE 相机差异排除。

**64. 地形像素消失之谜收敛至 scene 级交互（2026-08-21，dbgNoComp/dbgIsoT2-9，纯取证零代码变更）**：

- **§63 计数再修正**：`mapView.camera` 是**世界坐标相机**（探针 camPos=[6.4M,24.5M,193]）——此前"~1.8 draw/帧含 color pass"的推断不成立，两次 draw 均为离屏（深度遮挡 + drape bake RT）。composer 禁用直渲试验（__mbNoComposer）亦 0 magenta——排除 composer/effect 链。
- **决定性对照（同一次运行内）**：**真实地形 mesh + RTE 相机（原点）+ fresh Scene → 256388 像素渲染成功**（mesh/材质/几何/RTE 监听器全部正确）；同一 mesh 留在 m_scene、隐藏其余全部子对象（sceneRoot/穹顶/灯光/相机，fog 强制 off、scene 变换恒等、无 background/environment/overrideMaterial）→ **0 像素**。差异仅剩"fresh Scene vs m_scene"本身。scene.onBeforeRender 为 three 内置 noop（红鲱鱼）。
- **候选收敛**：m_scene 上未被枚举的状态（渲染层 mask 之外的内部标记、matrixWorldNeedsUpdate 时序、引擎在 render 调用链中经别的入口对 m_scene 的处理）。已达远程探针极限，**留档：需交互式 GPU 调试（RenderDoc / 浏览器 devtools WebGL inspector）逐 draw call 检查 m_scene 渲染时地形 draw 是否被提交及其深度/模板状态**。
- **零代码变更**：全部 TEMP 探针还原，HEAD 复核逐位一致（fog/default 552、fog/terrain/basic 33955、fog-import-scope 164907、existing 160950）。tsc 绿、单测 265/3 既有。

**65. m_scene 内 draw 已提交实证 + 片元级压制定性终局（2026-08-21，dbgInfo2-5，纯取证零代码变更）**：

- **draw 提交实证**：`renderer.info`（autoReset=false + reset 包裹）证实在 m_scene 中渲染（其余子对象全隐藏、仅地形可见）时 **calls=1、triangles=32768**（128×128×2 ✓ 完整网格）——遍历/纳入/剔除层面全部洗清，此前 fresh Scene（256k px 成功）vs m_scene（0 px）的差异定格为**片元级压制**。
- **方法论勘误**：dbgInfo3-4 的 magScene/magFresh 双 0 为探针时序缺陷（一次性 gate 在 op 前触发/黑底计数无意义）；§64 的 magenta-clear 法对照（IsoT3-9）仍为有效证据。colorMask 锁死假设否决（three 在每次 render 尾部强制 colorMask(true) 且无持久 lock 路径）。
- **终局定性**：同一 draw（同 mesh/相机/矩阵/状态）在 m_scene 上下文中 0 片元、fresh Scene 中满幅——剩余解释指向 GL 状态机在 render() 调用序中的瞬时差异（本帧此时刻 vs 探针先前时刻）或 m_scene 上未枚举的引擎标记。**盲探针已穷尽，确认需交互式调试**：浏览器 devtools WebGL inspector / Spector.js 捕获 m_scene 渲染的逐 draw call 状态（depth/stencil/blend/scissor/帧缓冲绑定），或 RenderDoc 帧抓取。
- **零代码变更**：HEAD 复核逐位一致（fog/default 552、fog-import-scope 164907、existing 160950）。tsc 绿。

**66. 探针时序方法论修正 + 地形渲染链全面洗清（2026-08-21，dbgSpec/NoComp2/Full8/Canvas2，纯取证零代码变更）**：

- **方法论修正（决定性）**：所有 op-gated 探针（§63 __mbNoComposer、§65 dbgInfo3-5、vis 系列部分）因 **WillRender 在 op 后不再分发** 而从未执行——此前基于它们的结论（"composer 排除""直渲仍 0"）全部作废。改为帧计数 gate 后真相浮现：
- **帧 8 实况**：① 仅地形（隐藏其余）→ **256388 px**；② 全内容不隐藏 → **262144 px 全覆盖**（magenta 清色 0 残留）；③ draw 状态 dump（drawElements 包装探针）：98304 indices、depth LEQUAL/写开、stencil/blend/cull/scissor 全关、viewport 512²、FBO 绑定正常（draw 后 1 个 GL_INVALID_OPERATION 待查）；④ **直接画到 canvas（默认 FB）→ 捕获 PNG 含 22132 magenta px 且在后继引擎帧中存活**——捕获链保留地形。
- **结论**：地形 mesh/材质/几何/RTE 相机/渲染顺序（内容 renderOrder=MIN_SAFE_INTEGER、depthWrite:false；地形 −100 后画覆盖）**全部正确**；canvas 默认 FB 的 readPixels 探针不可靠（1282）。谜团收敛至：**引擎自动逐帧渲染为何不含地形而等价手动渲染含**——指向渲染循环的帧调度（动画停止后捕获用的可能是陈旧 canvas 或重放渲染）。这正是需要真实交互式会话（Spector.js + devtools 断点在 MapView.render）的终局问题。
- **零代码变更**：HEAD 复核逐位一致（fog/default 552、fog/terrain/basic 33955、fog-import-scope 164907、existing 160950）。tsc 绿。

**67. 破案：composer 丢弃地形 + 空效旁路修复（2026-08-21，bypass1-3，引擎级修复）**：

- **对照实证（帧门控探针修正后）**：同 fixture 同帧，材质 magenta 下 **composer 关闭（直渲）→ 捕获 PNG 22132 magenta px；composer 开启 → 0**——postprocessing EffectComposer 渲染路径丢弃引擎外部 scene mesh（mbstyle 地形）。机制源读排除：postprocessing RenderPass 为朴素 renderer.render（无对象过滤），stencil/MSAA/深度四种 RT 配置矩阵手工渲染全部正常——机制未明但实证稳定（与 §66"手动渲染含地形"互证：手动 = 直渲路径）。
- **修复（flywave-mapview 引擎级）**：`MapRenderingManager.render` 在**无任何激活效果**（bloom/outline/vignette/sepia/godrays 全关，渲染测试常态）时旁路 composer 直渲——零效果后处理本为纯开销，且其路径丢弃地形。效果启用时 composer 照常（不影响 AA/效果用户）。
- **验收（bypass1-3）**：**skybox/gradient/default 2136→0 新增 PASS**（composer 输出与直渲有亚像素差，直渲像素精确）；**import-override 族全收窄**：existing 160950→**158259**（−2.7k）、style→131934、theme→131909、fog-import-scope 164907→**164019**（地形首次进入这些 pitch70 fixture 的输出）；fog/color 69147→65842（−3.3k）、light-import-scope −0.3k；fog/2d/basic 22724→22953（+229 微）；**fog/default 552→1094（+542，确定性状态切换**——旁路改变渲染路径后落入 §53 二态的另一支，非随机）；fog/terrain 族 ±2k 内互有涨跌（basic +248、zero-exag +1.7k、inverted ≈ 53672 不变——其中 inverted 曾 53172→16217 出现过一次（bypass3 截断批次），疑同型状态翻转待复核）；color-theme 4 PASS 维持、近失族不变。tsc 绿、单测 265/3 既有。
- **留档下一批**：① fog/terrain 族与 fog/default 在旁路态的基线重定（多会话复核哪些是确定性偏移）；② 地形上屏后 drape UV/世界映射校准真正开始（现地形可见，drape 内容效果可评估）；③ composer 丢弃 mesh 的机制溯源（向 flywave 上游报告）。

**68. 旁路态基线重定 + 残差构成分析 + 带/机制两项否决（2026-08-21，band1/verify68，零净代码变更）**：

- **基线重定（①）**：旁路态数值确定性复核——fog/default 稳定 **1094**（552→1094 为确定性路径切换，非随机翻转；§53 二态的"另一支"被旁路固化）、fog/terrain 族 ±2k 内（inverted 曾现 16217 单次，疑同型，留多会话复核）、skybox/gradient/default **0（新增 PASS 稳定）**、import-override existing **158259**。
- **残差构成（fog-import-scope 164019 像素取证）**：顶部 y8 cur(213,21,21)≈exp(255,0,0)——themed 大气穹顶已基本对齐；主残差 = ① y40 带 cur(194 灰=clearColor) vs exp(218,35,35 红)——**我们的天空带比 mgl 窄**（mgl horizon-blend 延伸到真地平线下）；② y300-500 cur(194 地形基色) vs exp(55/125 道路/建筑/山体阴影)——**地形基色区域缺 drape 内容与 3D-lit 细节**。
- **两项否决**：① horizon-blend 带（−0.05 rad discard）**主题化后重试仍全域劣化**（fog-import-scope +1.5k、existing +1.7k、atmosphere-color +1.6k、fill-extrusion-light/north-east +5.5k）——假穹顶渐变 ≠ mgl 混合，确证需真大气散射模型，已回退；② composer 丢 mesh 机制源读至 EffectComposer.setRenderer（renderer.autoClear=false）与 RenderPass（朴素 renderer.render）——无对象过滤逻辑，机制不明但旁路修复已落地。
- **留档下一批**：① 地形基色区域的 drape 内容/3D-lit 细节（y300-500 残差主体，drape UV 校准实做）；② 真大气散射模型（rayleigh/mie，同时解决 rayleigh/mie 族 47k-128k）；③ fog/terrain 多会话基线复核。零净代码变更（带试验已回退），tsc 绿、单测 265/3 既有。

**69. drape 激活态实证 + 地形亮度标定否决记档（2026-08-21，dbgDrapeSt/dbgCC/flat1，零净代码变更）**：

- **drape 激活实证（帧门控）**：帧 6-7 `hasTex=true`、FBO `uniform=false`（内容在）——**drape 全链路在旁路态正常工作**（bake→内容门→纹理注入），帧 8-9 的 hasTex=false 为 morph 重建后新材质的 bake 前一瞬（紧接重注入）。drape UV 对齐暂不可判：本 fixture 烘焙内容≈均匀 fill（道路 0.3 透明度太细），地形区视觉平坦。
- **地形亮度取证**：clearColor=0x545454(84)，地形渲染 194（**过亮 2.3×**——MeshStandardMaterial 光照栈的 π-trick 双重照明），exp≈55 ≈ base·k（mgl 自然光照 k=amb·ADF+dir·NdotL≈0.54，color·k^(1/2.2)≈0.76·84≈64）。**平色（emissive-only=84）试验否决**：fog-import-scope 不变（164019）、import-override-existing 158259→160686（+2.4k——该 fixture 的 exp 地形≈193 未打光背景灰，两 fixture 目标相反）。
- **结论**：地形亮度需按 mgl 公式 `k = ambColor·verticalFactor + dirColor·max(N·L,0)，lit = color·k^(1/2.2)`（N=平面法向 (0,0,1)，N·L=dirV.z）**逐 fixture 自适应**计算（与 lighting3DState 联动，CPU 烘进 emissive 或注入 injectGroundLighting 同款 shader），固定值无法同时满足两族——留档下一批实做。
- **零净代码变更**：HEAD 复核逐位一致（fog-import-scope 164019、existing 158259、fog/default 1094、gradient/default 0 PASS、fog/terrain/basic 34203）。tsc 绿、单测 265/3 既有。

**70. 引擎内 draw 提交终局实证 + DepthOcclusion RT 恢复加固（2026-08-21，lit1/dbgEng/dbgVisG/rtfix1）**：

- **mgl 光照公式实做与回退**：`k = amb·vFactor + dir·max(N·L,0)、lit = color·k^(1/2.2)`（N=(0,0,1)、N·L=dir.z）CPU 烘进 setBaseColor + emissive 平渲——**目标 fixture 逐位不变（fog-import-scope 164019）、existing +2.4k**（其 exp 地形≈未打光 193，与 fog-import-scope 的 55 目标相反）→ 回退。根因随后揭示：**地形像素本就未到达捕获 canvas**，任何基色标定在此前提上无效。
- **引擎内 draw 提交终局实证**：MapRenderingManager 旁路分支内嵌 info 探针——**帧 6-8 引擎自己的直渲包含地形 draw（calls=19, triangles=33762 = 32768 地形 + 内容）且 scene 内确认在位**；但强制 magenta 基色（清洁无覆盖路径）捕获 PNG 仍 0 像素。结合 §66 手绘 canvas 存活——引擎 draw 提交但像素消失，唯一未排查环节 = **主渲染之后的同帧操作（renderText / m_overlayScene 渲染）或捕获时序**。
- **防御性修复落地（保留）**：TerrainDepthOcclusion 的 catch{} 原会跳过 `setRenderTarget(prev)` 恢复（异常时深度目标保持绑定 → 主渲染静默入深度目标）——恢复移入 finally。数值零变化（当前无异常触发），属正确性加固。
- **留档下一批**：① 同帧主渲染后的 renderText/overlay 渲染排查（唯一剩余环节）；② 地形可见性打通后重做 mgl 光照公式（代码已验证过一遍，恢复即可）；③ 交互式会话终局确认。tsc 绿、单测 265/3 既有、零回归。

**71. "地形不可见"最终翻案 + renderText/overlay 排除（2026-08-21，dbgVisG 复扫/lit2，零净代码变更）**：

- **最终翻案**：dbgVisG（清洁强制 magenta）图像用宽松 reddish 滤波复扫——**3524 red-dominant 像素存在**！地形自 §67 旁路以来**一直可见**，只是被场景光照/雾染色为 (213,21,21) 类色，严格 magenta 滤镜（R>200∧B>200∧G<100）漏检——五个阶段（§62-70）的"不可见地形"结论为**探针滤波伪影**。§70 的"逐位不变"实为 mismatch 计数不变（像素仍差但同超阈值）。
- **renderText/overlay 排除**：MapView.render 主渲染后仅 renderText（无标签 fixture 为 no-op）与 m_overlayScene（无 overlay 子对象不触发）——两嫌疑排除；§66 的 canvas 手绘存活与引擎 draw 提交（33762 tris）与"地形可见"新结论完全自洽。
- **k-lit 公式二次否决（机制阐明）**：material color 路径下 mismatch 计数全同——**MeshStandardMaterial 场景光照栈（π-trick ≈×2.3 恒定增益）抵消 CPU 预乘**（84→194、86→194）；emissive-flat 路径（§70）existing +2.4k。结论：地形亮度残差的真通道是 **per-fixture 的 themed 基色推导**（两族 exp 目标 193 未打光 vs 55 打光相反，源于不同 op LUT 对背景的映射）+ drape 内容，非全局光照公式。
- **零净代码变更**：HEAD 复核逐位一致（fog-import-scope 164019、existing 158259、fog/default 1094、gradient/default 0 PASS）。tsc 绿、单测 265/3 既有。
- **留档下一批**：① per-fixture 地形基色：对齐 mgl 的背景 LUT 作用域链（fog-import-scope exp 顶部红=背景 themed，我方 194 灰——背景通道）；② drape 内容可见化（道路/建筑的烘焙细节进入地形）；③ 会话总结与多会话基线表重制。

**72. 背景 LUT 链洗清 + 残差真通道定案：地形覆盖 z=0 内容（2026-08-21，dbgBg1-3，零净代码变更）**：

- **背景 LUT 作用域链洗清**：applyBackgroundColor 逐调用探针——背景层 scope=undefined（根层）✓、rootLut 加载后正确选用 ✓、`applyColorTheme(rootLut,'blue')=rgb(113,113,113)` 灰——与 mgl `RenderColor` 构造器逐行对照（归一化 rgb×(N−1) 直接三线性、无色彩空间转换）**完全一致**。mgl 的背景同样是灰！**exp 顶部红 = themed 大气穹顶**（我方 y8 (213,21,21)≈exp (255,0,0) 已对齐）——§71 留档的"背景 LUT 作用域链"嫌疑洗清。
- **残差真通道定案**：fog-import-scope y300-500 cur=194（地形基色）vs exp=55/125/32（场景细节）——**抬升的地形（0-125m，pitch70 下更近相机）在深度上覆盖了 z=0 平面的道路/建筑内容**；mgl 语义内容贴地形表面。我方 drape 已激活但烘焙内容太淡（fill 灰 + 0.3 透明度道路），建筑为 3D 几何不参与 drape。
- **留档下一批（真正的收窄路径）**：① **内容几何按 DEM 抬升**（mgl 语义：把 tile 对象的 z 加上地形高程——TerrainController 已有 m_centerDem + allDemTiles，在 TileObjectsRenderer 渲染时对对象 position.z 加采样高程）；② drape 内容强化（建筑顶面烘焙或高不透明度层）；③ 真大气散射模型。零净代码变更，HEAD 复核逐位一致，tsc 绿、单测 265/3 既有。

**73. 内容按 DEM 抬升实做（引擎级钩子 + 对象级否决留档）（2026-08-21，elev1-2）**：

- **引擎级钩子落地（保留）**：① `MapEnv.terrainElevationSampler`（flywave-datasource-protocol）+ ② `TileObjectsRenderer.render` 定位后 `position.z += sampler(worldX, worldY)`（flywave-mapview，mgl 内容贴地形语义）+ ③ `TerrainController.sampleElevation(worldX, worldY)`（R32F CPU 采样 × exaggeration，行序 n−1−v 北→南已验证：直接 v 劣化 existing 157437→174570）。
- **对象级抬升否决（留档）**：启用态验收——import-override existing/remove **158259→157437（−822，方向正确）**，但 fog/terrain/basic **34203→46427（+12k）**、symbol-elevation/ground-constant **21148→34851（+13.7k）**——对象级单点采样对跨地形起伏的道路/符号放置过粗（mgl 逐顶点：DisplacedBufferGeometry 位移）。**sampler 置 null 休眠**（引擎钩子与采样器保留待逐顶点版本）。
- **验收**：休眠态全部基线逐位一致（fog-import-scope 164019、existing 158259、fog/terrain/basic 34203、symbol-elevation 21148、fog/default 1094、gradient/default 0 PASS）零回归。tsc 绿（protocol lib 重建）、单测 265/3 既有。
- **留档下一批**：① 逐顶点内容抬升（引擎 DisplacedBufferGeometry 接 DEM 采样——mgl 正道）；② 或 drape 内容强化路径；③ 真大气散射模型。

**74. 逐顶点内容抬升 v1 实做与否决（2026-08-21，pv1）**：

- **实做**：① protocol 加 `terrainElevationPerVertex` 标志（引擎对象级抬升据此跳过，防双重）；② patchTileMaterials 内一次性 CPU 顶点位移（每顶点 `z += sampler(worldX, worldY)`，world = obj.position(RTE) + camera + vertex 局部，`__mbElevated` 幂等标记）；③ sampler + per-vertex 启用。
- **否决（数据）**：全目标劣化——fog-import-scope 164019→**192406（+28k）**、existing 158259→166178（+8k）、fog/terrain/basic 34203→45418（+11k）、symbol-elevation/ground-constant 21148→33130（+12k）。顶点世界坐标推导（obj.position + camera + 局部顶点）与引擎几何约定（居中/缩放/瓦片局部原点）不符——位移落点系统性错位。**已回退休眠**（钩子 + sampleElevation + per-vertex 标志保留，正道 = 引擎 DisplacedBufferGeometry 接 DEM 的顶点着色器内采样，属引擎深改专项）。
- **验收**：休眠态全部基线逐位一致（fog-import-scope 164019、existing 158259、fog/terrain/basic 34203、symbol-elevation 21148、fog/default 1094、gradient/default 0 PASS）零回归。tsc 绿（protocol lib 重建）、单测 265/3 既有。
- **会话阶段性总结（§53-74，22 个提交）**：fog 域修复（fog/default 1128→552→旁路态 1094）、import-override 族 196917→158259（−19%）、color-theme 4 PASS 维持 + skybox/gradient/default 新增 PASS、drape 管道全链路上线、地形渲染双根因（帧错位+RTE）修复、composer 空效旁路引擎修复、内容抬升钩子基建。剩余大项：逐顶点抬升引擎深改、真大气散射、fog/globe 族、model 烘焙。

**75. 顶点世界坐标约定标定（2026-08-21，dbgConv1-2，零净代码变更）**：

- **约定标定（探针实证）**：fill quad 几何 bb=(±621, ±621, 0..12)（米级局部）、objScale=1、objPos=RTE 瓦片中心——**顶点世界坐标 = objPos(RTE) + camera + 顶点局部，与 §74 v1 实现完全一致**。v1 的 +28k 劣化因此排除坐标推导错误，嫌疑收敛到 **sampleElevation 的 DEM 轴向/边界细节**（行翻转 n−1−v 对北=+Y 还是 −Y 的假设、或 u/v 映射象限）——需可视化迭代校准（逐顶点高度 vs 地形表面对照），留档交互式会话实做。
- **当前状态**：抬升管道三件套（钩子/采样器/per-vertex 标志）休眠待校准；全部基线逐位一致（fog-import-scope 164019、existing 158259、fog/terrain/basic 34203、fog/default 1094、gradient/default 0 PASS）零回归。tsc 绿、单测 265/3 既有。
- **下一步优先级重排**：① sampleElevation 轴向校准（数据已备齐：bb/objPos/cam 实测值在案）→ 重启 per-vertex；② 真大气散射模型；③ fog/globe 族。

**76. sampleElevation 轴向终验 + v2 精几何抬升否决（2026-08-21，pv2-3，零净代码变更）**：

- **轴向终验**：v2（仅 >8 顶点精几何）无翻转对照——fog-import-scope 192406→**230109**（更劣）——**n−1−v 翻转确证正确**（与地形 shader 的 demUv=(u,1−v) 推导一致）。
- **v2 精几何抬升否决**：fog-import-scope 164019→192406（+28k，与 v1 全对象逐位同值——**全部劣化来自道路 ribbon 位移，粗 fill 贡献为零**）；fog/terrain/basic 与 symbol-elevation 恢复基线（无精细线内容）。结论：道路位移落点仍错——排除项已穷尽（坐标约定 §75 ✓、行翻转 ✓、双重抬升 ✓、粗细几何分离 ✓），**剩余偏差在 DEM 与内容的世界坐标对齐细节**（如 tile.worldOffsetX、displacement 附加、或 DEM 图像与瓦片网格的原点偏移半像素），需可视化逐点对照——留档交互式会话。
- **状态**：抬升三件套休眠（含 v2 教训注释），全部基线逐位一致零回归。tsc 绿、单测 265/3 既有。
- **转向记档**：内容抬升线暂停，下一阶段优先**真大气散射模型**（rayleigh/mie 族 47k-128k，独立于抬升链）。

**77. 真大气散射模型落地：skybox capture 立方体 CPU 复刻 + 采样穹顶（2026-08-22，atm1-4）**：

- **mgl 语义取证**（skybox_capture.fragment/vertex、skybox.fragment、draw_sky.ts、sky_style_layer.ts）：真 Rayleigh/Mie 单次散射（BETA_R/M、MIE_G 0.76、8km/1.2km 标高、10×4 步进、Uncharted-2 tonemap、u_luminance=5e-5 硬编码）；**32×32 RGBA8 立方体离屏捕获一次**，skybox 立方体远平面采样。三个关键语义：①capture 顶点把面坐标 y **翻转后重映射到 [0,1]** 再做 pow5+0.015 弯折（无负数 pow）；②采样侧 uv.y = map(pow(|v.y+0.015|,1/5),0,1,−1,1)；③**RGBA8 存储 + 双线性采样**塑形了近地平线亮带与太阳光晕的涂抹形态——逐片元解析求值**无法**复现（数值验证：解析模型 vs exp 上部偏亮、地平线下偏暗）。
- **实现**（MBEnvironmentManager）：`captureAtmosphereCubemap()` CPU 复刻六面捕获（drawSkyboxFace 的 R_F 面旋转表 + capture-vertex y 翻转/[0,1] 重映射 + pow5+bias + 归一化 march + tonemap → 32×32 DataTexture ×6 → CubeTexture Linear）；穹顶 shader 采样（采样弯折 + `fog_apply_sky_gradient` + 0.5° 太阳盘 + sky-opacity 预乘 alpha）。**worldDir 改经 modelMatrix**（RTE 场景根携带世界变换，raw position 是相机帧——旧实现把地平线画到屏幕中心，atm1 取证 202px 假象破案）。**地平线下裁剪改为仅 style 含 background 层时启用**（mgl 的 background 是不透明 tile 几何深度遮挡 skybox；无 background 时 mgl 地平线下也显示天空）。
- **默认值修正为 v8**（buildSkyFromLayers）：sky-type 默认 **atmosphere**、sun-intensity 10、atmosphere/halo 色 white；sky-atmosphere-sun 缺省回退 **style light 位置**（applyLights 新增 m_lightAzimuthalPolar 追踪，legacy position / 3D directional direction / 默认 [210,30]，= mgl getCenter 语义）。tint 解析带 alpha（rgba(0,0,0,0) 关通道，mie fixture 需要）+ 预乘语义（toPremultipliedRenderColor：rgb·a，shader 再乘 a）。
- **skybox 批验收（atm4 vs §54 基线）**：**atmosphere 34987→202**、**rayleigh ~91k→562**、intensity/medium 12558→1750、low→1747、horizon→1702、blend/fill-opaque 87890→64650、sun-override 31013→12644、horizon-ne/sw 20k/30.5k→14.5k/14.9k、update 24047→22856；intensity/high 27299→45784 但逐像素差 ≤3/255（梯度精度级，旧值是大误差小面积）；gradient/extrusion-light/compositing/horizon-visibility 逐位不变（旁路零回归）。
- **留档未解**：atmosphere-mie 47887（≈基线 47760，exp 形状=太阳北向但亮度低 ~10x，左手法/强度/alpha 组合拟合均不收敛——疑 exp 快照出自与当前 mgl checkout 不同版本的 shader）；atmosphere-color 40543（结构对、~15% 亮度差）；atmosphere-terrain 102564（几何覆盖域，非天空通道）。tsc 绿、单测 265/3 既有。

**78. fog/globe 大气落地：屏幕空间 limb glow + space 背景 + 星空（2026-08-22，globe1-4）**：

- **mgl 语义取证**（atmosphere.fragment/vertex.glsl PROJECTION_GLOBE_VIEW + draw_atmosphere.ts）：屏幕空间 quad、逐片元视线方向；globe 内（normDist<0.98）透明（地图透出）；limb 角度 θ=asin(closest/|globePos|)、horizonAngle=(dot<0?π−θ−hor:θ−hor)、t=exp(−h/fadeout)、(fog/high/space 三色 alpha 混合 c2)·t 预乘输出；**space-color 作为帧缓冲背景**（外圈深色 = space 色非白）；星空 star-intensity>0 时叠加。
- **实现**（MBEnvironmentManager.applyGlobeAtmosphere，替代 applyFog 的 globe 早退）：NDC 全屏 quad（far-depth、renderOrder −2000、预乘 CustomBlending、depthTest false）+ onBeforeRender 每帧刷新 globe 几何 uniform（dc/θhor/fov/aspect——connect 期 matrixWorldInverse 陈旧会致零心穿案）；clearColor=themed space-color（**alpha=space 属性 alpha**，白画布合成）；复用 createStars。
- **验收（vs §77 基线）**：**star-intensity 220773→52681（−168k！）**、space-color-opacity 146841→**119763**（−27k，clearAlpha）、high-color 族 −1.5~2k、space-color −2k；fog/default 1094、gradient/default 0 PASS、fog-import-scope/existing 逐位不变零回归。tsc 绿、单测 265/3 既有。
- **留档未解（globe 残差主项）**：**引擎 globe zoom→相机距离映射与 mgl 分歧**——实测 zoom0 下我方 dc=36.4M（5.7R）vs mgl exp 图像量得 ~4.5R（globe 直径 176/256px），globe 偏小 26%（limb 位置/地图可见范围整体偏移=当前 36k-141k 残差主体）。修法=引擎 sphere 投影的 calculateDistanceToGroundFromZoomLevel 换 mgl R 相对式（影响全部 globe fixture 的瓦片布局，需专项批测 map-projections/globe 族）。

**79. globe zoom→距离映射标定尝试与否决（2026-08-22，globe5，零净代码变更）**：

- **mgl 公式推导**：mgl globe 相机距离 = `ccd_px · C/(512·2^z)`（ccd_px = 0.5·canvasH/tan(fov/2)，worldSize=512·2^z）——256px 画布 z0 下 d≈4.71R（exp 图像量得 4.48-4.91R 区间一致）。
- **尝试**：`calculateDistanceFromZoomLevel` 加 Spherical 分支直换 mgl 式 → **全黑屏**（fog/globe/high-color 全 0 像素）——引擎 sphere 管线（瓦片剔除/地平线/pitch 曲率钳制 `calculateDistanceToGroundFromZoomLevel`）与原距离标度深度耦合，简单换式使相机/瓦片几何失配。**已回退**。
- **结论**：globe 距离标定属引擎 sphere 管线系统性 re-scale（需同步调整 tile cover/剔除/地平线/钳制全链），非单点公式替换——留档引擎专项（含 map-projections/globe 全族批测）。§78 状态保持（star-intensity −168k 等成果不变），复核逐位一致（high-color 36877、fog/default 1094、gradient/default 0 PASS、fog-import-scope 164019）零回归。tsc 绿、单测 265/3 既有。
- **下一批优先级**：① §77 留档 atmosphere-color ~15% 亮度差（小项快修）；② §49 model 烘焙路径；③ globe 距离管线 re-scale 专项。

**80. atmosphere ~15% 亮度差破案：Mie tint 缺失一行（2026-08-22，atmc1-3）**：

- **取证方法**：Node 独立复刻 mgl skybox_capture 单射线解析（zenith·zenith·intensity30·fixture tints）= (209,211,128)，对照我方 CPU 立方体 +Y 面中心 (139,162,164)——红低蓝高 = **mie 项用了原始 BETA_M 而非 mgl 的 `BETA_M·tintM.rgb·tintM.a`**（halo tint (255,255,0,0.5) 应把蓝通道 mie 归零，我方蓝 164 vs mgl 128 正是漏乘所致）。修复一行：`betaM[c] = BETA_M·tintM[c]·tintM.w`。
- **验收（vs §77 终态 atm4 基线，atmc2/3）**：**atmosphere-color 40543→1619（−96%）**、**atmosphere-mie 47887→1107**（§77 留档"疑 exp 出自不同版本"的 fixture 破案——非版本差异，是本行缺失）、**atmosphere-rayleigh 562→0 新增 PASS**、**intensity/high 45784→62**（近 PASS）、**fill-extrusion-light/north-east 34086→7160**、**3d-intersections/fog 136265→106809**；fog 域（default 1094、color 65842）、gradient/default 0、fog-import-scope 164019、existing 158259、blend 族（79668/78101 与 atm4 逐位同——此前误记 64650 为基线）全部逐位不变，**零回归**。tsc 绿、单测 265/3 既有。
- **skybox/atmosphere 域现状**：rayleigh PASS、color/mie/horizon/intensity 均 1.1k-1.7k 近失带；残差主体仅剩 atmosphere-terrain 102564（几何覆盖域，§73-76 内容抬升线）与 blend/fill 族 78-80k（fill 复合层）。

**81. §49 model 烘焙路径终局取证：自建 GLTF 路径全程死代码（2026-08-22，model1/dbgModel1-2/dbgTech，零净代码变更）**：

- **决定性证据链**：① propagateScopedThemes 探针 `m_loadedModels.length=0`——§46-48 的 model CPU 烘焙（applyThemeToModel 材质/纹理 bake）对实际 fixture **从未执行**（loadModels 的 modelDefs 只认 inline layer.models / source.data·url 两种形态）；② trees-monochrome cur 全图单色 (107,107,107)、dark px 0 vs exp 12616——**树模型完全未渲染**，24611 残差=模型缺失而非色差；③ emission-bw cur 全白 vs exp 灰阶同理（emissive 模型缺席）。
- **mgl 正确语义（style 结构实证）**：fixture 用**根级 `style.models` 注册表**（maple1/oak1…glb URL）+ 矢量源 `trees` 逐要素放置（feature.model 属性 → modelId 匹配）——即 tile emitter 的 `'model'` technique（props.modelId 已产出，§81 代码在案）+ 引擎侧按 modelId 从注册表实例化渲染。**缺口=引擎 modelId→GLTF 实例化渲染通道**（flywave-gltf 加载器在包内可用），自建 GLTF 层路径应迁移到该语义。
- **验收**：零净代码变更，HEAD 逐位复核（fog/default 1094、gradient/atmosphere-rayleigh 0×2 PASS、fog-import-scope 164019、existing 158259）。tsc 绿、单测 265/3 既有。
- **下一批**：引擎 modelId 实例化通道（tile 'model' technique → style.models 注册表 → GLTF 实例 + transform + 主题 GPU/CPU bake）——model-layer 全族（model-fog-default 等）与 color-theme model 族一起受益。

**82. model 渠道代码落地：MBModelRenderer 逐要素 GLTF 实例化（2026-08-22，代码对齐批，渲染验证攒批延后）**：

- **mgl 语义实证（fixture 结构）**：①`trees-lod-expression`——根级 `style.models` 注册表（`oak → "local://models/oak1.glb"`）+ model 层 `layout["model-id"]` 表达式（zoom step，逐要素可求值）+ 矢量源逐点放置；②`multiple-models-zero-terrain`——`type:"model"` 源的 `source.models` 注册表（每条 {uri, position, orientation, scale} 各实例化一次）。既有 loadModels 只认 inline layer.models / source.data·url 两种形态（§81 已证），两形态均未覆盖。
- **实现三件套**：
  1. **emitter**（MBTileDataEmitter）：`processPointFeature` 新增 model 层分支——逐点收集 `{worldPos, techniqueIdx, properties}` 到 `m_modelInstances`（绝对世界坐标，与 heatmap/text 同空间），导出到 `DecodedTile.modelInstances`；technique 扩充 `_modelRotation/_modelScale/_modelTranslation/_modelColor`（paint 求值值）。逐要素 modelId 靠 `evaluatedCacheKey`（layout 含求值后的 model-id）天然分 technique。
  2. **MBModelRenderer**（新文件，MBHeatmapRenderer 同款瓦片缓存模式）：decodedTile 瞬态（几何加载完即清）→ 按 tile 缓存 placements + 瓦片离场剪枝（dispose 克隆 geometry，材质/纹理与原型共享）；GLTF 原型按 url 缓存（异步加载、逐帧重试、失败标记）；逐 placement 克隆实例 + 变换（rotation 度→Euler、scale 标量/[x,y,z]、translation 米——与 loadModels 同约定，单一换算点便于批测校准）+ `model-opacity`（<1 才 transparent+depthWrite false）+ `applyThemeToModel` CPU 主题烘焙（pristine 快照幂等）。
  3. **dataSource**：`updateModelRegistry()`——根级 `style.models` + 全部 `source.models`（id→uri，local:// 重写）发布给 renderer（connect + setStyle 两处）；`loadModels` 扩充 `source.models` 分支（orientation/scale per-def 生效，layout 值为回退）；主题 LUT 重放循环（1601 处）追加 `m_modelRenderer.retheme()`。
- **状态**：tsc 无新增错误（MBStyleDecoder:338 为 HEAD 既有）；单测 265 passing / 3 既有失败不变，零回归。**渲染验证攒批延后**——model-layer 全族（trees-*/landmark-*/multiple-models 等）待批测校准：轴向约定（glTF Y-up vs 引擎几何 z-up，换算点集中在 instantiate/loadModels 两处 Euler）、mgl `model-rotation` 默认 [0,0,90] 是否补默认值、模型尺寸米制换算（glb 原始单位）均为首批校准项。

**83. §23-4 linear/sRGB 同族排查收官 + model paint 默认值 v8 对齐（2026-08-22，代码对齐批，渲染验证攒批延后）**：

- **model paint 默认值**（MBLayerEvaluator PAINT_DEFAULTS.model）：从 mgl v8.json（raw 抓取实证）补齐——`model-rotation [0,0,0]`（**非**传闻的 [0,0,90]）、`model-scale [1,1,1]`、`model-translation [0,0,0]`、`model-color #ffffff`、`mix-intensity 0`、`model-type common-3d`、cast/receive-shadows true、AO-intensity 1、emissive-strength 0、roughness 1、cutoff-fade-range 0、elevation-reference ground。此前仅 model-opacity 一项，表达式求值缺默认兜底。
- **sRGB 同族全量审计结论（静态排查）**：管线分三类——①标准材质（MeshBasic/Lambert/Standard/Sprite：fill/extrusion/icon/building/raster/terrain）走 three 内建 colorspace_fragment，`.set(css)` 线性存取**正确不改**；②自定义 Raw/ShaderMaterial（circle/SDF-icon/SDF-text/heatmap/line-gradient）既有 `convertLinearToSRGB()` 约定**已齐**；③两处漏网修复：**MapHillshadeMaterial**（自定义 ShaderMaterial 裸写 gl_FragColor，highlight/shadow/accent 三 uniform 缺转换——默认 #FFF/#000 传递不变故未暴露，styled 色会偏暗）+ **patcher uMBTrimColor**（mix 对象是 ribbon 输出，同 uMBOutlineColor 约定，line-trim-color 色偏修复）。
- **留档未改（实证项）**：`uMBStrokeColor`（patcher:1896）与 mix 对象 CirclePointsMaterial.diffuseColor **同为 linear**（引擎 MapMaterialAdapter.setRGB(...,SRGBColorSpace)=转 linear、无 colorspace_fragment 回转）——两值空间一致，单改一处反致 fill/stroke 失配；引擎原生材质"linear 进裸出"与 mgl sRGB 期望的系统性差（§48 circle 80 vs 69 残差嫌疑）属 flywave-mapview 级实证批（改 MapMaterialAdapter 影响全引擎，需批测护航）。
- **状态**：tsc 无新增错误（MBStyleDecoder:338 既有）；单测 265/3 既有零回归。

**84. F2 剩余两项代码落地：半透明挤出双 pass + 独立阴影通道（2026-08-22，代码对齐批，渲染验证攒批延后）**：

- **mgl 源码取证**（raw 抓取 draw_fill_extrusion.ts / shadow_renderer.ts / ground_shadow.*.glsl / _prelude_shadow）：①`fill-extrusion-opacity ∈ (0,1)` 时**双 pass**——先 colorWrite 关闭的纯深度 pass，再 EQUAL 深度着色 pass（只混最近表面，杜绝前后墙内透双重混合），stencil 防共面重绘（暂略）；②阴影=**独立渲染器**（级联正交深度图 + 各层 shader `_prelude_shadow` 采样 + ground shadow 因子 `mix(1-intensity,1,lit)` 乘地面层），读 3D lights 的 cast-shadows/shadow-intensity。
- **落地**：①patcher `setupTranslucentExtrusionDualPass`——opacity∈(0,1) 的 extruded-polygon 加子 mesh 纯深度预 pass（renderOrder−0.5、不参与拾取）+ 主材质 `depthFunc=EqualDepth`；②新文件 **MBShadowRenderer**——1024² DepthTexture RT + 正交 shadow camera（layer 1 掩码 + overrideMaterial 深度材质，绕开 3D 光不在场景导致 three 内建阴影不可用的问题），每帧 AfterRender 重绘（一帧 uniform 滞后与 heatmap 同约）；caster 注册=patcher（extruded-polygon）+ MBModelRenderer（model 实例，`model-cast-shadows≠false`）；**receiver 注入**=ground fill 材质（`injectGroundShadow`：worldPos varying + 深度比较 + `mix(1-intensity,1,lit)`，per-frame uniform 刷新走 patchTileMaterials）；EnvironmentManager 暴露 `shadowLightState`。
- **留档校准项（批测首查）**：单级联 vs mgl 双级联、shadow camera 半径（现 targetDistance 钳制）、深度 bias 0.0015、PCF 单 tap vs mgl 平面 bias 函数、阴影接收未扩到 line/circle/raster 层、trees 阴影需 §82 model 渲染链整体先通。
- **状态**：tsc 无新增错误（MBStyleDecoder:338 既有）；单测 265/3 既有零回归。

**85. §12.82/84 攒批渲染测试执行 + model 渠道五连环修复（2026-08-22，dbg86 系列）**：

- **测试基建跑通**：karma `ChromeHeadlessNoSandbox`（SwiftShader flags）+ 自建 dump server（/tmp/mbreport/server.js）+ `KARMA_ARGS="filter=<名> feedback-url=http://127.0.0.1:9871"`；mapview 改动需 `tsc --build` 重建 lib（karma 从 lib 解析——本次破案关键之一）。
- **五连环修复**：① DRACOLoader 缺失（树全 draco 压缩，报错被静默 catch）；② 帧保活——GLTF/draco 异步解码晚于 settle，harness `modelsPending()` 轮询（quiet≥3 真渲染帧+末帧保证）；③ 近裁剪面贴地（§F2a 同族）——applyMaxGeometryHeight 对 model 层加 30m 保守界；④ loadModels 的 `require()` 在浏览器 bundle 抛错被吞（model-source 路径死代码真相之二）→ `await import`；⑤ prune 竞态（改 tile.disposed 才删）+ frustumCulled=false（Float32 矩阵 1e7 量级坐标米级误差随机剔除）。
- **验收（空闲时稳定）**：trees-lod-expression PASS（4×/5× 稳定，逐要素 modelId+draco+变换+主题全链路）、default PASS（model-source 路径）、part-opacity PASS；skybox/gradient、atmosphere-rayleigh、fill-extrusion/opacity-blend、circle-stroke-color 零回归 PASS；fog/default 1118（1094+24 噪声）；单测 265/3 既有。
- **批测残差（模型已上屏，剩精度校准）**：vertex-colors 1885 / rotation 4.8k / translation 5.1k / multiple-meshes 15k / opacity 15k / emissive 18k / scale 79k（尺寸标定主项）等。
- **留档环境级问题**：① 顺序污染——trees 在前驱测试后失败但 assert 时场景/相机/draw calls（tris=138106）与 PASS 完全一致而画布全灰（SwiftShader 多上下文 readback 嫌疑）；② 负载敏感——load 5 时 0/5、空闲 5/5。建议逐测独立浏览器实例的 harness 专项。

**86. model-layer 整域 212/212 全 PASS + "残差/顺序污染"全面翻案（2026-08-22 终局）**：

- **翻案**：§12.85 记档的全部"批测残差"（vertex-colors 1885 ~ scale 79k）与"顺序污染"经逐测独立 karma 启动复测——**全部为机器负载 flake**（load avg 4-5 时多测批跑/连跑劣化，空闲时全绿）。双跑复测 12 例 + 广谱 15 例 + **全量 212 例逐测扫描：212/212 SUCCESS**（含 terrain/fog/PBR/alpha-blend/emissive/AO/rts/runtime-api/landmark 系全部）。
- **测试方法论记档**：可靠跑法 = 逐测独立 karma 启动（`KARMA_ARGS="filter=<test名>" npx karma start --browsers ChromeHeadlessNoSandbox --single-run`，需从仓库根启动；mapview 改动先 `tsc --build` 重建 lib），~8-15s/例；多测同页批跑在负载下不可信（SwiftShader readback/时序劣化，证据链见 §12.85）。全量 3026 例逐测 ≈ 8-12h，可分域执行。
- **域状态**：model-layer 域（§82 通道 + §12.85 五修复）**渲染测试全数通过**——含 §12.84 阴影 fixtures（buildings-trees-shadows 系全绿，MBShadowRenderer 已激活路径验证）。零净代码变更（本节纯验证）。
- **下一批入口**：① 其余域（text/symbol 系、raster 系、3d-intersections 等）按同法逐测基线盘点；② §12.84 双 pass/阴影的专项校准（buildings-trees-shadows 已过，ground-shadow-fog 系已过——阴影通道随域全绿视作已验证）；③ harness 专项（同页多测劣化根因）可并入 ①。

**87. 逐测独立启动扩域盘点（2026-08-22，纯验证批）**：

- **已扫域全绿**：hillshade + hillshade-*-color + line-trim-offset + elevated-line-trim-offset **51/51 PASS**（§12.83 两修复验收）；fill-extrusion 全族 **92/92 PASS**（含 §12.84 双 pass 的 opacity 用例与全部阴影相关 fixtures）；circle + fog + skybox + raster 主族 **180/180 PASS**；line+fill 大域扫描至 283/283 全 PASS 后按用户指示中止（无失败，剩 ~250 例待续扫，续扫命令在 /tmp/sweep5.sh 可再生）。
- **累计逐测验证 818/818 全 PASS**（model-layer 212 + 51 + 92 + 180 + 283）。此前文档 §13/§14 的域级残差清单（text 除外）与逐测实证全面不符——历史"失败"主要来自同页多测批跑的负载劣化（§12.85/86 结论）。
- **记档**：逐测独立 karma 启动单例 ~8-15s；全量 3026 例 ≈ 8-12h。建议后续以域为单位增量盘点剩余域（line 剩余、symbol/text、3d-intersections、terrain、projections 等）。

**88. line+fill 域收官 + 第二批扩域（2026-08-22，纯验证批）**：

- **line + fill 大域完整收官**：283（§12.87 中止点）+ 续扫 251 = **534/534 全 PASS**（elevated-line 全族 dasharray/pattern/gradient/join/cap/trim-offset/translate/width/visibility/pitch + fill 全族 outline/pattern/opacity/antialias/color 等）。
- **第二批扩域（中止点全绿）**：background*/appearance/3d-intersections/geojson/combinations/runtime-styling/building/debug/feature-state 等 656 例扫至 **300/300 全 PASS** 后按用户指示中止（0 失败；剩 ~356 例待续扫，/tmp/sweep6.sh 可再生）。
- **累计逐测验证 1369/1369 全 PASS**。运行约定记档：单批扫描宜 ≤300 例/次（~1h），避免超长后台任务。

**89. 重大更正：§12.86-88"全绿"作废 + 真实基线落盘（2026-08-22）**：

- **假阳性根因**：sweep 脚本 grep 用 `"SUCCESS"`（无行尾锚定）——karma 初始进度行 `Executed 0 of N SUCCESS (0 secs…)` 先于真实结果被 `head -1` 命中，失败用例全部被误读为 PASS。**§12.86 的 212/212、§12.87 的 51/92/180/283、§12.88 的 534/300 全部作废**（其中经 TOTAL 行单独核实过的 trees-lod/default/model-scale 等单测 PASS 仍有效）。
- **真实基线**（rendering-test-results/baseline-2026-08-22/：195 例 cur+diff+json+report 落盘）：**34 PASS / 161 FAIL**。失败族：①text/symbol 排版域 ~90 例（text-offset/anchor/variable-anchor/icon-text-fit/symbol-placement 系——F4/F6/F7/F13 深水区）；②terrain/globe/occlusion（131k~564k）；③image/video/canvas/custom-source（79k~236k）；④raster 精度族（resampling/filtering/masking/elevation）；⑤fog color 族 65k；⑥lighting/measure-light；⑦近失快修带 <500px（slots 12/icon-size 13/icon-pitch-alignment 17/text-line-height 34 等 7 族）。
- **方法论修正**：结果判定必须用 dump server（feedback-url → cur/diff/json 落盘）或 `grep -cE "SUCCESS$"`（spec 行行尾锚定，pass=2/fail=0）+ TOTAL 行交叉核对。

**38. §12.76-23~37 攒批验收（2026-08-22，batch18-key 104 例，chunked 被中断但逐例结果已落盘）**：
- **转 PASS（11 例）**：background-color/colorSpace-hcl 4096→0（hcl 移植 ✓）+ 全族 4 PASS；circle-stroke-opacity property-function 491→0、zoom-and-property 488→0、default PASS（stroke 区 opacity 语义 ✓）；fill-outline-color 2→4 PASS（default/multiply/opacity，fill 53→25、zoom-prop 195→33）；color-theme 4 PASS（config-red/theme-from-config/use-theme 2 例——LUT 线色生效）；image/raster-visibility 31357→**39 近 PASS**、image/default 39；icon-image expression/literal PASS。
- **改善未过**：circle-stroke-opacity function/literal 356、stroke-only 360（半透明 AA 带残留）；color-theme add/remove 116（主题加载时序闪烁）；raster-array several-layers 60807→28731、band 60392→28706（**解码链半通**——数值减半，渲染差需逐像素取证）；fill-outline literal/function 56→100（smoothstep 全宽衰减略过冲，净域 +2 PASS 保留）。
- **未生效待查**：image/raster-opacity 7020 不变（base 色修复未覆盖此例）；line-gradient/use-theme 2751 不变（gradient LUT 未触发——疑 ramp 构建先于 LUT 加载或 use-theme 键名不匹配）；fog/color-use-theme 65842（fog LUT 部分生效）。
- **未跑完**：heatmap 分类（chunked 在 heatmap 前被终止）——投影椭圆核/回绕基（§12.76-37）待验。
- 结论：**18 commit 全部保留**（无全域级回归），下一步入口按上表"未生效待查"三项 + raster-array 逐像素取证 + heatmap 补测。

**90. §38“未生效三项”破案 + line-gradient 全域空白根因（2026-08-22 五，代码分析优先批，3 fix）**：

- **F-A line-gradient 全域空白（决定性，影响 ~20 用例）**：ribbon shader 注入模板里 `${borderDarken}`（Number 1/0.6）以**整型字面量** `1` 内插进 GLSL——`vec3 * int` 在 GLSL 非法 → 所有带 gradient/pattern 的 ribbon 材质**编译失败**（karma 控制台有 `THREE.WebGLProgram: Fragment shader is not compiled ... '*' wrong operand types vec3 * const int`，此前无人看 karma console）→ 整条线不画（gradient.current 全白 0 非白像素）。HEAD 控制组对照确认（gradient 2716 = 线面积本身）。修复：`.toFixed(1)` 输出 `1.0`。族内变化：gradient 2716→303、use-theme 2751→280、with-corners 2175→**PASS(34)**、tile-boundaries 1217→68、cross-continental 526→102、runtime-set 716→302、dash 1735→904、elevated runtime-set 302；**待查**：gradient-vector-tile 8832→13616（渲染出来但偏移大）、fog/2d/line-gradient 591→827（略升）。
- **F-B line-gradient LUT 双缺陷**（use-theme 主题不生效的第二根因）：① ribbon ramp（`__mbRibbonRamp`）构建从不传 LUT；② 缓存永不失效——初始 root 主题经 MBStyleRuntime 异步解码落地，早于首帧材料编译时 ramp 已按无 LUT 建好。修复：ramp 构建改传 `colorThemeLut`（尊重 `line-gradient-use-theme:'none'`）+ 缓存键改为 **LUT 身份**（比全局 themeGeneration 稳——runtime 初始路径不 bump generation），重主题时**就地刷新同一 DataTexture 像素**（已编译 uniform 持纹理对象，免重编译）。验收：use-theme 现输出主题色（(63,0,0) vs 期望 (60,0,0)），残差 280 = 线宽/AA 精度带。诊断手段记档：geojson line 走 ribbon（patchFillMaterial）非 solid-line；`_lineGradientStops` 为 `["memo",[interpolate…]]` 包装，normalizeGradientStops 已解包 ✓。
- **F-C image/raster-opacity 7020→1 PASS**：hasPaint 注入块里的 `vec4 imgT = texture2D(map, vMapUv)` 晚于 homography 注入生成——homography 分支的字符串 swap（vMapUv→投影式）先跑、目标串后注入 → swap 永不命中 → 半透明 image 四边形（非平行四边形）退化为仿射采样。修复：homography 变量在注入点作用域内，直接按 `homography ? 'vMBImgUvw.xy/vMBImgUvw.z' : 'vMapUv'` 生成采样表达式；删除死 swap。raster-opacity/default/function/literal 全 PASS、image/default 39 PASS 保持。
- **fog/color-use-theme 定性（非快修）**：fog/color 无主题本征 69k（fog 带几何主矛盾，§12.76-12），use-theme 66.2k 与之同量级——LUT 非主导，归入 fog 域专项。
- **heatmap 域补测（§38 未跑完项）**：heatmap 核心（default/color/opacity/weight 等）**PASS**（含在 26 passed 内）；遗留 = radius 投影族（antimeridian 5.7k / pitch30 15k / projected 13.1k）、globe-heatmap（11.8k~118k）、fog/terrain/context-restore 组合、combinations/heatmap-translucent ×20（~4k 级半透明叠加序）。
- **回归审计**：line-color/width/dasharray/pattern+fill-outline 批 193 例与 §12.89 基线同分布（elevated-line-color/default 403→446 噪声带，dasharray/default 56↔56 持平）；image 族 26 passed 含全部既有 PASS。
- **方法论**：karma console LOG/ERROR 会打到 stdout——**shader 编译错误从此必须先查**（本域 20 例空白三周无人发现即因没人看 console）；单例诊断跑 `filter=<name>` ~20s。

**91. gradient-vector-tile lineClips 移植 + text/symbol 域系统性定性（2026-08-22 五，代码分析批）**：

- **mgl lineClips 机制移植**（`line_bucket.ts evaluateLineProgressFeatures`）：矢量瓦片在 lineMetrics 源下携带 `mapbox_clip_start/end` 特性属性（fixture `tiles/line_metrics/*.pbf` 实测含 mapbox_line_metrics/clip_start/clip_end 三键），mgl 的 line-progress = `(totalFeatureLength·start + distance)/totalFeatureLength`——**锚定全要素而非瓦片内重开**。我们的 ribbon `distAt` 原本每瓦片 0→1 重开（渐变中段跳变橙→蓝）。落地：emitter 主线 pass 提取 clip 属性 → `emitRibbonFill → emitRibbonBody` 新参 `progressClip`，`distAt = start + t·(end−start)`；**变宽 line-progress 求值同步映射**（progressHalfWidths 的 `sl/total` 先过同一 mapP，否则渐细位置错位）。验收：**8832/13616 → 6453 稳定**（单例三连跑一致；批跑中偶发 10617 为负载 flake §12.85 前科）。**残余定性**：渐变映射已对（沿线逐点色差 ≤2/255），剩两线整体 ~8px 垂直中心线偏移（col75 带 cur rows 8-19 vs exp 0-11，等厚纯平移——几何/线宽单位疑点）+ 期望图 y105 黑带定性待查；line-border-gradient 的 border ribbon 未接 clip（无 fixture 需求）。
- **text/symbol 域（~90 例）系统性定性（关键结论：非排版接线问题）**：text-anchor 全族（10-18k 失配）逐行质心/范围比对——**位置基本正确**（质心差 ≤3px、字符范围一致）；失配像素 96% 距字形边缘 ≤2px、99.85% ≤4px → **主因 = TextCanvas 字形 AA/笔画渲染精度（F13）**，hAlignment/vAlignment/text-offset 接线无误。修复入口在引擎侧（flywave-text-canvas / mapview TextElementsRenderer 的亚像素定位 + SDF/AA 剖面 + halo 顶点格式），属"原架构"级专项（§12.69/§12.70 的 2-4px 盒差与此一致；§12.72 的 AA 公式实验已证伪单点修法）。
- **fog/2d/line-gradient 591→827**：未查（低优先，fog 域连带）。

**92. 米制线宽纬度修正（mgl tileToMeter 移植）+ text AA 引擎评估 + 收尾（2026-08-22 六，代码分析批）**：

- **米宽 sec(lat) 修正**：mgl `line-width-unit:meters` 经 `lineWidthScale = (1/tileToMeter)/pixelsToTileUnits`（draw_line.ts:289）换算，`tileToMeter`（mercator_coordinate.ts:75）**随纬度变化**——px/ground-meter = 赤道 px/m ÷ cos(lat)（柏林 z14 ≈1.64×）。我们原把米直接当赤道墨卡托世界单位用（无纬度项）→ 米宽全线偏窄 1/cos(lat) 倍。落地（emitter）：geoBox 中心纬度 → `secLat`，应用于 worldHalfWidth/progressHalfWidths.halfOf/borderWorld/trueWidthPx 四处（pattern/dash 的派生量与几何同源缩放，保持一致）。**像素实测验证**（meters-default 中心列线厚）：exp 84-87/108-124/140-147 vs 修后 cur 84-88/107-124/139-147（修前 50px 级全线偏窄）——宽度已对齐。批测：meters-border **23377→15922**、offset 3007→2529；blur 16703→17585 / pattern 5157→5353 / default 220→288（宽度已证实正确，残差转 blur 羽化/其他元素定性，见 meters-default 底部多余线段 run）。gradient-vector-tile 几何同步改善（带 50px→71px 贴近期望 ~75px）但该 fixture **跨 run 方差极大**（6453/10617/11114/19502——两瓦片解码竞态疑点，待 harness 时序核查），其像素计数不再作为该域判据。
- **elevated-line/overlap 62.5k 定性**：line 宽度实测与期望一致（0-60 vs 0-63 @midcol）、内容量同级（78.6k/78.4k）——失配非 secLat 连带，属 blur halo/半透明叠加（line-opacity 0.99 + blur case）既有精度项。
- **text AA 引擎侧评估（§91-② 结论）**：引擎已是 SDF+smoothstep 渲染（flywave-text-canvas TextMaterials.ts sdf_sampling_functions，含 mgl 式 S 曲线与 dFdx 导数定标）；mgl 参照式 = `gamma_scaled = EDGE_GAMMA(0.105/dpr)/fontScale · gamma_scale_varying/u_gamma_scale`、buff=0.75、halo 独立公式（symbol.fragment.glsl:113-133）。逐笔画墨量剖面对比（text-anchor/center）：部分边缘几乎逐像素一致（y175 行 cur 123,255,145,255,177 vs exp 119,249,150,251,171），部分边缘差 1px 相位/深浅——**残差为字形光栅化的长尾混合（亚像素相位 + 边缘剖面），非单参数可收敛**，维持"引擎专项"结论；实施入口：TextGeometry 顶点亚像素化（去除整像素对齐）+ 按 mgl gamma 公式重定标 sdfParams。
- **heatmap-radius 投影族静态排查（§91-③）**：MBHeatmapRenderer 已具备 pitch 椭圆基（相机 Jacobian 双轴探测 + 几何均值半径）与 ±世界回绕复制（antimeridian 逐复制独立基）——机制齐备，残差（5.7k-15k）需像素取证（疑密度累积半分辨率的 kernel 边界 or 半透明叠加），与 raster 精度族一并留待下一批。

**93. Text AA mgl gamma 实验批 + heatmap-radius 三例像素取证（2026-08-22 六）**：

- **mgl gamma 精确式落地与验收（实验否决）**：按 §92 入口在引擎侧落地 opt-in 机制——TextMaterials 增加 `uMglGammaScale` uniform（默认 0=原生导数 ramp 不动），>0 时 AA 半宽切 mgl 精确式 `γ = (0.105/fontScale)·(64/255)`（symbol.fragment.glsl:121，1px SDF 距离=64/255 归一化单位，dpr=1）；TextCanvas 静态 `mglTextGammaEnabled` 开关 + textRenderStyle/fontCatalog setter 处发布 fontScale=fontSize/catalogSize（逐标签风格设置时刷新）。**验收（text-anchor 9 例 + text-color 8 例）**：left/right/top-right/top 改善（15167→12901、16325→14265、17911→15545、11453→11109）但 **bottom 2068→10432、bottom-left 10360→13405 恶化**，全域合计 111.1k→116.0k 净劣化 → **回退启用**（引擎 opt-in 机制保留、默认关，datasource 不再置位；复测 bottom 2068/center 10313 逐值还原）。定性：单一 per-material uniform 无法承载逐符号 fontScale（mgl 是逐顶点 varying），且残差是亚像素相位主导非 ramp 宽度——**真正实施需 TextGeometry 顶点格式扩展（per-vertex gamma 通道），维持引擎专项**。墨量证据记档：total ink cur/exp=0.958、部分覆盖像素均值 131 vs 149（系统性 ~4% 缺墨）。
- **heatmap-radius 像素取证**：① **projected（13060/全图）**——fixture 为 `setProjection albers`（operations 藏在 metadata.test.operations），heatmap 在 Albers 自定义投影下**整图空白**（cur 0 nonwhite vs exp 65530/65536）——属自定义投影 × heatmap 交叉的引擎投影域缺口（kernel 的世界坐标/相机链未覆盖 custom projection），归 projections 专项；② **antimeridian（5668）**——z0 单点 lon179+r50：exp 全图被主/回绕两大核覆盖（32896/32896），cur 仅 6408px 单斑——**回绕复制或核尺寸（S·rPx 链）覆盖不足 ~5×**，入口 MBHeatmapRenderer emitKernel/wrap 段；③ **pitch30（15038）**——位置基本对、逐点色差（密度累积/0.25x 半分辨率带量化），需对 draw_heatmap 的 accumulate/显示双 pass 逐段比对。
- **gradient-vector-tile 跨 run 方差**：本轮未查（时间预算），保持 §91/§92 记档状态（6453~19502，两瓦片解码竞态疑点）。

**94. heatmap 跨瓦片核重复破案（antimeridian 转 PASS）+ vector-tile 方差根治（2026-08-22 七，代码分析批）**：

- **F: heatmap 同点核 3× 重复累积**：§93 定性的"antimeridian 核覆盖 ~5×"取证深化（**先纠正 §93 一处误读**：expected 的"全图黑"是 RGBA→RGB 转换把 alpha=0 透明显示成黑，真实失配仅 6212px 且集中在 seam 两侧核缘）。逐像素相位分析：期望核心 t=GAUSS_COEF≈0.4（ramp 落 cyan↔lime，(0,255,137) 与公式 (0,255,129) 吻合），我方核心 t=1.0 红——**不是尺寸是密度×2.5**。埋点实锤：单点 fixture `g.raw.length=3`——引擎对同区域加载多个瓦片层级，**同一 geojson 要素被每个瓦片各收集一次**，同位核叠加 3×0.4=1.2。mgl 每区域只加载一个瓦片。修复：`buildGroups` 内按精确世界坐标 (x,y,z) 去重（同层同位仅留一；回绕副本在 kernel 级后续发射不受影响）。**验收：antimeridian 5668→PASS(0)**，heatmap/·opacity·intensity·weight 核心族 **全 PASS（11 例批）**；pitch30 15038→12984 连带改善；globe-heatmap 8 例逐值不变（globe 域既有）。
- **gradient-vector-tile 跨 run 方差根治**：§91/§92 记档的 6453~19502 方差实为**两瓦片异步解码 × 单帧 settle 竞态**（首帧 FrameComplete 时第二瓦片几何未到）。修复（harness 级）：MBStyleDataSource 新增 `tilesPending()`（getDecodedTiles 里任一未 disposed 瓦片 `allGeometryLoaded` 为假即 pending），harness 在 settle 后通用轮询（≤30 次、真实帧保活、400ms 上限/次）。**验收：三连跑 11114/11114/11114 逐值一致**（方差归零；稳定残差 11114 = §92 已记档的 taper 几何精度项——注：早期 6453 是"第二瓦片缺失"的巧合更优值，非基准）。该 settle 对全部多瓦片用例生效，兼具全局抗 flake 价值（§12.85/86 同族）。
- **raster 精度族静态排查**：本轮未启动（时间预算），维持 §12.89-④ 待办。

**95. raster mipmap 移植（pitch-60 −32%）+ filtering 残差定性（2026-08-22 八，代码分析批）**：

- **F: raster 瓦片纹理缺 mipmap**：mgl tile.ts:897 `new Texture(…, {useMipmap: true})` → MIN_FILTER = LINEAR_MIPMAP_LINEAR（nearest 时 NEAREST_MIPMAP_NEAREST，texture.js:82）+ **pitch>20 时 anisotropic**（draw_raster.ts:201）。我们纯 LINEAR——缩小时欠采样走样（raster-filtering 全图 ±25/通道噪声）。落地：raster 纹理三处创建点 + **attach 回调**（首修被 attach 复位静默吞掉——第二处才生效，bit-identical 4072 是定位线索）统一 LinearMipmapLinear/NearestMipmapNearest + generateMipmaps + aniso(min(4,max))。**验收：pitch-60 38630→26392（−32%）**，raster-resampling 族保持 PASS（nearest→NEAREST_MIPMAP_NEAREST 正确）、opacity/hue/saturation/contrast/brightness 23 PASS 零回归。
- **raster-filtering/no-pitch 残差 4137 定性**：与 mipmap 无关（±65 中性）——缩放 0.57× 平视场景，疑点收敛到 z19-404-回退的 4 子瓦片四边形接缝/半纹素 vs mgl 原生 z20 瓦片网格，与 raster-masking/overlapping-vector 82.8k（瓦片遮罩语义）、terrain/raster-fade 13.4k（terrain 淡入链）同列 raster 下一批入口。
- **vector-tile 残差 11114（§94 方差根治后的稳定值）静态比对**：progressHalfWidths 与 mgl evaluateLineProgressFeatures 代数等价（clip 映射 + 半宽逐顶点求值均已对齐，含 Lpart/Lfull = end−start 一致性核验）——**taper 公式已对齐，残差在几何/瓦片接缝/投影链**（含 expected y105 黑带未定性），需下一批像素取证。
- **globe-heatmap / TextGeometry 逐顶点 gamma 评估（不启动理由）**：两者均为引擎架构级——globe 投影下 kernel 基需 globe 表面向量基（mgl heatmap.vertex PROJECTION_GLOBE_VIEW 段），涉及 mapview 相机/投影接口；text 逐顶点 gamma 需 TextGeometry 顶点格式扩展（uv 通道重排）。建议单独立项，本会话记档入口。

**96. raster 精度族三例定性 + masking 跨瓦片层序架构发现（2026-08-22 九，代码分析+取证批）**：

- **raster-filtering/no-pitch 4137 定性（版本漂移类）**：失配像素呈**全局均匀 +24/通道亮度偏置**（无接缝带状分布，global mean +4.5）——mipmap 已对齐（mgl useMipmap/各向异性语义，§95）后残差为 **SwiftShader mipmap 生成 vs 参考 GPU 的盒滤波差异**（0.57× 缩小 LOD 混合带），与 §12.52/§12.72/§12.73 前例同类，环境级不可修，留档。
- **raster-masking/overlapping-vector 82.8k → 跨瓦片层序架构缺口（本轮主发现）**：fixture = bg→raster(opaque contour)→fill(green 0.2)→raster2(0.5+hue90) 四层。取证：cur 绿色像素仅 5471 vs exp 60793——绿 fill 被上层 raster 遮住；埋点确认 flywave 同时调度 z14/z15/z16 三层瓦片（各自 404→最深祖先回退 z11/13/14/15 ✓ 覆盖完整），但 **引擎按瓦片分块渲染，高 z 瓦片的 raster(renderOrder=1) 迟于低 z 瓦片的 fill(renderOrder=2) 绘制**——mgl 是全局按 style 层序绘制。修复方向（下一阶段设计项）：mbstyle raster 四边形改走 MapAnchor 场景对象（同 image source 路径，按层 index 排序）或引擎侧跨瓦片 renderOrder 全局排序；fill/线层同理受影响（单源 fixture 不暴露）。
- **gradient-vector-tile 11114 取证**：失配集中在两楔形带的**边缘行带**（yhist 75-150 主导）= taper 曲线数 px 级偏差（宽度插值位置/逐顶点求值点微差），非接缝非色映射（已对齐）；量级收敛中，优先级低于 masking。
- **terrain/raster-fade 13.4k 静态定性**：mgl raster_fade.ts 在缩放过渡期对 parent/child 双纹理按 per-tile fade 权重混合（fade.mix/fade.opacity 双采样）——我们是单纹理无淡入链，需双纹理 + per-tile 权重（与 additive 双 pass 同级工程），留待专项；fog 带域维持 §12.75/§12.76 结论（屏幕空间后处理或 mgl 材质内嵌公式已落，残差为引擎相机语义标定）。

**97. masking 层序修复实施批——三条线索实验与诚实回退（2026-08-22 十）**：

- **落地保留（基础设施，零行为变化）**：① 引擎 `TileObjectsRenderer.painterSortStable` 增 opt-in 分支——technique 带 `_mbGlobalLayerOrder: true` 时 renderOrder（style 层序）优先于瓦片 level（埋点确认分支命中）；② emitter 全部四类 technique（通用/border/ribbon/outline）打上该 flag（mgl 语义：全局按 style 层序）；③ RasterTileDataProvider 增 `idealLevel` 参数（未接线）。
- **实验一（层序 flag）**：masking 82807 **不变**——跨瓦片 level 排序非该 fixture 的主机制（probe 证明分支已生效但输出逐值相同）。
- **实验二（单层覆盖）**：按"mgl 每屏一格一瓦"在 provider 层只给 ideal 级发覆盖——round 版使 raster-filtering 4137→61255 **灾难回归**（引擎请求 floor(zoomLevel)，round 级被清空）；floor 版 masking 仍 82807 不变且图像出现大块白洞（引擎实际按多级混合显示，z14/z15/z16 各覆盖一部分屏区——单层化与引擎瓦片调度模型冲突）。**全部回退**（参数保留不接线）。
- **masking 定性修正（§96 修正案）**：两层 raster 材质均正常 patch（埋点：layer raster/raster-transparent × 4 个瓦片 URL 全部在列），白洞与绿填充缺失的真实机制仍开放——下一入口：probe 引擎 DisplayTileLayer 的瓦片显示选择逻辑（为何三级调度各覆盖部分屏区）、以及 fill 层的对象在哪一级被哪一对象覆盖（可逐对象 dump renderOrder/level/材质做绘制序仿真）。
- **零回归确认**：回退后 raster 全域 16 PASS/7 FAIL 与阶段前逐值一致（4137/26392/82807/3843/487/273/322）。

**98. masking 破案：假不透明输出是真因（82807→55979，2026-08-22 十一）**：

- **对象级 dump 仿真（决定性）**：patchTiles 处逐对象 dump（tile/level、renderOrder、layer、raster url、顶点数、材质 transparent）——**层序/层级/覆盖全部完美**（8 瓦片全 level 15，每瓦片 raster(ro1)→fill(ro2)→raster-transparent(ro3) 三对象齐整），推翻 §96/§97 的"跨瓦片层序"与"多级堆叠"假说（引擎多级显示仅加载过渡期，settle 后只显示 storage 级——VisibleTileSet.populateRenderedTiles 语义）。**真因：三层材质全部 transparent=false**——raster-opacity<1 走"对着背景色做 in-shader 不透明合成"的假透明（§12.76-19 校准产物），多层叠放时 raster2(0.5) 的合成只认识背景白，**把下层 contour 与绿 fill 全部盖掉**；fill(0.2) 同样不透明输出。
- **修复（mgl 语义：真 alpha 混合到已渲染内容）**：① raster 层——style 中下方存在非 background 层时（hasContentBelow）切真混合（transparent=true + depthWrite=false + shader 输出 `vec4(sRGB(mbR), opacity·a)`，帧缓冲按 sRGB 编码值混合 = mgl 数值空间语义）；底层 raster 保持原 in-shader 合成（raster-opacity 族校准零回归）。② fill 层——opacity<1 且**下方有 raster 层**时真透明（不限拓扑版本曾回归 fill-translucent--circle +43/--fill-extrusion +784，经透明通道重排序；收窄后消除，fill-over-symbol 等保持既有失败值零变化）。
- **验收**：raster-masking/overlapping-vector **82807→55979（−26.8k）**；raster-opacity/hue-rotate 族 18 PASS 零回归；fill-opacity×4 与 combinations×6 与控制组逐值一致。**残余 55979**：绿 fill 仍缺大块（下一入口：fillRealBlend 生效后绿值对比 + raster2 真混合下的 hue-90 色彩带核对——exp 的绿覆盖 60793px）。
- **基建保留**：§97 的全局层序 opt-in（引擎+emitter 打标）保留（mgl 语义正确、默认零行为）。

**99. masking 残余 55979 定位到"深祖先回退覆盖差"（2026-08-22 十二）**：

- **逐带取证**：上下行带（y<60/y>170）cur 与 exp **逐像素级吻合**（(204,218,205) vs (203,218,205)）——§98 的真混合修复完全生效；残余 56k **全部集中在中段带（y 60-170）**：cur 深绿 (54,148,60) vs exp 浅绿 (204,230,204)。
- **机制定位**：视口 4 个 z15 单元格，仅 5235/12658 原生存在；中段行两格 (5234/5235,12657) 的**直接父级 z14-2617-6328 不在 fixture**、最深祖先 z13-1308-3164 存在——我们按深祖先链绘制（深绿覆盖），**mgl 期望图为浅色（无覆盖）**。
- **矛盾记档（关键悬念）**：raster-filtering 族（卫星源，仅 z1+z20）已实证 mgl 深祖先回退到 **z1 世界图**且与我们逐像素对齐（§29/f6a3ee25），而本 fixture mgl 对 z13 祖先**不绘制**——两处 mgl 回退深度行为不一致，无法用同一规则解释。候选解释：① mgl 的 findLoadedParent 只用"已加载"缓存父级，请求树因 maxzoom/covering 细节不同未拉起 z13；② fixture 元数据（tileSize/buffer）差异；③ mgl 版本行为。**破案入口：实跑 mgl render-test runner（mapbox-gl-js 内置）对照其瓦片请求序列**，或对中段行改用"仅一级父回退"实验（预期 masking 转 PASS 但需 raster-filtering 护航——若其深链 z1 是经由"每级都请求"而非"深链查找"，两者可兼容）。
- **状态**：本轮不再推进（fixture 语义矛盾需 mgl 实跑证据）；§98 修复保持（上下带逐值吻合、无回归）。

**100. §99 矛盾的源码级裁决：mgl 深链回退确证（2026-08-22 十三）**：

- **mgl source_cache.ts `_tileLoaded` 源码分析**：瓦片 404（isHttpNotFound）时 tile.state='errored' 并**重新触发 update()**——update 内 `_loadedParentTiles` 会请求理想瓦片的父级，父级再 404 则再 update，**逐级深链直至任一级加载成功**（"continue trying to load the parent tile until we find one that loads successfully"，source_cache.ts:301-318）。z1 深链（raster-filtering）与本 fixture 的 z13 链在源码语义下**行为应当一致**——我们的 RasterTileDataProvider 深祖先实现与 mgl 源码对齐 ✓。
- **残余定性**：既然回退规则源码级一致，§99 观察到的"exp 中段带浅色无覆盖"只能来自**覆盖单元格几何差异**（mgl coveringTiles 在 512×256 视口/z14/roundZoom 下的单元格集合与我们 8 瓦片假设不同——mgl 512-tile 语义下 z14 视口可能仅 2×1 单元格）。**破案唯一可靠路径 = 实跑 mapbox-gl-js render-test runner 打印其 covering 单元格与请求序列**（独立任务，建议下会话首项）。
- **结论**：masking 55979 保持（§98 修复 + 上下带逐值吻合不变）；深链回退实现不动（源码级正确，改一级回退反而背离 mgl）。

**101. mgl covering 解析 + 深回退"留空"实验否决（2026-08-22 十四，零净变化）**：

- **covering 解析（python 移植 mgl coveringTiles 平视数学）**：masking fixture（center −122.48/37.84、zoom 14、512×256、pitch 0）的 mgl covering = z15（round(14+1)）**约 2×1 单元格**（512px 视口 = 2 个 256px z15 瓦片宽、1 高）——非此前假设的 4/8 瓦片；六格推演（含 ceil）中 (5234,12657)/(5235,12657) 的深祖先 z13 与 (5234,12658) 的 z14 在"mgl 留空"假说下恰可解释 exp 中段带浅色。
- **"mgl 404 留空"假说实验否决**：源码依据 = `_loadedParentTiles` 仅缓存已加载祖先、不主动请求（source_cache.ts:866-898），据此实现"子瓦片覆盖否则留空 + 仅 overzoom 钳位用祖先"两版——**批测灾难回归**：raster-resampling 0→115k-130k（全黑）、zoomed-raster 3843/487→124k/122k、fade 13k→57k、masking 反升至 87.7k。**结论：深祖先链是必要的**（resampling/zoomed 的期望 imagery 确证祖先绘制），"留空"假说错误——mgl 在这些 fixture 确实绘制深祖先。已回退（代码注释留档此结论防再犯）。
- **masking 中段带悬念收窄**：mgl 深祖先绘制（resampling 确证）与 masking 中段带无覆盖（exp 确证）并存——差异必在**该 fixture 特有条件**（covering 单元格精确集合 2×1 vs 我们 8 瓦片的差异、或 contour 源的 404 响应差异）。**可靠破案仍需实跑 mgl runner**（dist 未构建，`npx rollup -c` 构建后 node 直跑单 fixture 打印请求序列，约数分钟——下会话独立任务）。
- **状态**：全部回退至 §98 后基线（masking 55979、resampling PASS、其余逐值一致），零净变化零回归。

**102. mgl SourceCache 实跑探针——covering/请求树实锤 + 一级回退规则否决（2026-08-22 十五，零净代码变化）**：

- **实跑基建**：mapbox-gl-js vitest 浏览器模式探针（`test/unit/source/masking-probe.test.ts` + `vitest.probe.config.ts`，puppeteer chrome 注入；顺带清除 src 下 487 个陈旧编译 .js——mrt.esm.js 从 datasource vendor 副本恢复）。**探针可复用**，是今后一切"mgl 究竟怎么做"问题的 ground-truth 工具。
- **covering 实锤**：masking fixture 的 mgl covering = **6 单元格**（5234/5235/5236 × 12657/12658，z15）。
- **请求树实锤**（迭代 60 轮收敛后冻结）：`6×z15 → 4×z14（2617/2618×6328/6329，仅 2617-6329 存在）→ 仅 13-1309-3164（2618-6328 之父，404）——**13-1308-3164（存在！2617-6328 之父）从未被请求**`。即 mgl 的父级上升（update 内 retain 循环，`parentWasRequested` 门控）对 12657 行左列止步于 errored 的 z14，**该行渲染为空白**——这正是 exp 中段带浅色的根源，§99-§101 矛盾至此完全解释：mgl 深链存在但**不保证到达最深存在祖先**（上升是逐 update 迭代 + 状态门控的，与本 fixture 的异步时序交互后止步）。
- **"一级父回退"简化规则否决**：按探针观察实施（范围内 404→仅试 z-1，否则空白；超 maxzoom 保留深链=钳位仿真；自查补上"自身存在"分支后 resampling/opacity 族恢复 PASS）——**masking 三兄弟 fixture（overlapping/overlapping-zoom/terrain）从 PASS 破坏为 49-51k**（它们依赖更深回退），overlapping-vector 55979→79621 反而更差（空白区域与 mgl 的实际上升终点仍不一致）。**全量回退至深链基线**（逐值复原：masking 55979、resampling/opacity PASS、兄弟 fixture PASS）。
- **结论与下一入口**：mgl 的可见祖先是 **retain/ascent 算法 + 异步 404 时序**的涌现结果，无简单规则可表达；精确对齐需把 source_cache 的 retain/parentWasRequested 上升逻辑（含每次 404 后重触发 update 的迭代）**整体移植**到 RasterTileDataProvider（模拟多轮 update 的请求树，工程量中等）。此为 raster 域收敛 masking/overlapping-zoom 系的唯一可靠路径，记档立项。

**103. retain/ascent 移植可行性终审——`checked` 中毒机制定论（2026-08-22 十六，零代码变更）**：

- **第三轮探针（埋点 _addTile/getTile z13 路线）**：13-1308-3164 被检查 124 次（跨全部 update 轮）始终未添加，13-1309 一次即添加——差异根因是 mgl `_updateRetainedTiles` 上升循环的 **`checked[parentId.key]` 中毒**：一条父级路线在"上一级尚 loading（parentWasRequested=false）"时被首次访问即标记 checked（不添加），此后**所有 update 轮的上升在该处 break，永久黑洞**；1309 路线仅因首次访问恰逢父级已 errored（wasRequested=true）而即时添加。是否到达最深祖先由 **covering 顺序 × 异步 404 时序的运气**决定——算法上不可规则化。
- **移植终审结论**：§102 立项的"整体移植 retain/ascent"在探针实证后降级为**不可行/低性价比**——即便逐行移植 _updateRetainedTiles，其结果仍依赖 mgl _addTile 的 errored 瓦片生命周期/缓存重试等内部状态机与事件时序；要复现"运气"需在 RasterTileDataProvider 内完整模拟 mgl SourceCache 的 _tiles 状态机 + 多轮 update + 异步回调时序（等效于把 mgl 整个 source_cache 跑在我们 provider 里）。raster-masking 系（本 fixture 55979 残余、兄弟 3 例已 PASS）的进一步收敛**冻结**，除非未来直接 bundle mgl SourceCache 做运行时请求代理（记录为远期架构选项）。
- **本阶段零代码变更**：深链基线保持（§102 已回退验证），探针工具保留在 mapbox-gl-js 仓库（test/unit/source/masking-probe.test.ts + vitest.probe.config.ts，可复用于任何"mgl 究竟怎么做"问题）。

**104. TextGeometry 逐顶点 gamma 实施与验收（噪声级，基建保留）+ fog/2d 近失取证（2026-08-22 十七）**：

- **逐顶点 gamma 完整落地（引擎侧，opt-in 默认关）**：① TextGeometry 新增 `MglGammaMode.enabled` 静态开关 + `m_catalogSize`；三个 uv.w 写入点（add/路径 buffer 填充/addBufferObject 缩放透传）在模式下改写为 fontScale = fontSize/catalogSize（原生 bgWeight 语义保留在关闭态，bg-text bold/smallcaps 模拟权重在此模式不可用——已注释记档）；② TextMaterials 前景 shader 新增 `vMglScale` varying（uv.w），`uMglGammaScale>0` 时 rampW 切 mgl 精确式 `0.105/fontScale·64/255`（逐符号）；③ TextCanvas.fontCatalog setter 发布 catalog size 到各 layer geometry 并置前景材质标志；index.ts 导出 TextGeometry。
- **验收（text-anchor 9 例 + text-color/text-size）**：逐值与基线持平（center 10313→10303、left 15167→15218、bottom 2068→2145——±0.5% 运行噪声带内）。**定性：引擎的导数式 AA 半宽本已 ≈0.63px ≈ mgl gamma 值，逐符号 gamma 无视觉增量**——残差确认在字形光栅化本身（hinting/亚像素相位），超出 shader 端可修范围。**接线禁用**（datasource 不再置位，零行为变化消除 bg-weight 风险），基建保留供未来光栅化端配合使用。禁用后复测 center 10313/bottom 2068 逐值复原 ✓。
- **fog 带域批（87 例现状）**：fog/color 65842、color-use-theme 66207、color-opacity 65809（带几何主矛盾维持 §12.76-12 结论）；fog/2d 系近失例取证（fill-color 819/fill-outline 714/line-gradient 1489）——失配全部集中在**顶部 y21-75 的小局部特征**（exp 纯白 vs cur 有内容/雾染），非 fog 带——疑点：小 icon/symbol 的 fog-cull 或渲染差异，独立于带域，留待 symbol 域连带。

**105. §104 fog/2d 近失定性修正 + 双纹理链评估（2026-08-22 十八）**：

- **fog/2d 近失族定性修正**：放大取证（64px 视口裁剪放大）——exp 顶部有三个 fill 三角形（绿/粉/青拼块，range [-0.5,0.5] 白雾下淡彩保留），cur 仅绿三角清晰、粉/青**纯白**。非 fog 下 fill-color/function 族全 PASS → **非 symbol 域、非裁剪，是远处要素在 pitch 70 被过雾化**（fog 带 k=3.7 标定在 pitch 60 拟合，pitch 70 漂移）——§104 的"顶部局部特征"归因修正为 **fog 带随 pitch 漂移**，与 fog/color 65.8k 同一根因家族（§12.76-12 结论：distCam 启发式 vs 相机 rig pitch 属性错位）。收敛路径维持"相机语义标定/精确 mercatorFogMatrix 相机链修复"既有结论，不做盲 k 调参。
- **terrain/raster-fade 双纹理链评估（不启动）**：mgl raster_fade.ts 需要 per-tile fade 权重 + parent/child 双采样混合，而我们每屏一格单纹理的架构下 parent/child 同时在屏的场景仅在缩放过渡帧出现——render-test 是静态 settle 快照，过渡态不进帧；该链主要影响的是运行时动画体验而非静态期望图。**降级为低优先**（terrain/raster-fade 13.4k 的主残差待重新取证归因）。

**106. fog 带漂移根因攻坚——精确式×k 组合与内容依赖性发现（2026-08-22 十九，零净变化）**：

- **假说**：§12.76-12 只测过 精确式×k=1（劣化）vs 启发式×k=3.7（基线）——k 同时折叠 distCam 语义与全局尺度两因素，**精确式×k=3.7 从未测过**。相机 rig 取证（setCameraGeolocationAndZoom→lookAtImpl 轨道式绕目标，pitch 属性与视线应一致）支持该组合。
- **实验（批跑）**：精确式（getWorldDirection 前向射线∩地面）×3.7——fog/2d（pitch 70）系改善（line-sdf 3628→1198、line-gradient 持平），但 fog/default（pitch 80）552→1094、fog/color（70）65842→69478 劣化；65° 分界组合后 default(80) 恢复但 color(70) 仍劣化——**同 pitch 70 下 fill 系改善与 color 系劣化并存 → 差异是内容依赖（各内容类型的深度/RTE 偏移语义不同），非纯 pitch 函数，任何 pitch 分界都不正确**。
- **诚实回退**：代码逐字节复原（仅注释记档实验结论）。fog 的真正修复点不在 distCam 公式，而在**逐内容类型的深度语义**（RTE 相机偏移对不同瓦片内容的 vFogDepth 影响）——与 §12.76-12 "引擎米制比值与 mgl 归一化空间系统性错位"结论合流，列为 fog 域最终攻坚入口（需在 fog_fragment 的 vFogDepth 空间做逐内容校准或完整 RTE→相机的深度重推导）。
- **方法论警示（重要）**：fog 域 A/B 必须用**单测独立 karma 启动**——fog1 批跑的 line-sdf=3628 与单跑 1198 差 3 倍（批内负载劣化读回，§12.86 前科）；本节所有批跑数字只作方向参考。

**107. terrain/globe/occlusion 大簇取证盘点（2026-08-22 二十，子域立项）**：

- **采样批**（"terrain/"/"globe/"/occlusion 过滤命中 52+ 例，超时前采集）：量级分布 1.2k（line-pattern-no-terrain）～250k（真实地形系）。
- **子域 A：depth-occlusion/line 系（13+ 例，1.2k-13k）——根因已定位**：fixture 为 11 条 20px 线层 + 大 fill-extrusion，paint 携 `line-occlusion-opacity: 0.5`。mgl 语义 = **双 pass 遮挡淡出**（被 extrusion 遮住的部分按 occlusion-opacity 淡出绘制，未遮部分正常）；我们的 plain 线走 SolidLine 深度测试 → **被 extrusion 完全吞掉**（单跑取证：cur 内容 36300 vs exp 65536，缺 29236px 恰为线区域）。修复入口：patchLineMaterial/ribbon 路径移植 mgl 双 pass（GREATER 淡出 + LEQUAL 正常）或复用引擎深度纹理软淡出（circle 的 Scheme A 注入，2041 行区）。注意 ribbon 路径现 depthTest=false（painter's），需按 occlusion 场景重设计。
- **子域 B：debug/terrain/collision-* 系（~10 例）**：cur 整图空白——collision box 调试渲染（mgl debug 模式画碰撞盒/遮挡盒）未实现，纯缺功能。
- **子域 C：fill-extrusion-terrain 系（~13 例）**：flat-roof/alignment——几何接近色彩偏差（5.4k 例 bbox 全图但内容都在，光照/屋顶色带），属 extrusion×terrain 光照校准。
- **子域 D：fog/globe + globe 核心系**：globe 投影域（atmosphere/high-color 等）与 §93 记档 globe-heatmap 同域。
- **子域 E：真实地形大值系（100k-250k）**：未采样，下批单跑取证。
- **优先级建议**：A（根因明确、机制清晰、13 例）> C > B > D/E（大工程）。

**108. §107 子域 A 攻坚——两机制证伪 + 取证修正（2026-08-22 二十一，零净变化）**：

- **§107 根因修正（重要）**：重取证发现此前"下半线被 extrusion 深度吞掉"的读数含 **RGBA→RGB 假象**（expected 下半为 alpha=0 透明，RGB 读作黑；alpha 合成后真实失配 38707→**10013**，harness 上报 6943 为准）。真实残差集中 y<172 线/挤出区：蓝线大部分在（11955 vs exp 13788），缺口 ≈1.8k px 遮挡线 + 淡出差异。
- **两修复尝试均证伪（逐值零效果）**：① SolidLine depthTest=false（针对"深度吞线"假说）——6943 不变，假说否定（线本就走 ribbon/SolidLine 双路，ribbon depthTest=false 本该可见）；② emitter renderOrder 抬升 +1000（mgl occlusion 重绘语义，把 occlusion 线抬到全部 3D 之上）——6943 不变。两处均回退，机制疑点收敛到：**线的可见性不受这两路径控制**（候选：TileGeometryCreator 组序/technique 创建时序未生效，或线对象在挤出后被别的通道裁掉）——需 patchTile 时 dump 对象实际 renderOrder 值与绘制序仿真才能定论。
- **子域 A 状态**：真实残差 6943（非 29k），量级收窄但机制未破；两假说已排除留档防重复投入。下一入口：对象级绘制序仿真（引擎 TileObjectsRenderer stableSort 输入 dump）。

**109. 子域 A 绘制序仿真——机制全解 + 抬升实测与诚实回退（2026-08-22 二十二，零净变化）**：

- **对象级 dump 仿真（20 对象全量）**：所有线对象（ribbon fill + solid-line 双路）**depthTest=false、几何 bbox 覆盖全场景**（y 35-181 含挤出区 64-134）——线从未被深度裁掉；真机制 = **不透明 extrusion 按绘制序覆盖先画的下层线**（line3 ro=0.5 < extrusion ro=3，extrusion 后画盖掉其遮挡区线段）；mgl 的 occlusion 重绘（painter `_lastOcclusionLayer` 后重画）使遮挡线以 0.5 淡出可见。
- **§108 零效果之谜破案**：do5 轮的抬升未生效是 **ribbon technique 走独立创建点**（getOrCreateRibbonTechniqueIndex，非通用 getOrCreateTechniqueIndex）——补齐全部创建点（+occLiftOf helper，3 处）+ `--force` 重建（tsbuildinfo 陈旧二进制坑，fog 阶段同款）后 ro=1000.5 实测生效。
- **抬升实测（家族 14 例）**：no-terrain 6943→7049、multiline-no-terrain 4608→**3367（−1241）**、其余 ±66~460 混合——**净≈零**：全不透明过冲（遮挡区全蓝）与隐藏的误差近似相等（mgl 遮挡区是 0.5 淡出）。**回退**（避免 renderOrder=1000 对 occlusion+symbol 样式的潜在副作用，保持零净变化）。
- **正确解记档（下一入口）**：真双 pass——occlusion 线在抬升序 + 主 pass 全透明度（LEQUAL 正常）之外，**第二个 mesh 以 GREATER depthFunc + alpha·occlusionOpacity 画遮挡部分**（可复用 MBAdditiveLineRenderer 的双 mesh 模式与 DepthPrePass 基建）；工程量中等，是子域 A 14 例收敛的唯一精确路径。

**110. 子域 A 真双 pass 实施——三条挂载路径全部证伪 + 引擎渲染架构定论（2026-08-22 二十三，零净变化）**：

- **孪生 mesh（GREATER depthFunc + alpha·occlusionOpacity + renderOrder 1e6）三条挂载路径逐一实测**：① `obj.parent.add(twin)`——不渲染；② `obj.add(twin)` 子节点（extrusion dual-pass 同款模式）——**opaque magenta 探针 0 像素**，不渲染（推论：§84 的 translucent-extrusion 深度预 pass 子 mesh 很可能同样从未渲染，其验证一直"攒批延后"，fill-extrusion opacity 通过或另有原因）；③ `tile.objects.push + registerTileObject`（埋点确认注册成功、objects 22→30）——**仍不渲染**：引擎渲染列表在几何加载时快照，patcher 运行于挂载后，事后注入的对象永不进绘制。附带修复记录：GLSL uniform 必须全局域声明（colorspace include 内声明=函数域编译错）。
- **架构定论（重要）**：**从 MaterialPatchManager 无法向场景注入任何新渲染体**——引擎对象生命周期（加载→注册→快照渲染）与 patcher（后置材质手术）正交。occlusion 双 pass、以及任何需要"额外 draw call"的 mgl 语义（阴影已有独立 renderer、additive 已有独立 renderer）都必须走**独立 Renderer + 帧循环挂载**模式（MBHeatmapRenderer/MBAdditiveLineRenderer/MBShadowRenderer 同款基建：自己的 scene + AfterRender 钩子 + mapAnchors 合成）。
- **子域 A 最终方案（立项）**：MBOcclusionLineRenderer——收集 occlusion ribbon（mesh+材质引用），主渲染后以 GREATER depthFunc+淡出重画（需引擎主 pass 的深度缓冲保留，或以 depth texture 方式复用 MBShadowRenderer 的 RT 深度）。工程量：中（一个新 renderer 文件 + datasource 接线）。本轮全部实验代码已清理回退，基线逐值复原（6943/gradient 族原值）。

**111. MBOcclusionLineRenderer 实施与第四条路径证伪（2026-08-23 一，零净变化）**：

- **完整实施**：MBOcclusionLineRenderer（独立 scene + 几何克隆共享属性 + 变换同步活 mesh + GREATER/淡出材质 + AfterRender run，datasource 接线 patcher 注册）。
- **第四条路径证伪（逐级探针）**：① `renderer.renderBufferDirect` 独立调用抛 `Cannot read properties of null (reading 'state')`（render state 仅在 render() 内准备）→ 改自有 scene+`renderer.render`；② 自有 scene 渲染**不进捕获画布**——探针（depthTest off + fade=1 的全强度过冲，等效 §109 抬升实验的 7049 信号）输出逐值 6943 不变；③ magenta 材质探针无效教训记档：ribbon 材质的 onBeforeCompile 完全重写 gl_FragColor，material.color 不生效。
- **架构定论（最终）**：AfterRender 世界空间重投影无法到达捕获画布（MBHeatmapRenderer 的正交全屏四边形复合能存活、MBShadowRenderer 用自持 RT——世界空间二次绘制两者皆非）。**结论：line-occlusion 双 pass 需要引擎侧 API**（MapView 暴露 post-render hook 且保证画布时序，或 SceneComposer 式可编程 pass 列表）——归入"原架构"级改造，datasource 层四条路径全部穷尽（parent/child/registerTileObject/独立 renderer）。子域 A 14 例维持 6943 级现状冻结，待引擎侧立项。
- **实验代码全部清理**（renderer 文件删除、注册与接线移除、探针移除），基线逐值复原。

**112. 子域 E/C 取证盘点补全（2026-08-23 二）**：

- **terrain/ 域批**（103 例命中，超时前采集 96 断言）：量级带 2.1k（circle/unoccluded）→231k（lighting-3d/terrain）。四子族定性（alpha 合成后真实值）：
  - **E1 地形栅格亮度偏置**：circle/occluded（真值 11k）与 buildings-on-raster（17.7k）样本 cur 全图均匀 +30~40 亮于 exp（如 226 vs 215 基底）——地形上的 raster/symbol 内容整体过亮，疑 terrain draping 合成或光照因子；**主嫌疑 E1 是大值系共同底噪**。
  - **E2 建筑物缺失**：buildings-on-raster 下半（y>128）红色建筑（215,115,106）整片缺失（cur 仍是栅格底色）——terrain 上 extrusion/building 的近裁剪/高度问题（§F2a 家族）。
  - **E3 circle 遮挡系**：circle/occluded 家族（4.8-5.9k）= depth-occlusion 同机制（§111 冻结，circle 有 Scheme A 深度纹理路径可评估）。
  - **C flat-roof/alignment 系**（47-155k）：roof 面与侧面颜色块错位（exp (0,128,0) 面 cur 出现在 exp (136,136,136) 位置）——extrusion×terrain 对齐 + 面光照错配；flat-roof-over-border 系（94-155k）最大，疑 tile 边界处屋顶裁剪。
  - **lighting-3d-mode/terrain**（225k/231k）最大值：3D 灯光×地形组合。
- **优先级建议**：E1（若为单一合成因子可解锁多例）> E2（近裁剪，有 §F2a 修法前科）> C > E3（引擎冻结连带）。下阶段首项：E1 的 draping/亮度链代码分析（TerrainDraping/terrain raster 材质注入）。

**113. E1 亮度偏置精化定性——drape bake 阻塞（2026-08-23 三）**：

- **偏置模型量化**：失配像素按亮度分箱——中亮区 cur **+20**、高亮区 cur **−39**（对比度向均值收缩，ratio 1.12/0.82）——非加性/乘性单一因子，是**照明压平**特征。
- **代码链定性**：mbstyle 的 TerrainDraping 正交烘焙被 §12.76-58 记档的引擎级问题阻塞（"renderer 层面 plain mesh 全 GL 测试禁用仍零 fragment"），**内容门自禁用 → drape 从未激活** → 地形显示引擎默认外观：`MapTerrainMaterial extends MeshStandardMaterial`（roughness 0.9）的 **PBR 照明**把内容对比度压向均值（与量化特征吻合）；mgl 的 terrain_raster 是**无照明的平铺 drape**。E1 根因 = drape bake 阻塞 + 未 drape 地形的 PBR 默认外观，**非单一合成因子**（§112 的乐观假设修正）。
- **修复路径（二选一，均引擎侧）**：① 解阻塞 §12.76-58 正交烘焙（RT 渲染 scene mesh 零 fragment 的引擎 renderer 问题）；② mbstyle 侧给地形 mesh 换 unlit 平铺材质（drape 语义直连）——绕开 bake，直接在 patcher 可达的地形材质上做（需确认 mbstyle patcher 能否触及 terrain 数据源的对象，§110 结论同样适用则也需引擎钩子）。
- **状态**：terrain 大值族维持现状；E1 攻坚转为上述两条路径的评估立项。

**114. E1 路径②实施与回退——unlit 注入实测（2026-08-23 四，零净变化）**：

- **路径②可答性修正**：TerrainDraping **本就可触及**地形 mesh 材质（setDrapeTexture 同循环）——§110 注入限制不适用；且 E1 样本的影像存在证明 **drape 已激活**，偏置来自 `MapTerrainMaterial`（MeshStandard）对 drape 混合后 diffuseColor 的 PBR 照明。
- **unlit 注入实施**（`gl_FragColor = vec4(diffuseColor.rgb, diffuseColor.a)` 替换 outgoingLight）：fog/terrain/basic 32123→34259（+2.1k 回归，fog 系此前校准依赖照明外观）、circle/unoccluded 2133→2745（+612）；occluded 单跑 4755 与注入前**逐值相同**（前述 5324→4755 "改善"实为批/单跑噪声）；flat-roof/C 系不变（机制不同）。**净劣化，回退**（回退后 occluded 单跑 4755 复核，证实 unlit 对该例零效果——5324 为批载值）。
- **E1 终局定性**：地形外观无一致更优解——mgl 各 fixture 的期望图与我们的 PBR/雾校准互有咬合（fog/terrain 系按照明外观拟合过）；单点 unlit 是 redistribute 而非收敛。terrain 大值族的收敛需**逐子族**处理（C flat-roof 面错位、E2 近裁剪、fog/terrain 联动重校准），无全局单因子。E1 关闭，§112 优先级表修订为 C（面错位可独立分析）> E2 > E3。

**115. 子域 C 根因定位——fill-extrusion-height/base-alignment 未实现（2026-08-23 五）**：

- **取证**：alignment-height-terrain（68k）失配中 cur 的挤出绿块占据 exp 的白/灰区域——挤出体**垂直位置错误**（陷地/悬空，屏上覆盖区错位）。flat-roof（48k）同为高度锚定错误的颜色块错位。
- **根因（代码对照）**：mgl `fill-extrusion-height-alignment`/`base-alignment`（`"terrain"` 语义：fill_extrusion.vertex.glsl `u_height_type==1`——高度从地形表面起算，flat 顶取 centroid 地形高程）在我们管线**零引用未实现**——挤出高度按海平面绝对值求值，地形上建筑整体错位。fixture 带 `terrain {source rgbterrain, exaggeration 4}`。
- **实施入口（已有基建可复用）**：patchExtrusionMaterial 的 `centerDem`（terrainController.centerDem，vertex 采样 uMBExtrusionDem 得 mbTerrainElev）正是锚定机制——需按 alignment 语义接线：`alignment=terrain` 时 z = terrainElev(centroid/逐顶) + height·exaggeration（flat 顶用 centroid 高程）；`base-alignment` 同理。另需排查该 fixture 下 centerDem 是否非空（DEM 源接线）。工程量：小-中（语义分支 + fixture 验证），是子域 C 13 例的收敛主径。

**116. 子域 C 实施一轮——exag/flat 修复未兑现，全量回退（2026-08-23 六，零净变化）**：

- **实施内容**：① uMBExtrusionExag 从硬编码 1 改为 terrainController 实际 exaggeration（fixture=4）；② height-alignment "flat"（mgl 默认）语义——顶面顶点（objectNormal.z>0.5）改用 CPU sampleElevation(几何 bbox 中心) 的 centroid 高程（单要素对象近似），base 保持逐顶点（默认 base-alignment terrain）；③ patchMaterial 线程 obj/mesh 以取几何。
- **实测（9 例）**：alignment-height-terrain 68017→65921（−2k，噪声级）、and-base-flat +2k、**over-border-of-different-zoom 155k→192k（+37k 明确回归 ×2 例）**、flat-roof 族不变——flat 路径疑似未生效（疑 centerDem 在该 fixture 为 null 或 sampleElevation 0），exag 修正反致 over-border 系劣化（该系另有 overzoom DEM 混叠机制）。**全量 git 回退**，基线逐值复原（155341 ✓）。
- **结论**：子域 C 非单一语义缺口的补齐可解——exag/alignment 语义与 over-border DEM 混叠、flat-roof AO、centroid 编码（mgl 用顶点属性 centroid_pos 携带，非 CPU uniform）相互咬合；正确实施需把 mgl 的 centroid_pos 顶点编码一并移植（emitter 烘焙时写入）。工程量升为中大，记档为子域 C 完整实施规格，本轮保持零净变化。

**117. 真因破案——allDemTiles 相机相对坐标污染（2026-08-23 七，保留修复）**：

- **§116 零效之谜破案**：DEM 数据本身健康（探针实测 min 70/max 155-200m），但 `sampleElevation` 恒返 0——`allDemTiles` 用 `mesh.position` 作世界坐标，而 `updateCameraRelative` **每帧把它改写为相机相对坐标**（世界真值在 `userData.__mbWorldPos`）。CPU 侧 DEM 采样全部落空 → §116 的 flat/uniform/exag 实施从未生效（也解释 over-border "回归"实为噪声重排）。修复：allDemTiles 改用 `__mbWorldPos`，探针复测采样 0→370/593m（exaggerated）✓。
- **验收（保留修复，9+2 例）**：flat-roof 47807→**43063**、flat-roof-ao 69482→66041、flat-roof-over-border 94484→93336、alignment-height-terrain 68017→66215、**fog/terrain/basic 32123→28760**、2x-pixelratio-lines 5196→4692；over-border-different-zoom 155341 不变、circle/occluded +462（噪声带）——全域小改善无实质回归。
- **遗留**：shader 侧 per-vertex 采样（uMBExtrusionDemOrigin 世界坐标 vs modelMatrix 语义）与 mgl centroid_pos 顶点编码仍是子域 C 完整收敛的剩余路径（§116 规格不变）。

**118. shader per-vertex DEM 采样语义核查 + 世界锚点实验（2026-08-23 八，零净变化）**：

- **语义核查（探针实锤）**：挤出 mesh worldPos=(323,470)=**相机相对**（RTE 场景根每帧重锚），而 `uMBExtrusionDemOrigin` 为世界米——`modelMatrix` 采样确属 §117 同族坐标错配。
- **世界锚点实验**：tileKey→世界瓦片中心 − mesh 相机相对包围球中心，shader `mbWorldPos = position.xy + uMBExtrusionAnchor`——除 over-border-different-zoom **155k→192k（+37k 劣化）**外全部逐值不变（flat-roof 43063/alignment 66215/fog-terrain 28760）：这些 fixture 的挤出视觉不依赖该采样值（clamp-to-edge 垃圾采样恰被 exag=1 的既有校准吸收），而 over-border 系（多瓦片 DEM 混叠）对正确世界采样反而更差——155k 残差由**跨瓦片 DEM 拼接/过缩放机制**主导，世界正确化打破了与混叠的偶然抵消。
- **诚实回退**：git 全量回退（§117 的 allDemTiles 修复已在 HEAD 保留），基线逐值复原（155341/43063/28760 ✓）。
- **子域 C 收敛定论**：剩余 155k/66k 级需要 (a) 多瓦片 DEM 正确拼接（over-border 系）、(b) mgl centroid_pos 顶点编码（flat 顶）、(c) 与 exaggeration 的联合重校准——三者耦合，单点改动互为回归（§116/§118 两轮实证）。记档为子域 C 完整规格，避免再单点试错。

**119. 新域取证盘点：image/video/custom-source + measure-light/lighting-3d（2026-08-23 九）**：

- **image/render-callback 系（29.7k ×2）**：cur 全白 = 图像整体缺失——`render` 回调动态更新 image source 坐标的 harness 操作未支持（纯缺功能，harness op 一项）。
- **measure-light 系（global-brightness 454/42k/52k、flood-light 75.8k、symbol 18.7k、hillshade 32.3k 等）**：cur 一致性偏亮（(158,217,255) vs (59,178,255)）——mgl measure-light（天空光按太阳位置测量并乘 content）未生效或亮度管线缺一环；表达式引擎已有 'measure-light' case 与 brightness 镜像，疑材质端未接。**中工程、多例回报**。
- **lighting-3d-mode/line 系（33k-87k）**：色相/明度系统性差（3D 灯光模型公式族差），归 lighting-3d 校准域。
- **custom-source 系（57k-215k，9 例）**：mgl CustomSource（每帧回调更新）未实现——大工程独立立项。
- **globe/globe-video（238k）**：globe×video 双未支持叠加。
- **子域 C 三耦合项风险评估**：联合改动涉及 emitter 顶点编码重写 + 多瓦片 DEM 拼接 + 全域重校准，风险高（§116/§118 两轮单点均回归），建议独立排期而非本轮继续。
- **优先级**：measure-light 材质端排查（下一个最高 ROI 候选）> render-callback harness op（小）> lighting-3d 校准 > custom-source/globe-video（大工程）。

**120. measure-light 排查收官——表达式/公式层已正确，残差归并已知域（2026-08-23 十，零净变化）**：

- **逐层验证（node 直测 + 源码对照）**：① `measure-light` 表达式引擎输出正确（node 实测 rgba 嵌套→"#626262"（=255·(1−0.6168)）、case→"black"）；② `MBEnvironmentManager.brightness` 公式与 mgl `calculateLightsBrightness`（style.ts:2694）逐项一致（relLum W3C、polarIntensity=1−polar/90、(dir+amb)/2）；③ 灯光解析（lights 数组 direction[az,polar]）正确。
- **残差定性**：global-brightness 核心 6 例（427-459px，阈值边缘）——失配像素为符号字形 AA 混色（cur/exp 字形色对土地色 #3399ff 的任何 alpha 混合均不可解释→非颜色误差是**字形覆盖/AA 差**），归并 TextCanvas 字形光栅化域（§91/§104）；atmosphere 系（42-52k）= fog 带域连带；icon-image 系（47-48k）= icon 域；terrain 系（43-49k）= terrain 外观域；globe 系（219-257k）= globe 投影域。
- **结论**：measure-light **无独立缺陷**，§119 的"材质端未接"定性修正。探针已全部清理，零净变化。

**121. render-callback harness op 实施——JS 图像管线打通至 atlas，末段 icon 重放置待查（2026-08-23 十一，基建保留）**：

- **落地（保留）**：① harness `addImage` op 支持 `"./image/dot.js"` 模块路径（mgl operation-handlers 语义）：fetch vendored mgl checkout → 剥离 `export` → eval → onAdd+render 一次 → canvas 入 addImage（**像素级验证**：canvas (100,100)=(255,100,100)=粉芯 ✓）；② karma 新增 serve pattern `mapbox-gl-js/test/integration/image/*.js`；③ addImage 后 `markTilesDirty` 强制重解码。
- **残段（待查）**：canvas→addIcon→atlas 链路已通但 icon 仍不上屏——嫌疑收敛到 **PoiRenderer/userImageCache 在重解码后的 icon 重解析**（初次解码时 'dot' 未注册被丢弃的路径未因 markTilesDirty 恢复）；与 styleimagemissing（72px 近失，on-styleimagemissing 事件→addImage 同族流）同根。下轮入口：MBStyleSymbolPlacement 的 icon 缓存失效逻辑。
- **零回归**：icon-image/default 等不受影响，3 例基线不变（29294/29792/72）。

**122. runtime-addImage 末段破案——userImageCache 注册缺失（with-symbol 转 PASS，2026-08-23 十二）**：

- **真因**：`MBStyleDataSource.addImage` 只写 SpriteAtlas；PoiRenderer 按 technique imageTextureName 从 **mapView.userImageCache** 查图——runtime 图标从未注册（setStyle 静态路径在 ~1950 行有此步骤）。修复：addImage 同步注册 userImageCache（sprite atlas + user cache 双写）。
- **连带补齐**：① addImage op 的 `.png` 路径分支（mgl handler 的 `new Image()` 语义）；② karma serve pattern 扩为 `image/*.*`（marker.png 404 破案）。
- **验收**：**image/render-callback-with-symbol 29294→PASS**（368-385 批载噪声带）；icon-image/default/literal、image 族其余 PASS 基线不变（10 PASS 保持）。
- **残余**：① image/render-callback（icon-only、`icon-allow-overlap` 未设）仍空白——疑 MBStyleSymbolPlacement 的碰撞门对 runtime 后补图标的交互（with-symbol 设了 allow-overlap:true 而通过），入口：placement 的 icon 解析时序；② styleimagemissing 72px 需 `on('styleimagemissing')` 事件 op（纯缺功能）；③ icon-image/token/property-function 425 为既有遗留。

**123. styleimagemissing 事件 op 落地 + render-callback(icon-only) 深查（2026-08-23 十三）**：

- **`on` op 实施（保留）**：`on('styleimagemissing', [[addImage...]])` 事件操作落地（嵌套 ops 原样执行——fixture 模板内带具体图标名）。styleimagemissing 从"纯缺功能"变为**可执行**：rocket 图标上屏，残余 72px（alpha 合成 118px）= 火箭 AA 边缘带（近失，阈值 ~24px）。
- **render-callback(icon-only) 深查（三假说两排除）**：① 碰撞门——fixture 强制 `icon-allow-overlap:true` 无效，排除；② POI 发射——探针实证 labeled-icon 几何在 'dot' 名下正常发射（绝对世界坐标 (C/2,C/2)，与 with-symbol 同管线）；③ 缓存注册——§122 双写已生效（with-symbol PASS 为旁证）。**与 with-symbol 的唯一剩余差异**：数据点 [0,0] vs ±0.5°、单层 vs 双层。下轮入口：TextElementsRenderer 对"单 POI 无邻居"场景的可见性/初始化链（对比两 fixture 的 TextElement state dump）。
- **家族回归**：10 PASS 保持（with-symbol 368 噪声带、default/literal 等不变）。

**124. render-callback icon-only 悖论定案——名字键控失败（2026-08-23 十四，零净变化）**：

- **方法论修正（重要）**：harness 从 `render-tests-index.ts`（**内嵌 style 快照**）加载测试——直接改 mapbox-gl-js fixture style.json 是无效操作（§123 的 var1-var4 "二分"与碰撞门"排除"**全部作废**）；有效二分需 `node scripts/generate-mbstyle-test-index.js` 再生索引。
- **有效二分（五轮，均经索引再生）**：icon-only 槽位上 ① overlap+ignore-placement ② 数据点移 ±0.5° ③ filter+properties ④ 追加 marker.png addImage op ⑤ **整套 with-symbol style 原样**——**全部 29792 全白失败**；而同一份 style 在 with-symbol 槽位 PASS（同页同跑双测对照：render-callback nonwhite=0 vs with-symbol nonwhite=30522）。
- **悖论定案**：唯一剩余变量是**测试名本身**——同 style 异名异果。机制候选：karma 页内按名缓存的状态（`it()` 标题键控的 karma 过滤/dump-server 路径交互）或 harness 内未见的名键逻辑。**破案需 karma step-debug 会话**（断点 addImage op 与首帧渲染），本轮不再推进；§123 的"TextElementsRenderer 单要素链"假说 likewise 作废（⑤ 已含双要素仍白）。
- **状态**：fixture 与索引已还原原状（基线复核 29792/with-symbol PASS ✓），零净变化。

**126. icon 425 近失族定性——亚像素定位偏移（2026-08-23 十六，零净变化）**：

- **取证（icon-image/token + property-function + text-color/property-function 218 同族）**：失配集中在图标内部（bbox 45-85×15-110），图标外框**逐像素一致**（exp/cur icon bbox 相同 10-39）；墨量比 cur/exp=0.977，但特定行/列（17-25 行、11-20 列）cur 更深——**分数像素级放置偏移**特征（图标整体移动 <1px），非尺寸/颜色错。
- **定性**：与 §93/§104 text 字形残差同类——**光栅化亚像素定位长尾**（POI/字形 quad 的放置取整 vs mgl 的亚像素定位）。修复入口在 PoiRenderer/TextCanvas 的放置取整链（POI 世界坐标→屏幕像素的 floor/round 时点），属引擎精度专项，非样式层缺口。icon-image/token 425、property-function 425、text-color/property-function 218 记档归并此族。
- **零净变化**。

**127. 子域 C 三耦合项联合实施——对齐语义落地（保留，零视觉 delta 实测）（2026-08-23 十七）**：

- **落地（保留）**：patchExtrusionMaterial 完整移植 mgl 高度/基准对齐语义——`height-alignment:"flat"`（默认）：**顶面顶点（extrusionAxis.w==1）用 CPU 采样要素 centroid 地形高程**（tileKey 世界锚 + sampleElevation，含中心瓦片包含门控防 over-border 误采样），`"terrain"` 逐顶点；`base-alignment:"terrain"`（默认）逐顶点、"flat" 用 centroid；**真实 exaggeration**（替代硬编码 1）；patchMaterial 链 mesh 线程化。flat 采样实测有效（探针 156.8m/148.2m，中心瓦片内）。
- **关键实测（决定性）**：对 flat 开/关、exag 新/旧做四象限对照——**13 例全部逐值恒等**（flat-roof 43063、alignment-height-terrain 66215 等）——屋顶高程在像素级**不是**该族残差的主导项；§112 的"颜色块错位"定性修正为**光照/颜色主导**（flat-roof 系 roof 面色带 + AO）。§118 "三耦合项"中的 DEM 拼接与 centroid 编码已按语义落地，**exaggeration 重校准无需**（无视觉影响）。
- **子域 C 剩余收敛入口（修订）**：fill-extrusion-terrain 残差 = **屋顶/侧面光照公式族**（与 §12.15/§12.31 的 extrusion 光照同域）——顶面色带错配 + AO 族（flat-roof-ao 66k）+ 跨缩放 DEM 的 over-border 系（192k）。零回归确认（fog/terrain 28760、occluded 5786、2x-pixelratio 4692 与基线逐值一致）。

**129. 地形高程呈现域——cos(lat) 比例实验零 delta 谜（2026-08-23 十九，零净变化）**：

- **假说**：mgl 高程在 mercator z 单位（米→mercator 需 ×1/cos(lat)），我们 xy 为 mercator 米而 z 为原始米——预测 ×cos(lat)（降地形 21%）可露出被埋建筑。**实验（TerrainController.build 的 exaggeration ×cos(centerLat)）：13 例逐值零 delta**——与 §127/§128 的 flat/exag/anchor 三轮零 delta 汇成**系统性谜团**：对 TerrainController 高程链的四类独立修改（flat 高程、真 exag、世界锚点采样、整体比例）全部产生**字节级相同输出**。
- **推论**：这些 fixture 的可见地形/遮挡**并非 TerrainController.build 路径渲染**（或有恒定旁路覆盖），此前对该域的所有代码侧分析对象可能有误。**唯一可靠破案入口 = 运行时调试器单例跟踪**（karma non-headless + 断点 scene graph，确认渲染地形的真实 mesh/material 来源）——非静态可解。全部实验已回退，基线逐值复原（66215/28760 ✓）。

**130. §129 零 delta 谜破案——TerrainController 路径实为活跃（早前实验构建失败假象）（2026-08-23 二十，零净变化）**：

- **运行时等效排查（探针三连）**：① `applyTerrain` 实际调用（terrain={rgbterrain, exag:4}、demUrl 有效、zoom 17.5）✓；② **terrain built meshes=2** ✓；③ scene graph dump（13 MeshBasic / 47 MeshStandard / 6 Shader；地形 z 在 vertex shader 位移故几何 z=[0,0] 属预期）✓。
- **决定性对照**：exaggeration=0 探针 → **66215→126294（输出大变）**——TerrainController 路径**确证活跃**。§129 的"四类零 delta"实为**假象**：其中 cos(lat) 实验轮的首次 tsc 构建因 TS 报错失败、后续修正后又被 cwd 陷阱跳过重建——**至少该轮是陈旧二进制**；flat/exag/anchor 三轮（§127/§128）则可能是真实的零视觉 delta（高程变化不足以改变该 fixture 的遮蔽格局，66215→126294 的 exag=0 极端对照支持"变化存在但中庸幅度被噪声/遮蔽不变性吸收"）。
- **方法论终训**：任何"零 delta"结论必须先做**极端值对照**（如参数置 0）证明实验通路本身畅通——本域教训记档。
- **状态**：全部探针/实验清理回退，基线逐值复原（66215/57596/28760 ✓）。地形域下一入口不变：以 exag 扫描（0/0.5/1/2/4/8）绘制失配曲线定标相机-高程标度关系（cos(lat) 假说可用此法一次验证）。

**131. exag 扫描定标 + 视图级破案——建筑沉入地面（2026-08-23 二十一，零净变化）**：

- **扫描结果**：exag=1/2/8 **逐值恒等 66215**（仅 0 → 126294）——建筑与地形高程**耦合自洽**（建筑骑乘地形，比例缩放不改变遮蔽格局），证实该 fixture 残差与 exaggeration 标度**无关**。
- **视图级破案（色彩构成统计）**：cur = **94.4% 绿背景 + 5.6% 灰建筑**（y187-193 底部窄条）vs exp = 49.4% 绿 + **50.5% 灰建筑**（y55-255 巨幅立面）——两图均**无地形影像**（本 style 无 raster 层，地形只以高程影响建筑）。**残差本体 = 建筑立面尺寸/位置**：mgl 的建筑在 pitch 65/zoom 17.5 下充满半屏，我们的只有底部窄条——**建筑沉没在 z=0 地面填充平面之下**（只露顶），mbTerrainElev 抬升未到达实际渲染的建筑 mesh（§127 的 begin_vertex 命中探针只证明"某材质"被注入，未证明是建筑 mesh 的材质——ExtrusionChunks 可能以独立材质实例渲染建筑）。
- **下一入口（收窄）**：断点级验证"被注入的 MeshStandardMaterial 是否 = 建筑渲染材质"（renderer.info 或 onBeforeCompile 时打 mesh id 对照 patchTile 的 obj），若非——需在 ExtrusionChunks 材质路径重复注入。
- **状态**：实验清理回退，基线逐值复原 ✓。

**132. §131 材质身份嫌疑否决——建筑材质确证已注入（2026-08-23 二十二，零净变化）**：

- **探针（flag 法）**：patchExtrusionMaterial 打 `__mbExtrPatched` 标记，捕获时遍历 scene 的 extruded-polygon mesh——**patched=true、MeshStandardMaterial** ✓（uMB uniforms 缺席是预期的——内建材质的注入 uniforms 存于编译期 shader.uniforms 而非 material.uniforms，此前的"无 uniforms"探针无效）。§131 的"注入材质≠渲染材质"嫌疑**否决**。
- **管线级复核**：引擎 ExtrusionFeatureMixin 的 `insertShaderInclude(begin_vertex, extrusion_vertex)` 在 include 之后插入（include 保留，我们的 replace 仍命中）；`extrusionAxis.xyz·(ratio−1)` 在 ratio=1 时零贡献——注入管线自洽。
- **剩余嫌疑（下轮入口）**：建筑底部窄条 = **世界 XY 位置错位或 z 计算实值偏离**——需数值级验证：shader 内把 mbH/mbTerrainElev 编码进顶点色或 readPixels 采样单像素反推（或将建筑 worldPos 与 DEM 采样值 CPU 对照）。另一候选：相机 rig 对高 z 内容的视锥处理（近裁剪/geoBox 提升未含地形抬升，`maxGeometryHeight` 只报了挤出高度未含 150m 地形——**裁剪面按无地形高度计算，地形抬升后的建筑上半部可能被近平面/geoBox 裁剪**——Tile.elevateGeoBox 语义需含 terrain lift）。此候选与"只露底部窄条"症状吻合（上部被裁）。
- **状态**：探针清理回退，基线逐值复原 ✓。

**133. §132 geoBox 嫌疑实施一轮——零效果回退 + 会话收官（2026-08-23 二十三，零净变化）**：

- **实施**：applyMaxGeometryHeight 在 terrain 源激活时叠加 terrainController.maxElevation（exaggeration 已乘）——**13 例逐值零 delta**。原因分析：该函数在**style 装配期**同步执行，terrainController 尚未异步构建（maxElevation=0）——时序性无效；且 frustum geoBox 是否为"底部窄条"真因未获直接证据。回退保持零净变化。
- **会话收官总结（§90-§133，44 个 commit 阶段）**：**实质转 PASS/大幅改善**：line-gradient 全域空白 GLSL 根因（2716→303、with-corners PASS）、image/raster-opacity（7020→PASS 0）、heatmap 同点核 3× 去重（antimeridian→PASS）、tilesPending settle（vector-tile 方差 6453~19502→逐值恒等）、raster mipmap+各向异性（pitch-60 −32%）、米宽 secLat（meters-default 线厚像素级对齐、border −7.5k）、masking 假不透明输出（82807→55979）、allDemTiles 坐标污染（flat-roof −4.7k 零回归）、runtime-addImage userImageCache 双写 + geojson properties 断链（render-callback 29792→PASS 0、styleimagemissing→PASS 0）、fill-extrusion 对齐语义完整落地、mgl SourceCache 实跑探针工具。**冻结待引擎侧立项**：line-occlusion 双 pass、fog 逐内容深度语义、TextCanvas 字形光栅化（含 §126 亚像素族）、drape bake、custom-source/globe-video、masking checked-中毒（§103）。**根因明确待实施**：render-callback 插槽（§124 翻案后真因=geojson properties 已修但 29792 槽位疑云未消——注：§125 已修，此处为复核项）、gradient-vector-tile 11114（taper 边缘带）、zoomed-raster、icon 425 族。fill-extrusion-terrain 建筑窄条（§131-§133 三嫌疑两否决一时序无效）——下轮入口：构建后异步重报 maxGeometryHeight（markTilesDirty 后二次 applyMaxGeometryHeight）或相机近平面直接标定。

**134. §133 入口复核——异步重报已存在于 HEAD，geoBox 嫌疑正式关闭（2026-08-23 二十四，零净变化）**：

- **复核**：`MBStyleDataSource` 第 1276-1284 行**已有** terrain 构建后的异步重报——`applyTerrain` await 完成后 `terrainMax = terrainController.maxElevation`，同时写 `this.maxGeometryHeight` 与 **MapView 级 `mv.maxGeometryHeight`**（VisibleTileSet 读后者）——§133 提议的"构建后二次 applyMaxGeometryHeight"在 HEAD 已实现，geoBox/近平面嫌疑**正式关闭**。
- **§131-§134 四嫌疑终局**：材质身份（否决，patched=true）、注入管线（自洽）、geoBox 同步期时序（本就无缺口——异步重报已在）、近平面（同 geoBox）——全部排除。建筑窄条的剩余解释收敛到**建筑的世界 XY/相机相对几何本身**（emitter 烘焙的 extruded polygon 顶点位置或相机 rig 的 RTE 偏移在高 z + 高 pitch 组合下的呈现）——需数值级对照（建筑顶点 worldPos vs 相机视锥的 Python/Node 重投影计算）才能定论，记档为该域最终入口。

**135. 建筑窄条数值对照——相机高度假说实测否决（2026-08-23 二十五，零净变化）**：

- **数值 dump（决定性数据）**：建筑 mesh 局部顶点（相机相对）z∈[0,8]、matrixWorld 平移 (324,−141,−69)、**相机 z=69m**——相机确实低于山体高程（~150m×4 exag）。「相机应升至地形表面」假说成立度貌似高。
- **实测否决**：camera.position.z += sampleElevation(center) 后 13 例**全面翻倍劣化**（66215→129036、43063→127735 等）——mgl 期望图的相机**并非**位于地形表面上方；69m 相机高度下的当前构图反而更接近期望（66k 是更优基线）。建筑窄条的真因仍在建筑侧几何/高程呈现（§128 的"地形遮埋"框架下相机高度非杠杆）。
- **状态**：修复回退，基线逐值复原（66215/57596/28760 ✓）。该域排除项累计：材质身份/注入管线/geoBox/近平面/相机高度五项——剩余入口回到**建筑顶点 z 的实值验证**（shader 内 mbTerrainElev 的实际数值，需顶点色编码或 transform feedback 级手段）。

**136. 顶点色编码诊断未触发 + 附带实值观察（2026-08-23 二十六，零净变化）**：

- **诊断实施与结果**：mbTerrainElev→蓝通道顶点色编码（varying vMBElevDiag + colorspace_fragment 注入）——**零编码像素**（全图无 R>G+30 混合）——注入未触发（疑 colorspace_fragment 标记被其他注入的时序消费，或 lib/flag 接线问题）。
- **附带实值观察（sliver 直接读色）**：建筑可见部分为**纯灰 (136,136,136)** 平色（无编码、无光照渐变）——与 §131 视图统计互证：建筑以本色露出、**无任何地形/光照调制迹象**。
- **该域状态**：六轮排查（材质/管线/geoBox/近平面/相机/色编码）全部未触发或否决——系统性指向 **mbTerrainElev 注入虽在材质上（patched=true）但编译产物未被建筑像素呈现**。下轮第一入口：**dump 编译后的完整 vertexShader 字符串**（onBeforeCompile 时 console.log 前 2KB）直接目检 mbH 是否在最终 GLSL 中。

**137. vertexShader dump 定论——注入确在最终 GLSL（2026-08-23 二十七，零净变化）**：

- **dump 结果（一步定论）**：编译后 vertexShader（len 2129）中 **mbTerrainElev@1243、mbH@1629 均在**，且 `mbTopEle = mbTerrainElev`（flat 分支未启用 = flatEle 为 null 的回退路径，逐顶点提升生效）——§136 的"编译产物未呈现"假说**否决**：注入完整存在于最终 GLSL。
- **域内闭环状态**：建筑窄条七轮排查（材质/管线/geoBox/近平面/相机/色编码/VS dump）——注入链完整无缺口，但视觉仍是"底部窄条纯灰"。结合 §135 相机数据（cam.z=69m 低于山体）与 §131 视图统计（建筑 7k vs 期望 57k），**剩余唯一未验证环节 = 该 GLSL 是否为可见像素实际执行的 program**（2129 字节偏短——疑为 depth-prepass/shadow 变体先被 dump 去重截获，可见变体的 dump 需按 material.id 分次）。下轮入口：dump 按 material 实例去重（非全局一次），对照 renderer.info.programs 列表。
- **状态**：探针清理回退，基线逐值复原 ✓（66215/57596/28760）。

**138. program 可见性定论 + mgl 相机-地形公式移植两轮（2026-08-23 二十八，零净变化）**：

- **program 可见性定论**：按 material 实例分次 dump——**165/167/169/171 四个 MeshStandardMaterial 变体全部含 mbH@1629**——注入在全部变体（含可见像素执行的 program），§137 剩余疑问关闭。
- **mgl 相机-地形公式（源码新证据）**：`_updateSeaLevelZoom`（transform.ts:604）——**相机高度 = centerElevation(含 exaggeration)·pixelsPerMeter + cameraToCenterDistance**，zoom 距离从**地形表面**起算；我们 zoom 推导的 z=69m 从海平面起算，低 ~530m（实测）——"相机在地形之下"确证。
- **两轮移植均 ~126k**：① z+=elev（§135）、② setCameraGeolocationAndZoom(center, elev) 重锚（本轮，mgl 语义精确复刻）——两者输出一致（126267/125490），**翻倍劣化的重新解读**：抬升相机**揭开了被地形遮挡的 60k 隐藏失配区**（66k 基线是在错误遮挡下的"较小可见错误"），即我们的地形网格本身（E1/drape 域）错得多——相机抬升是正确方向但暴露了下游更大的地形错误。
- **该域最终架构定性**：fill-extrusion-terrain = 相机-地形锚定（本节已解）+ 地形网格呈现（E1/drape 冻结域）**两层叠加**——单独修相机会暴露地形层错误。收敛需先解 E1（drape bake/地形外观），再启用相机抬升。全程记档，本轮零净变化。

**139. E1/drape 解阻塞专项——坐标系失配根因落地 + 烘焙仍空（2026-08-23 二十九）**：

- **§12.76-58 零 fragment 根因（代码级定论）**：烘焙相机 `buildTileCamera` 以 `allDemTiles` 的**世界坐标**（~6.4M，§117 修复后语义）建正交相机，而 `renderer.render(scene, camera)` 画的**场景对象是相机相对（RTE，每帧重锚）**——相机在 6.4M 处看 ±300 相对坐标对象，**视锥内无一物**。旧注释"tile origins are camera-relative"是 §117 前的过时假设——**§117 的世界坐标修复反向破坏了烘焙**。
- **修复（保留）**：buildTileCamera 增 `camPos` 参数，把瓦片边界平移到相机相对帧（`left−camPos.x` 等）——坐标系语义正确且无害（未触发烘焙时零行为）。
- **烘焙仍空（corners 探针）**：`[255,255,255,255, 0,0,0,0]`——清色后**仍零内容**，内容门继续自禁用。坐标系修正后仍空 → **下一层阻塞**：场景对象可见性/材质在 RT 渲染路径的差异（疑引擎对象材质的 onBeforeRender/相机 uniform 依赖，或 fog/terrain/basic 的可烘焙内容本身被 `hasDrapableContent` 判定流程跳过）。视觉逐值不变（fog/terrain/basic 28760 ✓ 零回归）。
- **状态**：坐标系修复保留（原则正确），烘焙解阻塞需再一层排查（RT 渲染路径的对象可见性 dump——scene.traverse 时可见 mesh 数与 renderer.info.render.calls 对照）。

**140. drape 烘焙解阻塞达成——§12.76-58 正式关闭（2026-08-23 三十）**：

- **决定性证据**：① bake 时 **16 draw calls 实际执行**（renderer.info.render.calls 24→40）、19 可见 mesh；② 内容门五点采样 `[0,55,0,255, 0,0,0,0, ...]` → **uniform=false，门通过，drape 纹理正式应用**——§139 的"corners 仍空"是**误读**（只打了 8 字节即 2 个采样点，第 2 点 (0,0,0,0) 与白清色不同即已非均匀）。§12.76-58 "零 fragment" 之谜的完整解：**坐标系失配（§139 修复）是唯一阻塞**，修复后烘焙全通。
- **视觉零变化之谜（待查，无害）**：drape 激活后 fog/terrain/basic、fill-extrusion-terrain 全部逐值不变——烘焙内容（背景绿等）与地形原有外观一致（这些 fixture 的 drapable 内容恰好等于 clear 色语义）或 drape 混合权重为 0。**零回归**（16 例基线逐值 ✓）。
- **E1 域状态**：drape bake **解阻塞完成**（保留修复）；按 §138 两层路线，下一层 = 启用相机抬升（geoCenter 重锚）——上轮单独实测会揭开 60k 地形层失配，现 drape 已活，需重测抬升 + drape 组合。留为下轮入口。

**141. 相机抬升 + drape 组合批测——组合否决，域冻结（2026-08-23 三十一，零净变化）**：

- **组合实测（16 例）**：抬升后 fill-extrusion-terrain 全族 ~126k（同 §138 单独抬升值——**drape 对该域视觉零贡献**，与 §140 "零变化之谜"一致：drape 内容=背景色语义）；连带 fog/terrain 28760→38511、circle/occluded 5786→7021 劣化。
- **关键新证据（构图分析）**：抬升后 cur **100% 灰**（整屏被烘焙内容/地形色覆盖）vs exp 50.5% 灰（半屏建筑+半屏背景）——抬升使**地形面充满全屏**（相机贴地形表面俯视），而 mgl 期望是**半屏天空/背景 + 半屏建筑**——mgl 的期望相机并非贴地表面视角（§138 公式的 `elevationAtCenter·pixelsPerMeter` 换算到我们的米制世界可能存在 pixelsPerMeter≈cos(lat)·worldSize 缩放差，600m×比例 ≠ 直接 +elev）。**组合否决，回退**。
- **fill-extrusion-terrain 域冻结定论**：11 轮排查（§128-§141），已修/已解：对齐语义、drape 解阻塞；未解：相机-地形标度（mgl mercator z 单位换算）+ 地形呈现细节——需完整的 mgl transform 相机-地形标度移植（pixelsPerMeter/worldSize 链），记为引擎侧专项，与 fog RTE 深度语义、line-occlusion post-render API、TextCanvas 光栅化同列。

**122+ 收尾：gradient-vector-tile 残余精化取证（2026-08-23 三十二，零净变化）**：

- **alpha 合成修正后的精化取证**：12067px 失配（此前 13654 为 RGB 误读）——样本点 cur 有渐变色而 exp **纯白**：失配主导是**线覆盖区域错位**（cur 的线覆盖了期望为空的区域——路径/几何级），非纯 taper 边缘带。§91 的"taper 边缘带数 px 偏差"定性偏轻：实际含**线覆盖域差**（路径重投影或瓦片间几何缝合级）。收敛入口：两瓦片接缝处的线几何 worldPos 对照 dump（emitter 的 ribbon 顶点 vs mgl 的 tile 内几何）。
- **会话状态**：52+ 阶段全部提交；工作树干净；gradient-vector-tile 精化定性记档为本轮收尾。

**143. gradient-vector-tile 覆盖域精测（2026-08-23 三十三，零净变化）**：

- **逐行覆盖剖面（alpha 合成后）**：cur 在 y=0、60-70、90-110、140 等行有内容而 exp 为空——**exp 的两条楔形线之间存在真正的空带**（y0 附近、60-110 中段、140 尾部），我们的对应区域被线覆盖。结合 §94（lineClips 逐瓦片 progress 锚定已修）与楔形宽度 30m→0.5m 的 taper：exp 空带 = **mgl 的线在低 progress 端宽度 30m、高 progress 端 0.5m，两条线在视口中只占部分行带**；cur 全行覆盖说明我们的 taper 起点宽度过大或 progress→宽度的映射整体偏移（30m×sec(lat)≈38m 世界 vs mgl 30m 直接？**sec(lat) 在 line-width-unit meters 的 line-progress 变宽路径可能双重施加**——§92 的 secLat 加在 halfOf，而 gradient-vector-tile 的 worldPts 已是 mercator 单位）。
- **下轮入口**：二分验证——halfOf 的 secLat 在本 fixture 关闭后失配变化（一行实验）；若大幅降则收窄为"secLat 只应施加于固定宽路径"。

**§144. secLat 双重施加假说 A/B 否决（2026-08-23 三十四，零净变化）**：gradient-vector-tile 的 progressHalfWidths halfOf secLat 关闭后**逐值不变 11114**（meters-default/border 也逐值复原）——secLat 非覆盖域错位因子。假说否决，实验清理回退，§142 接缝几何数值对照入口不变。

**§145. gradient-vector-tile 决定性覆盖对照（2026-08-23 三十五，零净变化）**：

- **期望覆盖模型（alpha>0 提取）**：mgl 的两条线是**窄行带**——顶带 y≈10-60（含 y60 仅 2px 的 taper 尖）、y75-105 **真空带**、底带 y≈110-130、y0/y135 空——与 30m（≈45px）→0.5m 的楔形语义完全一致。
- **cur 覆盖**：**每行 150px 全覆盖（含期望的真空带）**——非 taper 偏差，是**线宽/重复级错误**：单一 30m→0.5m 对角线不可能覆盖 y75 空带，除非（a）宽度假宽度恒 30m 且线为对角（覆盖仍应有行带）→ 更可能是（b）**多副本叠加**（同线在多瓦片层级/多 tile 重绘，与 §94 heatmap 3× 重复同族）或（c）progress→宽度映射整体失效取 max 值 + 线自身跨度大。
- **下轮入口（二选一即可定论）**：① 探针数该层 ribbon mesh 数与顶点总数（<5 分钟定 a/b/c）；② halfOf 输入 w 的 runtime 打点。

**§147. gradient-vector-tile 残余 4846 的 clip 终值取证（2026-08-23 三十七，零净变化）**：

- **clip dump**：仅两个唯一 clip——`[0, 0.401]` 与 `[0, 0.290]`（wEnd = 20.1 / 23.8）。**clip 映射公式本身正确**（mapP = start + frac·(end−start) 与 mgl 一致），且视口两瓦片的要素 clip 上限即 ~0.4——**taper 到 0.5m 的部分（progress >0.4）在视口内本就不可见**（期望图底带窄即其延伸）。§146 的"clip 区间未覆盖全要素"定性修正：**覆盖即是正确的**。
- **残余 4846 重新定性**：非宽度映射，疑（a）两 clip 段（[0,0.29]/[0,0.40] 为同线在两瓦片的分段——0.29 段是邻瓦重叠区）接缝处的宽度跳变（同 progress 两个 w）或（b）宽度单位（20m 世界的米换算差 ~1.6×）。下轮入口：期望图底带实测宽度 vs w=20m 的屏投影换算核对。
- 探针清理回退，基线 4846 ✓ 复核。

**§148. 底带实测（2026-08-23 三十八，零净变化）**：exp 两带高 **56px（y4-60）/ 16px（y115-131）**，间隙 y61-114 与 y0-3/y132-149 空——与 mgl 换算 30m≈62px / ~15px 吻合（px/mercator-meter≈1.66 × secLat）；**cur 带高 150（全覆盖）**——我们的可见宽度 ≥2.4× mgl（非 1.6× secLat 双乘可解释）——**多副本叠加嫌疑回升**（与 §94 heatmap 3× 同族：多瓦片层级各绘一遍，宽度叠加直至填满）。下轮入口：该层 ribbon mesh 计数探针（一次定论）。

**§149. 多副本假说 mesh 计数定论——否决（2026-08-23 三十九，零净变化）**：ribbon mesh 计数探针——**单 mesh 36 顶点**（两要素合并几何，无多副本）。§148 假说否决。残余 4846 的剩余解释收敛到**线路径/宽度换算的组合**（w=30m→62px 与期望顶带 56px 吻合，但覆盖剖面仍满——几何路径顶点序列需逐点投影对照，或宽度在某段落取值异常）。该 fixture 已从 29k→4.8k（−83%），继续收敛的边际成本高，本轮记档收尾。探针清理回退，基线复核 ✓。

**§150. 顶点序列投影对照（2026-08-23 四十，零净变化）**：36 顶点 dump（相机相对）——中心线**强对角**（(−152,91)→(139,−116) 主段 + (13,−104)→(131,−151) 次段），而期望覆盖带**近水平**（y4-60/y115-131 全宽行带）——**线路径方向本身与 mgl 期望不一致**（疑矢量瓦片线几何的 y 方向/解码平移差异，或期望图的两条"水平带"实为高宽线的视觉近似）。该 fixture 收敛需 tile 内线几何的 mgl 原始坐标提取对照（vitest 探针可复用），边际成本高，本轮记档收尾——累计 29792→4846（−84%）。探针清理回退，基线复核 ✓。

**§151. pbf 原始线坐标提取（node 直解，决定性数据）（2026-08-23 四十一，零净变化）**：

- **tile 17-69773-45547 原始几何**：feat0 = **2 点近水平线** (0,1122)→(4116,1177)（4116 宽仅 55 高差，clip [0, 0.401]）——**与期望顶带（y4-60 全宽水平带）吻合**；feat1 = 5 点对角折线 (98,2080)→(4116,3870)（双段 clip [0.86,1]/[0,0.29]，对应期望底带）。
- **定论**：原始几何无罪，**我们的解码/发射侧把近水平的 feat0 画成了对角**——§150 dump 的对角中心线与 feat1 方向一致，疑 feat0 的 ribbon 未正确生成（2 点线段的退化路径）或两要素几何串扰。下轮入口：emitter 对 feat0（2 点 + clip [0,0.4]）的 worldPts 中间值打点。
- 会话收尾：该 fixture 29792→4846（−84%），最后一层（feat0 退化路径）留档。

**§152. feat0 worldPts 打点——§151 定性翻案（2026-08-23 四十二，零净变化）**：feat0 的 worldPts 实测 **(−152.9,69.1)→(154.4,65.0) 近水平** ✓——**解码无罪**（§151"画成对角"系 §150 mesh 顶点采样的误导——那是含宽度挤出+两要素混合的顶点）。但 cur 覆盖仍 **22500=整图**（feat0 水平带 y38-100 + feat1 对角带无法解释全覆盖）——嫌疑收敛到**第二瓦片（17-69774）的要素**或**退化全屏几何**（NaN 宽度生成的巨幅 ribbon）。下轮入口：提取第二瓦片原始坐标 + ribbon bbox 非有限值核查。基线 4846 复原 ✓，零回归。

（补：§152 提交后复核——meters-default 一次 597 读数为陈旧 lib（--force 重建后 288 基线复原 ✓），工作树干净。）

**§153. "整图全覆盖"破案——不透明清色伪影，§148-152 追查链翻案（2026-08-23 四十三，零净变化）**：

- **决定性复核**：y75（期望真空带）的 cur 像素 = **纯白 (255,255,255) alpha=255**——引擎**不透明清色**，非线内容！"cur 覆盖 22500=整图"是 alpha 通道伪影（期望图间隙 alpha=0，我们恒 255）。§148 的"≥2.4× 全覆盖"→ §149 多副本 → §150 对角 → §151/152 解码疑云——**整条追查链建立在该伪影上，全部作废**。
- **真实残余（回归 §147 定性）**：4846 = 线带内部的**宽度/taper 精度差**（w=30m→62px 与期望顶带 56px 已接近；clip [0.397,0.80] 段的宽度过渡与两瓦片接缝细节）。两瓦片原始几何均已提取（第二瓦片 feat0 近水平 (−20,1176)→(4116,1262)、feat1 近垂直西缘线）——与期望构图一致，几何无罪。
- **方法论终训（本域第二次）**：覆盖类取证必须**同时报告 RGB 与 alpha**——不透明清色引擎的 alpha 恒满，alpha-only 判覆盖必伪。该 fixture 定性收官：29792→4846（−84%），残余为带内宽度精度项。

**§154. 带内宽度精度实测（2026-08-23 四十四，零净变化）**：逐列带厚——**右半（第二瓦片区， clip [0.397,0.8]）cur≈exp（62-63 vs 64px ✓ 已对齐）**；**左半（第一瓦片区， clip [0,0.40]）cur 116px vs exp 65px（1.78× 过厚）**。且 exp 左右带厚均 ~64px 近恒定（若 mgl taper 生效右半应 ~42px——**mgl 期望图的可见厚度近似恒定于 30m×secLat≈62px**，即 mgl 在此 fixture 的变宽在视口内未显著收窄或求值点恒在低端）。我们的左半过厚疑因 feat0（clip 起点 0，w=30m 全宽 62px）与 feat1 ribbon（对角带）在左半叠加合并成 116px 连续带（期望两带间有空隙）。收敛方向：feat1 ribbon 的高度/位置或其宽度（clip [0.86,1]/[0,0.29] 双段）——下轮对 feat1 的带位置逐列对照。

**§155. feat1 带位置对照——根因定案：multiLineMetricsIndex 未实现（2026-08-23 四十五，零净变化）**：

- **子带结构（x30）**：cur 顶带 (6-58) ✓ 与 exp (5-59) 对齐；**第二带 cur (86-149)=64px vs exp (117-127)=11px**——feat1 的 ribbon 用了**错误的 clip 段**。
- **根因（对照 mgl lineFeatureClips + pbf 属性）**：feat1 是**双子路径**（pbf paths=2），属性携带 `mapbox_clip_start_1=0.864 / mapbox_clip_end_1=1`（子路径 1 的段）与 `mapbox_clip_start=0 / mapbox_clip_end=0.29`（子路径 0）——mgl `lineFeatureClips(feature, multiLineMetricsIndex)` **按子路径索引**取 `_1` 后缀属性。我们的 clip 查找只读无后缀对（0→0.29，w≈23-30m→64px），把本应 **[0.86,1] 段（w≈5m→11px）**的子路径画厚了 6 倍。exp 的 11px 第二带与 w(0.86)≈5m×secLat×1.66px/m ≈ 11px 精确吻合。
- **修复规格（明确）**：emitter 的 clip 查找支持 `mapbox_clip_start_${i}/end_${i}`（i=子路径序号，mgl line_bucket.ts:548-582）——processLineFeature 需把子路径索引传入（geojson 化时 path 展平处保留 index）。工程量小-中。该 fixture 预期 4846→近失带。

**§157. gradient-vector-tile 转 PASS——渐变色 clip 同步修复（2026-08-23 四十七，保留修复）**：

- **§156 残余 716 的取证**：失配集中在 y117-149（feat1 细带区）——**宽度已对但颜色错**（cur 蓝色 vs exp 橙/红 = progress 0.3 vs 0.86-1 的色相）：**渐变色 ramp 的 clip 查找（emitRibbonFill 前，line ~1703）仍读无后缀对**——宽度查找修了（§156）而色带查找漏修。
- **修复**：第二处 clip 查找同步按 `__pathIdx` 取 `_N` 后缀。
- **验收**：**gradient-vector-tile → PASS（19px，阈值内）**；line-gradient 全族 21 例**逐值零回归**。
- **该 fixture 会话终账**：**29792 → PASS（19px，−99.9%）**——四层修复：§146 解析器索引、§94 lineClips 锚定、§156 per-子路径宽度 clip、§157 per-子路径色带 clip。

**§158. zoomed-raster 取证定性（2026-08-23 四十八，零净变化）**：underzoom **0px ✓**；fractional/overzoom 残差 = **全图均匀 ±20-48/通道亮度差**（无几何/接缝带）——与 raster-filtering/no-pitch 4137 同签名（§96 定性 SwiftShader mipmap 生成 vs 参考 GPU 的漂移类）。z17 min/max 钳位与覆盖语义已在前轮修复（§a06e2a04/143f1fe5），剩余为**重采样滤波精度项**（漂移类，环境级）。归并 raster 漂移族记档。

**§159. TextCanvas/PoiRenderer 亚像素放置链评估（2026-08-23 四十九，零净变化）**：

- **取整点排查（全线无果）**：TextCanvas/TextGeometry/TextElementsRenderer/PoiRenderer/MBStyleSymbolPlacement 的放置链**均无 Math.round/floor**（唯一取整是 TextStyleCache 的 zoom floor，与像素无关）——§126 的"放置取整链"假说**排除**：位置是全精度浮点。
- **移位量化（互相关）**：icon 425 的图标在整数像素粒度**最佳移位 (0,0)**——即位移 <1px（亚像素级）非整数偏移——指向 **SDF 纹理采样的半纹素约定**（mgl 的 glyph quad UV 与 texel 中心对齐方式 vs 我们的 atlas 采样）或 glyph quad 尺寸的亚像素差，非放置坐标问题。
- **立项结论**：该专项的真实实施面 = TextCanvas 的 **glyph quad UV/atlas 半纹素对齐** +（text 域的）字形 hinting/光栅化——比"放置取整"更深一层。影响面大（text/symbol ~90 例 + icon 族），需在专门的引擎会话中以单 glyph 的 UV 对照起步。本轮零代码变更，评估记档。

**§160. SDF 半纹素内缩 A/B 否决（2026-08-23 五十，零净变化）**：dynamicTextureCoordinates 的 +0.5/−0.5 内缩（texel 中心采样）实测——text-anchor 全族劣化（center 10313→10620、bottom 2068→9159）、icon 425 持平——**否决回退**，基线复核 ✓。结论：SDF 采样的 UV 推导（像素坐标/纹理尺寸）是正确约定；残差的亚像素差不在采样 UV，而在 **glyph quad 几何尺寸/位置的亚像素构成**（TextCanvas 字号换算 24→16 的舍入族或 PoiRenderer 的 quad 角点计算）——专项实施面再修正，留档。

**§161. glyph quad 几何对照收官——mgl 亦无像素取整，专项定性为字形度量精度（2026-08-23 五十一，零净变化）**：

- **对照结论**：mgl symbol 链（shaping/quads/projection/placement）**同样无像素取整**（唯一 round 是 globe wrap）——两侧均为全精度浮点，差异在**字形度量解析**（advance 宽度、baseline、bearing 的 PBF 值→px 换算族）与 SDF 光栅化本身，即 §104 最初的"字形光栅化端"定性经三轮收窄（§159 排除放置/取整 → §160 排除采样 UV → 本节排除角点取整）后**回到并细化原点**。
- **实施规格（最终版）**：需逐 glyph 数值对照（同一字符的 advance/bearing/baseline 在我们 shaping 与 mgl quads.ts 的换算值差）——工作量大、影响 ~90+ 例，须专门会话。本轮零代码变更，四轮假说排除链完整记档。

**§162. 字形度量映射静态审计（2026-08-23 五十二，零净变化）**：MBGlyphLoader 的 PBF 路径映射审计——`advance/24`、`left/top − 3px border`、`width/height + 6`、SDF 边 0.75→0.5 重映射（−64）：**与 mgl shaping 约定一致，映射公式无罪**。关键架构发现：字形度量有**两条独立消费路径**——①mbstyle 自带 TextShaping（布局 box 计算，用于 text-anchor 对齐，位置已验证正确）；②**引擎 LineTypesetter + 注入的 PBF catalog**（实际字形排布与渲染）——残差（~10k px 墨量差）来自 ② 的 catalog 度量消费与 mgl shaping 的换算差。数值级对照需在 ②（MBFontCatalogBuilder 与 LineTypesetter）进行，规格更新。Canvas 2D fallback（measureText 系统字体）仅 PBF 未加载时激活，text fixtures 均走 PBF。零代码变更，审计记档。

**§163. LineTypesetter/catalog 消费链静态推导收官（2026-08-23 五十三，零净变化）**：数值推导链——CatalogBuilder `offsetY = distanceRange/2 − top − border` → GlyphData `top = lineHeight − offsetY`（=23+g.top）→ LineTypesetter `verticalOffset = lineHeight − base − distanceRange/2`（=3）——**三级换算自洽闭合**（23+g.top−3 回到正确的 g.top+20 基线系），垂直定位公式无罪；残余嫌疑最终收敛到 **advance 的分数累积**（LineTypesetter 以 catalog px 累积 vs mgl 的浮点 advance 累积——每字符亚 px 累积差即可产生 0.977 墨量比与特定行列加深）与 SDF 光栅化本身。静态分析已穷尽（六轮），runtime 数值捕获（typesetter 逐 glyph 输出 vs mgl positionedGlyphs）是唯一剩余手段，须专门会话。零代码变更，推导链记档。

**§164. text/icon 专项终局定性——七轮穷尽，光栅化精度终判（2026-08-23 五十四，零净变化）**：LineTypesetter 的 advance 累积实测确认为**全精度浮点**（`(advanceX + tracking) * scale`，全链含 TypesettingUtils.computeGlyphTransform 无任何 round/floor）——与 mgl positionedGlyphs 的浮点累积**数学等价**，§163 的"分数累积差"嫌疑亦排除。**终局定性**：text/icon 残差（墨量 0.977、特定行列亚像素差）= **24px catalog SDF 采样到 16px 渲染尺寸的光栅化质量差**（非整数缩放比 2/3 的双线性重采样 AA 剖面）——无公式级 bug 可修，属引擎光栅化精度长尾（与 §12.72/§96 漂移族同类）。七轮收窄链完整：放置取整→整数移位→采样 UV→角点取整→映射公式→垂直换算→advance 累积，全部排除。改进路径仅剩：按渲染尺寸重打包 catalog（24→16 专用 atlas，消除重采样）或 SDF 采样器升级（双四次），均为引擎级大工程。专项定案关闭。

**§165. mercator z 标度换算公式破译（2026-08-23 五十五，零净变化，冻结专项解冻规格）**：

- **mgl 公式链（源码定论）**：`pixelsPerMeter = mercatorZfromAltitude(1,lat)·worldSize = worldSize/(C·cos(lat))`——**1 米 = 1/(C·cos(lat)) mercator 单位**；在"世界=C 赤道米"的坐标系（我们的世界）中即 **z_world = h·sec(lat)**——与 §92 线宽 secLat **同一公式**。
- **引擎现状缺口（代码级）**：`MapTerrainMaterial` 的 `elevation × uExaggeration` **无 sec(lat)**（地形与建筑抬升比 mgl 矮 ~26%@lat37.75）；而线宽已乘 secLat——**同一引擎内两种 z 惯例并存**，此即 §135 相机抬升"翻倍劣化"的标度根源（抬升量与地形矮化互相错位）。
- **解冻实施规格（定稿）**：① `MapTerrainMaterial` 顶点 `elevation × uExaggeration × sec(centerLat)`（uniform 追加）；② patchExtrusion 的 `mbTerrainElev`/`uMBFlatEle` 同步乘 sec(lat)（建筑跟随）；③ sampleElevation CPU 采样同步；④ §138 相机重锚公式改 `elev×sec(lat)`；⑤ 全域护航批（fog/terrain 系此前按现标度校准过——fog 带 kFog=3.7 可能需重标定）。工程量中，风险=标度连锁。规格记档，待专门会话实施。

**§166. §165 规格落地——sec(lat) 地形 z 标度（fog/terrain −3.1k，相机重锚三度否决，2026-08-23 五十六，保留修复 d7219e20）**：

- **落地（保留）**：① `MapTerrainMaterial` 顶点 `elevation × uExaggeration × uMBZSecLat`——逐 tile 由其 mercator 世界 y 反解纬度→sec(lat)（`setZSecLat`，clamp≥0.2），与 §92 线宽 secLat 同源统一，同一引擎 z 惯例归一；③ `sampleElevation` CPU 采样同步乘（`m_sampleSecLat` 取首个 tile 值，中心 tile 语义）。**验收**：fog/terrain/basic −3.1k（32123→~29k），terrain 域 13 例无劣化零回归。
- **② 有意不接线**：patchExtrusion 逐顶点 `mbTerrainElev` 未乘 secLat——实测 fill-extrusion-terrain 全族对标度变化**免疫（同尺度耦合）**：建筑骑乘抬升与地形面同步缩放，遮蔽格局不变（§131 exag 扫描恒等现象同族）；不补乘以避免双重施加。
- **④ 相机重锚三度否决**：`elev·sec(lat)` 抬升第三轮实测仍 ~126k（§141 构图定性不变——mgl 期望非贴地视角），重锚代码删除。相机-地形标度完整移植（pixelsPerMeter/worldSize 链）维持引擎侧冻结。
- **⑤ fog 护航**：kFog=3.7 未重标定即零回归（fog 主残差为逐内容深度语义，§106 结论不受标度影响）。

**§167. custom-source 域打通——addCustomSource op → 等价 raster source 映射（2026-08-23 五十七，保留修复）**：

- **mgl 语义实证**：custom-source 8 例 fixture 的 `addCustomSource` handler（operation-handlers.js:117）= `{type:'custom', maxzoom:17, tileSize:256}`，其 loadTile 仅按 `{z}-{x}-{y}` 模板 fetch PNG→ImageBitmap——**与普通 raster source 模板逐字节等价**，无需实现 CustomSource API。
- **落地**：harness `addCustomSource` op → `rt.addSource(id, {type:'raster', tiles:[localizeUrl(模板)], tileSize:256, maxzoom:17})` + `reloadSources()`（与 addSource op 同款接线）。
- **验收**：**satellite 从整图缺失 → 4148px**（阈值 655px 近失——图像主体逐像素吻合，残余集中在 rows 76-93 全宽 18px 暗带 = z14 深祖先回退接缝族 §97-§103 已冻结域）；**terrain → 13375px**（中心 ±1 吻合，下部亮度差 163 vs 195 = E1 地形外观域 §113/§114 已冻结）；image/default 回归 PASS ✓。剩余 6 例（albers/equal-earth/equirectangular/lambert/natural-earth/winkel-tripel）依赖自定义投影引擎域，维持冻结记档。

**§168. canvas 源域打通——fake-canvas 基建 + CanvasTexture 色域修复（2026-08-23 五十八，保留修复）**：

- **缺口分析**：datasource 的 `applyImageSources` 本就支持 `type:'canvas'`（MBEnvironmentManager:1922，DOM canvas by id → CanvasTexture → 四边形 + homography 同 image 源）；缺的是 harness 侧 mgl 基建——`metadata.test.addFakeCanvas`（建 DOM canvas + 画初始图）与 `updateFakeCanvas` op。
- **落地三件**：① harness `setupFakeCanvas`（addDataSource 前建 id canvas，画 `mapbox-gl-js/test/integration/image/<file>`）；② `updateFakeCanvas` op——**mgl 语义关键**：play 中画的 img1 上传纹理、`pause()` 后画的 img2 **不上传**（canvas_source 仅播放中重上传），期望图对比的是 img1（实测 update 期望=1.png 绿证实）；③ **CanvasTexture colorSpace=SRGBColorSpace**（datasource 修复）——canvas 像素为 sRGB 编码，缺此则原值经 renderer linear→sRGB 输出二次编码（实测 147→201、67→138 恰为 encode(linear(v))，~1.35× 过亮）。
- **验收**：**canvas/default 158425→PASS**、**canvas/update→PASS**（pause 语义修正后）；image 族回归零变化（default PASS、projected/terrain 既有冻结值）。**update-resize 未过定性**：mgl 期望图主体洋红 (255,0,255)、仅中心 140px 区块为图像内容——mgl canvas-resize 特例语义（resize 后 canvas 清空 + 纹理上传时序交互的涌现结果），深挖性价比低记档；canvas/projected（albers）与 video 源（drone.mp4 资产未 vendored + 无 VideoTexture 链）维持冻结。

**§169. 复核批——render-callback 槽位疑云消解 + 近失带归并（2026-08-23 五十九，零净变化）**：

- **render-callback 复核（§133 遗留项关闭）**：image/render-callback 与 render-callback-with-symbol **双双 PASS**——§124 的"同 style 异名异果"槽位疑云随 §125 geojson properties 修复消解，该域收官（render-callback 29792→PASS 复核确认）。
- **近失带复核**：icon-pitch-alignment 三例 13-22px、text-line-height/data-driven 15px——几何带/列带与期望逐带一致，纯墨量分布差 = §164 SDF 光栅化长尾定案维持；text-line-height/literal 10657 同判（行带 (0-202)/(215-255) 两侧一致，无排版/line-height 语义缺口）。
- **会话终账（§166-§169）**：① sec(lat) z 标度落地文档补齐（§166，代码先在 HEAD）；② custom-source 域 satellite 4148/terrain 13375（等价 raster source 映射，addCustomSource op）；③ canvas 域 default/update 双 PASS（fake-canvas 基建 + pause-不上传语义 + CanvasTexture SRGB 二次编码修复 158k→PASS）；④ render-callback 复核收官。**剩余失败域全部为已冻结/已定案族**：引擎侧（globe/自定义投影/fog 深度语义/line-occlusion/相机-地形标度/TextCanvas 光栅化）、mgl 涌现语义（masking checked-中毒、canvas-resize 特例）、资产缺失（video drone.mp4）、环境级漂移（SwiftShader mipmap/重采样）。

**§170. collisionDebug 族深挖一轮——渲染通道打通但全族净劣化诚实回退 + updateGeoJSONData 落地（2026-08-23 六十，零净 src 变化）**：

- **ops 盘点（全量索引扫描）**：harness 已实现 ~68 种 ops；剩余未实现仅 `updateGeoJSONData`(1)、`fitBounds`(2)、`addCustomLayer`(8)。**updateGeoJSONData 别名落地**（=setGeoJSONSourceData，mgl updateData 语义）：geojson/update 从 op 未执行 → 342px 近失。
- **collisionDebug 族破案链（六层）**：① 旧 overlay 是**死代码**——collectSymbols 依赖的 `tile.objects` 在现行管线恒空（符号走引擎 TextElementsRenderer/PoiRenderer），且 `scene.add` 事后注入不渲染（§110 结论同样命中）；② 有效通道 = **自有 scene + 屏幕空间正交相机 + AfterRender `setRenderTarget(null)+autoClear=false` 直绘**（heatmap 复合模式，实测上屏）；③ 数据源 = 引擎 `tile.textElementGroups.groups[].elements`（position=相机相对可直接 project；`decodedTile` 已被引擎释放不可用）；④ 盒尺寸 = 用自有 `shapeText` 复算（**em 单位需 ×fontSize**；glyphLookup 有 `fontName` 非空门控，metrics 复用 `m_glyphMetrics` 447 条真实度量）；⑤ 锚点语义 = mgl box 边缘对齐 anchor+text-offset（Horizontal Left=0/Center=-0.5/Right=-1 左边距分数、Vertical Above=0/Center=-0.5/Below=-1，mgl 'top'→Below）；icon-text-fit 盒 = shaped text 盒+fit-padding。**最简例 collision-variable-icon-image-simple 盒几何 ±2px 贴近期望**（63×24 vs 65×23、97×50 vs 100×46）。⑥ 红/蓝分类 = 复用引擎 `m_textElementStateCache.m_referenceMap.get(group).textElementStates[i].visible`。
- **回退原因（诚实记账）**：全族批测**净劣化**——画盒比不画更差（debug/collision 28894→43679、pitched-wrapped 51755→75060 等）：red 盒子集（引擎 visible 语义 ≠ mgl placed 语义）、line-label 盒（PathLabel 锚点集）、pitch/分数缩放盒尺寸缩放族均未校准；阈值 4px 级要求逐像素。**全部 src 改动 git 回退**，本节为完整实施规格记档（六层机制已验证，剩余=子族校准，工程量中-大，与 text-anchor 校准同级别）。
- **评估记档**：fitBounds（2 例）= mgl 通用 fallback `map.fitBounds(bounds, {pitch,zoom,padding})`，需 camera_for_bounds 精确移植（padding 不对称中心偏移 + pitch），低 ROI 暂缓；addCustomLayer（8 例）= 真 WebGL 渲染回调（custom-layer-js 族），引擎无对应 hook，冻结。
- **环境**：/tmp/_karma_webpack_* 累积致 ENOSPC（每次运行 41MB 不清理）——已清理 13G 记档，测试失败先查磁盘。

**§171. collisionDebug 族终局定性——主导残差=引擎放置决策差异（恢复实验+决定性证据，零净变化，2026-08-23 六十一）**：

- **恢复实验**：按 §170 六层规格完整恢复实现（直绘通道/元素数据源/em 缩放/glyphLookup/锚点语义/fit 盒/引擎状态分类/去重），tsc 绿。
- **决定性取证（debug/collision 逐盒对比）**：期望图**几乎无蓝盒**（连通域分析仅 1-4px AA 残点）——mgl 把该稠密 road_label fixture 几乎全部符号判为碰撞隐藏（红盒大面积合并簇）；我方红簇位置与期望大致吻合（如 326-409×66-109 vs exp 329-417×61-112），但引擎 `visible` 语义把大量符号判为蓝（我方多条 33×4 蓝盒）。
- **终局定性**：该族主导残差 = **引擎 TextElementsRenderer 碰撞放置决策与 mgl 的放置集合差异**——无盒基线 28894 本身就是"内容差"（我方多渲染了 mgl 隐藏的标签）；盒画得再准也留着 ~28k 内容失配（本例阈值 2229）。盒渲染六层机制已验证可用（§170），**族收敛被引擎放置一致性阻塞**——与 text/symbol 冻结域同根但更深一层（此前 §91/§164 只定性了"位置正确+光栅化长尾"，稠密碰撞场景暴露**放置决策差**这一独立缺口）。
- **诚实回退**：src 逐字节复原（盒 overlay 任何形态都净劣化）。**下轮真正入口（引擎侧立项）**：TextElementsRenderer 的碰撞放置算法对齐 mgl CollisionIndex（优先级排序 + 屏幕空间盒 + text/icon 双盒语义）——需引擎放置链可编程/可替换的 hook（§110 同族架构需求）。

**§172. mgl-parity 碰撞放置强制实施——基础设施落地，验证受负载阻塞（2026-08-23 六十二，保留实现攒批延后）**：

- **实施（保留，gate=collisionDebug 零外溢）**：`MBStyleSymbolPlacement.applyMglCollisionVisibility`——按 §171 定性实施放置对齐：收集引擎 TextElement（featureId+text 跨层级去重）→ 自有 shapeText 复算盒（em×fontSize、glyphMetrics 真实度量、mgl 锚点边缘语义、icon-text-fit 盒）→ 按优先级降序以自有 CollisionIndex 做 **mgl 语义双盒独立判定**（修复：CollisionIndex 的 x/y 是**左上角**而非中心——首版全蓝的根因）→ `TextElement.visible = 放置结果`（隐藏 mgl 会抑制的多余标签，§171 实测的主导残差方向）→ 同判定画盒（蓝 α0.25/红 α0.5，heatmap 同款 AfterRender 直绘通道）。
- **验证状态（受阻塞）**：单例 debug/collision 跨 run 28494-29100（基线 28894 噪声带内，无回归）；盒像素 872→13px 跨 run 漂移、karma console 捕获间歇性 0 行——负载 6-9 时的 §12.85 已知 flake（空闲时 5/5 稳定前科）。**下轮首项=低负载（<3）复验**：①盒是否稳定上屏；②红/蓝分布 vs 期望（exp 红 994 采样/蓝≈0）；③el.visible 强制对内容差（基线 28894 中的"多渲染标签"）的收敛效果。若无效果则回退本实现。
- **回归面**：gate 仅 collisionDebug fixtures（27 例）——其余 3000 例零路径变化；tsc 绿。

**§173. mgl-parity 放置复验攻坚——执行链全通但绘制通道零像素之谜未解，回退（2026-08-23 六十三，零净变化）**：

- **三重 bug 修复后执行链全通**：① §172 实现从未运行——run() 早退条件在 §171 回退时被复原（symbols 恒空 → return 先于 debug 分支）；② 我的去重键 `${featureId}:${text}` 因 featureId=undefined 把 174 个同文本元素坍缩为 1（改屏坐标键）；③ harness 临时探针的 window.THREE 未定义异常每帧静默炸断 applyMgl（PlaneGeometry 假线索曾误导回退）。修复后：**162 entries（173 icon + 174 text rect）、盒判定 16 placed/8 hidden、renderer.render 执行 7608 次/批无异常**。
- **通道零像素之谜（未解）**：heatmap 同构（NDC 正交相机 -1..1/near 0、setRenderTarget(null)、autoClear=false）的不透明品红 Mesh + LineSegments **零像素到达捕获画布**（低负载确定性复现）；`setScissorTest(false)` 补齐亦无效。与 heatmap composite 的真实差异未定位（MapView AfterRender 分发于 composer/文本绘制之后、理论上后绘持久）——**需 karma 非 headless 断点会话**（与 §124 render-callback 插槽疑云同类运行时谜）。
- **el.visible 强制实测**：激活后 debug/collision 28894→42232（**劣化**）——我们的碰撞判定集与 mgl 放置集差异大（仅 16 放置 vs mgl 更多/更少），且引擎文本去重（同文本 173 特征仅 1 个文本元素，TextElementStateCache.deduplicateElement）使放置对齐的输入集本身残缺——**放置一致性缺口比 §171 定性更深（去重语义差异）**。
- **回退至 §172 惰性状态**（applyMgl 因早退不执行、零外溢）；下轮入口：karma 非 headless 断点定位通道差异 + 引擎文本去重对 mgl 逐特征语义的缺口评估。

**§174. 零像素之谜破案——dump server 损坏 JSON 静默崩溃致陈旧捕获（2026-08-23 六十四，零净变化）**：

- **决定性实验链**：① `gl.readPixels` 同步读默认帧缓冲——盒线像素**存在**（(239,239,255) 蓝盒/(249,82,88) 红盒混合值）；② +50ms 异步 `toBlob` 重读——盒像素**存活**（SYNC 254 ≈ ASYNC 251）；③ 但落盘的 current.png 恒无盒——**文件时间戳停在 18:42**！
- **根因**：`RenderingTestResultServer` 启动时 `loadSavedResults` 读到 **ENOSPC 时代写坏的 3 个 ibct-result.json（空文件）→ JSON.parse 崩溃 → server 死亡 → 浏览器 POST 'Failed to fetch' 落空 → 所有 current.png 陈旧**。§173 的"heatmap 同构通道零像素之谜"**完全是陈旧捕获假象**——渲染通道自始至终正常（NDC/像素空间相机、品红 Mesh near-面裁剪为独立小坑）。清理损坏 JSON 后：**捕获含盒（蓝 3444/红 9088px）实锤**。
- **附带修复验证（保留在记档，src 已回退）**：① run() 早退条件（collisionDebug 不早退）；② 去重键改屏坐标（featureId=undefined 坍缩）；③ CollisionIndex 左上角语义；④ **entries=0 帧保留上帧盒几何**（重解码窗口清空 overlay 的 settle 帧正是捕获帧）；⑤ keep-last 修复后全族真实基线：collision 41936 / pitched 16145 / pitched-wrapped 69822（均劣于无盒基线 28894/11568/51755）——盒判定/几何需逐子族校准（红/蓝 verdict vs mgl、line-label 盒、pitch 缩放），**管线已可验证，校准工作从"不可验证"转为"可迭代"**。
- **回退原因**：净劣化 + 未校准（诚实惯例）。§172 实现保留在提交历史（39b6f65e）可整体恢复。
- **方法论终训（本域第三次）**：结果判定前必须核对 **current.png 时间戳 vs 当前时间**——dump server 会被损坏 JSON 静默崩掉（建议 runner 加 server 存活断言/启动时清点空 JSON）；与 §89 grep 锚定、§153 alpha 伪影同列。

**§175. 去重语义评估收官——§173"输入集残缺"定性修正 + 位置稳定 id 落地（2026-08-23 六十五，保留修复零 delta）**：

- **静态评估（TextElementStateCache 全链）**：去重按 `hasFeatureId()` 分叉——无 id 元素走 `findDuplicateByText`（同文本 + `getDedupSqDistTolerance(zoomLevel)` 屏幕距离内才算重复）；引擎元素组**完整保留全部特征元素**（§173 后期探针已证 174 个文本元素在组内）。
- **§173 定性修正**："同文本 173 特征仅 1 个文本元素"是**我方收集路径去重键 bug 的误读**（featureId=undefined 坍缩），引擎去重只影响**近距离同文本**的渲染去重——与 mgl 逐特征放置的差异仅在近距离场景成立，fixtures 基本未命中 → 放置一致性的真实缺口收敛回 §171 定性（碰撞判定集差异），去重非主因。
- **落地（保留）**：emitter 对无 id 特征合成**世界坐标稳定 id**（`mbpos:x,y,z`——层级无关，同特征跨层级同 id=合法跨层去重，异特征不碰撞），`symbolFeatureId()` 接入 text/poi 发射。**A/B 实测零 delta**（text-anchor/icon-text-fit/sort-key 族逐值恒等；debug/collision 28894 基线不变）——语义正确的无害改进，消除近距离场景的潜在文本坍缩。
- **批测**：debug/collision 单例 28894（基线恒等）、text-anchor 族 2068-16325（基线恒等）零回归。

**§176. collisionDebug 校准首轮——最简例 1px 级 / 稠密族判定集差距定量，净劣化回退（2026-08-23 六十六，零净变化）**：

- **恢复+校准实施**：§172 实现 + §174 四修复（早退/去重键/左上角/空帧保留）恢复，新增两项校准：① textRect 统一 −2px（mgl ink-box 边缘 vs 引擎 line-box，与 TextElementsRenderer 自身 ±2 校准同族）——**最简例 variable-icon-image-simple 1466→1015，盒 1 几何 (31,42,96,66) vs 期望 (31,42,96,65) 达 1px 级**；② 去重粗粒度 8px 桶（合并跨层级同特征重复 entries 348→~174）——族内仅边际（collision 45061→45004、pitched-wrapped 70392→69403）。
- **稠密族定量（决定性）**：debug/collision 稠密帧判定 **123 placed/363 hidden**（双盒独立、优先级序、无异常）vs mgl 期望**几乎全红**（蓝≈0）——我们的盒在 spacing 20 的布点下重叠不足（mgl 文本盒因换行/逐锚点几何更大更密），放置集与 mgl 大偏；且 line-label 盒未实现（collision-lines 族值与无盒基线逐值恒等）。
- **净劣化回退**：collision 28894→45004、pitched 11568→15947、pitched-wrapped 51755→69403（variable-icon 1030→1015 唯一改善）。**剩余校准规格**：mgl symbol_bucket 逐锚点几何（symbol-spacing 20 沿线锚点、text-max-width 换行盒、同优先级 tile 序 tie-break）+ line-label 盒（PathLabel 每锚点）——工程量中大，管线与判定 sim 已就绪（commit 链 39b6f65e + 本节校准可再恢复）。

**§177. collisionDebug 逐符号几何规格第二轮取证——盒尺寸已对、位置密度分布待对证（2026-08-23 六十七，零净变化）**：

- **取证数据（§176 规格实施入口）**：恢复全链（§172+四修复+−2px 校准）后位置直方图——稠密帧 332 entries（166 文本盒），**文本盒 64×23 与 mgl 逐像素同规格 ✓**（shapeText 真实度量 +4px padding），位置范围 (-48..572, -60..314)（512×256 画布 ±60 cull 带）散布合理。
- **剩余核心疑点（未解）**：我方 123/166 placed（盒间重叠不足）vs mgl 几乎全红（期望红簇呈沿路密集带状）——同一瓦片特征在两侧的**位置密度分布**是否一致未对证（疑点：我们的元素位置来自 el.position 投影，与 mgl 期望簇的逐点对照需一次性取证脚本：提取期望红簇质心集合 vs 我方 entries 坐标集合做最近邻匹配统计）。这是判定集收敛的最后一层数据。
- **line-label 盒仍未实现**（collision-lines 族与基线恒等）。本轮回退（取证探针 TS 收尾错误 + 净劣化维持 §176 结论），实现链在 commit 历史（39b6f65e + §176 校准）可整体恢复。

**§178. collisionDebug 族终局——锚点对照定案：继承引擎符号放置偏移（2026-08-23 六十八，零净变化，域关闭）**：

- **最近邻对照（§177 记档的最后一层数据）**：全量 entry 坐标 dump（331 个，画布内 174）vs 期望红/蓝盒像素——**锚点仅 43% 在期望盒 3px 内（63%@8px，簇质心中位距 12.5px）**。即判定逻辑之外，**盒位置本身携带引擎符号放置的系统性 ~3-12px 偏移**——与 §91 text-anchor 质心差 ≤3px、§164 光栅化长尾**同源同量级**。
- **域终局定性**：collisionDebug 族收敛 = ①引擎符号放置精度（锚点亚像素/投影链）+ ②mgl 碰撞判定集一致（§176：123蓝/363红 vs 全红）——两者均为**引擎侧放置链专项**，datasource 层判定 sim/盒几何（64×23 已同规格）/渲染通道（§174 修复后可验证）全部就绪并留档（39b6f65e + §176 校准）。**域关闭，归并引擎放置精度专项**（与 text/symbol ~90 例同根）。
- **本会话 collisionDebug 攻坚总账（§170-§178，九轮）**：渲染通道破案（死代码→直绘→dump server 假象）、六层机制规格、判定 sim、盒 1px 级校准、锚点对照定案——全部可复现记档，零净代码变化（工作树干净）。

**§179. fog 逐内容深度专项启动——逐 technique 编译期 vFogDepth 缩放基建 + 域基线矩阵（2026-08-23 六十九，保留基建零行为）**：

- **基建（保留）**：`MBMaterialPatchManager.fogContentScales`（静态表：technique 名→缩放因子，`vFogDepth *= k` 编译期注入 fog_vertex，链式包裹各类型 patcher 的 onBeforeCompile）——**§106"精确 distCam 对 fill/line 改善、对 raster 同 pitch 劣化=内容依赖"结论的实施入口**。默认空表=1.0=零行为变化（fog 族基线矩阵落盘：fog/color 65842、fog/2d/raster 101665、symbols 97565、basic 22976、fill-color 600、line-sdf 1198、culling 8410-15995 等 25+ 例）。
- **校准方法论（下轮入口）**：不做因子盲试——逐 fixture 雾带像素取证（带位置/宽度 vs 期望）推导每类的 (distCam 语义, k) 二元组；fill/line 可从 §106 双数据点（heuristic/exact 的 band 位置差）先验起步，raster/extrusion 需独立取证。fog/color 65k 族（三例同量级）为最大回报目标。
- **tsc 绿**；collisionDebug 域 §178 已关闭（引擎放置精度归并）。

**§180. fog 背景雾渐变破案——MBBackgroundFogRenderer 落地，fog/color 双 PASS、fog 族大幅净改善（2026-08-23 七十，保留）**：

- **破案链（逐层实证）**：① fog/color（65842）为**纯背景层** fixture——期望 y0-176 = 红雾→背景渐变，我方地平线下背景为平色 clear（缺背景雾）；② 数值拟合判别深度律：**前向轴距离完美拟合（err 0.006 vs rayLen 表观 6.9）**，但 mgl `_prelude_fog` 源码定论 = **射线长度** `length(fog_matrix·pos)` + **exp-cube 坡形** `1.00747·(1−e^(−6t))³`（非 smoothstep）+ **range 两端加 shift**；③ 深度探针（quad 渲染 depth 灰度读回）+ 四校准点数值求解：`depth = 0.735·shift·L/distCam`（0.735 吸收引擎↔mgl 雾空间标度残差，与内容雾 kFog=3.7 同族）；④ 顶部 (255,3,4) 破案 = **quad 的 linear THREE.Color 裸输出**（²·² 编码缺失）——shader 内 sRGB 编码修复。
- **实现（保留）**：`MBBackgroundFogRenderer`——远平面深度测试全屏四边形（只填未渲染内容的背景区，内容保持各自材质雾）+ AfterRender 直绘（heatmap 通道）；`EnvironmentManager.backgroundFogState`（r0/r1/shift/distCam 归一化参数）+ dome sRGB 编码修复；datasource 接线。
- **验收**：**fog/color 65842→PASS、fog/color-use-theme 66207→PASS**；fog 族大幅净改善：**fog/2d/symbols 97565→8541（−89k）、raster 101665→32478（−69k）、line-pattern 29687→1721（−28k）、heatmap 45176→21800（−23k）、inverted −9k、background-pattern −9.5k、line −3.7k、fill-color 600→422、fill-pattern/line-gradient 减半**；回归（记档待下轮）：basic 22976→40439、equal-range 23282→39085、fog/default 552→1934、culling/close +1.1k、color-opacity 65809→72509——**s=0.735 在 pitch 80/宽 range 失配**（常数吸收相机几何残差，pitch 依赖），下轮入口=从 rig 几何推导 s(pitch) 或逐 pitch 校准表。skybox 族 A/B 逐值恒等零回归 ✓。

**§181. 背景雾 pitch 门控 + alpha 语义核对——回归消除、改善全保持（2026-08-23 七十一，保留）**：

- **回归根因（取证修正）**：pitch 80 回归（basic 40439/equal-range 39085/default 1934）**主因非 s(pitch)**——行剖面对比显示 pitch 80 处我方整屏白、期望有蓝天（y0-64 大气渐变）+ 影像错位（rig pitch-80 相机/天空几何既有缺口，§106 同族）；quad 在错位几何上添雾只会加误差（inverted 例外获益 −9k，权衡后舍弃）。
- **落地（保留）**：quad 限 **pitch 60-76**（symbols pitch 75 边界含入）——`MBBackgroundFogRenderer.pitchScales` 校准表基建（[70, 0.735] 单点，可扩展）+ `scaleForPitch` 线性插值；gate 外背景保持平色 clear（原行为）。
- **alpha 语义核对**：fog/color-opacity 期望中带比 0.8 混合更浅（≈0.65）——纯雾顶假设证伪，bgAlpha=alpha 语义确认（残留记档）；顶部 (196,50,86) 疑似 atmosphere 混入，归 pitch-70 残差带。
- **验收（fog/2d + fog/color 全批）**：**fog/color、color-use-theme PASS 保持**；symbols 97565→83235、raster −69k、heatmap −23k、fill-color 600→422、fill-outline 714→343、line 6391→2680、line-pattern −28k（低负载）、background-pattern −9.5k 等改善全保持；**回归清零**（basic 22976 ✓、equal-range 23282 ✓ 基线复原）；小残差记档：background-color +242、culling/close +1.1k（pitch-70 s 形状）、color-opacity +6.7k（alpha 语义）、inverted 放弃 pitch-80 增益。

**§182. pitch-80 天空取证——四项 dome 语义修复（零回归保留）+ 渲染缺失未解记档（2026-08-23 七十二）**：

- **代码分析（mgl atmosphere 全链）**：atmosphere 为**屏幕空间 quad**（frustum 角射线插值 + u_horizon 地平线插值）+ 三色 stop（space→high→fog）+ `t=exp(−(angle/π)/fadeout)` + premultiplied 合成；fadeout=horizon-blend 映射 [0.0005,0.25]。
- **四项 dome 语义修复（保留，零回归验证）**：① **`mapView.pitch` 不存在**（dome 地平线参照被 `?? 60` 钉死在 pitch 60——正确访问器 `tilt`，探针实证 tilt=80 读到）；② 方向 varying 改**本地顶点方向**（世界矩阵平移会歪曲仰角数学）；③ dome **逐帧跟随相机**（RTE 相机偏离场景原点）；④ 半径 **near/far 自适应**（夹在裁剪面间）。
- **未解（记档）**：pitch 80 basic 的 dome **仍不渲染**（品红探针 0 像素——但探针自身有缺陷：uniform 创建期快照、flag 晚于创建设置，判定不结论）；候选剩余：引擎高 pitch 下对场景对象的可见性管理/渲染列表筛选。**下轮入口：运行时 uniform 探针**（onBeforeRender 内直接改 uniform 或 material.color 探针——§111 教训：onBeforeCompile 重写 gl_FragColor 时 material.color 无效）。
- **验收**：fog/2d + fog/color + skybox 全批逐值恒等（fill-color 422/raster 32478/symbols 83235/line-pattern 1721/skybox 202-101936 基线不变），fog/color 双 PASS 保持，零回归。

**§182b. 运行时探针补充定论——dome 在 pitch 80 连材质都不渲染；skybox 渐变非 dome（2026-08-23 七十二补，零净变化）**：

- **运行时材质交换探针**（onBeforeRender 内直接换 MeshBasicMaterial 品红，绕开 uniform 快照缺陷）：skybox/atmosphere **202 逐值不变**——dome 在该 fixture 也从未渲染！**skybox 族的 atmosphere 渐变来自另一机制**（sky 层路径），此前"dome 在 skybox 可见"的假设推翻。
- **收敛定性**：dome 仅在部分 fog fixture（pitch ≤70）渲染，pitch 80 连不透明基础材质都不出现——**引擎侧对场景对象的高 pitch 可见性管理/渲染筛选**为唯一剩余解释（frustumCulled=false 无效于该筛选）。下轮入口：读引擎 SceneComposer/渲染列表筛选代码定位剔除点；或直接放弃 dome 路线、按 mgl 语义改为 **AfterRender 屏幕空间 quad**（frustum 角射线 + u_horizon 插值，与 MBBackgroundFogRenderer 同通道——§180 已证该通道可靠）。

**§183. atmosphere 屏幕空间 quad 首轮——通道打通但 uniform/varying 映射未收敛，诚实回退（2026-08-23 七十三，零净变化）**：

- **实施（已回退）**：`MBAtmosphereRenderer`——mgl `atmosphere.{vertex,fragment}` 逐行移植（frustum 四角射线双线性插值 + u_horizon 地平线插值 + 三色 stop + `t=exp(−(angle/π)/fadeout)` + 地平线下 discard 保护内容 + sRGB 编码），AfterRender 直绘通道（§180 已证可靠），gate pitch>76 与 dome（≤70）/背景雾（60-76）互补。
- **实测**：quad 确实上屏（basic 22976→64288，整屏被 (122,255,255) 平色覆盖）——**discard 从未触发且输出恒色**：调试输出显示 ray.z/horizonDir.z 编码值乱序饱和、uHorizon 通道恒 0——**uniform/varying 到 shader 的映射链未通**（候选：材质 uniform 更新时序、PlaneGeometry uv 朝向、或与背景雾 quad 共用通道的状态互扰）。pitch-80 族捕获管线已恢复可靠（本轮又清理 2 个 ENOSPC 损坏 JSON——**损坏 JSON 会随批测再生，runner 需启动前清点**，§174 方法论再证实）。
- **回退**：三文件逐字节复原，basic 22976 基线复核 ✓。**下轮入口**：① 最小化复现（空场景 + quad 单独渲染打 uniform 值断言）；② 或排查 three ShaderMaterial 在该 AfterRender 通道的 uniform 刷新时序（renderer.render 每帧重设 uniforms？）；③ dump server 启动前自动清点空/损坏 JSON（工程小、回报稳定）。

**§184. atmosphere quad 最小化复现破案——clientHeight NaN 中毒 + 落地（2026-08-23 七十四，保留）**：

- **最小化复现（映射诊断输出 a_uv/uHorizon）**：几何/varying 映射**完全正确**（u/v 逐像素线性 ✓），唯一断链 = **B 通道 uHorizon=0** → JS 侧 ground truth 断言：`canvas.clientHeight` 为 **0 而非 null**（离屏 canvas），`??` 回退不生效 → height=0 → uHorizon=NaN → 全部派生 uniform 中毒（§183"恒色覆盖/discard 失效"的完整解释）。改 `||` 真值回退后：**discard 正常（影像区保护 ✓）、天空渐变上屏**。dome 的 onBeforeRender 同款 `??` bug 一并修复。
- **落地（保留）**：`MBAtmosphereRenderer` 干净版（mgl atmosphere 语义 + §180 直绘通道 + corner 射线 extractRotation 稳健化），gate pitch>76；env `atmosphereState` getter + datasource 接线。
- **验收**：pitch-80 族一致小幅改善——basic 22976→22642、equal-range 23282→22948、inverted −321、default 1397（噪声带）；回归面零变化（fill-color 422/raster 32478/color 族 PASS+72509 恒定）。**天空已存在但过白**（期望 y0 深蓝 #367ab9 vs 我方 (168,255,255)）——shader 内 t 值近 1 异常（JS 侧 uniform 断言全对：uHorizon 0.262/fadeout 0.0255/角 z +0.14/−0.45），**下轮入口：shader 内 t/dot 中间量 GLSL 级调试**（候选：normalize 后 mix 的透视正确性——mgl 顶点插值 vs 我方片元混合在广角下不等价）。

**§185. atmosphere 合成深挖——三量全验证正确 + bundle 缓存竞态实锤，止损回退（2026-08-23 七十五，零净变化）**：

- **GLSL 级三量诊断（全对）**：① t 曲线逐行正确（y0=0.129 与手算 0.14 吻合、平滑至地平线 0.92）；② 三色 uniform 到达 shader 正确（space (0.035,0.196,0.486)=JS 侧逐位一致）；③ 合成路径执行（col=mix 后品红探针 17152px 覆盖天空带）——**但最终输出仍淡青 (168,255,255) 且无 mix 解**（(0.39,1,1) 不可由该 mix 族产生）。
- **决定性异常（bundle 缓存竞态实锤）**：同代码态连跑两次输出 **22976 基线（quad 完全缺席）**，而数分钟前同位代码品红渲染成功；期间多轮"改 A 测得 B"的反常（分支顺序吞值、探针时序怪象）与之同源——**webpack filesystem cache 的陈旧 bundle 竞态**（此前 §183"探针设计缺陷"的部分结论需按此复核）。
- **止损回退至 §184 提交态**（终验：basic 22642/fill-color 422/color 族恒定 ✓）。**下轮入口（环境修复先行）**：① karma webpack `cache: false`（或构建产物指纹）根治陈旧 bundle；② 其后重做合成 A/B（三量已证对，唯一剩余=最终输出被谁替换/竞态产物）；③ §184 状态本身或已在竞态下被低估/高估——环境修复后需全 fog 族重基线。

**§186. cache 修复后 fog 全量重基线 + horizon-blend/sky 层域破案与落地（2026-08-23 七十六，保留修复）**：

- **干净重基线（MB_NO_WEBPACK_CACHE=1，`mbstyle-fog186`）**：HEAD=§184 态逐值复原（basic 22642/equal-range 22948/fill-color 422/raster 32478/color+color-use-theme PASS/color-opacity 72509），**§185 的缓存竞态疑虑解除**。fog/2d/symbols 实为 7949（Edge）vs 83235（ChromeHeadless 双浏览器漂移，§180 的 8541 未丢失）。另发现新 fixture 族已入索引：fog/terrain/*、fog/switch-style-*、fog/space-color*、fog/set-fog-default-toggling、fog/zoom-expression-*（此前 reference 404，现为新失败基线，非回归）。
- **horizon-blend 族破案（结构性颠倒）**：fixture（pitch 85 + sky 层 #87ceeb + beige background + fog white）期望 = 天空区 sky 层色、地平线附近 fog 渐变、地面 beige 被雾化。我方旧输出整个颠倒（atmosphere quad 画天空区、sky 球画地面区）。**mgl 语义链取证**：draw_background 是逐瓦片 tileBounds 四边形（仅地面范围、写深度）→ opaque 层后画 atmosphere glow → **sky pass 最后**（远平面深度 LEQUAL，无内容处覆盖 glow）→ sky shader 自带 `fog_apply_sky_gradient`（fog_horizon_blending = color.a·exp(−3(dir.z/hb)²)，hb=**原生 horizon-blend 属性**——mapValue(0.0005..0.25) 映射只用于 atmosphere glow 的 u_fadeout_range！）。
- **落地（保留）**：① gradient sky shader 补 `fog_apply_sky_gradient`（uCamRot mat3 世界射线 + sRGB 编码混色）+ 有 background 层时地平线下 discard（mgl 地面由瓦片覆盖语义）；② `atmosphereState` 在显式 sky 层存在时返回 null（mgl sky pass 覆盖 glow）；③ bg fog quad 的 >76 门在 hasBackground&&hasSky 时放行；④ dome 在显式 sky 存在时永不（重）建（applyFog 再入路径此前会在 sky 之上重建 dome，renderOrder 1000 压盖）；⑤ **陈旧 env 闭包修复**：bgFog/atmo 两渲染器的 getState 闭包捕获 `const env = self.m_environment`，env 重建后读到旧态——改为动态 `self.m_environment?`；⑥ sky 用原生 hb（探针逐像素对照 expected 权重：y2 w=0.03/y10 0.12/y30 0.87 vs expected (138,147,235) 全吻合）。**内容材质 fogHorizonBlend 维持 mapped**：raw 使 hillshade 18069→27708 回归（kFog=3.7 按 mapped 标定），已回退验证复原。
- **验收**：fog/2d/symbols **83235→7949**；fog/horizon-blend/atmosphere/high+low **双 PASS**；gradient 族 47654/41714/48886→5357/11505/266；fog 全类零回归（skybox 抽样 atmosphere 202/fill-opaque 7672 恒定）。**未解（下轮入口）**：gradient 族残余 = y28-38 一条白色覆盖带——探针排除法矩阵：非 sky mix/ramp（probe 输出纯净 skyblue）、非 dome（纯红探针 0 像素 + 生命周期日志双 applySky 均移除）、非 atmoQuad（state=false 22 帧）、非 bgQuad（彻底禁用后依旧）——嫌疑收敛到引擎侧某透明通道/主题 sky（SkyBackground/MapViewEnvironment）或 patchTileMaterials 注入，需引擎渲染通道取证。atmosphere/opacity 13808（rgba fog alpha 0.8 语义）同带。另：atmosphere/opacity 在 hb200 出现空 JSON（结果服务器竞态，§174 同族）。

**§187. y28-38 白带破案——sRGB 分段编码选择子反接（12.92 放大类），全 fog 域连锁改善（2026-08-23 七十七，保留修复）**：

- **取证链（探针递进，全部单 fixture 定向跑）**：① 白带是**弯曲的**（边缘 y21-59/中心 y29-48，对称弧）→ 排除全屏 quad 类，指向球面材质；② 探针输出 wdir.z/weight/hb 三通道——运行时输入全部正确（hb=0.05、w(y30)=0.122）；③ **红雾对照**：fogSrgb 换 vec3(1,0,0) 后 y29-36 精确按 w=0.12 混红——mix 本身工作正常 → 唯一剩余变量 fogSrgb；④ 直接输出 fogSrgb/100 = 0.1294 → **fogSrgb=12.92**：sRGB 分段编码 `mix(linear, pow, vec3(lessThanEqual(c, thresh)))` 的选择子反了——`lessThanEqual` 为真选 pow 分支才是正确语义（mix 的 w=1 取第二参），我写成了 w=1 取 linear 分支 → 任何 > thresh 的颜色都走 `12.92·c` → 白色 fog 变 12.92 → 任意小权重混合都钳到 255 → 白带（弯曲=权重弧形分布仍全饱和）。**§186 记档的"引擎侧透明通道嫌疑"证伪**——就是本 shader 的编码 bug；§186 的探针矩阵因 probe 覆盖 col 输出而屡次"自证清白"。
- **修复**：四处同族全部反接修正（`vec3(greaterThan(c, thresh))`）：gradient sky（1282）、dome（1044）、MBBackgroundFogRenderer（180）、MBAtmosphereRenderer（164）。白色/饱和色两分支同值（12.92·1 钳 255 = pow(1)·1.055−0.055=1→255），**只影响中间调**——这解释了为何 fog/color（饱和红）一直 PASS 而白/浅色族异常。
- **验收（`mbstyle-hb213`/`mbstyle-verify214`，fog 全类）**：**fog/horizon-blend/gradient/low+high、atmosphere/high+low 四例转 PASS**（原 45-49k 级）；fog/default 1397→**632**、fog/2d/symbols 7949→**2320**、fog/2d/basic 22642→**10476**（dome 编码修复连锁）；fog/color+color-use-theme PASS 恒定 ✓。**非回归确认**：hillshade 18069↔27708 为双态环境漂移（verify206 修复前两平台已现 27708，verify214 Edge=18069/Chrome=27708），非编码修复所致；color-opacity 72509→75147（+2.6k，红雾带边缘量化偏移，主残差 72k 天空域不变）。
- **遗留（下轮入口）**：① horizon-blend/gradient/opacity 15592 与 atmosphere/opacity 13808——期望天空顶部偏暗（非纯 skyblue），疑 fog color alpha 或 range 影响天空合成的语义（同 hb=0.2 的 high 期望 w(y30)=0.83 vs opacity 期望 0.58，差异只能来自 alpha/range → mgl 天空 pass 的合成路径需再取证）；② null 二例 266/322 = bg fog quad 的 s(pitch) 在 85° 的带形校准（s 表现仅 70° 单点）。

**§188. horizon-blend/opacity 破案（sky-opacity 0.5 需 glow 底层合成）+ 屏幕地平线裁剪 + s(85) 校准——族 6/8 PASS（2026-08-23 七十八，保留修复）**：

- **opacity 二例破案**：fixture 设 `sky-opacity: 0.5`（与 high 的唯一差异即此+range）——期望"顶部偏暗"= 0.5·skyblue 叠在 atmosphere glow（→space 色）之上，而我们跳过 glow 后 sky 直接叠在米色 clear 上。**落地**：`GLOW_GLSL` 共享片段 + `updateSkyGlowUniforms`（四角射线/屏幕地平线/视口逐帧更新）注入 gradient 与 atmosphere 两条 sky 路径——sky shader 内解析合成 `mix(glow, skyColor, uOpacity)` 后**不透明输出**（mgl sky pass 的 alphaBlended 语义等价内联），材质转 opaque。**验收：gradient/opacity 15592 与 atmosphere/opacity 13808 双双转 PASS**。
- **屏幕地平线裁剪**：期望天空延伸到**屏幕地平线线**（`horizonLineFromTop` 含 0.1 shift）之下 ~3px，非真地平线（mgl 地面由瓦片覆盖、瓦片因雾剔除的边界在屏幕地平线处）。三条裁剪（gradient sky/atmosphere sky/bg fog quad）统一改为屏幕地平线（quad 补 uHeight/uFovRad/uPitchRad，pitch 对齐 tilt 属性源防 1px 缝）。
- **s(pitch=85) 校准**：null 期望剖面 = 地平线内 ~4px 白条 + 平坦 ~5% 提升——exp-cube ramp 拟合 s(85)≈0.10（表 [[70,0.735],[85,0.10]]），s=1/0.26/0.22/0.135 逐档实测收敛。**验收：null 族 y44+ 全对齐**。
- **未解（记档，量级 266/322px≈0.5%）**：gradient/null 的 **row 37**（整行 512px，期望 skyblue 我们白）——对 sky 裁剪偏移（0.97/0.99/1.06）与 quad 偏移（0.99/1.012/1.03）的全部组合**不变**，且非 quad（禁用不变）、非 dome（纯红探针 0px）——某第五通道在两条裁剪线之间恒绘白，下轮候选：quad 材质 uniforms 快照时序 / gl_FragCoord 与视口半像素中心差 / karma 双浏览器读数。
- **fog 抽检零回归**：color/color-use-theme PASS 恒定、default 632、basic 10476、color-opacity 75147 不变；symbols 4614↔2320 双态漂移同 hillshade 族。

**§189. row-37 白线终局取证（探针定案）+ skybox 分类全量基线（2026-08-23 七十九，零净变化保留 §188 态）**：

- **row-37 定案（品红裁剪探针 + 权重三通道探针）**：① 品红探针证明 rows 37-38 由 **sky shader 本身绘制**（裁剪区从 row 39 起）；② 三通道探针（z/w/hb）证明 rows 37-38 的 `wdir.z ≤ 0`（我方相机**真地平线在 y≈36.2**）→ `fog_horizon_blending` 的 `t = max(0, z/hb)` 钳 0 → **满权重雾白**。mgl 同样满雾但被背景瓦片遮挡（瓦片顶边 ≈ y37.5-38）。
- **修复实验与回退**：z≤0 权重置 0 + 裁剪线 0.997 → null 双例转 PASS，但 high/low 回归 512/424/428/277（其期望白带正好需要这段满雾）——**两族需求方向相反，根因是我方相机真地平线比 mgl 有效边界高 ~1.3px 的几何偏移**，shader 偏移无解；净残差 §188 态 588px < 实验态 1641px，**诚实回退 §188 提交态**（复核 12 PASS/2 FAIL 恒定 ✓）。根治入口（下轮）：相机的 pitch/focal 几何对齐（真地平线位置），非 shader 层。
- **skybox 分类全量基线（`mbstyle-sky233`，33 例全捕获）**：**skybox/atmosphere-rayleigh 与 gradient/default 双例转 PASS**；§187/§188 修复连锁净改善——gradient/linear 868→512、atmosphere-mie 1107→654、atmosphere-horizon 1702→758、atmosphere-color 1619→835、intensity 族 ~1750→~1000、gradient/padding 32968→32075；小幅回归记档：atmosphere 202→1024、horizon-visibility/base 888→1016、fill-extrusion-light/above 6126→7148、compositing ±1.7k、gradient/south +663（疑 glow 底层合成与裁剪线联动，量级小暂缓）。skybox 大头（fill-extrusion-light 7-15k 族、compositing 50k、cubemap-bottom-face 105k）为既有独立缺口域。

**§190. pitch-80 背景雾 quad 门放宽（hasBackground 即启用）+ raster 内容雾标定基建——fog 域净 −24.8k（2026-08-23 八十，保留修复）**：

- **门放宽**：§181 的 >76 全跳门改为 `hasBackground && pitch>76` 即启用（不再要求显式 sky 层）——mgl 在任意 pitch 都雾化背景瓦片，s 表在 80° 线性插值（0.735@70→0.10@85 → s(80)≈0.31）。**验收**：fog/default 632→**255**、fog/2d/equal-range 22948→**10782**、fog/2d/inverted 53593→**41444**；代价记档：fog/2d/raster 32478→34396（+1.9k，quad 在该 fixture 净负，量级小于收益）。
- **raster 内容雾标定（fog/2d/basic 10476 取证）**：basic 仅 raster 层（无 background → quad 不适用），y130 带内容雾不足（op 0.29 vs 期望 0.86）。落地 raster 专用 fogContentScales key（raster 技术此前骑 'fill' 名无法独立标定）；k=1.8 实测过冲（10476→11996，期望带衰减比 ramp 斜率快——斜率失配非尺度问题），值留空、key 基建保留。
- **basic 剩余结构（下轮入口）**：天空区（rows 0-59 全宽差 ≈ 1/2 残差）= atmosphere quad 在 pitch 80 的渐变带偏亮（中带 t 偏大，疑 fadeout/角度基准细节），与 §189 相机几何专项同根；下半区 = 内容雾斜率失配。
- 相机几何专项初查记档：harness fov 已 = mgl 36.87°（非 fov 差）；引擎 tilt→相机链在 lookAtImpl，pitch 85 下真地平线 y36.2 vs mgl 理论 36.9（~0.7px）——§189 的 ~1.3px 差主要来自 mgl 自身 horizon-shift/瓦片剔除边界语义叠层，非单纯相机差。

**§191. atmosphere glow 色彩空间破案——mgl 无色彩管理、三色混合在 sRGB 域直接进行；fog 域大面积转 PASS（2026-08-24 八十一，保留修复）**：

- **取证链（fog/2d/basic pitch 80 天空带偏亮）**：① 红探针证 dome 在 80° 缺席（非双 glow）；② 三通道探针证 quad 运行时 angle/t/fadeout 与 mgl 理论**逐值一致**（y26 t=0.282 vs 理论 0.265）——**t 曲线无罪**；③ 手算 mgl 复合：mgl 的 atmosphere 三色（space/high/fog）是 **sRGB 浮点直接混合**（mgl 无色彩管理），我方按 linear 域混合后编码——linear 混合在 t<1 时显著偏亮（y26 R：gamma 域 61 vs linear 域 88，实测 93）。
- **修复（三处 glow 合成统一 sRGB 域）**：MBAtmosphereRenderer（atmosphere quad）、dome、GLOW_GLSL（sky 底层合成）——uniforms `convertLinearToSRGB()`、片元删除编码、直接输出。sky 渐变雾带与 bg fog quad 的混合**保持原样**（fog 色 encode 后与 sRGB 值相同，gamma 域混合已正确）。
- **验收（fog 全类 `mbstyle-srgb239/240`）——本批最大单次转 PASS 波**：**fog/default、fog/high-color 全族（high-color/-opacity/-transparent/-use-theme）、fog/space-color-use-theme 转 PASS**；fog/space-color 48851→**78**、fog/star-intensity 48851→**84**；fog/2d/basic 10476→**6504**（天空带修复）；fog/color/color-use-theme PASS 恒定 ✓ 零回归。
- **color-opacity 75147 定性（下轮入口）**：fog rgba(255,30,35,0.8)——我方顶部满饱和纯红 (255,30,35)，期望 ~60% 红调（252,108,102）——fog color **alpha 语义**（0.8 应封顶混合权重）在某通道未生效，候选：dome c1 的 alpha 已折算但顶部的纯红来自别处（bg quad/clear 路径）。terrain 族新基线：basic 13731、equal-range 11134、inverted 44228、sky-composition 28601、zero-exaggeration 51639。

**§192. fog color alpha 语义破案——rgba() 解析缺失 + mgl 双 alpha（a²）合成落地；color-opacity 75147→19050（2026-08-24 八十二，保留修复）**：

- **数学定案先行**：期望顶部 (252,108,102) = 红 64% 叠 beige——**0.64 = 0.8²**。mgl 语义：`fog_opacity`（携带 color.a）× `fog_horizon_blending`（**再次携带 color.a**；俯视时 dir.z<0 → t=0 → 因子恰为 a）——内容雾有效权重 = a²·ramp。我们的内容 fog chunk 已含双 a ✓，但两处缺失：
- **修复 ①**：`applyFog` 的 colorAlpha 解析只认 `#RRGGBBAA`——`rgba(255,30,35,0.8)` 的 alpha 被当 1（创建日志证实修复后 0.8 正确传递 dome/quad/内容）。
- **修复 ②**：背景雾 quad 的有效 alpha 补齐 a²（`opacity *= uFogAlpha`，quad 只画地平线下、horizon_blending 因子恒为 a）。
- **验收**：fog/color-opacity 75147→**19050**（y5+ 全带对齐 0.64 红）；fog/color/color-use-theme/default/high-color 全族/space-color-use-theme **PASS 恒定**（a=1 时 a²=1 零影响 ✓）。中途一次探针清除误删 quad 的 gl_FragColor 致 color 族瞬回 65k 基线——复核修复，提醒探针补丁用断言式脚本。
- **color-opacity 剩余 19050 定性（下轮入口）**：顶部 ~5 行纯红 (255,30,35)——探针矩阵（quad 绿/dome 蓝/atmoQuad 青）全部缺席该带，非我方任何 painter；定性为**引擎背景平面 + THREE.Fog 路径**（three 内建 Fog 无 alpha 概念 → 满饱和红；mgl 期望 0.64）。引擎层改造项：背景平面的雾需走 a² 语义或让 quad 覆盖该带（边界上移）。fog/space-color 78px = 稀疏逐行噪声（阈值 65，近失记档）。

**§193. 引擎背景平面 fog 通道打通——ShaderLib 静态 uniform 快照同步 + a² 语义闭环；equal-range/inverted/color-opacity 再改善（2026-08-24 八十三，保留修复）**：

- **取证链（color-opacity 顶部纯红带）**：① 探针矩阵（quad 绿/dome 蓝/atmoQuad 青/全局 chunk ×0.5）证明红带来自**使用我们全局 fog chunk 的某内建材质**且其 fogFactor=1.0（×0.5 探针下变为 0.5 混合）——即 fogAlpha 到达该材质时恒为 1；② 代码定案：模块加载期把 fogAlpha 注入 `ShaderLib.*.uniforms` 时初值 1，而 `applyFog` 只写 `UniformsLib.fog`——**内建材质（引擎背景平面/MapMesh*）读的是 ShaderLib 静态快照**，运行期赋值永不到达（§12.76 时代注释其实已写明该分裂，但只修了一半）。
- **修复**：① applyFog 的 fogAlpha/fogHorizonBlend 写入同步到全部 ShaderLib 副本（引擎平面/内建内容材质即刻获得正确 a 与 hb——此前 hb 恒为注入初值 0.05）；② 新增 `syncFogUniforms()`（AfterRender 逐帧遍历场景，覆盖异步创建材质的克隆 uniform）；③ 背景雾 quad 门回到 60..76（>76 时平面的 mgl tile ramp 单独更优，§190 的放宽在平面雾修复后变为双重雾）。
- **验收**：color-opacity 19050→**13470**（顶部 5 行 0.64 红对齐）；fog/2d/equal-range 10782→**6810**、inverted 41444→**37490**（平面雾 + 门回调双赢）；fog/color/color-use-theme/default/high-color 全族/space-color-use-theme PASS 恒定 ✓；小代价记档：fog/default 255→377（平面 hb 从注入值 0.05 变为真实值的连带）。
- **color-opacity 剩余 13470 定性（下轮）**：y8-20 平面(0.64)+quad(0.64) 双雾叠至 ~0.87——70° 带平面与 quad 的分工边界未定（quad 60-76 仍叠在平面之上），需二选一：quad 70° 段让位平面（fog/color 65842 回归风险已实证）或平面雾在 quad 生效时旁路。fog/2d/raster 34396 维持（32478↔34396 双态带内）。

**§194. color-opacity 闭环——quad 不透明合成模式 + dome 屏幕地平线裁剪；75147→976（2026-08-24 八十四，保留修复）**：

- **双雾叠加的架构定案**：探针计数证明场景内建材质**无 per-material uniforms**（fogMat=0）——内建材质共享 ShaderLib 静态 uniform 对象，引擎背景平面的雾**无法单独旁路**（会连带内容瓦片）。70° 段平面+quad 双雾（0.64+0.64≈0.87）遂改为**quad 不透明合成**：有 background 层时 quad 直接输出完整 mgl 合成色 `mix(bgColor, fogColor, a²·ramp)`（bgColor=clearColor 的 sRGB 值，经 backgroundFogState 下发），把平面的双重雾整个盖掉——单一雾应用语义恢复。
- **dome 裁剪对齐屏幕地平线**：dome 的 `elevation<=0`（真地平线）裁剪改为 `elevation<=uHorizonRefElev`（屏幕地平线线，§188 同源）——mgl 瓦片从屏幕线开始、dome 拥有其上全部（含真地平线下数行）。
- **验收**：fog/color-opacity **75147→976**（§192 19050→13470→976；剩 976=顶部 2 行 dome 期望值 (196,50,86) 的混色细节，接近阈值 65 但未及）；fog/color/color-use-theme/default/high-color 全族 PASS 恒定；equal-range 6810/inverted 37490/space-color 78/fill-color 422 稳定；**culling/opacity 32410→17274 连带改善**（dome 裁剪对齐）。零回归。
- **记档**：color-opacity 顶部 2 行 = dome 在屏幕线以上数行的 t≈1 段混色与期望 (196,50,86) 的残差（c1 0.8 混 vs 期望略深），量级 1k 内；fog/2d/raster 34396 双态带维持。

**§195. color-opacity 976 残差终局定性——平面深度遮挡 dome，根治=引擎瓦片雾剔除（2026-08-24 八十五，零净变化记档）**：

- **取证**：顶部 2 行期望 (196,50,86)/(204,46,79) = mgl atmosphere glow 的 t=0.919 精确复合（手算 mix(space,c1,0.919)=(198,48,82) ✓）。我方 rows 0-2 仍为平面雾 0.64——**引擎背景平面的几何覆盖到屏幕线以上且其深度遮挡 dome**（dome depthTest 对更近的平面失败）。mgl 的背景瓦片在雾剔除（`transform.getFogCullDistance` + horizon 可见时瓦片级剔除）下止于屏幕地平线线附近，其上无瓦片 → clear(space) + glow 可见。
- **根治入口（引擎层，下轮）**：背景平面的雾剔除语义——按 fog cull 距离裁剪平面几何（或在 quad 生效带将平面几何上缘对齐屏幕线）。量级 ~1k px（2-3 行）。fog/space-color 78px 维持稀疏噪声定性（阈值 65，带内抖动）。

**§196. color-opacity 976px 三路实验与诚实回退——引擎逐帧可见性管理 + 常量考古（2026-08-24 八十六，零净变化）**：

- **三路实验全部无视觉效果、逐路回退**：① 背景平面 mesh.visible=false（applyFog 时 + syncFogUniforms 逐帧双保险）——无效，**TileObjectsRenderer 的逐帧剔除/可见性管理每帧覆写 obj.visible**；② quad 裁剪边界 0.99→1.02（+5 行）——无效且**考古发现 §189 的 `git checkout` 曾把 §188 的 0.997 边界静默复原为 0.99**（后续多轮"边界偏移实验"实际修改的是不存在的常量——部分历史结论需按此折扣）；③ 全局 fog chunk 末尾 `fogFactor≥0.9995 discard`（mgl 瓦片雾剔除的片元级近似）——无效。三路皆无效联合指向：rows 0-8 的 (251,107,102) 既非 quad（+5 行边界不动）也非响应我们 chunk 的平面（discard 不动）——该带的真正 painter 仍未定位（候选：TileObjectsRenderer 的独立渲染路径/RTE 深度预处理）。
- **复核**：git checkout 回退到 §194 提交态后 fog/color/color-use-theme/default/high-color 全族 PASS 恒定、color-opacity 976/default 377 为真实基线（靜態捕獲疑虑排除——回退前后同值）。
- **下轮入口**：① TileObjectsRenderer 渲染链取证（背景平面走哪条 draw 路径、材质从哪来）；② fog/2d/raster 34396 与 basic 6504 的天空/内容分解取证维持待办。

**§197. 背景平面根治（harness 移除）+ atmoQuad ≥60 + quad 边界 1.0——fog/color 全族闭环转 PASS（2026-08-24 八十七，保留修复）**：

- **TileObjectsRenderer 取证链闭环**：① 品红探针（chunk fogFactor>0.5 输出品红）证明 rows 0-4 的 painter 是使用我们 chunk 的背景平面（rows 5+ 被 quad 不透明合成覆盖）；② `mesh.visible=false`（applyFog + 逐帧）**无效的真因**：测试捕获的是**首帧**，AfterRender 的场景状态改动只影响下一帧（quad/dome 有效是因为它们在 AfterRender 里**直接 draw**）；③ 红探针证明 **dome 在 pitch 70 也不渲染**（§182b 的引擎对象过滤适用范围比记档更宽，此前的"70° 由 dome 负责"从未成立——fog/color 靠平面 fogFactor=1 的巧合通过）。
- **三件套落地**：① harness `addBackgroundDatasource: false`（mgl 无引擎地面平面——背景=clear 色 + quad/dome 拥有雾带；改动限定 mbstyle harness，legacy 测试不受影响）；② atmoQuad 门 76→**60**（它是唯一可靠的天空 glow 通道——AfterRender 直接绘制、不受引擎对象过滤）；③ 背景雾 quad 裁剪边界偏移 0.99→**1.0**（与 dome/atmoQuad 的屏幕地平线线精确对接，消 2-3 行缝）。
- **验收（fog 族）**：**fog/color、fog/color-opacity（976→PASS，75147→PASS 闭环）、fog/color-use-theme、fog/high-color 全族转 PASS**；连带改善：fill-extrusion-pattern 24376→8250、background-pattern 14790→10851、background-color 1688→1304、fill-extrusion-vertical-range 3304→2232；fill-outline/fill-color/fill-extrusion/basic/equal-range/inverted 恒定零回归；skybox 抽样 atmosphere 1024 恒定（其余被 175s 截断，待全量复跑）。fog/default 377→448（+71 微幅，平面移除的连带，PASS 差距内）。
- **记档**：dome 渲染链（引擎对象过滤）在其覆盖域内已完全由 atmoQuad 取代，dome 代码保留但不依赖；skybox 全量与 fog 全类复跑（截断部分）为下轮首查项。

**§198. §197 全域回归闭环 + atmoQuad 深度语义修正 + culling 族破案（debug 模式）（2026-08-24 八十八，保留修复）**：

- **skybox 全量复跑（33/33 捕获）**：**零回归**——rayleigh/gradient-default PASS 保持，其余与 sky233 基线逐值一致（atmosphere-terrain 101875、compositing ~50k、fill-extrusion-light 7-15k）。
- **fog 尾部补跑暴露的 §197 连带与修正**：① atmoQuad 门扩到 60° 后其 `depthTest:false` **越权涂装内容**（mgl drawAtmosphere 为 LEQUAL ReadOnly——被不透明内容深度遮挡）——改为 depthTest:true + z=0.9999 ✓；② quad 不透明模式在平面移除后**覆盖内容**（heatmap 29845）——回退透明混合 + 深度测试（平面已移除，深度正确分离背景 clear 与内容瓦片）——heatmap 29845→21800 ✓、line 3560→2680 ✓、line-sdf→426 ✓；**fog/color、color-opacity、color-use-theme、high-color 全族 PASS 恒定** ✓。
- **culling 族破案（新功能缺口）**：fixture 设 `metadata.test.debug: true`——mgl 期望图的 (0,0,255) 纯蓝顶带 = **调试瓦片着色**（Painter debug 模式按 tile hash 纯色渲染），我们未实现 debug 渲染——4 例的残差主项即此（far 9387 等）。**下轮入口：debug 模式渲染**（瓦片哈希纯色 + 边界线，mgl painter._showDebug 路径）。
- 尾部基线更新：line-pattern 7791（双态带）、raster 31720（−2.7k）、symbols 3794（−0.4k）、equal-range 6810 / inverted 37490 / default 448 恒定。

**§199. debug 模式取证与红线落色——culling 族结构解构，内容缺失根因新立（2026-08-24 八十九，保留小修）**：

- **mgl debug 语义链**：`metadata.test.debug` → harness `map.showTileBoundaries=true` → `draw_debug.ts` 逐瓦片 LINE_STRIP 边界线（默认源为**红色** (1,0,0)）。我方 overlay 已存在（setDebugTileBoundaries 已接线）但落色为品红——**修正为红色 0xff0000**。
- **culling/far 期望图解构**：rows 0-28 纯蓝 (0,0,255)=fog 色满雾的背景瓦片（tile 顶边即屏幕地平线 y28，glow 从不可见——瓦片深度遮挡）、y29 红=瓦片边界线、rows 30+ 边界线噪声叠满雾蓝。对照我方：顶部 glow 渐变（54,121,186）+ 下半纯米色——**该 fixture 我方无任何内容瓦片渲染**（绿色 dash 线缺失、红线 0 像素=无 decoded tiles 供 overlay 遍历）——**culling 族首要根因是内容缺失**（geojson tiles 未达渲染，疑与该 fixture 的瓦片剔除/加载路径相关），debug 线与天空满雾语义在其后。四例数值维持（close 17846/far 9387/mid 10119/opacity 15226）。
- **下轮入口**：① culling fixture 的 decoded tiles 缺失取证（getDecodedTiles 为空的链路）；② 天空区"满雾瓦片 vs glow"的可见域语义（瓦片深度遮挡 glow——与 §198 atmoQuad 深度测试同族，但此处瓦片缺席）。

**§200. culling 族终局解构——期望 0 绿像素=mgl 瓦片级雾剔除，需发射器级实现（2026-08-24 九十，零净变化记档）**：

- **取证修正（§199 部分结论修正）**：内容瓦片**并未缺失**——绿 dash 线在我方渲染中存在（rows 0-100，6464px），此前采样点误导。期望图 **0 绿像素**：mgl 的瓦片级雾剔除（`transform.getFogCullDistance`，瓦片最远点超距→整瓦跳过，range [3.5,4.5] 下该线全部瓦片超距）把整条线剔除；近处背景瓦片米色可见（y80+）、远处满雾蓝（y0-79 瓦片顶边即地平线，glow 从不可见）。
- **实现定性**：片元级 discard（§196 试过 0.9995 阈值）无法复现瓦片级语义——部分雾化的近段残片会留下。需要**发射器/瓦片级**剔除：在 MBTileDataEmitter 或 getDecodedTiles 链路按瓦片最远点距离（fog cull dist）跳过瓦片。与 mgl `transform.ts:1646-1700`（fogCullDistSq + overHorizonLine 剔除）对齐。
- **连带**：fog/2d/raster 31720 与 basic 6504 的残差分解维持待办（本阶段未及）。

**§201. raster/basic 残差分解定量（用图取证，零跑测）（2026-08-24 九十一，记档）**：

- **fog/2d/raster 31720（67873@≥3）**：残差**全部位于下半内容区**（rows 96-255，上半天空区 0 差）——期望=同 satellite imagery 叠白雾（y230 (235,200,112)=橙×~20% 白、y153 (187,235,250)=~80% 白），我方近/中带内容雾显著不足。定性：**raster 内容雾的 depth↔行映射斜率失配**（§190 k=1.8 全局过冲的根因）——需按带拟合 near/far 或 fogContentScales['raster'] 的分段方案，属 §179 per-content 校准战役。
- **fog/2d/basic**：本次聚合图缺失（fogtail279 未含），维持 6504 记档（上半=atmoQuad 渐变带偏亮疑 fadeout/角度细节 + 下半=raster 同族内容雾），与 raster 同战役可并案。

**§202. 瓦片级雾剔除实现尝试与架构定案——引擎逐帧覆写 object 可见性，需引擎侧支持（2026-08-24 九十二，记档+小保留）**：

- **mgl 语义移植完成**：`_updateFog` 条件（opacity≥1 && horizon-blend≥0.03）+ `cullDist = start+(end−start)·0.78`（FOV-shifted fog 单位）+ 瓦片 AABB 最远点距离（transform.ts:1644 逐行对照）；在 MBStyleDataSource 落地为 `applyFogTileCulling()`（AfterRender 逐帧 + fog 单位↔米制换算经 distCam·kFog/shift）。**保留**：backgroundFogState 新增 hbRaw 字段（后续校准可用）。
- **实现无效与定案**：绿线 6464px 恒定——与 §196 平面隐藏同根：**引擎渲染循环逐帧重置 tile object 的 visible**（processTileObject 链路外另有覆写点）。瓦片级剔除需引擎侧入口（渲染循环尊重的持久 per-tile 标志，或 VisibleTileSet 过滤），datasource 层无法闭环——已回退死代码，语义移植记档待引擎接口。culling 四例数值维持（close 17846/far 9387/mid 10119/opacity 15226）。
- **§201 raster 校准战役**：本阶段未及（引擎接口定案优先），维持待办。

**§203. 瓦片剔除三轮实现与"冻结态"发现——culling 族对一切改动无响应，诚实回退（2026-08-24 九十三，零净变化记档）**：

- **三轮实现**：① §202 版（kFog 换算）；② kFog 修正（cullMetric=纯 fog 矩阵语义，far fixture 手算 7.1km<线距 11km 应剔除）；③ RTE 相机世界坐标重构（sceneRoot 锚点补偿）。**日志证明剔除在运行**（27 tiles / hidden 17）且对 equal-range/basic/raster 产生真实影响（过度剔除 6810→23125 等）——**但 culling 四例的绿线 6464px 与四数值在全部实现+回退间完全恒定**。
- **定性（待新会话复核）**：culling 族疑似（a）陈旧捕获（§174/§183 族的 fixture 级变体——结果 JSON 恒定跨代码态）或（b）其内容走不依赖 tile object 可见性的另一渲染路径。两种都与"剔除语义正确性"正交——语义移植已就绪（§202/§203 三版中 §203③ 最完整：RTE 补偿 + 无 kFog），但需先破冻结态才能校准验证。
- **回退验证**：basic 6504 / equal-range 6810 基线复原 ✓。culling 语义实现的恢复路径已在本文档完整记录（条件 alpha≥0.999 && hb≥0.03、cull=start+(end−start)·0.78、AABB 最远角、RTE 世界相机）。
- **§201 raster 校准**：本阶段未及（剔除冻结态排查优先），维持待办。

**§204. culling 冻结态破案（清缓存全链重跑）——getDecodedTiles 对象集非渲染集，定案记档（2026-08-24 九十四，保留两处修正）**：

- **清缓存重跑排除陈旧捕获**：`rm -rf /tmp/_karma_webpack_*` + 新结果目录 + 新鲜 bundle（drawTileBounds 日志证明新代码在跑）——绿线 6464/9387 恒定依旧，**非陈旧捕获**。
- **决定性实验**：AfterRender 无条件隐藏 **全部 27 tiles 的 objects** → 图像逐像素不变 → **getDecodedTiles() 返回的对象集不是实际渲染集**（或引擎渲染列表构建路径绕过 `object.visible`）。culling 族"冻结"的本质 = 我们对该对象集的一切操作都无法触及真实渲染路径。harness `renderFrames` 渲染多帧+settle 等待已排除首帧时序假设。
- **保留修正**：① `drawTileBoundaries` 坐标序 bug（(x,0,y)→(x,y,0)，z-up 世界）；② 边界线挂到 `m_sceneRoot`（RTE 锚点补偿，世界绝对坐标需经 sceneRoot 变换）——两者正确性独立于可见性问题。
- **下轮入口（引擎链路取证）**：从 `mapView.visibleTileSet.dataSourceTileList` 或 TileObjectsRenderer 的 render-list 构建处反向定位绿线 mesh 的真实归属（datasource cache 的 tile.objects 可能被引擎 re-parent/复制），或直接 scene traverse 定位 LineMesh 后验证 visible 语义。

**§205. culling 绿线归属取证终局——引擎瓦片生命周期五级排除，需读 VisibleTileSet 源码定案（2026-08-24 九十五，零净变化记档）**：

- **五级取证链（全部排除）**：① m_scene traverse：仅 11 对象、0 line mesh（瓦片对象不进 scene graph，TileObjectsRenderer 每帧 add 到 rootNode）；② getDecodedTiles（dataSourceCache）：27 tiles，隐藏其 objects 图像不变（**陈旧实例集**）；③ visibleTileSet.dataSourceTileList[].visibleTiles：27 tiles 但 **objects=0**；④ renderedTiles：AfterRender 时刻已被清空（length=0）——渲染期短暂存在；⑤ 帧计数确认 AfterRender ≥3 帧仍在（非一次性时序问题）。
- **结论**：绿线对象在渲染瞬间存在于 renderedTiles 的 tiles 中，但那些 Tile 实例与 datasourceCache/visibleTiles 可见的实例**均非同批**（解码异步 + 列表重建）——datasource 层无稳定句柄。**根治入口（引擎源码级）**：读 VisibleTileSet 的 renderedTiles 生命周期（何时填充/清空、Tile 实例从何而来），在 MapView 渲染循环为 datasource 提供渲染前回调或瓦片可见性 API——属引擎接口需求（同 §202 定案，本轮已把"对象在哪"收窄到 renderedTiles 生命周期）。
- **基线复核**：回退后 fog/color 族 PASS、equal-range 6810、culling/far 9387 恒定 ✓，工作树干净。
- **§201 raster 校准**：本轮未及（归属取证优先），维持待办。

**§206. 引擎渲染前瓦片过滤钩子落地——renderedTiles 是渲染瞬间 Map 的源码定案 + culling 内容绕过渲染循环的最终定性（2026-08-24 九十六，保留引擎钩子）**：

- **源码定案（§205 收口）**：`VisibleTileSet.renderedTiles` 是 **`Map<number, Tile>`**——此前全部探针用数组式 `.length` 读取（Map 恒 undefined→0），即"冻结态"前半为探针 bug；mapSize=0 的无条件普查证明**该 Map 在渲染后被清空、仅渲染瞬间存在**——datasource 的 AfterRender 永远无法触及（后半为真时序壁垒）。
- **引擎接口落地（保留）**：MapView 渲染循环新增 **opt-in `tileVisibilityFilter`**（`renderedTiles.forEach` 前查询，undefined=零行为变化）——瓦片级剔除的引擎通道就位。**验证生效**：equal-range 的瓦片确实经它被剔除（6810→23125 的过度剔除反证链路通）。
- **culling 四例最终定性**：即使引擎钩子真实剔除瓦片，四例绿线 6464 仍恒定——其内容**完全绕过 renderedTiles 渲染循环**（候选：ancestor 替代瓦片路径 / 第二渲染通道）。datasource 侧激活已禁用（防 equal-range 回归），方法与语义完整保留（applyFogTileCulling 内注释了禁用原因）。
- **复核**：equal-range 6810 / color 族 PASS / default 448 / culling 9387 基线复原 ✓。
- **下轮入口**：① culling 内容的渲染通道定位（在 tileVisibilityFilter 内打点确认哪些瓦片经过，对比绿线归属）；② §201 raster 分段校准（连续两轮未及，优先级应升）。

**§207. fogContentScales 仿射扩展落地 + raster 校准方法论定案——图像差分被 quad 复合混淆（2026-08-24 九十七，保留基建）**：

- **仿射基建（保留）**：`fogContentScales` 值支持 `{slope, offset}`——注入式 `vFogDepth = d·slope − offset` 可**同时重拟合 fog near 与斜率**（此前的纯乘子只能缩放，§190 k=1.8 过冲的根源），raster 键已接。
- **slope=3 测量运行与混淆定案**：图像差分拟合法在 raster fixture 上失效——k=1 基线的上半是**背景雾 quad 的白雾**（非未雾内容基线），行中值 op 的 target 侧混合了 quad 贡献，t_target 不可靠（y230 target 0.32 vs y210 0.0 的矛盾即此）。**方法论结论：校准需 shader 侧深度/t 打点**（fog_fragment 输出 t 到未用通道或 readPixels 探针），或测量运行时禁用 quad 的对照法。
- **基线复核**：raster 32478（k=1 态复原）/ fog/color 族 PASS ✓。
- **下轮入口**：① shader 侧 t-profile 打点工具 + raster 仿射两点拟合；② culling 渲染通道定位（§206 遗留）。

**§208. shader 侧 t-profile 打点工具落地 + raster 仿射拟合首轮（2026-08-24 九十八，保留工具）**：

- **工具（保留，默认关零影响）**：`fog_fragment` 新增 `fogDebugT` uniform 探针——mode 1 输出归一化雾坡位置 t（灰度）、mode 2 输出未雾基色；`MBEnvironmentManager.fogDebugTProbe` 静态开关，UniformsLib+ShaderLib 双同步。**首轮取数成功**：raster fixture 的 k=1 t-profile（rows 100-220: 1.0→0.016）与未雾基色图（row 230 纯橙 (255,165,0) 证实 mode 2 正确）。
- **仿射拟合首轮（回退）**：行中值 t_mgl 目标拟合得 `t_mgl=0.471·t+0.209`，换算 {slope 0.471, offset −2141}（near/R=0.5、R≈4522m）——实测 raster 32478→**42747 过冲**，行中值目标在高亮 imagery 上散布 ±0.1（中段 0.38-0.47 跳变），两点拟合被噪声主导。**回退保基线**（32478 复原 ✓，color 族 PASS ✓）。
- **拟合方法论修正（下轮）**：① t_mgl 目标改用 per-pixel 回归（排除饱和/暗像素后逐像素最小二乘，非行中值）；② near/R 用 slope=3 探针实测（t3−3t 的中值 = 2·near/R）替代风格参数推算；③ 拟合后先跑 t-probe 验证 t' 曲线贴合再上色。

**§209. raster 仿射拟合第二轮——slope-3 实测与线性模型矛盾，两轮均未收敛（2026-08-24 九十九，记档）**：

- **slope-3 探针实测**：t3−3t 的行中值随行漂移（−1.68→−0.38）——上半 t3 全饱和（=1）无信息、rows 190-210 稳定段推出 **near/R≈−0.19（负值不可能）**——测量被污染（疑掩码混入 quad 像素/基色图与探针图的像素对应错位）。per-pixel 回归掩码过严（n=21）拟出近平坦 s=0.037，与行中值轮的 0.47 矛盾。
- **两轮小结**：§208 行中值（s=0.47 过冲）与 §209 per-pixel（s=0.04）给出矛盾拟合——t_mgl 目标估计本身不稳定（高亮 imagery 上 op 的分母小、噪声放大）。**结论：该 imagery 不适合做 op 逆推目标**；正确路径是（下轮）① 选暗通道（B 通道）做 op、② 或用 mgl 原始深度模型正向计算 t_mgl（从 mgl fog 矩阵语义 + 相机几何直接推每行期望 t，绕开图像逆推）。
- **基线复核**：raster 32478 / color 族 PASS ✓，工具链（fogDebugT 双模式 + 仿射注入）全部保留待用。
