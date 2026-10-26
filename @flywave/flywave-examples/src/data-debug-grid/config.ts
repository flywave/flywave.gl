/* Copyright (C) 2025 flywave.gl contributors */

import type { ExampleConfig } from "../common";

import thumbnail from "./thumbnail.png";

/** Gallery metadata for the data-debug-grid example. */
const config: ExampleConfig = {
    title: "Debug Tile Grid",
    titleZh: "调试瓦片网格",
    description:
        "Visualize the tile schedule with a minimal DataSource that draws every rendered tile; " +
        "tune maxVisibleDataSourceTiles and quadTree search distances and watch the grid react.",
    descriptionZh:
        "用一个绘制所有渲染瓦片的最小 DataSource 可视化瓦片调度；调节 maxVisibleDataSourceTiles 与四叉树搜索距离，观察网格变化。",
    thumbnail,
    code: "data-sources",
    order: 3,
    level: "beginner",
    tags: ["debug", "tiles", "quadtree", "custom-datasource", "offline"],
    apis: [
        "DataSource",
        "Tile",
        "DebugGridDataSource",
        "TileKeyUtils",
        "MapViewOptions",
        "webMercatorTilingScheme"
    ],
    concerns: [],
    dataPolicy: "offline"
};

export default config;
