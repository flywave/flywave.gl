# 设计方案：CrossTileSymbolIndex（跨瓦片符号一致性 + Fade）

> 基于 mapbox-gl-js `src/symbol/cross_tile_symbol_index.ts` + `placement.ts` 源码深度分析。目标：解决符号跨瓦片闪烁、碰撞消失瞬间归零、无淡入淡出。影响 placement/runtime-styling 系列与所有 symbol 一致性。

---

## 1. 现状与差距

flywave 当前 `PlacementEngine`（`PlacementEngine.ts`）：
- ✅ 不再每帧 reset（仅 zoom 变化/5s 超时 reset）
- ✅ opacity fade（FADE_DURATION=300ms）已有时间插值
- ❌ **无 crossTileID**：符号按 `${layerId}:${featureId}` 索引，featureId 在不同 tile 间不一致 → 跨瓦片同标签无法关联
- ❌ **无 prevPlacement 链**：opacity 状态用 `m_opacityMap` 持久（部分弥补），但无 mapbox 的 commit/stillRecent 节流
- ❌ **无 GPU fade uniform**：opacity 纯 CPU 每帧计算

**关键差异**：mapbox 用 `crossTileID`（基于文本内容 hash + 空间邻近匹配）跨瓦片关联同一标签，确保 fade opacity 连续。

---

## 2. mapbox 核心机制（移植要点）

### 2.1 crossTileID 分配算法

```
"概念唯一符号" = 标签文本内容(murmur3 hash) + 锚点位置(空间邻近)

匹配判据：
  1. key 相同（murmur3(text) 截断 Uint16）
  2. 位置在 ±tolerance 内（KDBush 空间查询，roundingFactor=1/32 ≈4px 网格）
  3. 去重：zoomCrossTileIDs 防止一父多子

跨 zoom 匹配：
  - 新 tile 查"父瓦片"（更粗层级）：parentIndex.findMatches
  - 新 tile 查"子瓦片"（更细层级）：childIndex.findMatches
  → 继承父/子的 crossTileID
```

`maxCrossTileID` 全局单调递增，整个地图每符号唯一。

### 2.2 两级 Fade（CPU 量化 + GPU 插值）

**CPU 级**（placement 周期，~300ms 一次）：
```
increment = (now - commitTime) / fadeDuration   // ≈0.05/帧
opacity = clamp(prevOpacity + (placed ? +increment : -increment), 0, 1)
```

**GPU 级**（每帧 shader）：
```glsl
// a_fade_opacity = 7bit opacity + 1bit target（placed?）
vec2 fo = unpack_opacity(a_fade_opacity);
float change = fo[1] > 0.5 ? u_fade_change : -u_fade_change;
float out_opacity = max(0.0, min(occlusion_fade, fo[0] + change));
```
`u_fade_change = symbolFadeChange(now)`（每帧实时计算），让 CPU 只量化一次但 GPU 平滑插值。

### 2.3 状态机

```
首次(屏幕外,skipFade) → 满显(1.0)
首次(屏幕内)          → 0 → FADE-IN(+inc) → VISIBLE(1) 
                                    ↓ placed=false
                              FADE-OUT(-inc) → HIDDEN(0,丢弃)
```

### 2.4 stillRecent 节流

```
stillRecent = commitTime + fadeDuration*adjust > now
若 stillRecent：跳过新 placement，复用上次结果（GPU fade 继续）
```
这是平滑性根基——300ms 内不重算。

---

## 3. flywave 移植架构

```
MBStyleSymbolPlacement（现有，改造）
  ├─ m_crossTileIndex: CrossTileSymbolIndex（新建，持久单例）
  ├─ m_placement: Placement（新建，替代直接调 PlacementEngine.place）
  │    └─ prevPlacement（仅一帧链）
  └─ m_opacityUniform: { value, lastCommit }（GPU fade）

每帧 run()：
  1. crossTileIndex.addLayer(layer, tiles)  → 给每个 symbol 分配 crossTileID
  2. if !stillRecent(now, zoom): 新 Placement(collisionIndex 复用, prevPlacement=last)
  3. placement.place(symbols)  → 碰撞决策
  4. placement.commit(now)     → opacity 从 prevPlacement 推进
  5. updateObjectOpacities()   → 写回 three.js 对象 + 更新 m_opacityUniform
```

---

## 4. 关键类设计

### 4.1 CrossTileSymbolIndex（新建 `CrossTileSymbolIndex.ts`）

```typescript
interface SymbolEntry {
    crossTileID: number;
    key: number;          // murmur3(text) & 0xFFFF
    x: number; y: number; // 量化坐标（roundingFactor 网格）
}

class CrossTileSymbolIndex {
    private maxCrossTileID = 0;
    private layerIndexes: Map<string, CrossTileSymbolLayerIndex> = new Map();

    // 给一组 symbols（某 layer 某 frame）分配 crossTileID
    assignIDs(layerId: string, symbols: Array<{text: string; screenX: number; screenY: number; zoom: number}>): Map<string, number> {
        // 1. 计算 key = murmur3(text) & 0xFFFF
        // 2. 量化坐标到 4px 网格
        // 3. 跨 zoom 查父/子匹配，继承 ID
        // 4. 未匹配的 generate(++maxCrossTileID)
    }
    pruneStale(currentLayerIds: string[]): void;
}

class CrossTileSymbolLayerIndex {
    private zoomIndexes: Map<number, Map<number, SymbolEntry[]>>; // zoom → tileKey → entries
    findMatches(...): void;
}
```

> **简化**：第一版可用简单 `Map<key, {x,y,crossTileID}[]>` 线性扫描代替 KDBush（符号数不大时足够），后续优化再加空间索引。

### 4.2 murmur3 hash（轻量实现）

