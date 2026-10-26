/* Copyright (C) 2025 flywave.gl contributors */

import type { ExampleConfig } from "../common";
import thumbnail from "./thumbnail.png";

const config: ExampleConfig = {
    title: "Map Projections",
    titleZh: "地图投影",
    description:
        "Switch the map projection at runtime between globe (ellipsoid), Mercator and " +
        "equirectangular, with the atmosphere kept on to show each projection's look.",
    descriptionZh:
        "在球体（椭球）、墨卡托与等距圆柱投影之间运行时切换，并保留大气配置以展示各投影的视觉效果。",
    thumbnail,
    code: "getting-started",
    order: 2,
    level: "beginner",
    tags: ["projection", "globe", "mercator", "equirectangular", "atmosphere"],
    apis: ["MapView", "MapView.projection", "MapControls"],
    concerns: ["U2"],
    dataPolicy: "open-data"
};

export default config;
