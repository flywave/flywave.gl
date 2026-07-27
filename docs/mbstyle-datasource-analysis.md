# flywave-mbstyle-datasource 分析文档（原生实现方案）

## 1. 背景与目标

### 1.1 当前状态

flywave.gl 是一个基于 harp.gl 的三维地图渲染引擎。当前 MVT 矢量瓦片渲染使用 **flywave 自有的 Theme/StyleSet 体系**（源自 harp.gl 的设计），这是一种非 Mapbox Style 的实现。

核心渲染链路：

```
MapView
  → addDataSource(VectorTileDataSource)   // 关联 styleSetName: "tilezen"
  → MapViewThemeManager.setTheme(Theme)
    → 提取 Theme.styles["tilezen"] → StyleSet[]
    → 传递到 VectorTileDecoder (Web Worker)
      → StyleSetEvaluator 匹配 when → technique
      → VectorTileDataEmitter 构建 DecodedTile（几何 + IndexedTechnique[]）
  → TileObjectsRenderer 渲染
    → DecodedTileHelpers.createMaterial(technique) → Three.js 材质
```

### 1.2 目标

**不通过 Style 转换映射**，而是参照 mapbox-gl-js 的渲染方式，在 flywave.gl 上实现一套**原生 Mapbox Style 渲染层**。

```typescript
const mbDataSource = new MBStyleDataSource({
    style: mbStyle,           // Mapbox Style JSON 或 URL
});

mapView.addDataSource(mbDataSource);
```

---

## 2. 总体架构

### 2.1 设计原则

| 原则 | 说明 |
|------|------|
| **不复用 flywave 的样式系统** | 不转换为 `StyleSet`/`Technique`，直接评估 Mapbox Layer 的 paint/layout |
| **复用工具体系** | 瓦片加载、MVT protobuf 解析、Worker 通信、几何工具函数 |
| **参照 mapbox-gl-js 的实现方式** | Layer 评估、表达式求值、paint 属性解析按 mapbox-gl-js 的模式实现 |
| **Three.js 原生渲染** | paint 属性直接映射到 Three.js 材质和几何参数 |

### 2.2 架构对比

```
当前 flywave 方式（不做）：
  要素 → StyleSetEvaluator → IndexedTechnique[] → createMaterial → Three.js
        ↑                         ↑
     Theme.StyleSet           technique 参数
     (when+technique+attr)    (color, lineWidth...)

新方案（原生 Mapbox 方式）：
  要素 → MBLayerEvaluator → 解析后的 paint/layout → MBMaterialFactory → Three.js
        ↑                         ↑
     style.layers[]          直接评估 paint 属性
     (filter+paint+layout)    (fill-color, line-width...)
```

### 2.3 总体架构图

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          flywave-gl MapView                            │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                   MBStyleDataSource                               │   │
│  │                                                                   │   │
│  │  继承 TileDataSource                                             │   │
│  │  - getTilingScheme() → webMercatorTilingScheme                    │   │
│  │  - getTile(tileKey) → 复用 TileFactory + TileLoader               │   │
│  │  - connect() → 解析 style, 初始化 DataProvider, 注册 decoder      │   │
│  │                                                                   │   │
│  │  MBStyleManager (主线程)                                          │   │
│  │  ├── loadStyle()        解析/加载 Mapbox Style JSON               │   │
│  │  ├── resolveSources()   构建多个 DataProvider (多 source 支持)     │   │
│  │  ├── resolveLayers()    按 source 分组，构建 Layer 配置            │   │
│  │  ├── loadSprite()       加载 sprite JSON + PNG → 纹理图集         │   │
│  │  ├── loadGlyphs()       加载 pbf 字体 → font catalog              │   │
│  │  ├── applyLight()       配置 MapView 光照                         │   │
│  │  ├── applyFog()         配置雾                                    │   │
│  │  └── applyTerrain()     配置地形                                  │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                    │                                     │
│                                    ▼  send to Worker                     │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  Worker 中运行: MBStyleDecoder                                  │   │
│  │                                                                   │   │
│  │  复用的 flywave 组件:                                            │   │
│  │  ├── OmvDataAdapter ──── MVT protobuf 解码                      │   │
│  │  ├── OmvDataAdapter.visitLayer/visitFeature ─── 要素遍历         │   │
│  │  └── DecodeInfo ──────── 瓦片坐标/投影信息                       │   │
│  │                                                                   │   │
│  │  新实现的 Mapbox 渲染组件:                                       │   │
│  │  ├── MBLayerEvaluator ── 评估 filter, min/max zoom               │   │
│  │  ├── MBExpressionEngine ── 原生 Mapbox 表达式求值                │   │
│  │  ├── MBPaintResolver ──── 逐属性解析 paint (含 zoom 插值)        │   │
│  │  ├── MBLayoutResolver ─── 解析 layout 属性                       │   │
│  │  └── MBTileDataEmitter ── 按 layer type 构建几何                 │   │
│  │                              → DecodedTile 数据                  │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                    │                                     │
│                                    ▼  decode response                    │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  主线程渲染: MBRenderLayer                                      │   │
│  │                                                                   │   │
│  │  ├── MBMaterialFactory ─── paint → Three.js 材质                 │   │
│  │  │    (fill-color → MeshBasicMaterial.color)                     │   │
│  │  │    (line-color → LineBasicMaterial.color)                     │   │
│  │  │    (icon-image → SpriteMaterial.map)                          │   │
│  │  │                                                               │   │
│  │  └── MBSymbolRenderer ─── symbol 层碰撞检测与布局                │   │
│  │       (symbol-avoid-edges, icon-allow-overlap, etc)              │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 3. 复用与新建的组件判定

