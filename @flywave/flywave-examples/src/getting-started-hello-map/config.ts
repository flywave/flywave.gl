/* Copyright (C) 2025 flywave.gl contributors */

import type { ExampleConfig } from "../common";
import thumbnail from "./thumbnail.png";

const config: ExampleConfig = {
    title: "Hello Map",
    titleZh: "你好，地图",
    description:
        "The smallest flywave.gl map, rendered as a GLOBAL 3D terrain: one factory call wires " +
        "view and controls, the AWS terrarium DEM turns the whole planet into a mesh, and Esri " +
        "imagery is draped one level finer (2x2 child mosaic per tile).",
    descriptionZh:
        "最小的 flywave.gl 地图，直接渲染成全球 3D 地形：一个工厂调用创建视图与控件，AWS terrarium " +
        "DEM 把整个星球变成网格，Esri 影像以更细一级的 2x2 子图 mosaic 贴在地形上。",
    thumbnail,
    code: "getting-started",
    order: 1,
    level: "beginner",
    tags: ["mapview", "mapcontrols", "terrain", "global", "imagery", "mosaic"],
    apis: ["MapView", "MapControls", "DEMTerrainSource", "imageryLevelOffset"],
    concerns: ["U1", "U38"],
    dataPolicy: "open-data"
};

export default config;
