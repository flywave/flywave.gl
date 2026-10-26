/* Copyright (C) 2025 flywave.gl contributors */

import type { ExampleConfig } from "../common";
import thumbnail from "./thumbnail.png";

const config: ExampleConfig = {
    title: "GLTF Model Placement",
    titleZh: "GLTF 模型放置",
    description:
        "The flywave glTF pipeline end to end: loadGLTF fetches and parses, postProcessGLTF resolves " +
        "materials/textures, createThreeSceneFromGLTF builds a three.js scene — then anchor it at a " +
        "latitude/longitude/altitude with a heading, and tune height, orientation and scale live.",
    descriptionZh:
        "flywave glTF 管线全流程：loadGLTF 拉取解析、postProcessGLTF 处理材质贴图、" +
        "createThreeSceneFromGLTF 构建 three.js 场景 —— 再通过经纬度/高度 anchor 放置并设置朝向，" +
        "高度、朝向、缩放均可实时调节。",
    thumbnail,
    code: "models-integration",
    order: 1,
    level: "beginner",
    tags: ["gltf", "model", "map-anchor", "placement"],
    apis: ["loadGLTF", "postProcessGLTF", "createThreeSceneFromGLTF", "mapAnchors", "anchor"],
    concerns: ["U12"],
    dataPolicy: "offline"
};

export default config;
