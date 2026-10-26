/* Copyright (C) 2025 flywave.gl contributors */

import type { ExampleConfig } from "../common";

import thumbnail from "./thumbnail.png";

const config: ExampleConfig = {
    title: "Text Labels & Languages",
    titleZh: "文字标注与多语言",
    description:
        "Map text labels 101: the theme-provided FontCatalog (FiraGO + HanSans for CJK), " +
        "text technique params (size, color, alignment, priority), collision avoidance via " +
        "priority ordering and the MapViewOptions.maxNumVisibleLabels cap, plus live " +
        'language switching with mapView.languages = ["zh" | "en"] (name:<lang> properties).',
    descriptionZh:
        "地图文字标注入门：主题自带的 FontCatalog（FiraGO + HanSans 覆盖中文）、text 技术" +
        "关键参数（size、color、对齐、priority）、基于优先级的碰撞避让与 " +
        'MapViewOptions.maxNumVisibleLabels 上限，以及 mapView.languages = ["zh" | "en"] ' +
        "的实时多语言切换（数据使用 name:<lang> 属性）。",
    thumbnail,
    code: "styling-theming",
    order: 5,
    level: "beginner",
    tags: ["text", "labels", "font-catalog", "languages", "collision-avoidance", "priority"],
    apis: [
        "text technique",
        "MapView.languages",
        "maxNumVisibleLabels",
        "FeaturesDataSource",
        "FontCatalog"
    ],
    concerns: ["U22", "U39"],
    dataPolicy: "offline"
};

export default config;
