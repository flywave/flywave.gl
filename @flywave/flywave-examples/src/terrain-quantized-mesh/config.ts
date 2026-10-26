/* Copyright (C) 2025 flywave.gl contributors */

import type { ExampleConfig } from "../common";

import thumbnail from "./thumbnail.png";

const config: ExampleConfig = {
    title: "Quantized Mesh Terrain (Cesium Ion)",
    titleZh: "量化网格地形（Cesium Ion）",
    description:
        "Stream Cesium World Terrain (quantized-mesh) as the elevation source, with satellite " +
        "imagery draped on top and atmosphere clouds enabled. Requires a Cesium Ion access token.",
    descriptionZh:
        "接入 Cesium World Terrain（quantized-mesh）作为高程源，叠加卫星影像并启用大气与云层。" +
        "需要 Cesium Ion Access Token。",
    thumbnail,
    code: "terrain-elevation",
    order: 2,
    level: "beginner",
    tags: ["terrain", "quantized-mesh", "cesium", "ion", "atmosphere"],
    apis: ["CesiumWorldTerrainSource", "setElevationSource", "checkIonToken"],
    concerns: ["U8"],
    dataPolicy: "token"
};

export default config;
