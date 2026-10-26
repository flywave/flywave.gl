/* Copyright (C) 2025 flywave.gl contributors */

import type { ExampleConfig } from "../common";

import thumbnail from "./thumbnail.png";

const config: ExampleConfig = {
    title: "Ground Modification (Height Maps)",
    titleZh: "地面修改（高度图）",
    description:
        "Raise and excavate the terrain surface with HeightMapModifierManager image modifiers: " +
        "a stepped wall, a flat platform and a dug trench, generated on canvas. Toggle or clear " +
        "each modifier from the GUI.",
    descriptionZh:
        "用 HeightMapModifierManager 的图像修改器抬升与开挖地表：阶梯墙、平整平台与壕沟，" +
        "均由 canvas 生成；可在 GUI 中切换或清除。",
    thumbnail,
    code: "terrain-elevation",
    order: 4,
    level: "intermediate",
    tags: ["terrain", "ground-modification", "heightmap", "excavation"],
    apis: ["HeightMapModifierManager", "addModifier", "DEMTerrainSource"],
    concerns: ["U9"],
    dataPolicy: "open-data"
};

export default config;
