/* Copyright (C) 2025 flywave.gl contributors */

import thumbnail from "./thumbnail.png";

export default {
    title: "Water Surface with Reflection Toggle",
    titleZh: "水面与反射开关",
    description:
        "Animated TSL water surface over real lake polygons, with the waterReflection switch recovered from f4map's front-end contract",
    descriptionZh: "基于真实湖泊多边形的 TSL 动态水面，并复现 f4map 前端的水面反射开关语义",
    thumbnail,
    code: "rendering-effects",
    order: 45,
    level: "intermediate",
    tags: ["water", "reflection", "tsl", "node-material", "polygon"],
    apis: ["WaterMaterial", "PolygonMesh", "mapAnchors", "MapView.update"],
    concerns: [
        "Reflection is an analytic fresnel/sky term, not a mirrored scene pass: the reference engine's stencil reflection is not present in the analysed bundle",
        "Water polygons are anchored 2 m above the ground plane to avoid depth fighting with the basemap lake fill"
    ],
    dataPolicy: "open-data"
};
