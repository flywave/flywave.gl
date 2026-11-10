/* Copyright (C) 2025 flywave.gl contributors */

import type { ExampleConfig } from "../common";

import thumbnail from "./thumbnail.png";

const config: ExampleConfig = {
    title: "Terrain Local Tiles (Level Gating)",
    titleZh: "本地地形瓦片（层级门控测试）",
    description:
        "Diagnostic page for a local tile server: 0-20 imagery (google-earth JPEG) draped on a " +
        "0-12 terrarium DEM (mapterhorn WebP). The HUD shows both caps at once — the DEM max " +
        "zoom that gates terrain subdivision and the imagery provider's maxDataLevel — plus the " +
        "highest level actually requested. Use ?demmax=20 to reproduce 'terrain marked as 20'.",
    descriptionZh:
        "本地瓦片服务的诊断页：0-20 级影像（google-earth JPEG）贴在 0-12 级 terrarium DEM" +
        "（mapterhorn WebP）上。HUD 同时显示两个上限——门控地形细分的 DEM maxZoom 和影像 " +
        "provider 的 maxDataLevel——以及实际请求到的最深层级。用 ?demmax=20 复现地形标成 20 级。",
    thumbnail,
    code: "terrain-elevation",
    order: 9,
    level: "advanced",
    tags: ["terrain", "imagery", "levels", "diagnostic", "local-tiles"],
    apis: ["DEMTerrainSource", "addWebTileDataSource", "imageryLevelOffset"],
    concerns: [],
    dataPolicy: "open-data",
    // Diagnostic bench pointed at a private local tile server (192.168.x).
    internal: true
};

export default config;
