/* Copyright (C) 2025 flywave.gl contributors */

import type { ExampleConfig } from "../common";

import thumbnail from "./thumbnail.png";

const config: ExampleConfig = {
    title: "Extrusion Bar Chart",
    titleZh: "3D 柱状数据可视化",
    description:
        "Attribute-driven extruded-polygon styling: expression heights ([\"get\", field] × " +
        "scale), classed step colors and zoom-interpolated edges over an offline district " +
        "GeoJSON. Restyling goes through async setTheme because extrusion heights are baked " +
        "worker-side at decode time.",
    descriptionZh:
        "基于属性的 extruded-polygon 样式：表达式驱动高度（[\"get\", 字段] × 系数）、分级填色" +
        "与缩放插值边线，数据为内置离线行政区 GeoJSON。挤出高度在 Worker 解码期烘焙，" +
        "因此改样式必须走异步 setTheme。",
    thumbnail,
    code: "styling-theming",
    order: 2,
    level: "intermediate",
    tags: ["extrusion", "data-visualization", "expressions", "thematic-mapping"],
    apis: ["extruded-polygon technique", "FeaturesDataSource", "setTheme", "Expr"],
    concerns: ["U21"],
    dataPolicy: "offline"
};

export default config;
