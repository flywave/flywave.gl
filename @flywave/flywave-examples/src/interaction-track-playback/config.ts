/* Copyright (C) 2025 flywave.gl contributors */

import type { ExampleConfig } from "../common";

import thumbnail from "./thumbnail.png";

const config: ExampleConfig = {
    title: "Track Playback",
    titleZh: "轨迹回放",
    description:
        "Digital-twin style GPS track playback: a generated loop track around the Jinan DEM " +
        "area, a MapAnchor mover updated every frame, a FeaturesDataSource polyline for the full " +
        "track, an incrementally drawn traveled-path highlight, playback GUI (play/pause, speed, " +
        "timeline scrubbing) and a smooth camera-follow toggle.",
    descriptionZh:
        "数字孪生式 GPS 轨迹回放：环绕济南 DEM 区域的生成轨迹、每帧更新位置的 MapAnchor " +
        "移动目标、完整轨迹 polyline（FeaturesDataSource）、动态增长的已走轨迹高亮、" +
        "回放 GUI（播放/暂停、倍速、时间轴拖动）与平滑相机跟随开关。",
    thumbnail,
    code: "interaction",
    order: 7,
    level: "intermediate",
    tags: ["playback", "map-anchor", "camera-follow", "digital-twin"],
    apis: [
        "MapAnchor",
        "MapView.beginAnimation",
        "MapView.lookAt",
        "MapViewEventNames.Update",
        "FeaturesDataSource",
        "setFromGeojson"
    ],
    concerns: ["U19", "U30"],
    dataPolicy: "offline"
};

export default config;
