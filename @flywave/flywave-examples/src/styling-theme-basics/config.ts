/* Copyright (C) 2025 flywave.gl contributors */

import type { ExampleConfig } from "../common";

import thumbnail from "./thumbnail.png";

/** Gallery metadata for the styling-theme-basics example. */
const config: ExampleConfig = {
    title: "Theme Basics: setTheme vs patchTheme",
    titleZh: "主题基础：setTheme 与 patchTheme",
    description:
        "Swap whole tilezen themes asynchronously with setTheme, and patch exposure, saturation and light rigs synchronously with patchTheme.",
    descriptionZh:
        "用 setTheme 异步切换完整 tilezen 主题；用 patchTheme 同步修改曝光、饱和度与灯光（明暗对比）。",
    thumbnail,
    code: "styling-theming",
    order: 1,
    level: "beginner",
    tags: ["theme", "patchTheme", "setTheme", "lighting", "tone-mapping", "offline"],
    apis: ["MapView.setTheme", "MapView.patchTheme", "MapView.getTheme", "MapAnchor"],
    concerns: ["U3"],
    dataPolicy: "offline"
};

export default config;
