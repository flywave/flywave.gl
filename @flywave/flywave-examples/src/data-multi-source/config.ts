/* Copyright (C) 2025 flywave.gl contributors */

import type { ExampleConfig } from "../common";

import thumbnail from "./thumbnail.png";

/** Gallery metadata for the data-multi-source example. */
const config: ExampleConfig = {
    title: "Multi-Source Stack",
    titleZh: "多数据源叠加",
    description:
        "Stack terrain elevation, raster imagery, an in-memory features layer and a 3D Tiles " +
        "tileset on one view; toggle each source live and watch the inspector.",
    descriptionZh:
        "在同一视图叠加地形高程、栅格影像、内存要素层与 3D Tiles；实时开关各数据源并配合 inspector 观察。",
    thumbnail,
    code: "data-sources",
    order: 2,
    level: "intermediate",
    tags: ["terrain", "imagery", "features", "3d-tiles", "layers"],
    apis: [
        "demoTerrain",
        "setElevationSource",
        "demoImagery",
        "FeaturesDataSource",
        "TileRenderDataSource",
        "ModularMapViewMonitor",
        "clearTileCache"
    ],
    concerns: ["U10", "U34"],
    dataPolicy: "open-data"
};

export default config;
