// @ts-nocheck
/* Copyright (C) 2025 flywave.gl contributors */
// (TSL node types are intentionally loose — same convention as the other
// effect/node files: fogLight, TemporalAntialiasNode, bloom.)

import {
    cameraNear,
    depthToViewZ,
    inverseProjectionMatrix,
    projectionMatrix,
    screenToPositionView
} from "@flywave/flywave-atmosphere";
import {
    Break,
    clamp,
    exp,
    float,
    Fn,
    fract,
    If,
    int,
    Loop,
    max,
    min,
    mix,
    normalize,
    pow,
    reflect,
    screenUV,
    select,
    step,
    texture,
    uniform,
    vec2,
    vec3,
    vec4
} from "three/tsl";
import type { type TextureNode, Camera, Node } from "three/webgpu";
import {
    HalfFloatType,
    LinearFilter,
    NodeMaterial,
    NodeUpdateType,
    QuadMesh,
    RendererUtils,
    RenderTarget,
    TempNode,
    Vector2
} from "three/webgpu";

/**
 * Screen-space reflections (SSR), ported from navara's ssr.frag / cone
 * resolve (kode80SSR / McGuire lineage, Stachowiak 2015 resolve), adapted to
 * this engine's TSL node pipeline.
 *
 * Three internal stages, all pure screen-space over the already-rendered
 * scene pass (no second scene render):
 *
 *   1. raymarch (half-res RT): for every pixel whose `ssrData` MRT mask has
 *      reflectivity ≥ 0.01, reflect the view ray off the stored view-space
 *      normal and march it through homogeneous screen space (navara's DDA:
 *      200 steps, 2 px stride near the camera tapering to unit pixels from
 *      100 m out, deterministic for smooth surfaces) against the pass depth.
 *      A crossing is refined by binary search and accepted when the ray
 *      penetrates less than `thickness` — the guard against reflecting
 *      through walls and against self-intersection on the reflector itself.
 *      Output: premultiplied reflection color + coverage.
 *   2. resolve (half-res RT): 5×5 joint-bilateral gather (Gaussian ×
 *      view-Z similarity) denoises the jittered raymarch and turns the
 *      coverage into soft reflection edges (misses dilute coverage instead
 *      of hardening it).
 *   3. composite (chain node): `mix(baseColor, reflection.rgb, coverage)`,
 *      inserted at the head of the VRM effect chain (linear, pre-tonemap).
 *
 * Depth conventions (see flywave-dev skill, iron rule 1): the engine uses a
 * REVERSED depth buffer — the pass depth texture is fed straight into
 * `depthToViewZ`, whose three.js implementation un-reverses internally;
 * cleared depth is 0, which maps to the far plane, so sky pixels naturally
 * read as "no geometry within any ray distance". All texture reads use
 * texel-center UV sampling (`.sample(uv)`), never `.load(screenCoordinate)`
 * — the documented post-chain zero-read trap. Projection round-trips mirror
 * `screenToPositionView`'s flipY convention: forward-projected NDC uv is
 * flipped back before sampling scene textures.
 *
 * Which pixels reflect is decided by the `ssrData` MRT attachment, written
 * per material by `MapRenderingManager.addReflectiveObject`
 * (`mrtNode = mrt({ ssrData: vec4(packedNormal, reflectivity, roughness) })`)
 * with a pass-level default of vec4(0) — untagged geometry is simply skipped.
 */

/** navara `iterations` default — max DDA steps (uniform loop bound + Break). */
const MARCH_STEPS = 200;
/** Upper bound for the binary-search refinement (early-broken per config). */
const MAX_BINARY_STEPS = 8;
/** Base pixel stride near the camera (navara `pixelStride` default = 1 — the
 * slab test is only sound while a step's z-span stays ~1 px thick; a larger
 * base stride makes near/mid-range rays step clean through every slab). */
const BASE_PIXEL_STRIDE = 1;
/** Distance (m) where the stride reaches unit-pixel (navara default). */
const PIXEL_STRIDE_Z_CUTOFF = 100;

/** 5×5 Gaussian kernel, σ = 1.5, index = (dy+2)*5 + (dx+2). */
const GAUSSIAN_5X5: number[] = (() => {
    const sigma2 = 2 * 1.5 * 1.5;
    const kernel: number[] = [];
    for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
            kernel.push(Math.exp(-(dx * dx + dy * dy) / sigma2));
        }
    }
    return kernel;
})();

