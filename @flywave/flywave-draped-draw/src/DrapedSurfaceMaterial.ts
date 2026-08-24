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
    vec4,
    cross,
    mix,
    normalize,
    sign,
    step
} from "three/tsl";

import { DrapedSurfaceMaterialOptions, DrapedTarget } from "./DrapedTarget";
import { buildDrapedColorNode, metersPerPixel } from "./drapedFragment";

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
    /**
     * Expanded view-space vertex position, returned from
     * {@link setupPositionView} — the NodeMaterial extension point that fully
     * replaces the local→view transform (this is how sprites work too).
     */
    private expandedEc: any;

    constructor(options: DrapedSurfaceMaterialOptions) {
        super(options, "curtain");

        // The shell is expanded in the vertex stage, so its winding is
        // view-dependent — disable face culling exactly like Cesium's
        // GroundPolylinePrimitive render state (`cull.enabled = false`).
        this.side = THREE.DoubleSide;
        // Occlusion is carried by the membership tests against the captured
        // surface (the equivalent of Cesium's `writeDepthClamp` compositing),
        // not by the hardware depth buffer — the shell hugs the datum while
        // the painted track follows the terrain.
        this.depthTest = false;

        const aStartPos = customAttribute("aStartPos", "vec3");
        const aEndPos = customAttribute("aEndPos", "vec3");
        const aStartN = customAttribute("aStartPlaneNormal", "vec3");
        const aEndN = customAttribute("aEndPlaneNormal", "vec3");
        const aRightN = customAttribute("aRightNormal", "vec3");
        const aSideSign = customAttribute("aSideSign", "float");

        // Eye-space endpoints and frame vectors. Direction vectors ride
        // modelViewMatrix with w=0: for rigid transforms this equals the
        // normal-matrix rotation, and unlike `modelNormalMatrix` it is
        // reliably updated even for basic materials without normals.
        const ecStart = modelViewMatrix.mul(vec4(aStartPos, 1.0)).xyz;
        const ecEnd = ecStart.add(modelViewMatrix.mul(vec4(aEndPos.sub(aStartPos), 0)).xyz);

        const startNormalEc = modelViewMatrix.mul(vec4(aStartN, 0)).xyz;
        const endNormalEc = modelViewMatrix.mul(vec4(aEndN, 0)).xyz;
        const rightNormalEc = modelViewMatrix.mul(vec4(aRightN, 0)).xyz;

        // Plane constants (n·p + w = 0), one lateral + one cap per endpoint.
        const startW = startNormalEc.dot(ecStart).negate();
        const endW = endNormalEc.dot(ecEnd).negate();
        const rightW = rightNormalEc.dot(ecStart).negate();

        const vStartPlane = varying(vec4(startNormalEc, startW));
        const vEndPlane = varying(vec4(endNormalEc, endW));
        const vRightPlane = varying(vec4(rightNormalEc, rightW));

        // Eye-space endpoints for the tube-distance containment: unlike the
        // three-plane corridor (which admits any height), the distance to the
        // segment itself defines a camera-independent 3D region.
        const vEcStart = varying(ecStart);
        const vEcEnd = varying(ecEnd);

        // Pick the closer cap plane relative to THIS vertex, then derive the
        // expansion normal with two cross products — the exact ternary/cross
        // chain of PolylineShadowVolumeVS.
        const baseEC = modelViewMatrix.mul(vec4(positionLocal, 1.0)).xyz;
        const dStart = startNormalEc.dot(baseEC).add(startW).abs();
        const dEnd = endNormalEc.dot(baseEC).add(endW).abs();
        const planeDirection = mix(endNormalEc, startNormalEc, step(dStart, dEnd));
        const upOrDown = normalize(cross(rightNormalEc, planeDirection));
        const normalEC = normalize(cross(planeDirection, upOrDown));

        // Full pixel width converted to meters at this vertex, divided by the
        // plain miter/right cosine — no abs, no clamp, as in the original.
        const pushDistance = metersPerPixel(baseEC, this.pixelsPerMeterFactor)
            .mul(this.halfWidthPx.mul(2))
            .div(normalEC.dot(rightNormalEc));
        const expandedEC = baseEC.add(normalEC.mul(sign(aSideSign)).mul(pushDistance));

        this.colorNode = buildDrapedColorNode(
            "curtain",
            this.fragmentContext({
                startPlane: vStartPlane,
                endPlane: vEndPlane,
                rightPlane: vRightPlane,
                ecStart: vEcStart,
                ecEnd: vEcEnd
            })
        );

        this.expandedEc = expandedEC;
    }

    public setupPositionView(/* builder */): any {
        return this.expandedEc;
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
        this.positionNode = positionLocal;
        this.colorNode = buildDrapedColorNode(
            "prism",
            this.fragmentContext({
                cornerA: vCornerA,
                cornerB: vCornerB,
                cornerC: vCornerC
            })
        );
    }
}