### 3.1 直接复用（不改动或极轻微调整）

| 组件 | 路径 | 复用方式 |
|------|------|---------|
| `OmvDataAdapter` | `@flywave/flywave-vectortile-datasource/src/adapters/omv/OmvDataAdapter.ts` | 直接用于 MVT protobuf 解析 |
| `OmvDataAdapter.visitOmv()` / `visitOmvLayer()` / `visitPointFeature()` / `visitLineFeature()` / `visitPolygonFeature()` | 同上 | 复用要素遍历逻辑，但**处理器需要改为调用新的 MBLayerEvaluator** |
| `DecodeInfo` | `@flywave/flywave-vectortile-datasource/src/DecodeInfo.ts` | 直接复用 |
| `TileLoader` | `@flywave/flywave-mapview-decoder/src/TileLoader.ts` | 直接复用 |
| `TileFactory` | `@flywave/flywave-mapview-decoder/src/TileDataSource.ts` | 直接复用 |
| `TileDataSource`（**扩展而非继承**） | `@flywave/flywave-mapview-decoder/src/TileDataSource.ts` | 继承其瓦片加载/管理能力，覆写解码逻辑 |
| `TileDecoderService` | `@flywave/flywave-mapview-decoder/src/TileDecoderService.ts` | 直接复用 worker 通信协议 |
| `WorkerDecoderProtocol` | `@flywave/flywave-datasource-protocol/src/WorkerDecoderProtocol.ts` | 直接复用 |
| `DecodedTile` | `@flywave/flywave-datasource-protocol/src/DecodedTile.ts` | **数据结构可复用**，但 `Geometry` 中的 technique 索引需要改为 layer 索引 |
| `ThreeBufferUtils` | `@flywave/flywave-datasource-protocol/src/ThreeBufferUtils.ts` | 几何构建工具 |
| `DataSource` | `@flywave/flywave-mapview/src/DataSource.ts` | 基类接口 |
| `OmvRestClient` | `@flywave/flywave-vectortile-datasource/src/OmvRestClient.ts` | 复用 tile URL 请求 |
| `DataProvider` 接口 | `@flywave/flywave-mapview-decoder/src/DataProvider.ts` | 复用接口定义 |

### 3.2 部分参考（参考 mapbox-gl-js 源码重新实现）

| mapbox-gl-js 源码 | 路径 | 用途 |
|-------------------|------|------|
| `StyleLayer` 子类（`FillStyleLayer`、`LineStyleLayer`、`SymbolStyleLayer` 等） | `mapbox-gl-js/src/style/style_layer/*.ts` | 参考其 paint/layout 属性结构和 recalculate 逻辑，在 `MBLayerEvaluator` 中实现 |
| `Expression` 引擎 | `mapbox-gl-js/src/style-spec/expression/` | 参考表达式解析和求值逻辑，在 `MBExpressionEngine` 中实现 |
| `Properties` / `Property` 系统 | `mapbox-gl-js/src/style/properties.ts` | 参考 paint 属性的 zoom 插值和 transition 处理 |
| `featureFilter` | `mapbox-gl-js/src/style-spec/feature_filter/` | 参考 filter 编译和求值逻辑 |
| `Sprite` 加载 | `mapbox-gl-js/src/util/sprite.ts` / `style/load_sprite.ts` | 参考 sprite JSON+PNG 加载 |
| `GlyphManager` / `GlyphSource` | `mapbox-gl-js/src/render/glyph_manager.ts` | 参考 pbf 字体加载 |
| `Bucket` 子类（`FillBucket`、`LineBucket`、`SymbolBucket` 等） | `mapbox-gl-js/src/data/bucket/*.ts` | 参考几何构建的细分和布局逻辑（尤其是 SymbolBucket） |
| `CollisionIndex` / `Placement` | `mapbox-gl-js/src/symbol/` | 参考碰撞检测和标注布局算法 |

### 3.3 完全新建的组件

