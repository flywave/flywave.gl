/* Copyright (C) 2025 flywave.gl contributors */

import type { ExampleConfig } from "../common";
import thumbnail from "./thumbnail.png";

export default {
    title: "3D Tiles on Terrain",
    titleZh: "3D Tiles 贴地叠加",
    description:
        "Drape a Cesium Ion photogrammetry tileset onto DEM terrain via setElevationSource, " +
        "and toggle the translucentDepth post effect to see how depth writing changes the " +
        "compositing of the tilted mesh against the terrain.",
    descriptionZh:
        "用 setElevationSource 将 Cesium Ion 实景模型贴合到 DEM 地形上，" +
        "并通过开关 translucentDepth 后处理观察深度写入对叠加合成的影响。",
    thumbnail,
    code: "tiles-3d",
    order: 3,
    level: "intermediate",
    tags: ["3d tiles", "terrain", "dem", "photogrammetry"],
    apis: [
        "CesiumIonDataSource",
        "DEMTerrainSource",
        "MapView.setElevationSource",
        "postEffects.translucentDepth"
    ],
    concerns: ["U10"],
    dataPolicy: "token"
} satisfies ExampleConfig;
