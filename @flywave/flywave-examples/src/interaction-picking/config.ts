/* Copyright (C) 2025 flywave.gl contributors */

import type { ExampleConfig } from "../common";

import thumbnail from "./thumbnail.png";

const config: ExampleConfig = {
    title: "Picking: CPU vs GPU",
    titleZh: "拾取：CPU 与 GPU 双路径",
    description:
        "Pick map objects with the GPU depth path or a CPU raycast: switch useGpuPick " +
        "strategies live, hover-highlight demo models and inspect point, distance, " +
        "data source and featureId on click — including the lazy PickResult contract.",
    descriptionZh:
        "分别用 GPU 深度路径与 CPU 射线拾取地图对象：实时切换 useGpuPick 策略，悬停高亮" +
        "示例模型，点击查看交点、距离、数据源与 featureId，并理解 PickResult 惰性字段契约。",
    thumbnail,
    code: "interaction",
    order: 1,
    level: "beginner",
    tags: ["picking", "gpu", "raycast", "hover", "interaction"],
    apis: ["intersectMapObjects", "useGpuPick", "PickResult", "mapAnchors", "InfoWindow"],
    concerns: ["U16"],
    dataPolicy: "open-data"
};

export default config;
