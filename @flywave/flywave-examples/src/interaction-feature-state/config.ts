/* Copyright (C) 2025 flywave.gl contributors */

import type { ExampleConfig } from "../common";

import thumbnail from "./thumbnail.png";

const config: ExampleConfig = {
    title: "Feature State",
    titleZh: "要素状态与动态高亮",
    description:
        "Click-to-highlight polygons driven by DataSource feature state: setFeatureState / " +
        'getFeatureState plus the ["feature-state", key] style expression. Includes throttled ' +
        "hover picking, a live state panel and a reset button. Note: the feature-state operator " +
        "is only honored by the `enabled` style attribute — fill colors are re-highlighted via " +
        "a data-property update + setFromGeojson re-push.",
    descriptionZh:
        "点击要素后用 DataSource 的 setFeatureState / getFeatureState 与样式表达式 " +
        '["feature-state", key] 实现动态高亮；含鼠标悬停节流拾取、状态面板与复位按钮。' +
        "注意：feature-state 操作符仅被样式的 enabled 属性支持，填充色高亮通过" +
        "“数据属性更新 + setFromGeojson 重设”实现。",
    thumbnail,
    code: "interaction",
    order: 5,
    level: "intermediate",
    tags: ["feature-state", "picking", "highlight", "geojson"],
    apis: [
        "DataSource.setFeatureState",
        "DataSource.getFeatureState",
        "DataSource.removeFeatureState",
        "PickResult.featureId",
        "FeaturesDataSource.setFromGeojson"
    ],
    concerns: ["U16", "U20"],
    dataPolicy: "offline"
};

export default config;
