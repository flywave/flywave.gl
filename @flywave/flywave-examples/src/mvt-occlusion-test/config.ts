/* Copyright (C) 2025 flywave.gl contributors */

import type { ExampleConfig } from "../common";

import thumbnail from "./thumbnail.png";

/** Gallery metadata for the mvt-occlusion-test example. */
const config: ExampleConfig = {
    title: "MVT Occlusion Test Bench",
    titleZh: "MVT 大面积遮挡测试",
    description:
        "Large-scale formal test with free OpenFreeMap MVT tiles (OpenMapTiles schema, no key): whole-city vector rendering plus a mesh placed through a custom DataSource, A/B the renderOrder against ground fills.",
    descriptionZh:
        "免费 OpenFreeMap MVT 瓦片（OpenMapTiles schema，无 key）铺整城矢量，叠加自定义 DataSource 放置的 mesh：A/B renderOrder 与地面 fill 的涂盖关系。",
    thumbnail,
    code: "data-sources",
    order: 6,
    level: "intermediate",
    tags: ["mvt", "openfreemap", "vectortiles", "occlusion", "renderOrder", "datasource"],
    apis: ["VectorTileDataSource", "DataSource", "Tile", "onWillTouchTiled"],
    // Diagnostic renderOrder bench (uses an internal __probe handle).
    internal: true,
};
export default config;
