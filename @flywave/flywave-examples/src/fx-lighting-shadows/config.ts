/* Copyright (C) 2025 flywave.gl contributors */

import type { ExampleConfig } from "../common";

import thumbnail from "./thumbnail.png";

const config: ExampleConfig = {
    title: "Lighting & Shadows",
    titleZh: "光照与阴影",
    description:
        "Engine lighting tour: the theme.lights rig (ambient + shadow-casting directional sun) with enableShadows, plus three.js spot/point lights on a MapAnchor with helper visualization, shadow camera tuning and a moving shadow box.",
    descriptionZh:
        "引擎光照教学：theme.lights（环境光 + 投影方向光）与 enableShadows，叠加 MapAnchor 挂载的 three.js 聚光灯/点光源，含 helper 可视化、阴影相机参数与移动受光盒子。",
    thumbnail,
    code: "rendering-effects",
    order: 5,
    level: "intermediate",
    tags: ["lights", "shadows", "theme", "threejs"],
    apis: ["theme.lights", "enableShadows", "SpotLightHelper", "patchTheme"],
    concerns: ["U28"],
    dataPolicy: "open-data"
};

export default config;
