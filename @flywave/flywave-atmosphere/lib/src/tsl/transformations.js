// @ts-nocheck
/* Copyright (C) 2025 flywave.gl contributors */
import { cameraFar as cameraFarTSL, cameraNear as cameraNearTSL, cos, int, logarithmicDepthToViewZ, orthographicDepthToViewZ, perspectiveDepthToViewZ, PI, PI2, sin, sub, vec3, vec4, viewZToLogarithmicDepth, viewZToPerspectiveDepth } from "three/tsl";
import { cameraFar, cameraNear } from "./accessors";
import { FnLayout } from "./FnLayout";
import { FnVar } from "./FnVar";
export const depthToViewZ = FnVar((depth, camera, near, far) => builder => {
    near ?? (near = cameraNear(camera));
    far ?? (far = cameraFar(camera));
    const perspective = camera?.isPerspectiveCamera === true;
    const logarithmic = builder.renderer.logarithmicDepthBuffer;
    return logarithmic
        ? logarithmicDepthToViewZ(depth, near, far)
        : perspective
            ? perspectiveDepthToViewZ(depth, near, far)
            : orthographicDepthToViewZ(depth, near, far);
});
export const logarithmicToPerspectiveDepth = (depth, near = cameraNearTSL, far = cameraFarTSL) => {
    const viewZ = logarithmicDepthToViewZ(depth, near, far);
    return viewZToPerspectiveDepth(viewZ, near, far);
};
export const perspectiveToLogarithmicDepth = (depth, near = cameraNearTSL, far = cameraFarTSL) => {
    const viewZ = perspectiveDepthToViewZ(depth, near, far);
    return viewZToLogarithmicDepth(viewZ, near, far);
};
export const screenToPositionView = (uv, depth, viewZ, projectionMatrix, inverseProjectionMatrix) => {
    const scale = projectionMatrix.element(int(2)).element(int(3));
    const offset = projectionMatrix.element(int(3)).element(int(3));
    const clip = vec4(vec3(uv.flipY(), depth).mul(2).sub(1), 1);
    const ndc = clip.mul(viewZ.mul(scale).add(offset));
    return inverseProjectionMatrix.mul(ndc).xyz;
};
export const equirectToDirectionWorld = FnLayout({
    name: "equirectToDirectionWorld",
    type: "vec3",
    inputs: [{ name: "uv", type: "vec2" }]
})(([uv]) => {
    const lambda = sub(0.5, uv.x).mul(PI2);
    const phi = sub(uv.y, 0.5).mul(PI);
    const cosPhi = cos(phi);
    return vec3(cosPhi.mul(cos(lambda)), sin(phi), cosPhi.mul(sin(lambda)));
});
//# sourceMappingURL=transformations.js.map