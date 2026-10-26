/* Copyright (C) 2025 flywave.gl contributors */

import type { ExampleConfig } from "../common";
import thumbnail from "./thumbnail.png";

const config: ExampleConfig = {
    title: "Draco-Compressed Models",
    titleZh: "Draco 压缩模型",
    description:
        "Draco mesh compression in the flywave glTF pipeline: KHR_draco_mesh_compression primitives are " +
        "decompressed inside loadGLTF (decompressMeshes defaults to true) with the self-hosted wasm decoder, " +
        "no extra wiring. The panel reports the measured decode + build time; placement reuses the MapAnchor pattern.",
    descriptionZh:
        "flywave glTF 管线中的 Draco 网格压缩：KHR_draco_mesh_compression 图元在 loadGLTF 内自动解压" +
        "（decompressMeshes 默认开启），使用自托管的 wasm 解码器，无需额外接线。面板显示实测解码+构建耗时；" +
        "放置方式复用 MapAnchor 模式。",
    thumbnail,
    code: "models-integration",
    order: 2,
    level: "intermediate",
    tags: ["gltf", "draco", "compression", "decode"],
    apis: ["loadGLTF", "postProcessGLTF", "createThreeSceneFromGLTF", "GLTFLoader"],
    concerns: ["U12"],
    dataPolicy: "offline"
};

export default config;
