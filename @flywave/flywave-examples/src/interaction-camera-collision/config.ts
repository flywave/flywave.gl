/* Copyright (C) 2025 flywave.gl contributors */

import type { ExampleConfig } from "../common";

import thumbnail from "./thumbnail.png";

const config: ExampleConfig = {
    title: "Camera Terrain Collision",
    titleZh: "相机地形碰撞",
    description:
        "Zoom into steep DEM terrain with camera collision on and off: MapControls clamps the " +
        "zoom hit point against the elevation source (AWS terrarium DEM, encoding terrarium), " +
        "with a live raycast marker, HUD collision hints and MapControls tilt limits.",
    descriptionZh:
        "在陡峭 DEM 地形上对比开关相机碰撞：MapControls 依据高程源（AWS terrarium DEM，" +
        "encoding terrarium）钳制缩放命中点，附实时射线命中标记、HUD 碰撞提示与倾角限制调节。",
    thumbnail,
    code: "interaction",
    order: 3,
    level: "intermediate",
    tags: ["camera", "collision", "terrain", "zoom", "mapcontrols"],
    apis: ["DEMTerrainSource", "enableCameraCollision", "raycast", "MapControls", "maxTiltAngle"],
    concerns: ["U31"],
    dataPolicy: "open-data"
};

export default config;
