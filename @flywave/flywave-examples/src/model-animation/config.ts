/* Copyright (C) 2025 flywave.gl contributors */

import type { ExampleConfig } from "../common";
import thumbnail from "./thumbnail.png";

const config: ExampleConfig = {
    title: "Animated FBX Model",
    titleZh: "FBX 骨骼动画模型",
    description:
        "Skeletal animation on the map: load an FBX character with three.js FBXLoader, drive it with an " +
        "AnimationMixer fed from MapView's on-demand update loop, place it on a MapAnchor and control " +
        "playback (play/pause, speed, clip switching, scale) from the panel. Sun shadows on.",
    descriptionZh:
        "地图上的骨骼动画：three.js FBXLoader 加载角色，AnimationMixer 由 MapView 按需渲染循环驱动，" +
        "MapAnchor 放置，面板控制播放/暂停、速度、动画切换与缩放。开启太阳阴影。",
    thumbnail,
    code: "models-integration",
    order: 3,
    level: "beginner",
    tags: ["fbx", "animation", "mixer", "map-anchor", "shadows"],
    apis: [
        "FBXLoader",
        "AnimationMixer",
        "mapAnchors",
        "MapViewEventNames.Update",
        "enableShadows"
    ],
    concerns: ["U13"],
    dataPolicy: "offline"
};

export default config;