```typescript
// 仅需文本→Uint16 hash，可用现成 murmurhash3 或简化 djb2
function symbolKey(text: string): number {
    let h = 5381;
    for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0;
    return (h >>> 0) & 0xFFFF;
}
```

### 4.3 Placement 改造（扩展现有 PlacementEngine）

```typescript
class Placement {
    private opacities: Map<number, {opacity: number; placed: boolean}> = new Map(); // crossTileID → state
    private prevPlacement: Placement | null = null;
    private collisionIndex: CollisionIndex;
    private commitTime = 0;
    private fadeDuration = 300;

    commit(now: number, symbols: SymbolInstance[]): Map<number, number> {
        const increment = this.prevPlacement ? this.symbolFadeChange(now) : 1;
        const result = new Map<number, number>();
        // A. 当前帧 placed 的：从 prev 推进
        for (const sym of symbols) {
            const cid = sym.crossTileID;
            const prev = this.prevPlacement?.opacities.get(cid);
            const placed = sym.visible;
            const opacity = prev
                ? Math.max(0, Math.min(1, prev.opacity + (prev.placed ? increment : -increment)))
                : (placed ? increment : 0);  // 首次从 0 淡入
            this.opacities.set(cid, { opacity, placed });
            result.set(cid, opacity);
        }
        // B. prev 有但当前无：继续淡出
        if (this.prevPlacement) {
            for (const [cid, prev] of this.prevPlacement.opacities) {
                if (!this.opacities.has(cid) && !(prev.opacity === 0 && !prev.placed)) {
                    const opacity = Math.max(0, prev.opacity - increment);
                    this.opacities.set(cid, { opacity, placed: false });
                    result.set(cid, opacity);
                }
            }
        }
        this.commitTime = now;
        return result;
    }

    symbolFadeChange(now: number): number {
        return this.fadeDuration === 0 ? 1 : (now - this.commitTime) / this.fadeDuration;
    }
    stillRecent(now: number): boolean {
        return now - this.commitTime < this.fadeDuration;
    }
}
```

### 4.4 MBStyleSymbolPlacement.run() 改造

```typescript
run(): void {
    const now = Date.now();
    const symbols = this.collectSymbols(camera, w, h);
    // 1. 分配 crossTileID
    const idMap = this.m_crossTileIndex.assignIDs(layerId, symbols);
    for (const sym of symbols) sym.crossTileID = idMap.get(sym.id) ?? 0;

    // 2. stillRecent 节流
    if (this.m_placement && this.m_placement.stillRecent(now)) {
        this.applyOpacities(symbols);   // 复用，仅更新 GPU fade uniform
        return;
    }
    // 3. 新 placement
    const placement = new Placement(this.m_placement);  // prevPlacement 链
    placement.place(symbols, this.m_collisionIndex);
    const opacities = placement.commit(now, symbols);
    this.m_placement = placement;
    this.applyOpacities(symbols, opacities);
}
```

---

## 5. 集成点

| 位置 | 改动 |
|------|------|
| `MBStyleSymbolPlacement` | 持有 `CrossTileSymbolIndex` + `Placement`；改造 `run()` |
| `PlacementEngine` | 保留碰撞检测核心，但 opacity 逻辑上移到 `Placement.commit()` |
| GPU fade | 第一版可纯 CPU opacity（每帧计算），后续加 `u_fade_change` uniform |

---

## 6. 实施步骤

| 步骤 | 内容 | 复杂度 | 解锁 |
|------|------|--------|------|
| S1 | `symbolKey` hash + `CrossTileSymbolIndex` 基础（assignIDs，线性扫描匹配） | ⭐⭐ | crossTileID 一致性 |
| S2 | `Placement` 类 + prevPlacement 链 + commit opacity 推进 | ⭐⭐ | fade 连续性 |
| S3 | 改造 `run()`：assignIDs → stillRecent → commit | ⭐⭐ | 整体集成 |
| S4 | 跨 zoom 父/子匹配（tileID.scaledTo / isChildOf） | ⭐⭐⭐ | zoom 缩放不闪烁 |
| S5 | GPU `u_fade_change` uniform 插值（可选优化） | ⭐⭐ | 更平滑 |
| S6 | pruneStale / handleWrapJump | ⭐ | 内存 + 反子午线 |

**总估算**：~12–18 PD（3–4 人周）。

---

## 7. 风险

| 风险 | 缓解 |
|------|------|
| crossTileID 匹配在多源/多 layer 时误配 | key 含 layerId 前缀；按 layer 分 CrossTileSymbolLayerIndex |
| opacity Map 内存增长 | pruneStale 定期清理 HIDDEN 且超时的条目 |
| 纯 CPU fade 帧间抖动 | 优先做 S5（GPU uniform） |

---

## 8. 验证用例

```
placement/basic, placement/multiple-layers
runtime-styling/label-fade-in, runtime-styling/label-fade-out
text-variable-anchor/*（锚点切换平滑）
combinations/symbols（多符号一致性）
zoom 切换时标签不闪烁（手动验证）
```

---

## 9. 两个方案对比与建议优先级

| 方案 | 用例 | 复杂度 | 依赖 | 建议 |
|------|------|--------|------|------|
| **CrossTileSymbolIndex** | ~46+（placement/runtime-styling symbol 子集） | ⭐⭐⭐ 12-18 PD | 无 | **优先**（独立、无外部依赖、直接提升 symbol 体验） |
| **Terrain Draping** | ~96 | ⭐⭐⭐⭐⭐ 25-35 PD | DEM source（已有） | 其次（解锁最多用例但工程量大） |

建议先做 CrossTileSymbolIndex（独立、中复杂度），再做 Terrain Draping（高复杂度、解锁最多）。
