# 坐标系与对象放置

地球半径 ~6.37e6 米，float32 在这个量级的精度只剩米级——直接在世界坐标里渲染会
顶点抖动。flywave.gl 的解法（camera-relative rendering）贯穿全引擎，改任何涉及
空间计算的代码前必须理解本文。

## 三层坐标概念

1. **地理坐标** `GeoCoordinates(latitude, longitude, altitude)`：经纬度 + 高程
   （米），用户 API 层使用的形式。注意参数顺序是 (lat, lon, alt)。
2. **投影世界坐标（geo 帧）**：经投影生成的场景世界坐标，`m_camera` 生活在
   这一帧。投影决定坐标语义：`sphereProjection`（球面/地球仪）、
   `webMercatorProjection`（平面贴图）、`ellipsoidProjection`（WGS84 ECEF），
   全部在 `@flywave/flywave-geoutils`（每个投影一个类 + 预置单例，不是 EPSG
   注册表）。
3. **RTE 帧（camera-relative）**：实际渲染帧。`m_rteCamera` 复制 geo 相机参数
   后把 position 归零；GPU 深度、拾取、后处理产物都在这一帧。

## 正确代码范式（照抄，别发明）

### 范式 A：把持久 3D 对象放到地图上 —— MapAnchor，不是 scene.add

```typescript
const group = new Group();
const mesh = new Mesh(new BoxGeometry(5, 5, 5), new MeshStandardNodeMaterial({ color: 0xff6b6b }));
mesh.castShadow = true;
mesh.receiveShadow = true;
group.add(mesh);
group.anchor = new GeoCoordinates(36.4393, 118.188, 420); // 高程 420m
mapView.mapAnchors.add(group);
```

权威范例：`@flywave/flywave-examples/src/getting-started-basic-config/index.ts`。
两个要点：材质必须用 NodeMaterial 系（铁律 6）；场景根每帧清空，MapAnchor 是
唯一正确的持久挂载点（铁律 2）。

### 范式 B：GPU 深度像素 → 世界坐标点

unproject 必须用 **VRM 的 render camera**（原点相机），得到的点在 RTE 帧，
再加回 geo 相机位置才是 geo 世界坐标。**直接用 `mapView.camera` unproject
会得到差一个"相机位置"的结果。**

权威实现：`@flywave/flywave-map-controls/src/MapControls.ts` 的
`buildGpuPoint`（内有坐标系约定注释）；
`@flywave/flywave-mapview/src/PickHandler.ts` 的 `intersectMapObjects`。

### 范式 C：自定义 raycast（对地图对象做碰撞/拾取）

3DTile 先例的契约：**只信调用方射线方向，不信原点坐标系**——origin 统一重置为
`(0,0,0)`（render 空间眼点）参与求交，事后恢复；输出点在 render 空间，消费方
`.add(camera.position)` 转回 geo 帧。

权威实现：`@flywave/flywave-3dtile-datasource/src/TilesRenderer.ts` 的
`raycast`。

## Bug 特征速查

| 特征 | 根因 |
|---|---|
| 位置差地球半径量级 / 对象飞到原点附近 | RTE/geo 混用——漏了 `.add(camera.position)` 平移 |
| 顶点闪烁/抖动（远处） | 把需要精度的计算放在了 geo 帧，应挪到 RTE 帧 |
| 对象出现一帧后消失 | 挂到了场景根（每帧清空）——改用 MapAnchor（范式 A） |
| 经纬度反了 | `GeoCoordinates` 是 (lat, lon, alt) 顺序 |
| 平面/球面投影下行为不一致 | 投影决定世界坐标语义，检查代码是否假设了某一种投影 |
