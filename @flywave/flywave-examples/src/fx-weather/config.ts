/* Copyright (C) 2025 flywave.gl contributors */

import type { ExampleConfig } from "../common";

const config: ExampleConfig = {
    title: "Weather Precipitation",
    titleZh: "降水天气效果",
    description:
        "Rain and snow driven entirely by the theme: set theme.rain / theme.snow (null disables) and patch them at runtime with mapView.patchTheme. Sweep intensity, density, direction and colors live.",
    descriptionZh:
        "纯 theme 驱动的降水效果：theme.rain / theme.snow 段存在即启用、置 null 关闭，运行时用 mapView.patchTheme 热更新强度、密度、方向与颜色。",
    // No source thumbnail exists for this example; the browser gallery falls
    // back to its default art when the file is missing.
    thumbnail: "thumbnail.png",
    code: "rendering-effects",
    order: 3,
    level: "beginner",
    tags: ["weather", "rain", "snow", "theme"],
    apis: ["theme.rain", "theme.snow", "patchTheme"],
    concerns: ["U24"],
    dataPolicy: "open-data"
};

export default config;
