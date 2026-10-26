/* Copyright (C) 2025 flywave.gl contributors */

import type { ExampleConfig } from "../common";

import thumbnail from "./thumbnail.png";

const config: ExampleConfig = {
    title: "Post Processing Effects",
    titleZh: "后期处理效果",
    description:
        "Post-processing playground: the full PostProcessingGUIModule parameter panel, selective outline (addOutlineObject), selective bloom (addBloomObject) and live bloom-object spawn/despawn.",
    descriptionZh:
        "后期处理游乐场：PostProcessingGUIModule 全参数面板 + addOutlineObject 选择性描边 + addBloomObject 选择性 bloom，并支持运行时动态生成/移除 bloom 物体。",
    thumbnail,
    code: "rendering-effects",
    order: 1,
    level: "intermediate",
    tags: ["post-effects", "bloom", "outline", "gui"],
    apis: ["PostProcessingGUIModule", "addOutlineObject", "addBloomObject", "postEffects.bloom"],
    concerns: ["U26"],
    dataPolicy: "open-data"
};

export default config;
