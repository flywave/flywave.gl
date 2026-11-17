/* Copyright (C) 2025 flywave.gl contributors */

import type { ExampleConfig } from "../common";
import thumbnail from "./thumbnail.png";

const config: ExampleConfig = {
    title: "Atmosphere × 3D Tiles (Sunset)",
    titleZh: "大气 × 实景三维（日落）",
    description:
        "Reproduces the upstream three-geospatial 'Shadows' story with a Cesium-ion 3D Tiles city: local solar time 17:42, " +
        "AgX exposure 10, 3×1024² cascaded sun shadows over 50 km, and aerial perspective fed by CSM shadow length " +
        "(god rays).",
    descriptionZh:
        "用 Cesium ion 实景三维城市复现上游 three-geospatial『Shadows』示例：当地太阳时 17:42、AgX 曝光 10、" +
        "3×1024² 级联太阳阴影（50 km 范围），以及带 CSM 阴影长度的空气透视（光束）。",
    thumbnail,
    code: "rendering-effects",
    order: 10,
    level: "intermediate",
    tags: ["atmosphere", "3d tiles", "sunset", "shadows", "cesium ion", "photogrammetry"],
    apis: [
        "theme.atmosphere",
        "atmosphere.sunTime",
        "CesiumIonDataSource",
        "MapViewOptions.shadowCascades",
        "toneMappingExposure"
    ],
    concerns: ["U23"],
    dataPolicy: "token"
};

export default config;
