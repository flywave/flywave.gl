/* Copyright (C) 2026 flywave.gl contributors */

import { SurfaceCapturePass } from "@flywave/flywave-mapview";
import * as THREE from "three/webgpu";
import {
    attribute,
    cameraProjectionMatrix,
    modelViewMatrix,
    positionLocal,
    screenUV,
    texture,
    uniform,
    varying,
    vec3,
    vec4
} from "three/tsl";

import { DrapedSurfaceMaterialOptions, DrapedTarget } from "./DrapedTarget";
import { buildDrapedColorNode } from "./drapedFragment";

/**
 * Real (non-empty) stand-in bound until capture outputs exist. An empty
 * `Texture` risks deriving sampler/bind-group layouts that silently return
 * zero after the live render-target textures are swapped in.
 */
const PLACEHOLDER_TEXTURE = (() => {
    const texture = new THREE.DataTexture(new Float32Array([0, 0, 0, 0]), 1, 1, THREE.RGBAFormat);
    texture.needsUpdate = true;
    return texture;
})();

/**
 * Typed escape hatch for custom attributes: the TSL `attribute()` typings
 * return an untyped node that no arithmetic overload accepts, so every
 * custom-attribute consumer in this package funnels through here.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function customAttribute(name: string, type: "float" | "vec3" | "vec4"): any {
    return attribute(name, type);
}

/**
 * Common state for materials drawing volumes draped onto captured surfaces.
 *
 * Subclasses assemble their vertex stage and containment inputs themselves
 * (after `super()` returns) and then assign `positionNode` / `colorNode`.
 */
abstract class DrapedVolumeMaterialBase extends THREE.MeshBasicNodeMaterial {
    protected readonly halfWidthPx: any;
    protected readonly pixelsPerMeterFactor: any;
    protected readonly colorUniform: any;
    protected readonly opacityUniform: any;
    protected readonly colorVec: any;
    protected readonly allowTerrain: any;
    protected readonly allowModel: any;
    protected readonly debug: any;
    protected readonly probe: any;
    protected readonly depthTextureNode: any;
    protected readonly typeTextureNode: any;

    constructor(options: DrapedSurfaceMaterialOptions, mode: "curtain" | "prism") {
        super({
            transparent: true,
            depthWrite: false,
            side: mode === "curtain" ? THREE.BackSide : THREE.DoubleSide,
            blending: THREE.CustomBlending,
            blendSrc: THREE.OneFactor,
            blendDst: THREE.OneMinusSrcAlphaFactor
        });

        this.halfWidthPx = uniform(Math.max(0.25, (options.widthPixels ?? 2) / 2));
        this.pixelsPerMeterFactor = uniform(0.001);
        this.colorUniform = uniform(new THREE.Color(options.color ?? 0xff0000));
        this.opacityUniform = uniform(options.opacity ?? 1);
        this.colorVec = vec4(this.colorUniform, this.opacityUniform);
        const target = options.target ?? DrapedTarget.Both;
        this.allowTerrain = uniform((target & DrapedTarget.Terrain) !== 0 ? 1 : 0);
        this.allowModel = uniform((target & DrapedTarget.Model) !== 0 ? 1 : 0);
        this.debug = uniform(options.debugShowVolume === true ? 1 : 0);
        this.applyDebugState(options.debugShowVolume === true);
        this.probe = uniform(0);

        this.depthTextureNode = texture(PLACEHOLDER_TEXTURE, screenUV);
        this.typeTextureNode = texture(PLACEHOLDER_TEXTURE, screenUV);
    }

    /** Bind the capture pass outputs once they exist (safe to call every frame). */
    public syncCaptureTextures(capturePass: SurfaceCapturePass): boolean {
        const depthTexture = capturePass.depthTexture;
        const typeTexture = capturePass.typeTexture;
        if (depthTexture === null || typeTexture === null) {
            return false;
        }
        if (this.depthTextureNode.value !== depthTexture) {
            this.depthTextureNode.value = depthTexture;
        }
        if (this.typeTextureNode.value !== typeTexture) {
            this.typeTextureNode.value = typeTexture;
        }
        return true;
    }

    public setWidthPixels(widthPixels: number): void {
        this.halfWidthPx.value = Math.max(0.25, widthPixels / 2);
    }

    public setColor(colorValue: THREE.ColorRepresentation): void {
        (this.colorUniform.value as THREE.Color).set(colorValue);
    }

    public setOpacity(opacityValue: number): void {
        this.opacityUniform.value = opacityValue;
    }

    /**
     * Feed the meters-per-pixel scale factor `2*tan(fovY/2)/viewportHeightPx`
     * for the current camera and viewport. Called by the owning wrapper every
     * frame before the main pass.
     */
    public setPixelsPerMeterFactor(factor: number): void {
        this.pixelsPerMeterFactor.value = Math.max(1e-8, factor);
    }

    public setTarget(target: DrapedTarget): void {
        this.allowTerrain.value = (target & DrapedTarget.Terrain) !== 0 ? 1 : 0;
        this.allowModel.value = (target & DrapedTarget.Model) !== 0 ? 1 : 0;
    }

    public setDebugShowVolume(enabled: boolean): void {
        this.debug.value = enabled ? 1 : 0;
        this.applyDebugState(enabled);
    }

