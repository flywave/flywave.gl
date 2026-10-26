/* Copyright (C) 2025 flywave.gl contributors */

import type { ExampleConfig } from "../common";

import thumbnail from "./thumbnail.png";

/** Gallery metadata for the data-raster-tiles example. */
const config: ExampleConfig = {
    title: "Raster Web Tiles",
    titleZh: "栅格瓦片数据源",
    description:
        "Switch between ArcGIS, OpenStreetMap, NASA GIBS and a hand-written CustomWebTileDataSource; " +
        "learn URL templates, per-source copyright attribution and the offline debug-grid fallback.",
    descriptionZh:
        "在 ArcGIS、OpenStreetMap、NASA GIBS 与手写 CustomWebTileDataSource 之间切换；" +
        "学习 URL 模板、各源版权标注与离线调试网格降级。",
    thumbnail,
    code: "data-sources",
    order: 1,
    level: "beginner",
    tags: ["raster", "webtiles", "imagery", "url-template", "copyright"],
    apis: [
        "ArcGISWebTileDataSource",
        "CustomWebTileDataSource",
        "CopyrightElementHandler",
        "demoImagery",
        "createImageryWithFallback"
    ],
    concerns: ["U7", "U40"],
    dataPolicy: "open-data"
};

export default config;
