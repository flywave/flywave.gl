/* Copyright (C) 2025 flywave.gl contributors */

import type { ExampleConfig } from "../common";

import thumbnail from "./thumbnail.png";

const config: ExampleConfig = {
    title: "Gaussian Splatting Models",
    titleZh: "高斯泼溅模型",
    description:
        "Consume 3D Gaussian Splatting assets through the glTF extension pipeline and anchor " +
        "them on the map with automatic bounds framing.",
    descriptionZh: "经 glTF 扩展管线消费 3D 高斯泼溅资产，用 MapAnchor 放置并自动按数据范围取景。",
    thumbnail,
    code: "models-integration",
    order: 4,
    level: "intermediate",
    tags: ["gaussian-splatting", "3dgs", "gltf"],
    apis: ["createThreeSceneFromGLTF", "MapAnchor", "loadGLTF"],
    concerns: ["U15"],
    dataPolicy: "offline"
};

export default config;
