/* Copyright (C) 2025 flywave.gl contributors */

import type { ExampleConfig } from "../common";

import thumbnail from "./thumbnail.png";

const config: ExampleConfig = {
    title: "Info Window",
    titleZh: "信息窗",
    description:
        "The shared InfoWindow component end to end: click the map, resolve the surface " +
        "coordinate with getWorldPositionAt + unprojectPoint and show HTML at that geo anchor. " +
        "Covers single vs multi window setups, pixelOffset, arbitrary DOM content (tables) and " +
        "the automatic hide-when-offscreen behavior.",
    descriptionZh:
        "完整演示公共 InfoWindow 组件：点击地图用 getWorldPositionAt + unprojectPoint 取得地表" +
        "坐标并在该 geo 锚点显示 HTML 内容；覆盖单窗/多窗模式、pixelOffset、任意 DOM 内容" +
        "（小表格）以及视野外自动隐藏行为。",
    thumbnail,
    code: "interaction",
    order: 6,
    level: "beginner",
    tags: ["info-window", "overlay", "picking", "dom"],
    apis: [
        "InfoWindow",
        "InfoWindow.show",
        "InfoWindow.hide",
        "getWorldPositionAt",
        "unprojectPoint",
        "getScreenPosition"
    ],
    concerns: ["U17"],
    dataPolicy: "open-data"
};

export default config;
