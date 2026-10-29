/* Copyright (C) 2025 flywave.gl contributors */

import type { ExampleConfig } from "../common";

import thumbnail from "./thumbnail.png";

/** Gallery metadata for the mvt-element-test example. */
const config: ExampleConfig = {
    title: "MVT Element Isolation Test",
    titleZh: "MVT 逐元素隔离测试",
    description:
        "Render one vector element category at a time (ground plane, water, landuse, extruded buildings with static/coalesce/get heights, roads) against free OpenFreeMap tiles, one minimal style entry per case.",
    descriptionZh:
        "每次只渲染一个矢量元素类别（地面平面/水面/地块/楼体三种高度写法/道路），对免费 OpenFreeMap 瓦片逐元素验证渲染链路，每个用例一条最小样式。",
    thumbnail,
    code: "data-sources",
    order: 7,
    level: "intermediate",
    tags: ["mvt", "openfreemap", "vectortiles", "debug", "isolation"],
    apis: ["VectorTileDataSource", "MapView", "addBackgroundDatasource"]
};
export default config;
