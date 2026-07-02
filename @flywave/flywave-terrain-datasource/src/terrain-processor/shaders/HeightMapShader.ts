/* Copyright (C) 2025 flywave.gl contributors */
// @ts-nocheck

import * as THREE from "three";
import { NodeMaterial } from "three/webgpu";
import {
    Fn,
    attribute,
    float,
    floor as tslFloor,
    mod,
    uv as uvNode,
    varying,
    vec2,
    vec4,
    Discard
} from "three/tsl";

import { FaceTypes } from "../../quantized-terrain/quantized-stratum-mesh/decoder";

export class HeightMapShader extends NodeMaterial {
    constructor(vertexShaderType: "quantized" | "stratum") {
        super();
        this.name = "HeightMapShader";
        this.side = THREE.DoubleSide;

        const altitude = attribute("altitude", "float");
        const vheight = varying(altitude, "vheight");
        const faceType = attribute("faceType", "float");
        const webMercatorY = attribute("webMercatorY", "float");

        // WebGPU readRenderTargetPixelsAsync 从顶部开始读（与 WebGL 相反）
        // 所以不需要像原始 RawShaderMaterial 那样翻转 Y
        if (vertexShaderType === "stratum") {
            this.positionNode = vec4(uvNode().x, uvNode().y, 0, 1);
        } else {
            this.positionNode = vec4(uvNode().x, webMercatorY, 0, 1);
        }

        this.fragmentNode = Fn(() => {
            const vector = vec4(6553.6, 25.6, 0.1, 10000.0);
            let v = tslFloor(vheight.add(vector.w).div(vector.z));
            const b = mod(v, 256.0);
            v = tslFloor(v.div(256.0));
            const g = mod(v, 256.0);
            v = tslFloor(v.div(256.0));
            const r = v;
            const color = vec4(r, g, b, float(255.0)).div(255.0);

            if (vertexShaderType === "stratum") {
                const vDiscard = faceType.notEqual(float(FaceTypes.TopGroundFace));
                return vDiscard.select(Discard(), color);
            }
            return color;
        })();
    }
}
