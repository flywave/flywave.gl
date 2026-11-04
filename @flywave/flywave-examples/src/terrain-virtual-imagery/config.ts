/* Copyright (C) 2025 flywave.gl contributors */

import type { ExampleConfig } from "../common";
import thumbnail from "./thumbnail.png";

const config: ExampleConfig = {
    title: "Terrain Virtual Finer Imagery",
    titleZh: "地形虚拟精细影像",
    description:
        "Single-tile test bed for the imagery level offset: one terrain tile keeps its own " +
        "geometry but drapes a 2x2 mosaic of its four child imagery tiles (4x the texels, " +
        "same mesh count). Every quadrant falls back to a coarser cached ancestor when its " +
        "child is missing. The visible tile set is locked to one (or two) fixed tile keys so " +
        "a single tile can be inspected in isolation.",
    descriptionZh:
        "影像级别偏移的单瓦片试验台：一块地形瓦片保持自身几何，但贴上四个子瓦片的 2x2 " +
        "mosaic（纹理像素 x4，网格数量不变）；某个象限取不到子图时自动回退到缓存中更粗的" +
        "祖先瓦片。可见瓦片集合被锁定为固定的一个（或两个）tile key，便于单独检查。",
    thumbnail,
    code: "terrain-elevation",
    order: 6,
    level: "advanced",
    tags: ["terrain", "imagery", "texture", "virtual-texture", "mosaic", "debug"],
    apis: ["DEMTerrainSource", "addWebTileDataSource", "imageryLevelOffset", "VisibleTileSet"],
    concerns: [],
    dataPolicy: "open-data"
};

export default config;
