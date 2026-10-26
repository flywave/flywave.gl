/* Copyright (C) 2025 flywave.gl contributors */

import type { ExampleConfig } from "../common";
import thumbnail from "./thumbnail.png";

const config: ExampleConfig = {
    title: "Map Controls",
    titleZh: "地图交互控件",
    description:
        "The full MapControlsUI overlay (zoom input, screenshot button) plus dat.GUI switches " +
        "for every MapControls interaction option and the thumbnail generator panel.",
    descriptionZh:
        "完整版 MapControlsUI 覆盖层（缩放输入、截图按钮），并用 dat.GUI 演示 MapControls 的全部交互选项与缩略图生成面板。",
    thumbnail,
    code: "getting-started",
    order: 4,
    level: "beginner",
    tags: ["mapcontrols", "controlsui", "screenshot", "thumbnail", "interaction"],
    apis: ["MapControls", "MapControlsUI", "MapThumbnailGenerator"],
    concerns: ["U37"],
    dataPolicy: "open-data"
};

export default config;
