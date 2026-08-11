// @ts-nocheck
import * as THREE from "three/webgpu";
import { Fn, uv, uniform, vec3, vec4, vec2, screenCoordinate, abs, mix } from "three/tsl";

export const outline = (inputNode, depthTexture, thickness = 0.002, edgeColor = "#ffffff") => {
    const c = uniform(new THREE.Color(edgeColor));

    return Fn(() => {
        const px = screenCoordinate.toUint();
        const w = screenCoordinate.x; // not needed, textureLoad uses integer coords
        const tex = depthTexture;

        const dc = tex.load(px).r;
        const d1 = tex.load(px.add(vec2(1, 0))).r;
        const d2 = tex.load(px.add(vec2(-1, 0))).r;
        const d3 = tex.load(px.add(vec2(0, 1))).r;
        const d4 = tex.load(px.add(vec2(0, -1))).r;

        const depthDiff = abs(d1.sub(d2)).add(abs(d3.sub(d4)));
        const edge = depthDiff.greaterThan(0.0001).toFloat();

        const edgeColorNode = vec4(vec3(c), 1);
        return mix(inputNode, edgeColorNode, edge);
    })();
};
