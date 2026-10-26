/* Copyright (C) 2025 flywave.gl contributors */

import type { ExampleConfig } from "../common";
import thumbnail from "./thumbnail.png";

const config: ExampleConfig = {
    title: "Atmosphere & Sky",
    titleZh: "物理大气与天空",
    description:
        "Physical atmosphere facade: one sun-time slider drives the whole day cycle — Rayleigh-blue noon sky, " +
        "orange Mie sunset, starry night — plus sun shadows, volumetric clouds, tone mapping and a planet view " +
        "to inspect the glowing atmosphere limb from afar.",
    descriptionZh:
        "物理大气门面：一条太阳时间滑条驱动全天变化 —— 瑞利散射的正午蓝天、米散射的橙色日落与星空夜幕，" +
        "配合太阳阴影、体积云、色调映射，并可拉远到星球视角远看大气边缘光晕。",
    thumbnail,
    code: "rendering-effects",
    order: 6,
    level: "beginner",
    tags: ["atmosphere", "sky", "sun-time", "shadows", "clouds"],
    apis: [
        "theme.atmosphere",
        "atmosphere.sunTime",
        "atmosphere.sunCastShadow",
        "atmosphere.clouds",
        "toneMappingMode"
    ],
    concerns: ["U23"],
    dataPolicy: "offline"
};

export default config;
