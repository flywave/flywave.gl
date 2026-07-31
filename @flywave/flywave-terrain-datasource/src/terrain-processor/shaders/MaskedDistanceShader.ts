/* Copyright (C) 2025 flywave.gl contributors */
// @ts-nocheck

import * as THREE from "three/webgpu";
import { NodeMaterial } from "three/webgpu";
import { Fn, clamp, dot, float, length, min as tslMin, texture, uniform, uv as uvNode, vec2, vec4 } from "three/tsl";


export class MaskedDistanceShader extends NodeMaterial {
    constructor() {
        super();
        this.name = "MaskedDistanceShader";
        this.side = THREE.DoubleSide;

        const resolutionU = uniform(new THREE.Vector2(256, 256));
        const slopeWidthU = uniform(10.0);
        const maskTextureU = uniform(
            new THREE.DataTexture(
                new Uint8Array([255, 255, 255, 255]),
                1,
                1,
                THREE.RGBAFormat,
                THREE.UnsignedByteType
            )
        );
        const contourTextureU = uniform(
            new THREE.DataTexture(
                new Uint8Array([255, 255, 255, 255]),
                1,
                1,
                THREE.RGBAFormat,
                THREE.UnsignedByteType
            )
        );
        const contourLengthU = uniform(0);
        const contourTexSizeU = uniform(new THREE.Vector2(1, 1));

        this.fragmentNode = Fn(() => {
            const maskColor = texture(maskTextureU, vec2(uvNode().x, float(1).sub(uvNode().y)));
            const maskValue = maskColor.r;
            const pixelCoord = uvNode().mul(resolutionU);

            const u = float(0).add(0.5).div(contourTexSizeU.x);
            const p0 = texture(contourTextureU, vec2(u, 0.5)).xy;
            const p1 = texture(
                contourTextureU,
                vec2(float(1).add(0.5).div(contourTexSizeU.x), 0.5)
            ).xy;

            const ab = p1.sub(p0);
            const ap = pixelCoord.sub(p0);
            const t = clamp(dot(ap, ab).div(dot(ab, ab)), 0, 1);
            const proj = p0.add(t.mul(ab));
            const dist = length(pixelCoord.sub(proj));

            const normalizedDistance = tslMin(float(1), dist.div(slopeWidthU.mul(2)));

            return maskValue
                .greaterThan(0)
                .select(vec4(normalizedDistance, 0, 0, 1), vec4(0, 0, 0, 1));
        })();
    }
}
