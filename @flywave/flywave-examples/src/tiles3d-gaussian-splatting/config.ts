/* Copyright (C) 2025 flywave.gl contributors */

import type { ExampleConfig } from "../common";
import thumbnail from "./thumbnail.png";

export default {
    title: "Gaussian Splatting Tiles",
    titleZh: "高斯泼溅瓦片",
    description:
        "Stream a locally hosted 3D Gaussian splatting dataset as a 3D Tiles tileset, " +
        "frame it automatically via its geographic extent, and switch projections from the " +
        "controls UI.",
    descriptionZh:
        "以 3D Tiles 形式加载本地托管的 3D 高斯泼溅数据集，按地理范围自动定位，" +
        "并可通过控件切换投影。",
    thumbnail,
    code: "tiles-3d",
    order: 4,
    level: "beginner",
    tags: ["3d tiles", "gaussian splatting", "3dgs", "offline"],
    apis: ["TileRenderDataSource", "getGeoExtent", "MapView.lookAt"],
    concerns: ["U15"],
    dataPolicy: "offline"
} satisfies ExampleConfig;