| 组件 | 说明 | 层级 |
|------|------|------|
| `MBStyleDataSource` | 数据源入口，扩展 `TileDataSource` | 主线程 |
| `MBStyleManager` | Style 生命周期管理 | 主线程 |
| `MBStyleDecoder` | Worker 中的解码器 | Worker |
| `MBLayerEvaluator` | **核心** — 针对每个要素评估所有匹配的 Mapbox Layer | Worker |
| `MBExpressionEngine` | Mapbox 表达式求值引擎（参照 mapbox-gl-js 实现） | Worker |
| `MBFilterCompiler` | Mapbox filter 编译为可执行函数 | Worker |
| `MBPaintResolver` | 逐属性解析 paint（含 zoom/feature 插值） | Worker |
| `MBLayoutResolver` | 解析 layout 属性 | Worker |
| `MBTileDataEmitter` | 按 layer type 构建几何（替代 `VectorTileDataEmitter`） | Worker |
| `MBMaterialFactory` | paint → Three.js 材质（主线程渲染时） | 主线程 |
| `MBSymbolRenderer` | symbol 层碰撞检测和布局 | 主线程 |
| `MBSpriteLoader` | sprite JSON+PNG → 纹理图集 | 主线程 |
| `MBGlyphLoader` | pbf 字体加载 | 主线程 |
| `MBMapViewIntegration` | light / fog / terrain 注入 MapView | 主线程 |

---

## 4. 核心数据流

### 4.1 要素解码与样式匹配（在 Worker 中）

```
MVT ArrayBuffer
  ↓
OmvDataAdapter.decode(payload)  ──── 复用
  → protobuf Tile
  → 遍历每个 Layer
    → 遍历每个 Feature
      ↓ 几何 + 属性
  ↓
MBLayerEvaluator.evaluate(feature, layers)
  ┌──────────────────────────────────────────────┐
  │  对每个 Mapbox Layer（按 style.layers 顺序）：       │
  │  1. 检查 source-layer 是否匹配                 │
  │  2. MBFilterCompiler.evaluate(filter, feature) │
  │  3. 检查 minzoom / maxzoom                    │
  │  4. 通过 → 收集该 layer 的匹配结果              │
  │     paint: MBPaintResolver.resolve(layer.paint, zoom, feature) │
  │     layout: MBLayoutResolver.resolve(layer.layout, zoom)       │
  └──────────────────────────────────────────────┘
  ↓ 每个匹配的 layer → 一组 (paint, layout) 值
  ↓
MBTileDataEmitter.emit(feature, matchedLayers)
  ┌──────────────────────────────────────────────┐
  │  按 layer.type 分派:                          │
  │  fill         → 三角化 + 顶点颜色              │
  │  line         → 线几何 + dash 处理             │
  │  symbol(icon) → 构建 POI 几何                   │
  │  symbol(text) → 构建 Text 几何                  │
  │  circle       → 构建点几何                      │
  │  fill-extrusion → 3D 挤出几何                   │
  │  ...                                            │
  └──────────────────────────────────────────────┘
  ↓
DecodedTile
  (第 3.1 节的复用数据结构，但 technique 索引改为 layer 索引)
```

### 4.2 渲染（在主线程）

```
DecodedTile
  ↓
TileObjectsRenderer（复用）
  ↓ 遍历每个 Geometry
MBRenderLayer.render()
  ┌──────────────────────────────────────────────┐
  │  根据 geometry 携带的 layerId:                 │
  │  → 取出该 layer 的 paint 属性                  │
  │  → MBMaterialFactory.create(layerType, paint) │
  │    fill    → MeshBasicMaterial({ color, opacity }) │
  │    line    → LineBasicMaterial / 自定义线着色器    │
  │    symbol  → SpriteMaterial / TextMaterial       │
  │    circle  → PointsMaterial                      │
  │  → 应用表达式属性（如 fill-color 是表达式）        │
  └──────────────────────────────────────────────┘
  ↓ 添加到场景
SceneGraph
```

---

## 5. 核心组件详细设计

### 5.1 MBLayerEvaluator — Layer 评估器

负责针对每个 MVT 要素，找出所有匹配的 Mapbox Layer 并返回评估后的 paint/layout 属性。

```typescript
interface EvaluatedLayer {
    id: string;
    type: LayerType;
    sourceLayer: string;
    paint: EvaluatedPaint;    // 已解析的 paint 属性键值对
    layout: EvaluatedLayout;  // 已解析的 layout 属性键值对
    renderOrder: number;      // layer 在数组中的位置
}

class MBLayerEvaluator {
    private m_layers: PreprocessedLayer[];
    private m_filterCache: Map<string, CompiledFilter>;

    constructor(style: StyleSpecification) {
        // 预处理所有 layer：
        // 1. 按 source-layer 分组，建立快速索引
        // 2. 预编译 filter
        // 3. 预解析 paint/layout 属性结构
    }

    /**
     * 为给定要素找出所有匹配的 layer，按 style 顺序返回。
     */
    evaluate(
        feature: Feature,
        layerName: string,          // source-layer
        zoom: number,
        geometryType: GeometryType
    ): EvaluatedLayer[] {
        const results: EvaluatedLayer[] = [];
        const candidateLayers = this.m_layersBySourceLayer.get(layerName) ?? [];

        for (const layer of candidateLayers) {
            // 1. 检查几何类型兼容性
            if (!this.isGeometryCompatible(layer.type, geometryType))
                continue;

            // 2. 检查 zoom range
            if (zoom < (layer.minzoom ?? 0) || zoom >= (layer.maxzoom ?? Infinity))
                continue;

            // 3. 评估 filter
            if (layer.compiledFilter && !layer.compiledFilter(feature))
                continue;

            // 4. 解析 paint（zoom 插值 + data-driven 表达式）
            const paint = this.resolvePaint(layer, zoom, feature);
            const layout = this.resolveLayout(layer, zoom, feature);

            results.push({
                id: layer.id,
                type: layer.type,
                sourceLayer: layerName,
                paint,
                layout,
                renderOrder: layer.renderOrder
            });
        }

        return results;
    }

    /**
     * Zoom 插值解析
     *
     * fill-color: ["interpolate", ["linear"], ["zoom"], 10, "#fff", 16, "#000"]
     * → 根据当前 zoom 插值出实际颜色
     */
    private resolvePaint(
        layer: PreprocessedLayer,
        zoom: number,
        feature: Feature
    ): EvaluatedPaint {
        const result: EvaluatedPaint = {};
        for (const [key, prop] of Object.entries(layer.paintProperties)) {
            if (prop.value === undefined) {
                result[key] = prop.default;
            } else if (isExpression(prop.value)) {
                result[key] = MBExpressionEngine.evaluate(
                    prop.value, zoom, feature
                );
            } else {
                result[key] = prop.value;
            }
        }
        return result;
    }
}
```

