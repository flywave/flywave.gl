/* Copyright (C) 2025 flywave.gl contributors */

import type { ExampleConfig } from "../common";

import thumbnail from "./thumbnail.png";

const config: ExampleConfig = {
    title: "DEM Terrain",
    titleZh: "DEM 数字高程地形",
    description:
        "Wire a DEMTerrainSource elevation source onto a MapView with draped imagery, and " +
        "experiment with the conservative maxGeometryHeight hint used for culling and shadows.",
    descriptionZh:
        "将 DEMTerrainSource 高程源接入 MapView 并叠加影像，体验用于剔除与阴影的 " +
        "maxGeometryHeight 保守几何高度提示。",
    thumbnail,
    code: "terrain-elevation",
    order: 1,
    level: "beginner",
    tags: ["terrain", "dem", "elevation", "imagery"],
    apis: ["DEMTerrainSource", "setElevationSource", "demoTerrain", "demoImagery"],
    concerns: ["U8"],
    dataPolicy: "offline"
};

export default config;
