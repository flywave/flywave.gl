/* Copyright (C) 2025 flywave.gl contributors */
// @ts-nocheck

import * as THREE from "three";
import { NodeMaterial } from "three/webgpu";
import {
    Fn,
    dot,
    float,
    floor as tslFloor,
    mod,
    texture,
    uniform,
    uv as uvNode,
    vec4
} from "three/tsl";

export class GroundModificationHeightShader extends NodeMaterial {
    constructor() {
        super();
        this.name = "GroundModificationHeightShader";
        this.side = THREE.DoubleSide;
        this.transparent = false;
        this.depthTest = false;
        this.depthWrite = false;

        const altitudeU = uniform(0.0);
        const vertexSourceTypeU = uniform(0);
        const heightOperationU = uniform(0);
        const baseDemTextureU = uniform(
            new THREE.DataTexture(
                new Uint8Array([255, 255, 255, 255]),
                1,
                1,
                THREE.RGBAFormat,
                THREE.UnsignedByteType
            )
        );
        const krigingTextureU = uniform(
            new THREE.DataTexture(
                new Uint8Array([255, 255, 255, 255]),
                1,
                1,
                THREE.RGBAFormat,
                THREE.UnsignedByteType
            )
        );
        const krigingMaskTextureU = uniform(
            new THREE.DataTexture(
                new Uint8Array([255, 255, 255, 255]),
                1,
                1,
                THREE.RGBAFormat,
                THREE.UnsignedByteType
            )
        );
        const distanceTextureU = uniform(
            new THREE.DataTexture(
                new Uint8Array([255, 255, 255, 255]),
                1,
                1,
                THREE.RGBAFormat,
                THREE.UnsignedByteType
            )
        );

        this.fragmentNode = Fn(() => {
            const unpackVec = vec4(6553.6, 25.6, 0.1, 10000.0);

            const baseDemColor = texture(baseDemTextureU, uvNode());
            const baseAltitude = dot(vec4(baseDemColor.xyz.mul(255.0), float(-1.0)), unpackVec);

            const krigingColor = texture(
                krigingTextureU,
                vec2(uvNode().x, float(1).sub(uvNode().y))
            );
            const krigingAltitude = dot(vec4(krigingColor.xyz.mul(255.0), float(-1.0)), unpackVec);

            const krigingMask = texture(
                krigingMaskTextureU,
                vec2(uvNode().x, float(1).sub(uvNode().y))
            );

            const modificationValue = vertexSourceTypeU
                .equal(0)
                .select(
                    krigingMask.r.greaterThanEqual(0.1).select(altitudeU, baseAltitude),
                    krigingMask.r.greaterThanEqual(0.1).select(krigingAltitude, baseAltitude)
                );

            const distanceValue = texture(distanceTextureU, uvNode());

            const finalHeight = float(1)
                .sub(distanceValue.r)
                .mul(baseAltitude)
                .add(distanceValue.r.mul(modificationValue));

            const vector = vec4(6553.6, 25.6, 0.1, 10000.0);
            let v = tslFloor(finalHeight.add(vector.w).div(vector.z));
            const b = mod(v, 256.0);
            v = tslFloor(v.div(256.0));
            const g = mod(v, 256.0);
            v = tslFloor(v.div(256.0));
            const r = v;
            return vec4(r, g, b, float(255.0)).div(255.0);
        })();
    }
}