### 5.2 MBExpressionEngine — 表达式引擎

与 flywave 的 `Expr` 引擎无关，参照 mapbox-gl-js 的 `expression/index.ts` 独立实现。

**为什么必须新建而非复用 `Expr` 系统**：

| 问题 | 说明 |
|------|------|
| 运算符集不完整 | `let`/`var`/`coalesce`/`format`/`image`/`to-number` 等缺失 |
| 语义差异 | `match`、`step`、`interpolate` 的某些边界行为可能不同 |
| 类型系统 | 表达式求值结果的类型校验（string/number/color/array）不够严格 |
| 后续维护 | 依赖 flywave 的 `Expr` 系统会长期绑定两个体系的兼容性 |

```typescript
class MBExpressionEngine {
    /**
     * 求值一个 Mapbox 表达式
     * 
     * @param expr - 表达式 JSON，如 ["get", "name"] 或 ["interpolate", ["linear"], ["zoom"], 0, 1, 20, 20]
     * @param zoom - 当前 zoom 级别
     * @param feature - 要素属性
     * @returns 求值结果
     */
    static evaluate(
        expr: ExpressionSpecification,
        zoom: number,
        feature?: Feature,
        featureState?: FeatureState
    ): Value {
        // ...
    }
}
```

**实现策略**：

- Phase 1: 支持最常用的运算符（`get`/`has`/`==`/`!=`/`all`/`any`/`match`/`interpolate`/`step`/`zoom`/`geometry-type`/`id`/`literal`/`case`/`coalesce`/`!`/`to-number`/`+`/`-`/`*`/`/`）
- Phase 2: 补齐剩余运算符
- 直接参考 `mapbox-gl-js/src/style-spec/expression/definitions/` 下的各运算符实现

### 5.3 MBFilterCompiler — Filter 编译

```typescript
type CompiledFilter = (feature: Feature) => boolean;

class MBFilterCompiler {
    static compile(filter: FilterSpecification): CompiledFilter {
        if (filter === undefined) return () => true;

        // 支持 legacy filter 格式：
        // ["==", key, val], ["has", key], ["in", key, ...vals]
        // 和表达式 filter 格式：
        // ["match", ["get", "class"], "primary", true, false]

        if (isExpressionFilter(filter)) {
            return (feature: Feature) => {
                return MBExpressionEngine.evaluate(filter, 0, feature);
            };
        } else {
            return compileLegacyFilter(filter);
        }
    }
}
```

### 5.4 MBPaintResolver — Paint 属性解析

```typescript
class MBPaintResolver {
    /**
     * 按 layer type 解析并缓存 paint 属性的数据结构
     */
    static resolveProperties(
        layerType: string,
        paintSpec: Record<string, any>,
        propertyDefinitions: Record<string, StylePropertySpecification>
    ): PaintPropertySet {
        const result: PaintPropertySet = {};

        for (const [name, spec] of Object.entries(propertyDefinitions)) {
            const value = paintSpec[name];

            if (value === undefined) {
                result[name] = { value: undefined, default: spec.default };
            } else if (isExpression(value)) {
                // data-driven 或 zoom 表达式
                result[name] = {
                    type: 'expression',
                    expression: value,
                    default: spec.default,
                    // 判断是 data-driven 还是 camera-driven
                    isDataDriven: isDataDriven(value)
                };
            } else if (typeof value === 'object' && value.stops) {
                // legacy stop function → 表达式
                result[name] = {
                    type: 'expression',
                    expression: convertFunctionToExpression(value, spec),
                    default: spec.default,
                    isDataDriven: !!value.property
                };
            } else {
                // 静态值
                result[name] = { type: 'constant', value, default: spec.default };
            }
        }

        return result;
    }

    /**
     * 对具体 zoom + feature 求值，得到最终属性值
     */
    static evaluate(
        properties: PaintPropertySet,
        zoom: number,
        feature: Feature,
        featureState?: FeatureState
    ): Record<string, any> {
        const result: Record<string, any> = {};
        for (const [key, prop] of Object.entries(properties)) {
            if (prop.type === 'constant') {
                result[key] = prop.value ?? prop.default;
            } else if (prop.type === 'expression') {
                result[key] = MBExpressionEngine.evaluate(
                    prop.expression, zoom, feature, featureState
                ) ?? prop.default;
            }
        }
        return result;
    }
}
```

