/* Copyright (C) 2025 flywave.gl contributors */

import type { ExampleConfig } from "../common";

import thumbnail from "./thumbnail.png";

const config: ExampleConfig = {
    title: "Terrain Elevation Query",
    titleZh: "地形高程查询",
    description:
        "Click the map to read the terrain elevation: compare the GPU pick position " +
        "(getWorldPositionAt / intersectMapObjects) against the CPU elevation provider " +
        "sampled at the same point, over free AWS terrarium DEM tiles (no token).",
    descriptionZh:
        "点击地图读取地形高程：对比 GPU 拾取位置（getWorldPositionAt / intersectMapObjects）" +
        "与 CPU 高程提供者在同一点的采样值；使用免 token 的 AWS terrarium DEM。",
    thumbnail,
    code: "terrain-elevation",
    order: 5,
    level: "intermediate",
    tags: ["terrain", "elevation", "picking", "query", "terrarium"],
    apis: ["getWorldPositionAt", "intersectMapObjects", "ElevationProvider", "DEMTerrainSource"],
    concerns: ["U32"],
    dataPolicy: "open-data"
};

export default config;
