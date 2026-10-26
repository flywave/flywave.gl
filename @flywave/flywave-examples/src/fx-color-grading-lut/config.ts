/* Copyright (C) 2025 flywave.gl contributors */

import type { ExampleConfig } from "../common";

import thumbnail from "./thumbnail.png";

const config: ExampleConfig = {
    title: "Color Grading LUT",
    titleZh: "LUT 调色",
    description:
        "Apply 3D LUT film color grading to the final image. Switch between built-in presets (.cube/.3dl/film-simulation PNG) and adjust blend opacity at runtime.",
    descriptionZh:
        "对最终画面应用 3D LUT 电影级调色。可运行时切换内置预设（.cube/.3dl/胶片模拟 PNG）并调节混合不透明度。",
    thumbnail,
    code: "rendering-effects",
    order: 2,
    level: "beginner",
    tags: ["post-effects", "lut", "color-grading"],
    apis: ["postEffects.colorGradingLUT", "patchTheme", "LUT_PRESETS"],
    concerns: ["U26"],
    dataPolicy: "open-data"
};

export default config;