### 5.5 MBTileDataEmitter — 几何构建（Worker 中）

与 `VectorTileDataEmitter` 结构相似，但**不再基于 technique 分派，而是基于 layer type**。

```typescript
class MBTileDataEmitter {
    /**
     * 处理一个要素，根据匹配上的 layers 构建几何
     */
    processFeature(
        layerName: string,
        extents: number,
        geometry: GeometryInput,
        properties: ValueMap,
        featureId: string | number | undefined,
        geometryType: 'point' | 'line' | 'polygon',
        matchedLayers: EvaluatedLayer[]
    ): void {
        for (const layer of matchedLayers) {
            switch (layer.type) {
                case 'fill':
                    this.emitFill(layerName, extents, geometry, properties, featureId, layer);
                    break;
                case 'line':
                    this.emitLine(layerName, extents, geometry, properties, featureId, layer);
                    break;
                case 'symbol':
                    this.emitSymbol(layerName, extents, geometry, properties, featureId, layer);
                    break;
                case 'circle':
                    this.emitCircle(layerName, extents, geometry, properties, featureId, layer);
                    break;
                case 'fill-extrusion':
                    this.emitExtrusion(layerName, extents, geometry, properties, featureId, layer);
                    break;
                // ...
            }
        }
    }

    /**
     * 构建 fill 几何
     * 
     * 三角化多边形 → 写入 vertex buffer
     * paint.fill-color → 顶点颜色或材质引用
     * paint.fill-opacity → 透明度
     * paint.fill-outline-color → 边框线
     */
    private emitFill(
        layerName: string,
        extents: number,
        geometry: IPolygonGeometry[],
        properties: ValueMap,
        featureId: string | number | undefined,
        layer: EvaluatedLayer
    ): void {
        const color = layer.paint['fill-color'] as string;
        const opacity = layer.paint['fill-opacity'] as number ?? 1;
        const outlineColor = layer.paint['fill-outline-color'] as string | undefined;

        // 三角化 → earclipping
        // 构建 MeshBuffers（复用 flywave 的工具函数）
        // 在 geometry.groups 中记录 layerId → GpuGroupInfo
    }

    getDecodedTile(): DecodedTile {
        // 组装所有积累的几何，返回 DecodedTile
    }
}
```

### 5.6 MBMaterialFactory — Paint 到 Three.js 材质（主线程）

这是**渲染阶段核心**，将解码后的 paint 属性转为 Three.js 材质，**不能运行在 Worker 中**。

```typescript
export class MBMaterialFactory {
    /**
     * 根据 layer type 和评估后的 paint 值创建 Three.js 材质
     */
    static createMaterial(
        layerType: string,
        paint: EvaluatedPaint
    ): THREE.Material {
        switch (layerType) {
            case 'background':
                return new THREE.MeshBasicMaterial({
                    color: paint['background-color'] ?? '#000000',
                    opacity: paint['background-opacity'] ?? 1,
                    depthWrite: false,
                });

            case 'fill':
                return new THREE.MeshBasicMaterial({
                    color: paint['fill-color'] ?? '#000000',
                    opacity: paint['fill-opacity'] ?? 1,
                    transparent: (paint['fill-opacity'] ?? 1) < 1,
                    side: THREE.DoubleSide,
                });

            case 'line':
                return new THREE.LineBasicMaterial({
                    color: paint['line-color'] ?? '#000000',
                    opacity: paint['line-opacity'] ?? 1,
                    linewidth: paint['line-width'] ?? 1,
                    transparent: (paint['line-opacity'] ?? 1) < 1,
                });

            case 'circle':
                return new THREE.PointsMaterial({
                    color: paint['circle-color'] ?? '#000000',
                    opacity: paint['circle-opacity'] ?? 1,
                    size: paint['circle-radius'] ?? 5,
                    sizeAttenuation: true,
                    transparent: (paint['circle-opacity'] ?? 1) < 1,
                });

            case 'fill-extrusion':
                // 需要自定义着色器或使用现有 extruded-polygon 的实现
                // ...

            case 'symbol':
                if (paint['icon-image']) {
                    // Sprite 图标的 SpriteMaterial
                    return new THREE.SpriteMaterial({
                        map: this.getSpriteTexture(paint['icon-image']),
                        opacity: paint['icon-opacity'] ?? 1,
                    });
                }
                // text 标注使用 TextGeometry 或 Sprite 文字
                // ...

            // raster / hillshade / heatmap 等
        }
    }
}
```

**需要处理的 paint 属性示例**（以 line 为例）：

