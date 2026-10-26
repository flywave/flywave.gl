/* Copyright (C) 2025 flywave.gl contributors */

import type { ExampleConfig } from "../common";

import thumbnail from "./thumbnail.png";

const config: ExampleConfig = {
    title: "DEM Patch Layers",
    titleZh: "DEM 修正层",
    description:
        "Override base DEM elevation with in-memory DemPatchLayer patches (plateau and crater) " +
        "fabricated on the CPU. Toggle layers, swap priorities and fly to the patch area.",
    descriptionZh:
        "用内存中生成的 DemPatchLayer 修正层（平台与陨石坑）覆盖基础 DEM 高程；" +
        "可切换图层显隐、互换优先级并飞行到补丁区域。",
    thumbnail,
    code: "terrain-elevation",
    order: 3,
    level: "advanced",
    tags: ["terrain", "dem", "patch", "elevation-override"],
    apis: ["DemPatchLayer", "DEMTerrainSource"],
    concerns: ["U9"],
    dataPolicy: "open-data"
};

export default config;