/**
 * Octahedral normal packing — vec3 unit normal → vec2 in [0,1]. Used by the
 * material-side `ssrData` MRT entry (see MapRenderingManager) and decoded by
 * the raymarch stage.
 */
export const packOctahedralNormal = (n: Node<"vec3">): Node<"vec2"> => {
    const p = n.xy.div(n.x.abs().add(n.y.abs()).add(n.z.abs())).toVar();
    const wrap = vec2(1, 1).sub(p.yx.abs()).mul(sign2(p.xy)).toVar();
    return select(n.z.lessThan(0), wrap, p).mul(0.5).add(0.5);
};

/** Inverse of {@link packOctahedralNormal}. */
export const unpackOctahedralNormal = (f: Node<"vec2">): Node<"vec3"> => {
    const e = f.mul(2).sub(1).toVar();
    const n = vec3(e.x, e.y, float(1).sub(e.x.abs()).sub(e.y.abs())).toVar();
    const t = n.z.negate().max(0).toVar();
    n.x.addAssign(select(n.x.greaterThanEqual(0), t.negate(), t));
    n.y.addAssign(select(n.y.greaterThanEqual(0), t.negate(), t));
    return normalize(n);
};

const sign2 = (v: Node<"vec2">): Node<"vec2"> => vec2(v.x.sign(), v.y.sign());

/** Interleaved gradient noise (Jimenez 2014) — per-pixel march jitter. */
const ignNoise = (uv: Node<"vec2">): Node<"float"> =>
    fract(dot2(uv, vec2(0.06711056, 0.00583715)).mul(52.9829189).fract());

const dot2 = (a: Node<"vec2">, b: Node<"vec2">): Node<"float"> => a.x.mul(b.x).add(a.y.mul(b.y));

/** Schlick fresnel with F0 = reflectivity (the mask doubles as F0). */
const fresnelSchlick = (cosTheta: Node<"float">, f0: Node<"float">): Node<"float"> =>
    f0.add(f0.oneMinus().mul(pow(clamp(cosTheta, 0, 1), 5)));

const sizeScratch = new Vector2();

export class SSRNode extends TempNode {
    static override get type(): string {
        return "SSRNode";
    }

    colorNode: TextureNode;
    depthNode: TextureNode;
    ssrDataNode: TextureNode;
    camera: Camera;

    /** Live-tunable parameters (uniforms — config changes never rebuild). */
    uMaxDistance = uniform(5000);
    uThickness = uniform(2);
    uEdgeFade = uniform(0.9);
    uMaxRoughness = uniform(0.6);
    uIntensity = uniform(1);
    uBinarySteps = uniform(4);
    /** Internal RT size — the DDA marches in HALF-RES pixel space (matching
     * navara, whose `resolution` uniform is its scaled render target size)
     * and all pixel→UV conversions divide by this. */
    uRtSize = uniform(vec2(1, 1));
    /** Debug visualization mode (see ISSREffect.debug). */
    uDebug = uniform(0);
    /** 0.25–1; consumed by setSize, not by the shaders. */
    resolutionScale = 0.5;

    private readonly raymarchRT = this.createRenderTarget("Raymarch");
    private readonly resolveRT = this.createRenderTarget("Resolve");
    private readonly raymarchMaterial = new NodeMaterial();
    private readonly resolveMaterial = new NodeMaterial();
    private readonly mesh = new QuadMesh();
    private _rendererState?: RendererUtils.RendererState;

    constructor(
        colorNode: TextureNode,
        depthNode: TextureNode,
        ssrDataNode: TextureNode,
        camera: Camera
    ) {
        super("vec4");
        this.updateBeforeType = NodeUpdateType.FRAME;
        this.colorNode = colorNode;
        this.depthNode = depthNode;
        this.ssrDataNode = ssrDataNode;
        this.camera = camera;
        this.raymarchMaterial.name = "SSR [Raymarch]";
        this.resolveMaterial.name = "SSR [Resolve]";
        this.mesh.name = "SSR";
    }

    private createRenderTarget(name: string): RenderTarget {
        const rt = new RenderTarget(1, 1, { depthBuffer: false, type: HalfFloatType });
        rt.texture.minFilter = LinearFilter;
        rt.texture.magFilter = LinearFilter;
        rt.texture.name = `SSR [${name}]`;
        return rt;
    }

