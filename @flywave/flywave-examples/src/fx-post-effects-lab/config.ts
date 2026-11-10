/* Copyright (C) 2025 flywave.gl contributors */

import type { ExampleConfig } from "../common";

import thumbnail from "./thumbnail.png";

const config: ExampleConfig = {
    title: "Post Effects Lab",
    titleZh: "后处理实验室",
    description:
        "Theme-level post effects lab: vignette, brightness/contrast, hue/saturation and sepia all applied through theme.postEffects, the antialiasing selector (none/taa/smaa), and screen-space reflections on a tagged mirror plaza (addReflectiveObject).",
    descriptionZh:
        "主题级后处理实验室：通过 theme.postEffects 调节暗角、亮度/对比度、色相/饱和度、棕褐色调，切换抗锯齿策略（none/taa/smaa），并在按物体标记的镜面广场上演示屏幕空间反射（addReflectiveObject）。",
    thumbnail,
    code: "rendering-effects",
    order: 9,
    level: "intermediate",
    tags: ["post-effects", "ssr", "antialiasing", "gui"],
    apis: [
        "postEffects.vignette",
        "postEffects.brightnessContrast",
        "postEffects.hueSaturation",
        "postEffects.sepia",
        "postEffects.antialiasing",
        "postEffects.ssr",
        "addReflectiveObject"
    ],
    concerns: ["U26"],
    dataPolicy: "open-data"
};

export default config;
