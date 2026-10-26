/* Copyright (C) 2025 flywave.gl contributors */

import type { ExampleConfig } from "../common";

import thumbnail from "./thumbnail.png";

const config: ExampleConfig = {
    title: "React Integration",
    titleZh: "React 集成",
    description:
        "Embedding the map in a real React component tree with @flywave/flywave-react: " +
        "MapProvider (theme + initial camera) wraps MapCanvas and a demo app that reads the " +
        "MapView through useMap, adds an offline data source via useDataSource, runs a throttled " +
        "status line on useMapEffect, and flies with toolbar buttons calling mapView.flyTo. " +
        "Entry is index.ts (webpack glob collects index.ts only), so the tree uses " +
        "createElement instead of JSX.",
    descriptionZh:
        "用真实的 @flywave/flywave-react 在 React 组件树中嵌入地图：MapProvider（主题 + 初始" +
        "相机）包裹 MapCanvas 与演示组件——useMap 拿 MapView、useDataSource 加离线数据源、" +
        "useMapEffect 驱动节流状态行、工具栏按钮调 mapView.flyTo 飞行。webpack 入口 glob 只收 " +
        "index.ts，故用 createElement 而非 JSX。",
    thumbnail,
    code: "models-integration",
    order: 4,
    level: "intermediate",
    tags: ["react", "integration", "provider", "hooks", "flyto"],
    apis: ["MapProvider", "MapCanvas", "useMap", "useDataSource", "useMapEffect", "MapView.flyTo"],
    concerns: ["U35"],
    dataPolicy: "offline"
};

export default config;
