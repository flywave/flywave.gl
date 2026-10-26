/* Copyright (C) 2025 flywave.gl contributors */

import type { ExampleConfig } from "../common";

import thumbnail from "./thumbnail.png";

const config: ExampleConfig = {
    title: "Night City Lights",
    titleZh: "夜景城市灯光",
    description:
        "Full night-scene toolkit: volumetric fog-light halos via mapView.addFogLight, bloom over emissive city lights, a dim theme.lights night rig and tone mapping exposure — all tunable live.",
    descriptionZh:
        "夜景全家桶：mapView.addFogLight 体积光晕 + 自发光城市灯光 bloom + theme.lights 夜间灯光 + toneMappingExposure 曝光，全部参数可实时调节。",
    thumbnail,
    code: "rendering-effects",
    order: 4,
    level: "beginner",
    tags: ["night", "fog-light", "bloom", "lights"],
    apis: [
        "addFogLight",
        "postEffects.fogLight",
        "postEffects.bloom",
        "theme.lights",
        "toneMappingExposure"
    ],
    concerns: ["U25", "U26"],
    dataPolicy: "open-data"
};

export default config;
