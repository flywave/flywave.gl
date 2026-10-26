/* Copyright (C) 2025 flywave.gl contributors */

import type { ExampleConfig } from "../common";
import thumbnail from "./thumbnail.png";

const config: ExampleConfig = {
    title: "Hello Map",
    titleZh: "你好，地图",
    description:
        "The smallest flywave.gl map: one factory call wires view and controls, then terrain, " +
        "imagery and a single camera flight complete the picture.",
    descriptionZh:
        "最小的 flywave.gl 地图：一个工厂调用创建视图与控件，再叠加地形、影像，并用一次相机飞行收尾。",
    thumbnail,
    code: "getting-started",
    order: 1,
    level: "beginner",
    tags: ["mapview", "mapcontrols", "terrain", "imagery", "flyto"],
    apis: ["MapView", "MapControls", "DEMTerrainSource"],
    concerns: ["U1", "U38"],
    dataPolicy: "open-data"
};

export default config;