    setConfig(config: {
        maxRayDistance: number;
        thickness: number;
        edgeFade: number;
        maxRoughness: number;
        intensity: number;
        binarySearchIterations: number;
        resolutionScale: number;
        debug?: number;
    }): void {
        this.uMaxDistance.value = config.maxRayDistance;
        this.uThickness.value = config.thickness;
        this.uEdgeFade.value = config.edgeFade;
        this.uMaxRoughness.value = config.maxRoughness;
        this.uIntensity.value = config.intensity;
        this.uBinarySteps.value = config.binarySearchIterations;
        this.uDebug.value = config.debug ?? 0;
        this.resolutionScale = config.resolutionScale;
    }

    private setSize(width: number, height: number): void {
        const w = Math.max(1, Math.floor(width * this.resolutionScale));
        const h = Math.max(1, Math.floor(height * this.resolutionScale));
        if (this.raymarchRT.width !== w || this.raymarchRT.height !== h) {
            this.raymarchRT.setSize(w, h);
            this.resolveRT.setSize(w, h);
            this.uRtSize.value.set(w, h);
        }
    }

    override updateBefore({ renderer }: any): void {
        if (renderer == null) return;
        const size = renderer.getDrawingBufferSize(sizeScratch);
        this.setSize(size.x, size.y);

        this._rendererState = RendererUtils.resetRendererState(renderer, this._rendererState);

        renderer.setRenderTarget(this.raymarchRT);
        this.mesh.material = this.raymarchMaterial;
        this.mesh.render(renderer);

        renderer.setRenderTarget(this.resolveRT);
        this.mesh.material = this.resolveMaterial;
        this.mesh.render(renderer);

        RendererUtils.restoreRendererState(renderer, this._rendererState);
    }

