/* Copyright (C) 2025 flywave.gl contributors */

import { expect } from "chai";
import { vec2 } from "three/tsl";

import { AtmosphereLUTNode } from "../src/atmosphere/AtmosphereLUTNode";
import { stbnTexture } from "../src/tsl/STBNTextureNode";

/**
 * Regression tests for the explicit level-0 sampling of the atmosphere LUTs
 * and the STBN texture.
 *
 * These textures have no mipmaps, and sampling them implicitly inside the
 * raymarch loops makes the WebGL2/ANGLE D3D11 shader pathological (see
 * upstream three-geospatial issue #115). Setting `levelNode` to 0 is a no-op
 * visually but turns the reads into explicit-LOD samples on every backend.
 */
describe("大气 LUT / STBN 显式 level 0 采样", function () {
    const LUT_NAMES = [
        "transmittance",
        "multipleScattering",
        "scattering",
        "singleMieScattering",
        "higherOrderScattering",
        "irradiance"
    ] as const;

    it("所有 LUT 纹理节点都设置 levelNode", function () {
        const lutNode = new AtmosphereLUTNode();
        for (const name of LUT_NAMES) {
            expect(lutNode.getTextureNode(name).levelNode, name).to.not.equal(null);
        }
    });

    it("sample() 克隆保留 levelNode（shader 里的读取点同样生效）", function () {
        const lutNode = new AtmosphereLUTNode();
        for (const name of LUT_NAMES) {
            const sample = lutNode.getTextureNode(name).sample(vec2(0.5, 0.5));
            expect(sample.levelNode, name).to.not.equal(null);
        }
    });

    it("STBN 纹理节点设置 levelNode", function () {
        expect(stbnTexture.levelNode).to.not.equal(null);
        expect(stbnTexture.sample(vec2(0.5, 0.5)).levelNode).to.not.equal(null);
    });
});
