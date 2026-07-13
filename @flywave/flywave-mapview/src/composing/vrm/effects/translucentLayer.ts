// @ts-nocheck
import { Fn, texture, vec4, vec3, vec2, float, uv } from "three/tsl";

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
