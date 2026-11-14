/* Copyright (C) 2025 flywave.gl contributors */

import { assert } from "chai";
import * as sinon from "sinon";

import {
    type IMapRenderingManager,
    MapRenderingManager
} from "../src/composing/MapRenderingManager";
import { ViewRenderManager } from "../src/composing/vrm/ViewRenderManager";

/**
 * Guards the contract behind `MapRenderingManager.syncConfigToViewRenderManager`:
 *
 *  - only graph-STRUCTURAL fields may request a pipeline rebuild
 *    (`needsUpdate = true` → dispose + recompile the whole TSL chain);
 *  - every uniform-FED value must reach the live nodes through
 *    `ViewRenderManager.applyUniformParams()` without a rebuild.
 *
 * Regression context (2026-11-13): the rebuild fingerprint used to include
 * whole effect objects (`config.bloom`, `config.vignette`, ...) while those
 * effects wrap their parameters in `uniform()` nodes. Dragging a bloom
 * strength slider therefore disposed the pipeline and recompiled the entire
 * chain on every value change (measured: 1 new pipeline + 2 shader modules
 * per edit; now 0). The same bug class applies to every effect, hence the
 * table-driven checks below enumerate ALL sections/fields instead of only
 * bloom.
 *
 * These tests create no GPU device and no renderer, so they are
 * backend-independent: the fingerprint and the uniform write-back are pure
 * JS/TSL state, identical under WebGPU and the WebGL2 fallback.
 */

/** Sections whose non-`enabled` fields are uniform-fed (build-time structure unchanged). */
const UNIFORM_FED_SECTIONS = [
    "bloom",
    "vignette",
    "brightnessContrast",
    "hueSaturation",
    "sepia",
    "colorGradingLUT",
    "fogLight",
    "ssr"
] as const;

/** A real VRM without a renderer: only its config/uniform bookkeeping is used. */
function createVrm(): ViewRenderManager {
    const vrm = new ViewRenderManager({} as never);
    // LUT loading is async and deliberately outside the rebuild fingerprint;
    // never let a unit test start a texture load.
    vrm.setLutUrl = () => {};
    return vrm;
}

function createWiredManager(): { mrm: MapRenderingManager; vrm: ViewRenderManager } {
    const mrm = new MapRenderingManager(800, 600, undefined, { msaaEnabled: false });
    const vrm = createVrm();
    mrm.viewRenderManager = vrm;
    // Initial reconcile: copy manager defaults into the VRM config.
    mrm.syncPostEffectsToVRM();
    vrm.needsUpdate = false;
    return { mrm, vrm };
}

function sectionOf(mrm: IMapRenderingManager, section: string): Record<string, unknown> {
    return (mrm as unknown as Record<string, Record<string, unknown>>)[section];
}

