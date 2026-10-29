/* Copyright (C) 2025 flywave.gl contributors */

import type { ExampleConfig } from "../common";

import thumbnail from "./thumbnail.png";

/** Gallery metadata for the data-occlusion-test example. */
const config: ExampleConfig = {
    title: "Occlusion Test Bench",
    titleZh: "遮挡隔离测试",
    description:
        "Ground + buildings tile scene with a mesh placed through a custom DataSource: A/B the mesh renderOrder against the depthTest-disabled ground fill.",
    descriptionZh:
        "地面+建筑瓦片场景，经自定义 DataSource 放置 mesh：A/B 对比 mesh renderOrder 与不测深度的地面 fill 的相互遮挡。",
    thumbnail,
    code: "data-sources",
    order: 5,
    level: "beginner",
    tags: ["occlusion", "renderOrder", "datasource", "depth"],
    apis: ["DataSource", "FeaturesDataSource", "Tile", "onWillTouchTiled"],
};
export default config;
