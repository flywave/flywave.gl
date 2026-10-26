/* Copyright (C) 2025 flywave.gl contributors */

import type { ExampleConfig } from "../common";

import thumbnail from "./thumbnail.png";

const config: ExampleConfig = {
    title: "Map Anchors",
    titleZh: "地图锚点与持久对象",
    description:
        "Place, pick, inspect and remove persistent objects via MapAnchor / mapAnchors — the " +
        "only safe way to keep objects across the per-frame scene rebuild. Includes the " +
        "overlay-pass variant drawn above labels.",
    descriptionZh:
        "通过 MapAnchor / mapAnchors 放置、拾取、查看与移除持久对象——这是场景每帧重建下" +
        "唯一安全的持久化方式；同时演示绘制在标注之上的 overlay 通道。",
    thumbnail,
    code: "interaction",
    order: 4,
    level: "beginner",
    tags: ["anchors", "persistent-objects", "overlay", "picking"],
    apis: ["MapAnchor", "mapAnchors", "overlayScene", "InfoWindow"],
    concerns: ["U16", "U30"],
    dataPolicy: "open-data"
};

export default config;