| Mapbox paint 属性 | Three.js 映射 | 备注 |
|-------------------|---------------|------|
| `line-color` | `LineBasicMaterial.color` | 字符串 `#rrggbb` |
| `line-opacity` | `material.opacity` | 需设置 `transparent: true` |
| `line-width` | `material.linewidth` | WebGL 限制（通常只支持 1）→ 需要**自定义线着色器** |
| `line-dasharray` | 自定义 Shader | `LineBasicMaterial` 不支持 dash，需实现 `MeshLine` 或自定义几何 |
| `line-gap-width` | 内部偏移渲染 | 需两条平行线实现 gap |
| `line-blur` | 自定义 Shader | 模糊效果 |
| `line-gradient` | 自定义 Shader | 按长度渐变 |
| `line-pattern` | `material.map` | sprite 纹理映射 |
| `line-offset` | 几何平移 | 修改顶点位置 |
| `line-translate` | `material.translate` | 或修改 Mesh 位置 |
| `line-border-color` | 自定义 | 需要两层渲染 |

**关键挑战**：`line-width` 在 WebGL 原生 Line 中仅支持 1px，需要实现**自定义线渲染器**（参考 mapbox-gl-js 的 `LineBucket` 使用三角化线段）。flywave 已有 `SolidLineMaterial` 可在此基础扩展。

### 5.7 MBSymbolRenderer — 标注碰撞检测

Mapbox symbol 层最复杂的部分。参照 `mapbox-gl-js/src/symbol/`：

```typescript
class MBSymbolRenderer {
    /**
     * 执行标注碰撞检测和布局
     * 
     * 关键属性:
     * - symbol-placement: point / line / line-center
     * - icon-allow-overlap / icon-ignore-placement
     * - text-allow-overlap / text-ignore-placement
     * - symbol-avoid-edges
     * - symbol-spacing
     * - icon-padding
     * - text-variable-anchor
     */
    place(
        symbols: SymbolInstance[],
        collisionIndex: CollisionIndex,
        viewport: Viewport
    ): PlacedSymbol[] {
        // 1. 为每个标注计算包围盒
        // 2. CollisionIndex 判断是否与已放置的标注重叠
        // 3. 如果重叠，根据 allow-overlap / ignore-placement 决定保留或跳过
        // 4. 支持 prioritize 优先级排序
    }
}
```

**简化策略**（Phase 1-2）：
- 只支持 `symbol-placement: "point"`，暂不支持 `"line"` 和 `"line-center"`
- 忽略碰撞检测，所有 symbol 直接渲染
- Phase 3 再实现碰撞检测（参照 mapbox-gl-js `CollisionIndex` 和 `Placement`）

### 5.8 MBStyleDataSource — 数据源入口

```typescript
export interface MBStyleDataSourceParameters {
    style: StyleSpecification | string;
    decoderScriptUrl?: string;
    languages?: string[];
    minDisplayLevel?: number;
    maxDisplayLevel?: number;
}

export class MBStyleDataSource extends TileDataSource {
    private m_styleManager: MBStyleManager;
    private m_layerEvaluator: MBLayerEvaluator;  // 传给 Worker

    constructor(params: MBStyleDataSourceParameters) {
        // ...
    }

    async connect() {
        // 1. 加载 Style JSON
        await this.m_styleManager.loadStyle(this.m_params.style);

        // 2. 为每个 source 创建 DataProvider
        const sources = this.m_styleManager.getSources();
        for (const [sourceId, sourceSpec] of Object.entries(sources)) {
            // 创建对应的 DataProvider (OmvRestClient / etc.)
            const provider = createProviderFromSource(sourceSpec);
            this.registerDataProvider(sourceId, provider);
        }

        // 3. 注册 Worker Decoder
        //    → 将 style layers 数据传递给 Worker
        const decoderService = ...;
        await decoderService.configure({
            layers: this.m_styleManager.getLayers(),
            sprite: this.m_styleManager.getSpriteInfo(),
        });

        // 4. 加载 sprite / glyphs
        await this.m_styleManager.loadSprite();
        await this.m_styleManager.loadGlyphs();

        // 5. 应用 light / fog / terrain
        this.m_styleManager.applyToMapView(this.mapView);

        await super.connect();
    }

    async setTheme(theme: Theme): Promise<void> {
        // 不使用 flywave 的 theme 系统
        // MBStyleDataSource 的样式由其自己的 style 决定
    }
}
```

---

## 6. 多 Source 路由

Mapbox Style 往往包含多个 source，每个 source 的 tile URL 不同。

```
style.sources = {
    "mapbox": { type: "vector", url: "mapbox://mapbox.mapbox-streets-v8" },
    "terrain": { type: "vector", url: "mapbox://mapbox.mapbox-terrain-v2" }
}

style.layers = [
    { id: "water", type: "fill", source: "mapbox", "source-layer": "water" },
    { id: "country_border", type: "line", source: "mapbox", "source-layer": "boundaries" },
    { id: "contour", type: "line", source: "terrain", "source-layer": "contour" },
]
```

**实现**：

1. `MBStyleDataSource` 为每个 vector source 注册一个独立的 `DataProvider`（`OmvRestClient` 实例）
2. `getTile(tileKey)` 时，为每个 source 分别发起请求
3. 各 source 的 tile 数据使用同一个 decoder 实例，但携带不同的 sourceId
4. `MBLayerEvaluator` 根据 layer 中声明的 `source` 字段，只评估属于当前 source 的 layer