describe("post-effects rebuild fingerprint", function () {
    afterEach(function () {
        sinon.restore();
    });

    it("re-syncing an unchanged config stays rebuild-free", function () {
        const { mrm, vrm } = createWiredManager();
        const applySpy = sinon.spy(vrm, "applyUniformParams");

        mrm.syncPostEffectsToVRM();
        mrm.syncPostEffectsToVRM();

        assert.isFalse(vrm.needsUpdate, "identical config must not rebuild the graph");
        assert.equal(applySpy.callCount, 2, "uniform write-back still runs on every sync");
    });

    it("copies every post-effect value into the VRM config", function () {
        const { mrm, vrm } = createWiredManager();

        mrm.bloom.strength = 3.25;
        mrm.bloom.radius = 1.05;
        mrm.bloom.luminancePassThreshold = 0.12;
        mrm.vignette.offset = 0.61;
        mrm.vignette.darkness = 0.42;
        mrm.sepia.amount = 0.11;
        mrm.hueSaturation.saturation = 0.33;
        mrm.brightnessContrast.brightness = -0.18;
        mrm.brightnessContrast.contrast = 0.22;
        mrm.colorGradingLUT.opacity = 0.73;
        mrm.fogLight.intensity = 1.7;
        mrm.fogLight.density = 0.004;
        mrm.ssr.intensity = 0.55;
        mrm.ssr.maxRayDistance = 1234;
        mrm.syncPostEffectsToVRM();

        assert.equal(vrm.config.bloom.intensity, 3.25);
        assert.equal(vrm.config.bloom.radius, 1.05);
        assert.equal(vrm.config.bloom.threshold, 0.12);
        assert.equal(vrm.config.vignette.offset, 0.61);
        assert.equal(vrm.config.vignette.darkness, 0.42);
        assert.equal(vrm.config.sepia.amount, 0.11);
        assert.equal(vrm.config.hueSaturation.saturation, 0.33);
        assert.equal(vrm.config.brightnessContrast.brightness, -0.18);
        assert.equal(vrm.config.brightnessContrast.contrast, 0.22);
        assert.equal(vrm.config.colorGradingLUT.opacity, 0.73);
        assert.equal(vrm.config.fogLight.intensity, 1.7);
        assert.equal(vrm.config.fogLight.density, 0.004);
        assert.equal(vrm.config.ssr.intensity, 0.55);
        assert.equal(vrm.config.ssr.maxRayDistance, 1234);
    });

    // Table-driven on purpose: adding a new field to one of these sections must
    // either be uniform-fed (this test keeps passing) or be a deliberate
    // structural change (move it out / whitelist it here consciously).
    for (const section of UNIFORM_FED_SECTIONS) {
        it(`${section}: every non-structural field edit stays rebuild-free`, function () {
            const { mrm, vrm } = createWiredManager();
            const applySpy = sinon.spy(vrm, "applyUniformParams");
            const target = sectionOf(mrm, section);

            for (const key of Object.keys(target)) {
                if (key === "enabled") continue;
                // The LUT url swap is async by design (no rebuild either way);
                // its dedicated path is covered by color-grading tests.
                if (section === "colorGradingLUT" && key === "url") continue;

                const previous = target[key];
                assert.strictEqual(
                    typeof previous,
                    "number",
                    `${section}.${key} should be numeric`
                );
                target[key] = (previous as number) + 0.37;

                mrm.syncPostEffectsToVRM();

                assert.isFalse(
                    vrm.needsUpdate,
                    `${section}.${key} is uniform-fed and must not trigger a rebuild`
                );
                assert.isTrue(
                    applySpy.called,
                    `${section}.${key} must still be pushed via applyUniformParams`
                );
                vrm.needsUpdate = false;
                applySpy.resetHistory();
            }
        });

        it(`${section}: toggling enabled is structural`, function () {
            const { mrm, vrm } = createWiredManager();

            sectionOf(mrm, section).enabled = true;
            mrm.syncPostEffectsToVRM();

            assert.isTrue(
                vrm.needsUpdate,
                `${section}.enabled changes the node graph and must rebuild once`
            );
        });
    }

    it("LUT opacity crossing 0 is structural (pass is added/removed)", function () {
        const { mrm, vrm } = createWiredManager();

        mrm.colorGradingLUT.enabled = true;
        mrm.colorGradingLUT.opacity = 1;
        mrm.syncPostEffectsToVRM();
        vrm.needsUpdate = false;

        mrm.colorGradingLUT.opacity = 0;
        mrm.syncPostEffectsToVRM();
        assert.isTrue(vrm.needsUpdate, "opacity 0 removes the LUT pass from the graph");
    });

    // Outline is the opposite case: its whole config is baked at build time
    // (dilate/erode loop size, colors, x-ray toggles).
    const OUTLINE_STRUCTURAL_FIELDS: Array<[string, (mrm: MapRenderingManager) => void]> = [
        ["thickness", mrm => (mrm.outline.thickness = 6)],
        ["color", mrm => (mrm.outline.color = "#ff0000")],
        ["xray", mrm => (mrm.outline.xray = false)],
        ["hiddenColor", mrm => (mrm.outline.hiddenColor = "#00ff00")],
        ["keepPassAlive", mrm => (mrm.outline.keepPassAlive = false)],
        // keepPassAlive stays true here, so the reconciled enabled flag is on.
        ["enabled", mrm => (mrm.outline.enabled = true)]
    ];
    for (const [name, change] of OUTLINE_STRUCTURAL_FIELDS) {
        it(`outline.${name} is structural`, function () {
            const { mrm, vrm } = createWiredManager();

            change(mrm);
            mrm.syncPostEffectsToVRM();

            assert.isTrue(vrm.needsUpdate, `outline.${name} is baked at build time`);
        });
    }

    it("antialiasing mode changes are structural", function () {
        const { mrm, vrm } = createWiredManager();

        mrm.antialiasing = "smaa";
        mrm.syncPostEffectsToVRM();
        assert.isTrue(vrm.needsUpdate);
    });

    it("the deprecated taaEnabled alias is structural when it drives the mode", function () {
        const { mrm, vrm } = createWiredManager();

        mrm.taaEnabled = true; // antialiasing stays "none" → resolves to "taa"
        mrm.syncPostEffectsToVRM();
        assert.isTrue(vrm.needsUpdate);
    });
});

