/* Copyright (C) 2025 flywave.gl contributors */

import type { ExampleConfig } from "../common";

import thumbnail from "./thumbnail.png";

/** Gallery metadata for the data-features-layer example. */
const config: ExampleConfig = {
    title: "Runtime Features Layer",
    titleZh: "运行时要素图层",
    description:
        "Render runtime GeoJSON with FeaturesDataSource: labeled icons, solid lines and text, plus live add/remove of features.",
    descriptionZh: "用 FeaturesDataSource 渲染运行时 GeoJSON：图标、实线与文字标注，并支持运行时增删要素。",
    thumbnail,
    code: "data-sources",
    order: 4,
    level: "beginner",
    tags: ["features", "geojson", "runtime", "labels", "icons"],
    apis: [
        "FeaturesDataSource",
        "MapViewPointFeature",
        "MapViewLineFeature",
        "MapViewPolygonFeature",
        "TransferManager",
        "createImageryWithFallback"
    ],
    concerns: ["U20"],
    dataPolicy: "offline"
};

export default config;
