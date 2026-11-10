/* Copyright (C) 2025 flywave.gl contributors */

import type { ExampleConfig } from "../common";
import thumbnail from "./thumbnail.png";

const config: ExampleConfig = {
    title: "Shadow Stress Test",
    titleZh: "阴影压力测试",
    description:
        "A measurement bench for the engine's shadow cost: global DEM terrain draped with Esri " +
        "World Imagery, an instanced city of up to 4096 shadow-casting blocks plus up to 800 " +
        "cloned glTF models, a live FPS/frame-time/draw-call HUD and a one-click shadows ON/OFF " +
        "A/B benchmark on the same camera and load.",
    descriptionZh:
        "引擎阴影开销的测量台：全球 DEM 地形 + Esri 卫星影像，最多 4096 个投影实例化楼块与 " +
        "最多 800 个 glTF 模型克隆，实时 FPS/帧耗时/绘制调用 HUD，以及同机位同负载的一键阴影 " +
        "开/关 A/B 基准。",
    thumbnail,
    code: "rendering-effects",
    order: 8,
    level: "advanced",
    tags: [
        "shadows",
        "performance",
        "fps",
        "benchmark",
        "terrain",
        "imagery",
        "instancing",
        "gltf"
    ],
    apis: [
        "enableShadows",
        "shadowsEnabled",
        "DEMTerrainSource",
        "ArcGISTileProvider",
        "imageryLevelOffset",
        "InstancedMesh",
        "MapAnchor",
        "beginAnimation"
    ],
    concerns: ["U28"],
    dataPolicy: "open-data"
};

export default config;