describe("ViewRenderManager uniform write-back", function () {
    afterEach(function () {
        sinon.restore();
    });

    it("applyUniformParams is safe before any graph is built", function () {
        const vrm = createVrm();
        vrm.config.vignette.offset = 0.25;

        assert.doesNotThrow(() => vrm.applyUniformParams());
        assert.equal((vrm as any).m_vignetteUniforms.offset.value, 0.25);
    });

    it("bloom strength/radius/threshold reach the live bloom node", function () {
        const vrm = createVrm();
        const bloomNode = {
            strength: { value: -1 },
            radius: { value: -1 },
            threshold: { value: -1 }
        };
        (vrm as any).m_bloomNode = bloomNode;

        vrm.config.bloom = { enabled: true, intensity: 3.4, radius: 1.1, threshold: 0.2 };
        vrm.applyUniformParams();

        assert.equal(bloomNode.strength.value, 3.4);
        assert.equal(bloomNode.radius.value, 1.1);
        assert.equal(bloomNode.threshold.value, 0.2);
    });

    it("vignette and analytic grading uniforms match the config", function () {
        const vrm = createVrm();
        vrm.config.vignette.offset = 0.66;
        vrm.config.vignette.darkness = 0.33;
        vrm.config.brightnessContrast.brightness = 0.12;
        vrm.config.brightnessContrast.contrast = 0.44;
        vrm.config.hueSaturation.saturation = 0.55;
        vrm.config.sepia.amount = 0.77;

        vrm.applyUniformParams();

        const vignetteUniforms = (vrm as any).m_vignetteUniforms;
        const gradingUniforms = (vrm as any).m_colorGradingUniforms;
        assert.equal(vignetteUniforms.offset.value, 0.66);
        assert.equal(vignetteUniforms.darkness.value, 0.33);
        assert.equal(gradingUniforms.brightness.value, 0.12);
        assert.equal(gradingUniforms.contrast.value, 0.44);
        assert.equal(gradingUniforms.saturation.value, 0.55);
        assert.equal(gradingUniforms.sepiaAmount.value, 0.77);
    });

    it("LUT opacity is written into the persistent controller", function () {
        const vrm = createVrm();
        const controller = { opacity: { value: -1 } };
        (vrm as any).m_lutController = controller;

        vrm.config.colorGradingLUT.opacity = 0.42;
        vrm.applyUniformParams();

        assert.equal(controller.opacity.value, 0.42);
    });

    it("SSR params are forwarded to the SSR node without a rebuild", function () {
        const vrm = createVrm();
        const node = {
            lastConfig: undefined as unknown,
            setConfig(config: unknown) {
                this.lastConfig = config;
            }
        };
        (vrm as any).ssrNode = node;

        vrm.config.ssr.intensity = 0.75;
        vrm.config.ssr.debug = 2;
        vrm.applyUniformParams();

        assert.strictEqual(node.lastConfig, vrm.config.ssr);
    });

    it("lensFlare intensity edits never request a rebuild", function () {
        const vrm = createVrm();
        const node = {
            calls: 0,
            setConfig() {
                this.calls++;
            }
        };
        (vrm as any).lensFlareNode = node;
        vrm.needsUpdate = false;

        vrm.setLensFlareConfig({
            enabled: true,
            bloomIntensity: 2,
            ghostIntensity: 1,
            haloIntensity: 1,
            glareIntensity: 1
        });

        assert.isFalse(vrm.needsUpdate, "intensities are uniforms on the persistent flare node");
        assert.equal(node.calls, 1, "the live flare node must receive the new values");
    });

    it("lensFlare arm-state changes are structural", function () {
        const vrm = createVrm();
        vrm.config.lensFlare = { ...vrm.config.lensFlare, enabled: false };
        vrm.needsUpdate = false;

        vrm.setLensFlareConfig({ ...vrm.config.lensFlare, enabled: true });

        assert.isTrue(vrm.needsUpdate, "the flare node is added/removed by enabled");
    });
});
