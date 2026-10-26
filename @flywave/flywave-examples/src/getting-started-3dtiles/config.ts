/* Copyright (C) 2025 flywave.gl contributors */

import type { ExampleConfig } from "../common";
import thumbnail from "./thumbnail.png";

const config: ExampleConfig = {
    title: "3D Tiles (Cesium Ion)",
    titleZh: "3D Tiles（Cesium Ion）",
    description:
        "Load a Cesium Ion photogrammetry asset as a 3D Tiles data source; shows a bilingual " +
        "setup card instead of failing when no Ion access token is configured.",
    descriptionZh:
        "将 Cesium Ion 摄影测量资产作为 3D Tiles 数据源加载；未配置 Ion 访问令牌时显示双语引导卡片而非直接报错。",
    thumbnail,
    code: "getting-started",
    order: 5,
    level: "beginner",
    tags: ["3dtiles", "cesium-ion", "photogrammetry", "token"],
    apis: ["CesiumIonDataSource", "MapView.addDataSource"],
    concerns: ["U10"],
    dataPolicy: "token"
};

export default config;
