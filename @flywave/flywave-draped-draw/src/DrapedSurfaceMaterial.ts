/* Copyright (C) 2026 flywave.gl contributors */

import { SurfaceCapturePass } from "@flywave/flywave-mapview";
import * as THREE from "three/webgpu";
import {
    Discard,
    If,
    div,
    min,
    Fn,
    abs,
    attribute,
    cameraProjectionMatrix,
    clamp,
    cross,
    float,
    max,
    mix,
    modelViewMatrix,
    normalize,
    positionLocal,
    screenUV,
    sign,
    step,
    texture,
    uniform,
    varying,
    vec3,
    vec4
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
    private readonly depthGate: any;
    protected reconProjInvUniform: any;
    /** West/south membership planes (EYE space, updated per frame). */
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

        this.depthGate = uniform(options.debugRawMaterial === true ? 0 : 1);
        this.reconProjInvUniform = uniform(new THREE.Matrix4());
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
        const snap = (capturePass as unknown as { reconProjInv?: THREE.Matrix4 }).reconProjInv;
        if (snap) {
            (this.reconProjInvUniform.value as THREE.Matrix4).copy(snap);
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

    /** Toggle the along-ray terrain disambiguation (A/B debugging). */

    /** Per-frame eye-space membership planes. */

    /** Static per-geometry reciprocal extents. */

    public setDepthGateEnabled(enabled: boolean): void {
        this.depthGate.value = enabled ? 1 : 0;
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
            depthGate: this.depthGate,
            reconProjInv: this.reconProjInvUniform,

            // Curtain no longer produces an eye-space fragment position; the
            // convention-fit probes are prism-only, so default to a constant.
            fragEye: varyings.fragEye ?? vec4(0),
            varyings
        };
    }
}

/**
 * Material for centerline curtains built by `buildCurtainGeometry`.
 *
 * Reference terrain-draped polyline material:
 * the vertex stage expands each segment quad along the closer miter plane's
 * in-frame normal by `metersPerPixel * width / dot(N, R)`; the fragment
 * stage reconstructs the visible surface from captured depth and tests it
 * against the segment's three bounding planes.
 */
export class DrapedCurtainMaterial extends DrapedVolumeMaterialBase {
    /** Expanded view-space position, returned via `setupPositionView`. */
    private expandedEc: any;

