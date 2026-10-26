/* Copyright (C) 2025 flywave.gl contributors */

import type { ExampleConfig } from "../common";

import thumbnail from "./thumbnail.png";

/** Gallery metadata for the data-large-geojson example. */
const config: ExampleConfig = {
    title: "Large GeoJSON (100k Points)",
    titleZh: "大数据量 GeoJSON（10 万点）",
    description:
        "Feed an in-memory 10k-100k point cloud through GeoJsonDataProvider's client-side tiling; " +
        "GPU circles technique plus a timing and FPS HUD to compare dataset rebuilds.",
    descriptionZh:
        "用 GeoJsonDataProvider 的客户端瓦片化渲染 1-10 万个内存生成的点；GPU circles 技术配合耗时与帧率 HUD 对比重建性能。",
    thumbnail,
    code: "data-sources",
    order: 4,
    level: "intermediate",
    tags: ["geojson", "performance", "points", "tiling", "offline"],
    apis: [
        "GeoJsonDataProvider",
        "GeoJsonDataSource",
        "circles technique",
        "MapViewEventNames.AfterRender",
        "DebugGridDataSource"
    ],
    concerns: ["U5", "U33"],
    dataPolicy: "offline"
};

export default config;
