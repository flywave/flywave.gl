/* Copyright (C) 2025 flywave.gl contributors */

// @ts-nocheck
import { float, Fn, texture, uv, vec2, vec3, vec4 } from "three/tsl";

export const translucentLayer: any = (
    rawGroundColor: any,
    finalColor: any,
    objDepthColor: any,
    objColor: any,
    terrainDepthColor: any,
    layerDataTexture: any,
    exposureUniform: any
) => {
    return Fn(() => {
        return vec4(objColor.rgb, float(1.0));
    });
};
