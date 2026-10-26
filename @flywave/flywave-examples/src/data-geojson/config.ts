/* Copyright (C) 2025 flywave.gl contributors */

import type { ExampleConfig } from "../common";

import thumbnail from "./thumbnail.png";

const config: ExampleConfig = {
    title: "GeoJSON Data Source",
    titleZh: "GeoJSON 数据源",
    description:
        "Load static GeoJSON files with GeoJsonDataProvider + GeoJsonDataSource, style points, " +
        "lines and polygons with one geometry-type-filtered style set, and swap datasets at " +
        "runtime via removeDataSource / addDataSource.",
    descriptionZh:
        "用 GeoJsonDataProvider + GeoJsonDataSource 加载静态 GeoJSON 文件；通过一套按几何类型" +
        "过滤的样式同时表达点/线/面；演示 removeDataSource / addDataSource 运行时切换数据集。",
    thumbnail,
    code: "data-sources",
    order: 3,
    level: "beginner",
    tags: ["geojson", "vector", "styles", "swap-data"],
    apis: ["GeoJsonDataProvider", "GeoJsonDataSource", "removeDataSource", "addDataSource"],
    concerns: ["U4"],
    dataPolicy: "offline"
};

export default config;
