/* Copyright (C) 2025 flywave.gl contributors */

import thumbnail from "./thumbnail.png";

export default {
    title: "Forest from OSM Polygons",
    titleZh: "OSM 森林多边形植被",
    description:
        "OSM-driven forest scatter ported from f4map: jittered scanline placement, tag-based species selection, mercator-corrected heights and billboard LOD",
    descriptionZh:
        "移植自 f4map 的 OSM 森林生成：抖动扫描线撒点、按标签选树种、墨卡托高度校正与广告牌 LOD",
    thumbnail,
    code: "rendering-effects",
    order: 46,
    level: "intermediate",
    tags: ["forest", "vegetation", "instancing", "lod", "osm", "tsl"],
    apis: ["ForestLayer", "mapAnchors", "InstancedMesh", "MapView.update"],
    concerns: [
        "Tree models and textures are the reference's own `.bis` assets, decoded at runtime by the recovered ModelDecoder format",
        "Instance packing uses InstancedMesh rather than the reference's baked mini-skinning geometry",
        "The reference build renders far billboards into the shadow pass only; here they also render in the colour pass"
    ],
    dataPolicy: "open-data"
};