    /**
     * FS instrumentation: encodes an intermediate fragment value into the
     * output color instead of running the drape logic. `0` disables.
     */
    public setProbe(value: number): void {
        this.probe.value = value;
    }

    /**
     * While debugging, render as an opaque depth-written solid so the raw
     * volume reads like a normal mesh instead of an X-ray superimposition
     * (the draped state is double-sided and depth-write-free by design).
     */
    private applyDebugState(enabled: boolean): void {
        if (this.transparent === !enabled && this.depthWrite === enabled) {
            return;
        }
        this.transparent = !enabled;
        this.depthWrite = enabled;
        this.blending = enabled ? THREE.NoBlending : THREE.CustomBlending;
        this.needsUpdate = true;
    }

    /**
     * Bisection override: `level >= 1` swaps the fragment graph for flat
     * opaque magenta and forces a solid, depth-written state — isolating the
     * vertex stage plus render state from the draped fragment logic.
     */
    public applyDebugOverride(level: number): void {
        if (level < 1) {
            return;
        }
        this.colorNode = vec4(1, 0, 1, 1);
        this.transparent = false;
        this.depthWrite = true;
        this.blending = THREE.NoBlending;
        this.needsUpdate = true;
    }

    protected fragmentContext(varyings: Record<string, any>) {
        return {
            depthTextureNode: this.depthTextureNode,
            typeTextureNode: this.typeTextureNode,
            halfWidthPx: this.halfWidthPx,
            pixelsPerMeterFactor: this.pixelsPerMeterFactor,
            colorVec: this.colorVec,
            allowTerrain: this.allowTerrain,
            allowModel: this.allowModel,
            debug: this.debug,
            probe: this.probe,
            // Curtain no longer produces an eye-space fragment position; the
            // convention-fit probes are prism-only, so default to a constant.
            fragEye: varyings.fragEye ?? vec4(0),
            varyings
        };
    }
}

/**
 * Material for centerline curtain volumes built by `buildCurtainGeometry`.
 *
 * Screen-space band rendering (GroundPolyline-style): the vertex stage
 * projects the segment endpoints to clip space; the fragment stage measures
 * the pixel's distance to that screen segment at the configured width.
 * Coverage comes from the tall centerline panels, while membership is decided
 * purely in screen space — stable under any camera motion.
 */
export class DrapedCurtainMaterial extends DrapedVolumeMaterialBase {
    constructor(options: DrapedSurfaceMaterialOptions) {
        super(options, "curtain");

        const aSegmentStart = customAttribute("aSegmentStart", "vec3");
        const aForwardOffset = customAttribute("aForwardOffset", "vec3");

        // Clip-space segment endpoints, interpolated across the panel.
        // The directional offset rides modelViewMatrix with w=0: for rigid
        // transforms this equals the normal-matrix rotation, and unlike
        // `modelNormalMatrix` it is reliably updated even for basic
        // materials without normals (a zero matrix here collapses both
        // projected endpoints onto one point).
        const ecStart = modelViewMatrix.mul(vec4(aSegmentStart, 1.0));
        const ecEnd = ecStart.add(modelViewMatrix.mul(vec4(aForwardOffset, 0)));
        const ndcStart = varying(cameraProjectionMatrix.mul(ecStart));
        const ndcEnd = varying(cameraProjectionMatrix.mul(ecEnd));

        // Self-projection: where THIS fragment lands through the very same
        // projection used for the endpoints. Must coincide with its own pixel.
        const baseEC = modelViewMatrix.mul(vec4(positionLocal, 1.0));
        const ndcSelf = varying(cameraProjectionMatrix.mul(baseEC));

        this.positionNode = positionLocal;
        this.colorNode = buildDrapedColorNode(
            "curtain",
            this.fragmentContext({
                ndcStart,
                ndcEnd,
                ndcSelf
            })
        );
    }
}

/**
 * Material for footprint prisms built by `buildPrismGeometry`. Each fragment
 * tests the reconstructed ground position against its own footprint triangle.
 * The footprint corners are transformed into eye space here so the fragment
 * wedge test compares points in one consistent frame (the reconstruction in
 * `buildDrapedColorNode` yields eye-space positions).
 */
export class DrapedPrismMaterial extends DrapedVolumeMaterialBase {
    constructor(options: DrapedSurfaceMaterialOptions) {
        super(options, "prism");

        const ecCornerA = modelViewMatrix.mul(vec4(customAttribute("aCornerA", "vec3"), 1.0)).xyz;
        const ecCornerB = modelViewMatrix.mul(vec4(customAttribute("aCornerB", "vec3"), 1.0)).xyz;
        const ecCornerC = modelViewMatrix.mul(vec4(customAttribute("aCornerC", "vec3"), 1.0)).xyz;

        const vCornerA = varying(ecCornerA);
        const vCornerB = varying(ecCornerB);
        const vCornerC = varying(ecCornerC);
        const vFragEye = varying(modelViewMatrix.mul(vec4(positionLocal, 1.0)).xyz);

        this.positionNode = positionLocal;
        this.colorNode = buildDrapedColorNode(
            "prism",
            this.fragmentContext({
                cornerA: vCornerA,
                cornerB: vCornerB,
                cornerC: vCornerC,
                fragEye: vFragEye
            })
        );
    }
}
