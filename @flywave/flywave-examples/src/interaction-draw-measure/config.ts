/* Copyright (C) 2025 flywave.gl contributors */

import type { ExampleConfig } from "../common";

import thumbnail from "./thumbnail.png";

const config: ExampleConfig = {
    title: "Draw & Measure",
    titleZh: "绘制与测量",
    description:
        "Draw, edit and export GeoJSON point/line/polygon features with GeoJSONDrawControls, " +
        "plus live measurements: haversine line length and a projected planar polygon area, " +
        "with an Ion-token gated elevation source.",
    descriptionZh:
        "使用 GeoJSONDrawControls 绘制、编辑并导出 GeoJSON 点/线/面，并实时显示测量结果：" +
        "测地线长度与投影平面近似面积；高程源按 Ion Token 有无自动降级。",
    thumbnail,
    code: "interaction",
    order: 2,
    level: "beginner",
    tags: ["draw", "measure", "geojson", "edit", "export"],
    apis: ["GeoJSONDrawControls", "DrawMode", "DrawEventNames", "GeoLineString", "checkIonToken"],
    concerns: ["U18"],
    dataPolicy: "token"
};

export default config;
