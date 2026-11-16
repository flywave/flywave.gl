/* Copyright (C) 2025 flywave.gl contributors */

import { expect } from "chai";
import type { Renderer, RenderTarget } from "three/webgpu";
import { HalfFloatType } from "three/webgpu";

import { AtmosphereLUTNode } from "../src/atmosphere/AtmosphereLUTNode";
import { AtmosphereLUTTexturesWebGL } from "../src/atmosphere/AtmosphereLUTTexturesWebGL";
import { AtmosphereParameters } from "../src/atmosphere/AtmosphereParameters";

/**
 * Regression tests for preallocating the LUT render targets before any
 * material samples them (upstream three-geospatial issue #116).
 */
describe("大气 LUT render target 预分配", function () {
    const initTargets = (textures: AtmosphereLUTTexturesWebGL): RenderTarget[] => {
        const targets: RenderTarget[] = [];
        const renderer = {
            initRenderTarget: (target: RenderTarget) => {
                targets.push(target);
            }
        } as unknown as Renderer;
        textures.initRenderTargets(renderer);
        return targets;
    };

    it("默认参数：初始化 transmittance / multipleScattering / scattering / higherOrder / irradiance", function () {
        const parameters = new AtmosphereParameters();
        const textures = new AtmosphereLUTTexturesWebGL();
        textures.setup(parameters, HalfFloatType);

        const targets = initTargets(textures);
        const byName = new Map(targets.map(target => [target.texture.name, target]));

        expect(targets.length).to.equal(5);
        expect(byName.get("transmittance")?.width).to.equal(parameters.transmittanceTextureSize.x);
        expect(byName.get("transmittance")?.height).to.equal(parameters.transmittanceTextureSize.y);
        expect(byName.get("scattering")?.width).to.equal(parameters.scatteringTextureSize.x);
        expect(byName.get("scattering")?.height).to.equal(parameters.scatteringTextureSize.y);
        expect(byName.get("irradiance")?.width).to.equal(parameters.irradianceTextureSize.x);
        expect(byName.get("irradiance")?.height).to.equal(parameters.irradianceTextureSize.y);
    });

    it("combinedScatteringTextures=false 时额外初始化 singleMieScattering", function () {
        const parameters = new AtmosphereParameters();
        parameters.combinedScatteringTextures = false;
        const textures = new AtmosphereLUTTexturesWebGL();
        textures.setup(parameters, HalfFloatType);

        const names = initTargets(textures).map(target => target.texture.name);
        expect(names).to.include("singleMieScattering");
        expect(names.length).to.equal(6);
    });

    it("higherOrderScatteringTexture=false 时跳过 higherOrderScattering", function () {
        const parameters = new AtmosphereParameters();
        parameters.higherOrderScatteringTexture = false;
        const textures = new AtmosphereLUTTexturesWebGL();
        textures.setup(parameters, HalfFloatType);

        const names = initTargets(textures).map(target => target.texture.name);
        expect(names).to.not.include("higherOrderScattering");
        expect(names.length).to.equal(4);
    });

    it("AtmosphereLUTNode.initialize(renderer) 不依赖 node builder 且幂等", function () {
        const lutNode = new AtmosphereLUTNode();
        const targets: RenderTarget[] = [];
        const renderer = {
            backend: {
                isWebGPUBackend: false,
                hasFeature: () => false
            },
            initRenderTarget: (target: RenderTarget) => {
                targets.push(target);
            }
        } as unknown as Renderer;

        lutNode.initialize(renderer);
        const transmittance = lutNode.getTextureNode("transmittance").value;
        expect(transmittance).to.not.equal(null);
        expect(targets.length).to.equal(5);

        // Host-side rebuild may initialize before the graph exists; a later
        // node setup must not allocate a second set of targets.
        lutNode.initialize(renderer);
        expect(targets.length).to.equal(5);
        expect(lutNode.getTextureNode("transmittance").value).to.equal(transmittance);
    });
});
