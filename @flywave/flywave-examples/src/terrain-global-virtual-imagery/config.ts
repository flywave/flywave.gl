/* Copyright (C) 2025 flywave.gl contributors */

import type { ExampleConfig } from "../common";
import thumbnail from "./thumbnail.png";

const config: ExampleConfig = {
    title: "Global Terrain Virtual Finer Imagery",
    titleZh: "全球地形虚拟精细影像",
    description:
        "A complete, freely navigable globe over the global AWS terrarium DEM with " +
        "imagery-level-offset tiles: every terrain tile drapes a 2x2 mosaic of its four child " +
        "imagery tiles (4x the texels at the same mesh count), falling back to cached ancestors " +
        "per quadrant. The sun is pinned to local solar noon so the target region is always in " +
        "daylight. Use ?offset=0 to compare against the legacy one-image-per-tile mapping.",
    descriptionZh:
        "可自由漫游的全球地形页面：全球 AWS terrarium DEM + 影像级别偏移瓦片——每块地形瓦片贴上四个" +
        "子瓦片的 2x2 mosaic（纹理像素 x4、网格数量不变），取不到的子图按象限回退到缓存祖先。太阳" +
        "钉在当地太阳正午，目标区域始终是白天。用 ?offset=0 对比传统一瓦片一图。",
    thumbnail,
    code: "terrain-elevation",
    order: 7,
    level: "intermediate",
    tags: ["terrain", "global", "imagery", "mosaic", "virtual-texture", "atmosphere"],
    apis: ["DEMTerrainSource", "addWebTileDataSource", "imageryLevelOffset", "lookAt"],
    concerns: [],
    dataPolicy: "open-data"
};

export default config;
