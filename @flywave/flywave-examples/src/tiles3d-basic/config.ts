/* Copyright (C) 2025 flywave.gl contributors */

import type { ExampleConfig } from "../common";
import thumbnail from "./thumbnail.png";

export default {
    title: "3D Tiles Essentials",
    titleZh: "3D Tiles 基础",
    description:
        "Load a Cesium Ion photogrammetry tileset, frame it by its geographic extent, " +
        "and watch the visible-tile budget react while you tune the LOD knobs live.",
    descriptionZh:
        "加载 Cesium Ion 实景三维瓦片，按数据地理范围定位相机，" +
        "并实时调节 LOD 参数观察可见瓦片数与帧率变化。",
    thumbnail,
    code: "tiles-3d",
    order: 1,
    level: "beginner",
    tags: ["3d tiles", "cesium ion", "lod", "performance"],
    apis: [
        "CesiumIonDataSource",
        "getGeoExtent",
        "MapView.lookAt",
        "MapView.forEachVisibleTile",
        "MapView.visibleTileSet"
    ],
    concerns: ["U10", "U33"],
    dataPolicy: "token"
} satisfies ExampleConfig;
