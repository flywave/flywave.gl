# 性能统计与调优

## 第一步永远是开采集（两步缺一不可）

```typescript
const mapView = new MapView({ ..., enableStatistics: true });  // 不开=所有统计字段永不写入
new MapViewMonitor(mapView);   // @flywave/flywave-inspector 的 dat.GUI 面板
```

- 统计核心：`PerformanceStatistics`（**在 `@flywave/flywave-mapview/src/Statistics.ts`，
  不在 utils**）。单例；全史环形缓冲固定 1000 帧，**写满后静默停止采集**
  （`isFull`）——长会话分析前先重置。
- inspector 面板只读不启用；没开 `enableStatistics` 时面板全是 0。
- 纯代码方式：`PerformanceStatistics.instance.log()` /
  `getLastFrameStatistics()` / `getAsSimpleFrameStatistics()`。
- 运行时中途开：`PerformanceStatistics.instance.enabled = true`（public 字段，
  每帧检查，运行时切换有效）。

## 帧统计字段 → 含义（`MapView.render()` 采集点）

| 字段 | 含义 |
|---|---|
| `render.fps` | 与上一帧间隔倒数（≠ 1000/fullFrameTime） |
| `render.fullFrameTime` | 帧总耗时（含帧外几何创建；`frameRenderTime` 只含 render() 本身） |
| `render.setupTime/cullTime/textPlacementTime/drawTime/textDrawTime/cleanupTime` | 帧内分段 |
| `render.geometryCreationTime` | 帧外几何创建（TileGeometryLoader 累加） |
| `renderCount.numTilesVisible/Rendered/Loading` | 每数据源瓦片计数 |
| `gl.numCalls/numTriangles/...` | renderer.info（帧首 reset） |
| `memory.usedJSHeapSize` | 仅 Chrome |
| `decode.decodingTime`、`TaskScheduler.numPendingTasks` | worker/队列侧 |

## 调参旋钮速查

### 瓦片缓存与数量（MapViewOptions）
```typescript
new MapView({
    tileCacheSize: 200,              // 默认；EstimationInMb 模式下=200MB
    resourceComputationType: ResourceComputationType.EstimationInMb,  // 默认
    maxVisibleDataSourceTiles: 400,  // 默认；可见瓦片硬上限
    maxTilesPerFrame: 0,             // 默认不限；设 8 平滑新瓦片入场削帧尖峰
    enableStatistics: true
});
mapView.setCacheSize(500);           // 运行时（可见上限自动减半）
mapView.clearTileCache();            // 改 pixelRatio/主题后需要
```
- `ResourceComputationType.NumberOfTiles` 模式**内存会失控**（源码注释明示），
  限内存用默认的 `EstimationInMb`；其准确性依赖 `tile.memoryUsage`
  （几何 + 每文字元素 312B + worker 上报 numBytes）——数据源虚报即铁律 4。

### LOD / 数据量
- `lodMinTilePixelSize`（默认 256）：瓦片屏幕像素小于此值不再细分——
  **调大 = 直接减瓦片数**。
- `enableMixedLod`：**doc 注释说"球面默认开"，代码实际默认恒 true**
  （`MapView.ts` 的 `getVisibleTiles`）；要省瓦片需显式 `false`。
- 数据源级：`storageLevelOffset = -1`（永远取粗一级数据，少瓦片少解码）、
  `maxDataLevel/maxDisplayLevel`。

### 渲染
- `maxFps`（跳帧限速；VSync 下只能取刷新率/n）、`pixelRatio`（改后
  `clearTileCache()`）、`dynamicPixelRatio`（运动时低分辨率，无 AA 有 artifact）、
  `synchronousRendering`（外部驱动 `renderSync()`，内置 maxFps 失效）、
  `extendedFrustumCulling: false` 可作基线对照测量。

### Worker / 任务队列
```typescript
new OmvDataSource({
    ..., 
    concurrentDecoderWorkerCount: 4,   // 默认 clamp(hardwareConcurrency-1, 1, 2)
    workerConnectionTimeout: 20        // 秒，默认 10
});
```
- TaskQueue 两组：**CREATE 硬编码先于 FETCH_AND_DECODE**（不可配置），
  组内按瓦片可见面积优先，离屏任务自动作废。
- `throttlingEnabled: true`（beta）：任务按帧预算时间片调度（每任务估 2ms）。

### 文本
`maxNumVisibleLabels`（小设备调小）、`minNumGlyphs/maxNumGlyphs`（默认
1024/32768）、`maxPoiDistanceToBorder`（默认 0.2）、`disableFading: true`
（测量时去动画干扰）。

## 排查流程（从统计定位到旋钮）

1. `render.fullFrameTime` 高但 `drawTime` 低 → 帧外瓶颈：看
   `geometryCreationTime`/`geometryCount.*` → `maxTilesPerFrame`、
   `storageLevelOffset`、调大 `lodMinTilePixelSize`。
2. `cullTime` 高 → 瓦片太多：`maxVisibleDataSourceTiles`↓、
   `lodMinTilePixelSize`↑。
3. `textPlacementTime` 高 → 文本旋钮（见上节）。
4. `drawTime`/`gl.numTriangles`/`gl.numCalls` 高 → GPU：`pixelRatio`↓、
   `dynamicPixelRatio`、主题减效果。
5. `decode.decodingTime` 高 / `numPendingTasks` 常驻 → `concurrentDecoderWorkerCount`↑、
   `throttlingEnabled`、`maxDataLevel`↓。
6. `memory.usedJSHeapSize` 持续涨 → `tileCacheSize`/`EstimationInMb`、
   `clearTileCache()`、查 memoryUsage 虚报（铁律 4）。
7. A/B 复测一次只动一个旋钮。

## 基准测试基建（改动量化）

- `@flywave/flywave-test-utils` 的 `ProfileHelper`：
  `measurePerformanceSync(name, repeats, fn)` / `measureThroughputSync(name, ms, fn)`；
  `PROFILEHELPER_COMMAND=baseline` + `PROFILEHELPER_OUTPUT` 固化基线对比。
- 既有基准：`test/performance/OmvDecoderPerformanceTest.ts`（解码/样式求值
  CPU 成本，分投影）、`LinesPerformanceTest.ts`（线几何随复杂度伸缩）。
  运行：`pnpm performance-test-node`。

## 黄金示例

无专门 performance 示例；标准接法见
`examples/src/3dtiles-animation/index.ts:318-321`（MapViewMonitor + 模块挂载），
`:302` 有 `globalThis.mapView` 控制台句柄。内存观察类：
`terrain-memory-visualizer/`、`test-renderobject-leak/`。