    /**
     * Stage 1 — faithful TSL port of navara's traceScreenSpaceRay (kode80 /
     * McGuire screen-space DDA): the ray is projected into HALF-RES pixel
     * space once, then advanced in homogeneous screen space (PQK/dPQK
     * perspective-correct derivatives) with a distance-adaptive pixel stride
     * — 2 px next to the camera, UNIT-PIXEL steps from 100 m out (navara
     * defaults). The hit test is navara's surface slab: the step's z-span
     * must be CONTAINED in [sceneZ − thickness, sceneZ]. That test is only
     * sound for the ~1-px z-spans this stride produces — the first attempt
     * here used a 5 px base stride, whose multi-meter spans step clean
     * through every slab, which is why nothing but grazing junk ever hit.
     */
    private setupRaymarch(): Node {
        const depthNode = this.depthNode;
        const ssrDataNode = this.ssrDataNode;
        const colorNode = this.colorNode;
        const camera = this.camera;

        return Fn(() => {
            const uv = screenUV;
            // Full-screen quad: EVERY pixel writes (vec4(0) = no reflection).
            const result = vec4(0, 0, 0, 0).toVar();
            // March outcome at Fn scope so the debug branch can encode it.
            const hitUv = vec2(0).toVar();
            const hitWeight = float(0).toVar();

            const data = ssrDataNode.sample(uv).toVar();
            const reflectivity = data.z;
            const roughness = data.w;

            If(reflectivity.greaterThan(0.01).and(roughness.lessThan(this.uMaxRoughness)), () => {
                // Texel-center UV read (textureLoad reads zeros post-chain).
                const depth = depthNode.sample(uv).r;
                // Reversed depth: 0 = sky/cleared, geometry > 0.
                If(depth.greaterThan(0), () => {
                    const viewZ = depthToViewZ(depth, camera).toVar();
                    const rayOrigin = screenToPositionView(
                        uv,
                        depth,
                        viewZ,
                        projectionMatrix(camera),
                        inverseProjectionMatrix(camera)
                    ).toVar();
                    const viewDir = normalize(rayOrigin).toVar();
                    const normal = unpackOctahedralNormal(data.xy).toVar();
                    const facing = viewDir.negate().dot(normal).toVar();
                    const rayDirection = reflect(viewDir, normal).toVar();

                    If(facing.greaterThan(0), () => {
                        // Fresnel: the reflectivity mask doubles as F0.
                        const f0 = fresnelSchlick(facing, reflectivity).toVar();

                        // Clip the ray end against the near plane (navara).
                        const rayLength = select(
                            rayOrigin.z
                                .add(rayDirection.z.mul(this.uMaxDistance))
                                .greaterThan(cameraNear(camera).negate()),
                            cameraNear(camera).negate().sub(rayOrigin.z).div(rayDirection.z),
                            this.uMaxDistance
                        ).toVar();
                        const rayEnd = rayOrigin.add(rayDirection.mul(rayLength)).toVar();

                        // Project into homogeneous clip space (navara).
                        const proj = projectionMatrix(camera);
                        const H0 = proj.mul(vec4(rayOrigin, 1)).toVar();
                        const H1 = proj.mul(vec4(rayEnd, 1)).toVar();
                        const k0 = float(1).div(H0.w).toVar();
                        const k1 = float(1).div(H1.w).toVar();
                        const Q0 = rayOrigin.mul(k0).toVar();
                        const Q1 = rayEnd.mul(k1).toVar();
                        // NDC → texture uv (flipY matches
                        // screenToPositionView's convention) → pixels.
                        const P0 = H0.xy
                            .mul(k0)
                            .mul(0.5)
                            .add(0.5)
                            .flipY()
                            .mul(this.uRtSize)
                            .toVar();
                        const P1 = H1.xy
                            .mul(k1)
                            .mul(0.5)
                            .add(0.5)
                            .flipY()
                            .mul(this.uRtSize)
                            .toVar();

                        // A degenerate line still covers one pixel.
                        const dP0P1 = P0.sub(P1).toVar();
                        P1.addAssign(select(dP0P1.dot(dP0P1).lessThan(0.0001), 0.01, 0));

                        const delta = P1.sub(P0).toVar();
                        // Permute so the primary iteration runs along x.
                        const permute = delta.x.abs().lessThan(delta.y.abs()).toVar();
                        delta.assign(select(permute, vec2(delta.y, delta.x), delta));
                        P0.assign(select(permute, vec2(P0.y, P0.x), P0));
                        P1.assign(select(permute, vec2(P1.y, P1.x), P1));

                        const stepDir = delta.x.sign().toVar();
                        const invdx = stepDir.div(delta.x).toVar();
                        const dQ = Q1.sub(Q0).mul(invdx).toVar();
                        const dk = k1.sub(k0).mul(invdx).toVar();
                        const dP = vec2(stepDir, delta.y.mul(invdx)).toVar();

                        // Distance-adaptive stride (navara): unit pixel
                        // steps at range keep each step's z-span small,
                        // which is exactly what the slab test presumes.
                        const strideScaler = float(1)
                            .sub(min(float(1), rayOrigin.z.negate().div(PIXEL_STRIDE_Z_CUTOFF)))
                            .toVar();
                        const pixelStride = float(1)
                            .add(strideScaler.mul(BASE_PIXEL_STRIDE))
                            .toVar();

                        dP.mulAssign(pixelStride);
                        dQ.mulAssign(pixelStride);
                        dk.mulAssign(pixelStride);
                        // navara defaults `jitter` to 0 (deterministic
                        // march); enable it only for visibly rough
                        // surfaces so mirrors stay noise-free.
                        const jitter = ignNoise(uv.mul(this.uRtSize)).mul(
                            clamp(roughness.sub(0.05).max(0).mul(4), 0, 1)
                        );
                        P0.addAssign(dP.mul(jitter));
                        Q0.addAssign(dQ.mul(jitter));
                        k0.addAssign(dk.mul(jitter));

                        const PQK = vec4(P0.x, P0.y, Q0.z, k0).toVar();
                        const dPQK = vec4(dP.x, dP.y, dQ.z, dk).toVar();
                        const zA = float(0).toVar();
                        const zB = float(0).toVar();
                        const hitPixelPx = vec2(0).toVar();
                        const intersect = float(0).toVar();
                        const iterCount = float(0).toVar();

                        Loop(
                            {
                                start: int(0),
                                end: int(MARCH_STEPS),
                                type: "int",
                                condition: "<"
                            },
                            ({ i }) => {
                                If(intersect.greaterThan(0.5), () => {
                                    Break();
                                });
                                PQK.addAssign(dPQK);
                                zA.assign(zB);
                                zB.assign(
                                    dPQK.z.mul(0.5).add(PQK.z).div(dPQK.w.mul(0.5).add(PQK.w))
                                );
                                const zFront = max(zA, zB).toVar();
                                const zBack = min(zA, zB).toVar();
                                hitPixelPx.assign(
                                    select(permute, vec2(PQK.y, PQK.x), vec2(PQK.x, PQK.y))
                                );
                                const stepUv = hitPixelPx.div(this.uRtSize).toVar();
                                const sceneViewZ = depthToViewZ(
                                    depthNode.sample(stepUv).r,
                                    camera
                                ).toVar();
                                // navara's slab test, verbatim: step z-span
                                // contained in [sceneZ − thickness,
                                // sceneZ]. Sky (reversed depth 0) maps to
                                // −far and can never contain a span.
                                const hit = zFront
                                    .lessThanEqual(sceneViewZ)
                                    .and(zBack.greaterThanEqual(sceneViewZ.sub(this.uThickness)));
                                If(hit, () => {
                                    intersect.assign(1);
                                });
                                iterCount.assign(float(i));
                            }
                        );

                        // Binary search refinement (navara verbatim).
                        If(pixelStride.greaterThan(1).and(intersect.greaterThan(0.5)), () => {
                            PQK.subAssign(dPQK);
                            dPQK.divAssign(pixelStride);
                            zA.assign(PQK.z.div(PQK.w));
                            zB.assign(zA);
                            const originalStride = pixelStride.mul(0.5).toVar();
                            const stride = originalStride.toVar();
                            Loop(
                                {
                                    start: int(0),
                                    end: int(MAX_BINARY_STEPS),
                                    type: "int",
                                    condition: "<"
                                },
                                ({ i }) => {
                                    If(float(i).greaterThanEqual(this.uBinarySteps), () => {
                                        Break();
                                    });
                                    PQK.addAssign(dPQK.mul(stride));
                                    zA.assign(zB);
                                    zB.assign(
                                        dPQK.z.mul(-0.5).add(PQK.z).div(dPQK.w.mul(-0.5).add(PQK.w))
                                    );
                                    hitPixelPx.assign(
                                        select(permute, vec2(PQK.y, PQK.x), vec2(PQK.x, PQK.y))
                                    );
                                    const refineUv = hitPixelPx.div(this.uRtSize).toVar();
                                    const refineZ = depthToViewZ(
                                        depthNode.sample(refineUv).r,
                                        camera
                                    ).toVar();
                                    const zFront2 = max(zA, zB).toVar();
                                    const zBack2 = min(zA, zB).toVar();
                                    const hit2 = zFront2
                                        .lessThanEqual(refineZ)
                                        .and(zBack2.greaterThanEqual(refineZ.sub(this.uThickness)));
                                    originalStride.mulAssign(0.5);
                                    // Hit → walk back; miss → forward.
                                    stride.assign(
                                        hit2.select(originalStride.negate(), originalStride)
                                    );
                                }
                            );
                        });

                        If(intersect.greaterThan(0.5), () => {
                            const hitUvFinal = hitPixelPx.div(this.uRtSize).toVar();
                            hitUv.assign(hitUvFinal);

                            // navara's alpha fades, ported:
                            // iteration count, screen edge, eye direction,
                            // ray distance.
                            const alpha = iterCount.div(MARCH_STEPS).oneMinus().toVar();
                            const hitNdc = hitUvFinal.mul(2).sub(1).toVar();
                            const maxNdc = max(hitNdc.x.abs(), hitNdc.y.abs()).toVar();
                            alpha.mulAssign(
                                float(1)
                                    .sub(
                                        maxNdc
                                            .sub(this.uEdgeFade)
                                            .max(0)
                                            .div(float(1).sub(this.uEdgeFade).max(0.001))
                                    )
                                    .max(0)
                            );
                            // navara map app: eyeFadeStart 0.4, eyeFadeEnd
                            // 0.8 — rays turning back toward the eye fade
                            // out across that band, steeper ones are cut.
                            alpha.mulAssign(
                                float(1).sub(clamp(rayDirection.z, 0.4, 0.8).sub(0.4).div(0.4))
                            );
                            // hit point (navara): Q0 advanced by count
                            // steps, z/k from the final PQK.
                            const hitQ = Q0.toVar();
                            hitQ.xy.addAssign(dQ.xy.mul(iterCount));
                            hitQ.z.assign(PQK.z);
                            const hitPoint = hitQ.div(PQK.w).toVar();
                            const rayDistance = hitPoint.sub(rayOrigin).length().toVar();
                            alpha.mulAssign(
                                float(1).sub(clamp(rayDistance.div(this.uMaxDistance), 0, 1))
                            );
                            alpha.mulAssign(f0);

                            const weight = alpha.mul(this.uIntensity).toVar();
                            If(weight.greaterThan(0), () => {
                                hitWeight.assign(weight);
                                const reflectionColor = colorNode.sample(hitUvFinal).rgb;
                                result.assign(vec4(reflectionColor.mul(weight), weight));
                            });
                        });
                    });
                });
            });

            // Debug visualization (postEffects.ssr.debug):
            //   1 — R/G = sampled screen UV of the hit, B = weight ×4;
            //       dim green = tagged + marched but missed; black = untagged.
            //   2 — unpacked view-space surface normal as RGB.
            If(this.uDebug.greaterThan(0.5).and(reflectivity.greaterThan(0.01)), () => {
                If(this.uDebug.greaterThan(1.5), () => {
                    result.assign(vec4(unpackOctahedralNormal(data.xy).mul(0.5).add(0.5), 1));
                }).Else(() => {
                    result.assign(
                        hitWeight
                            .lessThanEqual(0)
                            .select(
                                vec4(0, 0.25, 0, 1),
                                vec4(hitUv, clamp(hitWeight.mul(4), 0, 1), 1)
                            )
                    );
                });
            });

            return result;
        })();
    }

