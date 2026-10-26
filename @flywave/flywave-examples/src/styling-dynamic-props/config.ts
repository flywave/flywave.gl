/* Copyright (C) 2025 flywave.gl contributors */

import type { ExampleConfig } from "../common";

import thumbnail from "./thumbnail.png";

const config: ExampleConfig = {
    title: "Dynamic Style Properties",
    titleZh: "动态样式变量",
    description:
        "Runtime restyling without re-decoding: theme attributes read live values via " +
        '["get", name, ["dynamic-properties"]], and GUI sliders call ' +
        "mapView.setDynamicProperty — the per-frame volatile channel. Contrast with " +
        "styling-extrusion-bars where baked extrusion heights require the async setTheme.",
    descriptionZh:
        '免重解码的运行时改样式：主题属性通过 ["get", name, ["dynamic-properties"]] 读取' +
        "实时变量，GUI 滑条调用 mapView.setDynamicProperty 走逐帧易变通道。与 " +
        "styling-extrusion-bars（高度在解码期烘焙、必须异步 setTheme）形成对照。",
    thumbnail,
    code: "styling-theming",
    order: 4,
    level: "intermediate",
    tags: ["dynamic-properties", "setDynamicProperty", "expressions", "runtime-styling"],
    apis: [
        "MapView.setDynamicProperty",
        "dynamic-properties operator",
        "circles technique",
        "enabled attr"
    ],
    concerns: ["U20"],
    dataPolicy: "offline"
};

export default config;
