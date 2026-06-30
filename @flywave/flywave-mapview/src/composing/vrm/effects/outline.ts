// @ts-nocheck
import * as THREE from "three";
import { Fn, uv, uniform, vec3, vec4, vec2, viewportSize, mul, abs, mix } from "three/tsl";

export const outline = (inputNode, depthTexture, thickness = 0.002, edgeColor = "#ffffff") => {
    const t = uniform(thickness);
    const c = uniform(new THREE.Color(edgeColor));

    return Fn(() => {
        const texelSize = vec2(1).div(viewportSize);
        const offset = mul(t, texelSize);

        const center = uv();
        const d1 = depthTexture.sample(center.add(vec2(offset.x, 0))).r;
        const d2 = depthTexture.sample(center.add(vec2(-offset.x, 0))).r;
        const d3 = depthTexture.sample(center.add(vec2(0, offset.y))).r;
        const d4 = depthTexture.sample(center.add(vec2(0, -offset.y))).r;

        const depthDiff = abs(d1.sub(d2)).add(abs(d3.sub(d4)));
        const edge = depthDiff.greaterThan(0.0001).toFloat();

        const edgeColorNode = vec4(vec3(c), 1);
        return mix(inputNode, edgeColorNode, edge);
    })();
};