    /**
     * Stage 2 — 5×5 joint-bilateral denoise: Gaussian spatial weight ×
     * view-Z similarity; misses dilute coverage (soft edges) without
     * contributing color.
     */
    private setupResolve(): Node {
        const raymarchNode = this.raymarchRT.texture;
        const depthNode = this.depthNode;
        const ssrDataNode = this.ssrDataNode;
        const camera = this.camera;

        return Fn(() => {
            const uv = screenUV;
            const centerViewZ = depthToViewZ(depthNode.sample(uv).r, camera).abs().max(1).toVar();
            // Roughness-scaled blur radius: a mirror (roughness ≈ 0.02) keeps
            // its taps within a fraction of a texel (sharp), rough surfaces
            // spread the full kernel. Jitter in the raymarch stage scales the
            // same way, so noise and blur appear together.
            const centerRoughness = ssrDataNode.sample(uv).w;
            const blurScale = max(centerRoughness.mul(5), 0.15).toVar();

            const sumRgb = vec3(0).toVar();
            const validW = float(0).toVar();
            const totalW = float(0).toVar();

            const rtSize = this.uRtSize;
            for (let k = 0; k < GAUSSIAN_5X5.length; k++) {
                const dx = (k % 5) - 2;
                const dy = Math.floor(k / 5) - 2;
                const tapUv = uv.add(vec2(dx, dy).mul(blurScale).div(rtSize)).toVar();
                const tap = texture(raymarchNode, tapUv).toVar();
                const tapViewZ = depthToViewZ(depthNode.sample(tapUv).r, camera).abs().toVar();
                // Relative depth similarity: 0.5 m offset at 100 m range
                // stays ~1, a different surface (10 m at 100 m) collapses.
                const relDepth = tapViewZ.sub(centerViewZ).abs().div(centerViewZ).toVar();
                const w = float(GAUSSIAN_5X5[k])
                    .mul(exp(relDepth.mul(-12)))
                    .toVar();
                totalW.addAssign(w);
                validW.addAssign(step(0.001, tap.a).mul(w));
                sumRgb.addAssign(tap.rgb.mul(w));
            }

            const coverage = validW.div(max(totalW, 1e-4)).toVar();
            const avgRgb = sumRgb.div(max(validW, 1e-4)).toVar();
            return vec4(avgRgb, coverage);
        })();
    }

    override setup(): Node {
        this.raymarchMaterial.fragmentNode = this.setupRaymarch();
        this.resolveMaterial.fragmentNode = this.setupResolve();

        return Fn(() => {
            const base = this.colorNode.sample(screenUV);
            const reflection = texture(this.resolveRT.texture, screenUV).toVar();
            // Premultiplied composite: reflection REPLACES the base color
            // weighted by denoised coverage (navara ssrEffect.frag semantics).
            return vec4(mix(base.rgb, reflection.rgb, reflection.a), base.a);
        })();
    }

    override dispose(): void {
        this.raymarchRT.dispose();
        this.resolveRT.dispose();
        this.raymarchMaterial.dispose();
        this.resolveMaterial.dispose();
        this.mesh.geometry.dispose();
        super.dispose();
    }
}

/**
 * VRM chain entry: insert at the head of the effect chain (linear domain,
 * before clouds/aerial/tone mapping) — the earliest point where the full
 * lit+depth scene exists.
 */
export function ssr(
    colorNode: TextureNode,
    depthNode: TextureNode,
    ssrDataNode: TextureNode,
    camera: Camera
): SSRNode {
    return new SSRNode(colorNode, depthNode, ssrDataNode, camera);
}
