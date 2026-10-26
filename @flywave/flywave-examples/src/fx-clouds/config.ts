/* Copyright (C) 2025 flywave.gl contributors */

import type { ExampleConfig } from "../common";
import thumbnail from "./thumbnail.png";

const config: ExampleConfig = {
    title: "Volumetric Clouds",
    titleZh: "体积云",
    description:
        "Volumetric cloud layer showcase: quality presets (low/medium/high/ultra), global coverage and " +
        "per-layer density from the real CloudConfig fields, plus a sun-time slider and sun-shadow toggle. " +
        "No data sources — the atmosphere renders on the bare globe.",
    descriptionZh:
        "体积云展示页：质量档位（low/medium/high/ultra）、全局覆盖率与逐层密度（CloudConfig 真实字段），" +
        "含太阳时间滑条与太阳阴影开关。零数据源，大气直接渲染在裸地球上。",
    thumbnail,
    code: "rendering-effects",
    order: 7,
    level: "beginner",
    tags: ["clouds", "atmosphere", "volumetric", "quality"],
    apis: ["atmosphere.clouds", "CloudConfig", "CloudLayerConfig", "patchTheme"],
    concerns: ["U23"],
    dataPolicy: "offline"
};

export default config;