    constructor(options: DrapedSurfaceMaterialOptions) {
        super(options, "curtain");

        // The shell is expanded in the vertex stage (winding is
        // view-dependent) and occlusion is carried by the membership tests,
        // so culling is disabled and hardware depth testing is off.
        this.side = THREE.DoubleSide;
        this.depthTest = false;

        const aStartPos = customAttribute("aStartPos", "vec3");
        const aEndPos = customAttribute("aEndPos", "vec3");
        const aStartN = customAttribute("aStartPlaneNormal", "vec3");
        const aEndN = customAttribute("aEndPlaneNormal", "vec3");
        const aRightN = customAttribute("aRightNormal", "vec3");
        const aSideSign = customAttribute("aSideSign", "float");
        const aBottomFlag = customAttribute("aBottomFlag", "float");

        // Eye-space endpoints and frame vectors. Direction vectors ride
        // modelViewMatrix with w=0; `modelNormalMatrix` stays zero on basic
        // materials without normals.
        const ecStart = modelViewMatrix.mul(vec4(aStartPos, 1.0)).xyz;
        const segmentOffset = modelViewMatrix.mul(vec4(aEndPos.sub(aStartPos), 0)).xyz;
        const ecEnd = ecStart.add(segmentOffset);
        const forwardEc = segmentOffset.normalize();

        const startNormalEc = modelViewMatrix.mul(vec4(aStartN, 0)).xyz;
        const endNormalEc = modelViewMatrix.mul(vec4(aEndN, 0)).xyz;
        const rightNormalEc = modelViewMatrix.mul(vec4(aRightN, 0)).xyz;

        const startW = startNormalEc.dot(ecStart).negate();
        const endW = endNormalEc.dot(ecEnd).negate();
        const rightW = rightNormalEc.dot(ecStart).negate();

        const baseEC = modelViewMatrix.mul(vec4(positionLocal, 1.0)).xyz;

        const vStartPlane = varying(vec4(startNormalEc, startW));
        const vEndPlane = varying(vec4(endNormalEc, endW));
        const vRightPlane = varying(vec4(rightNormalEc, rightW));

        // Wall fragment's own eye position, for along-ray disambiguation.
        const vFragEye = varying(baseEC);

        // Closer cap plane for THIS vertex, then two cross products — the
        // exact ternary/cross chain of the reference vertex stage.
        const dStart = startNormalEc.dot(baseEC).add(startW).abs();
        const dEnd = endNormalEc.dot(baseEC).add(endW).abs();
        const planeDirection = mix(endNormalEc, startNormalEc, step(dStart, dEnd));
        const upOrDown = normalize(cross(rightNormalEc, planeDirection));
        const normalEC = normalize(cross(planeDirection, upOrDown));

        // Subtle adjustment #1: drop the floor vertices by roughly two
        // pixel-sizes at their own range along the line-forward x push
        // direction, so terrain relief can never poke through the curtain
        // floor under grazing views. Clamped by the globe radius magnitude.
        const downDir = cross(forwardEc, normalEC).normalize();
        const toleranceMeters = this.pixelsPerMeterFactor
            .mul(baseEC.length())
            .mul(float(2.0))
            .min(float(6378137.0));
        const droppedBase = baseEC.add(downDir.mul(toleranceMeters).mul(aBottomFlag));

        // Full pixel width in meters at this vertex divided by the plain
        // miter/right cosine — no abs, no clamp, as in the original, with
        // the negative-meters-per-pixel guard of the reference stage.
        // Subtle adjustment #2: the shell is deliberately oversized (double
        // width plus a one-meter unit push, the conservative fit of the
        // reference vertex stage): membership boundaries stay pixel-crisp
        // while rasterization noise can never expose the shared joint
        // planes or the open end caps.
        const pushDistance = metersPerPixel(droppedBase, this.pixelsPerMeterFactor)
            .max(float(0.0))
            .mul(this.halfWidthPx.mul(2))
            .mul(float(2.0))
            .div(normalEC.dot(rightNormalEc));
        const expandedEC = droppedBase.add(
            normalEC.mul(sign(aSideSign)).mul(pushDistance.add(float(1.0)))
        );

        this.expandedEc = expandedEC;

        // VERBATIM transplant of the validated pure-reference fragment body
        // (draped-pure example). Deliberately bypasses the shared
        // buildDrapedColorNode assembly until the discrepancy is found.
        const reconProjInvLocal = uniform(new THREE.Matrix4());
        this.reconProjInvUniform = reconProjInvLocal;
        const skyRevUniform = uniform(0);

        this.colorNode = Fn(() => {
            const depthSample = this.depthTextureNode.r;
            const ndc = vec3(
                screenUV.x.mul(2).sub(1),
                screenUV.y.oneMinus().mul(2).sub(1),
                depthSample
            );
            const viewH = reconProjInvLocal.mul(vec4(ndc, 1));
            const groundView = viewH.div(viewH.w).xyz;

            // Band half-width recomputed PER FRAGMENT from the reconstructed
            // surface point's own distance (reference semantics): keeps the
            // band width correct under oblique views where the volume shell
            // sits far above/below the actual terrain fragment.
            const halfMaxWidth = this.halfWidthPx
                .mul(this.pixelsPerMeterFactor)
                .mul(groundView.z.abs());
            const widthDist = abs(vRightPlane.xyz.dot(groundView).add(vRightPlane.w));
            const dFromStart = vStartPlane.xyz.dot(groundView).add(vStartPlane.w);
            const dFromEnd = vEndPlane.xyz.dot(groundView).add(vEndPlane.w);

            const isSky = mix(
                step(float(0.9999), depthSample),
                step(depthSample, float(0.0001)),
                skyRevUniform
            );
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const hwAny: any = halfMaxWidth;
            const insideF: any = float(1)
                .sub(step(hwAny, widthDist))
                .mul(step(float(0), dFromStart))
                .mul(step(float(0), dFromEnd))
                .mul(float(1).sub(isSky));

            const painted = vec4(vec3(1.0, 0.85, 0.0).mul(insideF), insideF);
            return mix(painted, vec4(1, 0, 1, 1), step(float(0.5), this.debug));
        })();
    }

    /**
     * NodeMaterial extension point (the same mechanism sprites use): return
     * the expanded view-space position instead of `modelViewMatrix * local`.
     */
    public setupPositionView(/* builder */): any {
        return this.expandedEc;
    }

    /**
     * Depth-clamp VS-half, adapted to WebGPU clip conventions:
     * force clip z into the middle of [0, w] so the near/far planes can
     * never clip the volume shell. The fragment stage keeps depth testing
     * and writing disabled, matching the blend-only
     * output, so no FS depth compensation is required.
     */
    public setupModelViewProjection(): any {
        const proj: any = cameraProjectionMatrix;
        const clip = proj.mul(this.expandedEc);
        return vec4(clip.x, clip.y, clip.w.mul(0.5), clip.w);
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

        // Route through the custom vertex hooks (same structure as the
        // curtain) so the depth-clamp below is guaranteed to be applied.
        this.setupPositionView = () => positionLocal;

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

    /**
     * Depth clamp: park clip z in the
     * middle of [0,w] so the near/far planes never clip the volume shell,
     * eliminating close-range holes when the camera flies into it. Depth
     * test/write stay disabled, matching the blend-only output.
     */
    public setupModelViewProjection(): any {
        const mv = modelViewMatrix.mul(vec4(positionLocal, 1.0));
        const clip = cameraProjectionMatrix.mul(mv);
        return vec4(clip.x, clip.y, clip.w.mul(0.5), clip.w);
    }
}
