/* Copyright (C) 2025 flywave.gl contributors */

import type { ExampleConfig } from "../common";
import thumbnail from "./thumbnail.png";

export default {
    title: "3D Tiles Batch Styling",
    titleZh: "3D Tiles 批属性样式",
    description:
        "Color photogrammetry buildings by batch attributes with tile3d styles: tiered height " +
        "gradients, single-style add/update/remove, per-band hiding and click-to-inspect with " +
        "a properties table and feature highlight.",
    descriptionZh:
        "用 tile3d 样式按批属性给实景建筑配色：按高度分档渐变、单条样式增删改、" +
        "按档隐藏，点击建筑查看批表属性并高亮。",
    thumbnail,
    code: "tiles-3d",
    order: 2,
    level: "intermediate",
    tags: ["3d tiles", "styling", "batch table", "picking"],
    apis: [
        "CesiumIonDataSource.setTheme",
        "addStyle",
        "updateStyleById",
        "removeStyleById",
        "getBatchProperties",
        "PropertiesTable"
    ],
    concerns: ["U11"],
    dataPolicy: "token"
} satisfies ExampleConfig;