```
Source A (mapbox) 的瓦片 → Decoder
  → 只评估 source="mapbox" 的 layers

Source B (terrain) 的瓦片 → Decoder
  → 只评估 source="terrain" 的 layers
```

---

## 7. 组件依赖关系

```
MBStyleDataSource
  ├── MBStyleManager
  │     ├── MBSpriteLoader
  │     ├── MBGlyphLoader
  │     └── MBMapViewIntegration
  │
  ├── DataProvider (OmvRestClient / 自定义)
  │
  ├── TileLoader (复用)
  ├── TileDecoderService (复用)
  │
  └── [Worker 中]
        └── MBStyleDecoder
              ├── OmvDataAdapter (复用)
              ├── MBLayerEvaluator
              │     ├── MBFilterCompiler
              │     └── MBExpressionEngine
              ├── MBPaintResolver
              ├── MBLayoutResolver
              └── MBTileDataEmitter
                    └── DecodedTile (复用数据结构)

[主线程渲染时]
  MBMaterialFactory
  MBSymbolRenderer
```

---

## 8. 与 mapbox-gl-js 源码的关系

| mapbox-gl-js 模块 | 本项目中的角色 | 代码复用方式 |
|-------------------|--------------|------------|
| `style-spec/types.ts` | TypeScript 类型定义 | **直接 import**（共享类型校验） |
| `style-spec/validate_style.ts` | Style 格式验证 | **直接调用**（验证输入的 Mapbox Style） |
| `style-spec/read_style.ts` | JSON 解析带行号 | **直接调用** |
| `style-spec/migrate/` | v7 → v8 迁移 | **直接调用**（兼容旧版 Style） |
| `style-spec/diff.ts` | Style 增量更新 | **直接调用** |
| `style-spec/expression/` | 表达式引擎参考实现 | **参照**全部重写 |
| `style-spec/feature_filter/` | filter 编译参考 | **参照**实现 |
| `style-spec/function/` | 旧版 stop 函数转换 | **复用**转表达式逻辑 |
| `style-spec/reference/v8.json` | paint/layout 属性默认值表 | **直接 import** |
| `style-spec/util/color.ts` | 颜色解析 | **直接 import** |
| `style/style_layer/*.ts` | 各 layer 的 paint/layout 结构参考 | **参照**实现属性解析 |
| `style/properties.ts` | paint zoom 插值参考 | **参照**实现 |
| `data/bucket/*.ts` | 几何构建参考（尤其是 LineBucket / SymbolBucket） | **参照** |
| `symbol/` | 碰撞检测和标注布局 | **参照** |
| `render/glyph_manager.ts` | pbf 字体加载 | **直接复用**或参照重写 |
| `util/sprite.ts` | sprite 加载 | **直接复用**或参照重写 |

---

## 9. 实施路线图

### Phase 1: 基础框架 + fill/line/background (Week 1-3)

1. 包结构创建，pnpm workspace 注册
2. 复用 `TileDataSource` + `TileLoader` + `TileDecoderService` 基础设施
3. 实现 `MBStyleDataSource` 数据源入口
4. 实现 `MBStyleDecoder`（Worker 中，集成 `OmvDataAdapter`）
5. 实现 `MBLayerEvaluator` 核心（filter/zoom 过滤 + 几何类型匹配）
6. 实现 `MBExpressionEngine`（支持最常用 15-20 个运算符）
7. 实现 `MBFillEmitter` / `MBLineEmitter` / `MBBgEmitter`（几何构建）
8. 实现 `MBMaterialFactory`（fill/line/background 的 Three.js 材质映射）
9. 单 source 支持

**验证**：使用含 fill + line + background 的简易 Mapbox Style 在 flywave 中渲染。

### Phase 2: symbol + circle + sprite/glyph (Week 4-7)

1. 实现 `MBSymbolEmitter` — icon 点 + text 点的几何构建
2. 实现 `MBCircleEmitter` — 圆点几何
3. 实现 `MBSpriteLoader` — sprite JSON+PNG → 纹理图集
4. 实现 `MBGlyphLoader` — pbf 字体加载
5. 实现 `MBMaterialFactory` 的 symbol/circle 材质分支
6. 多 source 支持（tile URL 路由）
7. 表达式运算符补齐（`format`/`image`/`to-string`/`let`/`var` 等）

**验证**：使用含 symbol（POI 图标+文字）、circle、多 source 的完整 Style。

### Phase 3: 碰撞检测 + fill-extrusion + 高级功能 (Week 8-10)

1. 实现 `MBSymbolRenderer` — 碰撞检测与标注布局（alpha）
2. `fill-extrusion` 3D 建筑渲染
3. `line` 自定义着色器（宽线、dash、gradient）
4. Light / fog / terrain 环境配置注入
5. Style 热更新（基于 `diff.ts`）
6. Raster layer 支持

### Phase 4: 完善 (Week 11-12)

