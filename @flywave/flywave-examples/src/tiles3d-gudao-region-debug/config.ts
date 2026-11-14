/* Copyright (C) 2025 flywave.gl contributors */

import type { ExampleConfig } from "../common";

import thumbnail from "./thumbnail.png";

/** Gallery metadata for the 3D Tiles inverted-region diagnostic page. */
const config: ExampleConfig = {
    title: "3D Tiles Inverted Region Check",
    titleZh: "3D Tiles 纬度倒置区域诊断",
    description:
        "Diagnostic page for a local 3D Tiles dataset (gudao): pins the host app camera pose " +
        "and reports whether tiles whose region metadata has swapped latitude bounds " +
        "(south > north) get loaded and get a valid OBB.",
    descriptionZh:
        "本地 3D Tiles 数据集（gudao）诊断页：锁定宿主应用相机位姿，检查 region 纬度界颠倒" +
        "（south > north）的瓦片是否被创建并正确算出 OBB。",
    thumbnail,
    code: "internal",
    order: 30,
    level: "advanced",
    tags: ["3d tiles", "region", "obb", "diagnostic", "local-tiles"],
    apis: ["TileRenderDataSource", "MapAnchor", "projectBox"],
    internal: true
};

export default config;
