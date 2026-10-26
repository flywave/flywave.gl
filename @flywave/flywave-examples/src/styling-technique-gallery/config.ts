/* Copyright (C) 2025 flywave.gl contributors */

import type { ExampleConfig } from "../common";

import thumbnail from "./thumbnail.png";

const config: ExampleConfig = {
    title: "Technique Gallery",
    titleZh: "渲染技术画廊",
    description:
        "Six styling techniques (fill, extruded-polygon, solid-line with dash params, labeled-icon, " +
        "text and circles) rendered side by side from one offline FeaturesDataSource, each selected " +
        "by a when filter. Toggling a technique rebuilds the theme and applies it via async setTheme " +
        "— patchTheme cannot touch the async styles section.",
    descriptionZh:
        "一个内置离线 FeaturesDataSource 同屏演示六种渲染技术（fill、extruded-polygon、solid-line 虚线、" +
        "labeled-icon、text、circles），通过 when 过滤互不干扰。开关某一技术需重建主题并走异步 setTheme " +
        "—— patchTheme 不能修改 styles 等异步段。",
    thumbnail,
    code: "styling-theming",
    order: 3,
    level: "intermediate",
    tags: ["techniques", "style-set", "when-filter", "solid-line", "labeled-icon", "circles"],
    apis: [
        "fill technique",
        "extruded-polygon technique",
        "solid-line technique",
        "labeled-icon technique",
        "text technique",
        "circles technique",
        "FeaturesDataSource",
        "setTheme"
    ],
    concerns: ["U21", "U22"],
    dataPolicy: "offline"
};

export default config;