1. 表达式运算符完整覆盖
2. symbol line-placement 标注沿路径
3. `heatmap` / `hillshade` 层（可选）
4. 性能优化（worker 并发、几何合并、纹理缓存）
5. 测试用例 + 渲染对比测试
6. 示例文档

---

## 10. 关键技术难点

### 10.1 线渲染

WebGL 原生 `lineWidth` 限制（大部分实现只支持 1px）是最棘手的问题。

**方案**：使用三角化线段（参考 mapbox-gl-js `LineBucket`）

```
对于每条线段，生成 2×n 个三角形：

  p0────p1────p2        p0'──p1'──p2'
   │     │     │         │     │     │
   │     │     │   →    p0"──p1"──p2"
  p3────p4────p5

支持:
- line-width: 通过调整偏移量
- line-dasharray: 通过纹理坐标 UV.x 控制
- line-gradient: 通过 UV.x 线性插值
- line-offset: 全局平移
```

flywave 已有 `SolidLineMaterial`（在 `DecodedTileHelpers` 中创建），可在此基础扩展支持 `line-gap-width`、`line-blur`、`line-pattern`。

### 10.2 Data-Driven Paint 属性

Mapbox 的 paint 属性可以是表达式（`["get", "class"]`），需要在 Worker 中求出具体值，或者将表达式序列化传递到主线程再求值。

**两种路线**：

| 路线 | 说明 | 优劣 |
|------|------|------|
| Worker 中求值 | 解码时已知要素属性和 zoom，直接求值 | ✅ 性能好；❌ 数据量大（每个要素的 paint 值都不同） |
| 主线程求值 | 几何中携带要素属性 + 表达式，渲染时求值 | ✅ 节省带宽；❌ 渲染帧率敏感 |

**推荐**：Phase 1-2 在 Worker 中求值（简单），Phase 3-4 根据 `isDataDriven` 判断是否延迟到主线程求值。

### 10.3 Symbol 碰撞检测

完整的 collision detection 包括：

- `CollisionIndex` — 视口空间 grid
- `Placement` — 一次布局 pass
- `JointPlacement` — icon + text 联合放置
- `symbol-z-order: "auto" | "viewport-y" | "source"`
- `text-variable-anchor` — 动态锚点选择

**简化策略**：Phase 2 用 flywave 已有的 `ScreenCollisions`，不实现完整 mapbox 碰撞算法，先保证功能可用。

---

## 11. 测试方案

### 11.1 单元测试

```
test/
├── MBLayerEvaluator.test.ts      # Layer 匹配正确性
├── MBExpressionEngine.test.ts    # 表达式求值（覆盖 30+ 运算符）
├── MBFilterCompiler.test.ts      # Filter 编译与求值
├── MBPaintResolver.test.ts       # Paint 属性解析（含 zoom 插值）
├── MBTileDataEmitter.test.ts     # 几何构建（fill/line/symbol/circle）
├── MBMaterialFactory.test.ts     # 材质映射正确性
├── MBStyleDataSource.test.ts     # 数据源生命周期
└── fixtures/                     # 测试用 Mapbox Style JSON
    ├── fill_with_expressions.json
    ├── line_properties.json
    ├── symbol_icon_text.json
    └── multi_source.json
```

### 11.2 渲染对比测试

使用 `test/rendering/StylingTest.ts` 类似的方式，截图对比 Mapbox GL JS 与 flywave 渲染结果。

```typescript
// 加载 Mapbox Style
const ds = new MBStyleDataSource({
    style: require('./fixtures/simple_fill.json')
});
mapView.addDataSource(ds);

// 等待渲染完成 → 截图 → 与基准图对比
await screenshotCompare('mbstyle_fill');
```

---

## 12. 风险与应对

| 风险 | 影响 | 应对 |
|------|------|------|
| 表达式引擎实现工作量大 | 工期拖长 | Phase 1 先支持核心 20 个运算符，满足 80% 场景 |
| 线渲染宽度限制（WebGL 1px） | line 渲染效果差 | 使用三角化线段方案，参照 flywave 现有 `SolidLineMaterial` |
| symbol 碰撞检测过于复杂 | 标注重叠 | Phase 2 不做碰撞，Phase 3 简化实现 |
| fill-extrusion 的阴影/灯光 | 3D 效果差 | 直接映射到 flywave 的 `extruded-polygon` 实现 |
| 多 source 瓦片加载同步 | 性能开销 | 各 source 独立加载，合并渲染 |

---

## 13. 总结

**核心决策**：不转换 Mapbox Style 为 flywave 的 Theme/StyleSet，而是**在 flywave 的瓦片加载框架之上，用 mapbox-gl-js 的方式实现一套原生 Mapbox 渲染层**。

**复用 flywave**：瓦片加载、MVT 解析、Worker 通信、几何工具函数
**新建 Mapbox 层**：Layer 评估、表达式引擎、paint 解析、材质映射、符号布局
**参照 mapbox-gl-js**：各 Layer 的 paint/layout 结构定义、表达式定义、碰撞检测算法

这一方案比"做 Style 映射"更可控、更干净，长期维护成本也更低。
