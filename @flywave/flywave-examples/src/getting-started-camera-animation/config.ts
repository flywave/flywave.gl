/* Copyright (C) 2025 flywave.gl contributors */

import type { ExampleConfig } from "../common";
import thumbnail from "./thumbnail.png";

const config: ExampleConfig = {
    title: "Camera Animation",
    titleZh: "相机动画",
    description:
        "Animate the camera with CameraKeyTrackAnimation: orbit the current target, fly a " +
        "Jinan -> Beijing landmark route and tune interpolation, loop and repetitions live.",
    descriptionZh:
        "使用 CameraKeyTrackAnimation 制作相机动画：环绕当前目标、沿济南->北京地标航线飞行，并实时调节插值、循环与重复次数。",
    thumbnail,
    code: "getting-started",
    order: 3,
    level: "intermediate",
    tags: ["camera", "animation", "orbit", "flyto", "keytrack"],
    apis: ["CameraKeyTrackAnimation", "CameraAnimationBuilder", "ControlPoint", "MapView.flyTo"],
    concerns: ["U29"],
    dataPolicy: "open-data"
};

export default config;
