/* Copyright (C) 2025 flywave.gl contributors */

export type QualityPreset = "low" | "medium" | "high" | "ultra";

/**
 * Configuration for a single cloud layer.
 *
 * Up to four layers are packed into the weather texture's R/G/B/A channels.
 * Layers are evaluated independently; their height bands may overlap, in which
 * case the shader merges them into raymarch intervals.
 */
export interface CloudLayerConfig {
    /**
     * Weather texture channel this layer samples. Each layer must use a
     * distinct channel.
     *
     * @default "r" (layer 0), "g" (1), "b" (2), "a" (3)
     */
    channel?: "r" | "g" | "b" | "a";

    /**
     * Base altitude of the layer above sea level, in meters.
     *
     * Range: `[0, +∞)`. Typical cumulus ~500–2000 m, cirrus ~6000–12000 m.
     *
     * @default 0
     */
    altitude?: number;

    /**
     * Thickness of the layer in meters. `0` disables the layer.
     *
     * Range: `[0, +∞)`. Typical 100–2000 m.
     *
     * @default 0
     */
    height?: number;

    /**
     * Multiplier on the sampled cloud density for this layer. Final density is
     * clamped to `[0, 1]` in the shader, so very large values saturate.
     *
     * Range: `[0, +∞)` (values >1 saturate). Typical 0.003 (wispy cirrus) to
     * 0.2 (dense cumulus).
     *
     * @default 0.2
     */
    densityScale?: number;

    /**
     * Blend weight of the low-frequency shape texture (0 = smooth/homogeneous,
     * 1 = fully detailed).
     *
     * Range: `[0, 1]`.
     *
     * @default 1
     */
    shapeAmount?: number;

    /**
     * Blend weight of the high-frequency shape-detail texture. Adds fine
     * structure ("cauliflower") on top of the base shape.
     *
     * Range: `[0, 1]`.
     *
     * @default 1
     */
    shapeDetailAmount?: number;

    /**
     * Exponent applied to the weather texture value (via `exp(n · log(tex))`).
     * Values <1 spread coverage (more cloud area), >1 concentrate it (clumpier,
     * denser cores with clearer gaps).
     *
     * Range: `(0, +∞)`. Recommended `0.5`–`3`. Must be >0 (a value of 0 with
     * weather tex = 0 yields `exp(-∞)` artifacts).
     *
     * @default 1
     */
    weatherExponent?: number;

    /**
     * Reshapes the vertical density profile via `pow(heightFraction, bias)`.
     * <1 concentrates density toward the top, >1 toward the bottom, 1 leaves
     * it uniform.
     *
     * Range: `(0, +∞)`. Recommended `0.2`–`3`.
     *
     * @default 0.35
     */
    shapeAlteringBias?: number;

    /**
     * Width of the coverage edge filter; controls softness of cloud edges.
     * Larger = softer, more diffuse edges.
     *
     * Range: `[0, 1]`.
     *
     * @default 0.6
     */
    coverageFilterWidth?: number;

    /**
     * Whether this layer casts/receives shadows within the cloud shadow
     * march. Layers above the camera typically set `true`; high cirrus layers
     * often set `false` to save performance.
     *
     * @default false
     */
    shadow?: boolean;

    /**
     * Vertical density profile coefficients. The density at altitude is
     * `expTerm·exp(-exponent·h) + linearTerm·h + constantTerm`, evaluated per
     * layer. Leave undefined for the default near-linear profile.
     */
    densityProfile?: {
        expTerm?: number;
        exponent?: number;
        linearTerm?: number;
        constantTerm?: number;
    };
}

/**
 * Volumetric cloud configuration. All fields are optional; a `quality` preset
 * seeds the defaults and the remaining fields override individual values.
 *
 * Units: lengths are in meters, velocities in UV units/second, angles in
 * radians unless noted.
 */
export interface CloudConfig {
    /**
     * Quality preset. Seeds a bundle of iteration counts, step sizes and
     * shadow parameters appropriate to the GPU tier. Any explicit field below
     * overrides the preset value.
     *
     * - `"low"` — fastest, coarsest, ~200 steps.
     * - `"medium"` — balanced.
     * - `"high"` — default-quality reference (~500 steps).
     * - `"ultra"` — accurate phase function, smaller steps, 1024-shadow-map.
     *
     * @default "high"
     */
    quality?: QualityPreset;

    /**
     * Whether to use temporal upscaling. When `true` (default), clouds are
     * raymarched at 1/N resolution (see {@link resolutionScale}) and temporally
     * accumulated to full resolution with a Bayer 4×4 jitter + variance-clipped
     * history reprojection. Much faster, with minor ghosting on fast motion.
     *
     * When `false`, clouds render at full resolution every frame
     * (pixel-perfect, but ~16× the pixel cost at the default `resolutionScale`
     * of 4). Disable only on very high-end GPUs or for static scenes where
     * temporal ghosting is unacceptable.
     *
     * @default true
     */
    temporalUpscale?: boolean;

    /**
     * Cloud render resolution downscale factor. Clouds are rendered at
     * `1 / resolutionScale` of the frame size. Only takes effect when
     * {@link temporalUpscale} is `true` (when `false`, clouds always render at
     * full resolution regardless of this value).
     *
     * Range: `{ 1, 2, 4, 8 }` recommended (must divide the frame evenly).
     * Larger = faster but coarser (more temporal ghosting). 4 is the
     * reference default; 2 is a quality/perform middle ground; 8 for mobile.
     *
     * @default 4
     */
    resolutionScale?: number;

    /**
     * Whether to compute per-sample sky/sun irradiance accurately (calls the
     * atmospheric illuminance integrator at every raymarch sample). When
     * `false`, irradiance is linearly interpolated between precomputed values
     * at the layer top and bottom — much cheaper, slightly less accurate near
     * the horizon and at steep sun angles.
     *
     * @default true
     */
    accurateSunSkyLight?: boolean;

    /**
     * Whether light-shaft / volumetric shadow-length accumulation is enabled.
     * When `true`, an additional march along the view ray accumulates the
     * cloud's shadow-length into the aerial-perspective buffer, producing
     * visible god-rays / light shafts through cloud gaps near the sun.
     *
     * Implemented as `maxShadowLengthIterationCount > 0`; disabling sets it to
     * 0. Costly — disabled in the `"low"` preset.
     *
     * @default true
     */
    lightShafts?: boolean;

    /**
     * Whether shape-detail high-frequency noise is sampled. When `false`, only
     * the low-frequency shape texture is used (smoother, cheaper clouds). This
     * is a runtime check on `shapeDetailAmount`; setting `false` here overrides
     * all layers to `shapeDetailAmount = 0`.
     *
     * @default true
     */
    shapeDetail?: boolean;

    /**
     * Whether domain-warping turbulence is applied to the shape field. When
     * `false`, the turbulence texture is not sampled (saves a texture fetch
     * per sample) and shape/detail positions are unwarped — clouds look less
     * wispy/organic.
     *
     * @default true
     */
    turbulence?: boolean;

    /**
     * Number of multi-scattering octaves used in the analytical multi-
     * scattering approximation. Each octave contributes with a 0.5 attenuation,
     * so values >8 have negligible effect. Lower values are cheaper but
     * under-estimate in-scattered light (darker cloud cores).
     *
     * Range: `[1, 8]`.
     *
     * @default 8
     */
    multiScatteringOctaves?: number;

    /**
     * Global cloud coverage. Combined with per-layer height to gate where
     * clouds form. Not clamped by the shader, but the visual range is
     * effectively `[0, 1]`: 0 = clear sky, 1 = full overcast. Values >1
     * saturate to overcast.
     *
     * Range: `[0, 1]` recommended.
     *
     * @default 0.3
     */
    coverage?: number;

    /**
     * Per-layer definitions. Up to four layers (R/G/B/A channels). When
     * omitted, three Earth-like default layers are used (low cumulus,
     * mid cumulus, high cirrus).
     *
     * @default CloudLayers.DEFAULT (3 layers)
     */
    layers?: CloudLayerConfig[];

    // ─── Scattering / phase ──────────────────────────────────────────────

    /**
     * Multiplier on the cloud's scattered light intensity (forward + back).
     * Increase for brighter clouds.
     *
     * Range: `[0, +∞)`. Typical 0.5–3.
     *
     * @default 1
     */
    scatteringCoefficient?: number;

    /**
     * Multiplier on absorbed light (darkens clouds). Subtract from the
     * scattering coefficient for net transmittance behavior.
     *
     * Range: `[0, +∞)`. Typical 0–1.
     *
     * @default 0
     */
    absorptionCoefficient?: number;

    /**
     * First Henyey–Greenstein anisotropy parameter `g`. Controls the dominant
     * scattering direction: positive = forward-scattering (bright fringe
     * around the sun), negative = back-scattering.
     *
     * Range: `[-1, 1]` (HG definition; |g|>1 produces NaN). Typical 0.5–0.9.
     *
     * @default 0.7
     */
    scatterAnisotropy1?: number;

    /**
     * Second HG anisotropy parameter for the back-scattering lobe of the
     * dual-HG phase function. Usually negative.
     *
     * Range: `[-1, 1]`. Typical -0.5–-0.1.
     *
     * @default -0.2
     */
    scatterAnisotropy2?: number;

    /**
     * Blend factor between the two HG lobes. 0 = only lobe 1, 1 = only lobe 2.
     *
     * Range: `[0, 1]`.
     *
     * @default 0.5
     */
    scatterAnisotropyMix?: number;

    /**
     * Use the more accurate Draine+HG Mie-fit phase function instead of the
     * cheaper dual-Henye–Greenstein approximation. ~10–20% more ALU.
     *
     * @default false (true only on `"ultra"` preset)
     */
    accuratePhaseFunction?: boolean;

    // ─── Lighting scales ─────────────────────────────────────────────────

    /**
     * Multiplier on sky-light (ambient dome) contribution to cloud lighting.
     *
     * Range: `[0, +∞)`. Typical 0.5–2.
     *
     * @default 1
     */
    skyLightScale?: number;

    /**
     * Multiplier on bounced light from the ground illuminating cloud bases.
     *
     * Range: `[0, +∞)`. Typical 0–2.
     *
     * @default 1
     */
    groundBounceScale?: number;

    /**
     * Strength of the powder effect (dark edges where light grazes dense
     * cloud edges, caused by multiple scattering near the surface).
     *
     * Range: `[0, +∞)`. Typical 0.5–1.5.
     *
     * @default 0.8
     */
    powderScale?: number;

    /**
     * Exponent of the powder extinction term `exp(-extinction · powderExponent)`.
     * Larger = sharper powder darkening.
     *
     * Range: `[0, +∞)`. Typical 50–300.
     *
     * @default 150
     */
    powderExponent?: number;

    // ─── Primary raymarch ────────────────────────────────────────────────

    /**
     * Maximum primary-ray march steps. Dominant cost driver; halving roughly
     * halves GPU time. Too few steps causes banding/holes in thick clouds.
     *
     * Range: `[1, +∞)`. Typical 50 (mobile) – 500 (desktop).
     *
     * @default 500
     */
    maxIterationCount?: number;

    /**
     * Minimum step length in meters along the primary ray. Prevents
     * infinite-looping on thin features; too large misses detail.
     *
     * Range: `(0, +∞)`. Typical 10–100.
     *
     * @default 50
     */
    minStepSize?: number;

    /**
     * Maximum step length in meters. Larger = faster but coarser.
     *
     * Range: `(0, +∞)`. Typical 500–2000.
     *
     * @default 1000
     */
    maxStepSize?: number;

    /**
     * Maximum distance in meters the primary ray marches before giving up.
     *
     * Range: `(0, +∞)`. Typical 5e4–5e5.
     *
     * @default 200000
     */
    maxRayDistance?: number;

    /**
     * Per-perspective-depth step scale factor. >1 grows steps with distance.
     *
     * Range: `[1, +∞)`. Recommended 1.0–1.1.
     *
     * @default 1.01
     */
    perspectiveStepScale?: number;

    /**
     * Density below which a sample is treated as empty (skipped). Raise to
     * cull wispy edges for performance.
     *
     * Range: `[0, 1]`.
     *
     * @default 1e-5
     */
    minDensity?: number;

    /**
     * Extinction below which a sample is skipped.
     *
     * Range: `[0, +∞)`.
     *
     * @default 1e-5
     */
    minExtinction?: number;

    /**
     * Transmittance threshold below which the ray terminates early (cloud is
     * opaque enough). Raising culls dense interiors faster.
     *
     * Range: `(0, 1]`. Must be >0; >1 yields empty clouds.
     *
     * @default 1e-2
     */
    minTransmittance?: number;

    // ─── Secondary (sun/ground) march ────────────────────────────────────

    /**
     * Maximum march steps toward the sun when computing in-scattering.
     *
     * Range: `[0, +∞)`. Typical 1–8.
     *
     * @default 2
     */
    maxIterationCountToSun?: number;

    /**
     * Maximum march steps toward the ground when computing ground-bounce.
     *
     * Range: `[0, +∞)`. Typical 0–4.
     *
     * @default 3
     */
    maxIterationCountToGround?: number;

    /**
     * Minimum step length in meters for the secondary (sun/ground) march.
     *
     * Range: `(0, +∞)`. Typically larger than the primary `minStepSize`.
     *
     * @default 100
     */
    minSecondaryStepSize?: number;

    /**
     * Step scale for the secondary march. >1 grows steps faster.
     *
     * Range: `[1, +∞)`.
     *
     * @default 2
     */
    secondaryStepScale?: number;

    // ─── Shadows (cascaded shadow maps) ──────────────────────────────────

    /**
     * Number of shadow cascades. Hard-capped at `3` by the shader and render
     * targets (a 4th uniform slot exists but is never sampled). Values >3 are
     * clamped to 3 at runtime.
     *
     * Range: `[1, 3]`.
     *
     * @default 3
     */
    shadowCascadeCount?: number;

    /**
     * Shadow map resolution per cascade, in texels.
     *
     * NOTE: This field is declared for forward-compatibility but is currently
     * not applied at runtime — the map size is fixed by the `quality` preset
     * (256/512/1024). Setting it has no effect.
     *
     * Recommended power-of-two values: 256, 512, 1024.
     *
     * @default 512
     */
    shadowMapSize?: number;

    /**
     * Maximum radius (in texels) of the PCF kernel used to soften shadow
     * edges. Larger = softer but slower; coupled with `sunAngularRadius`.
     *
     * Range: `[0, +∞)`. Typical 2–16.
     *
     * @default 6
     */
    maxShadowFilterRadius?: number;

    /**
     * Scale compensating the optical-depth under-estimation that occurs when
     * the cloud shadow march terminates early (transmittance below
     * `shadowMinTransmittance`). The tail contribution is accumulated into the
     * BSM alpha channel and added to the sampled optical depth at render time.
     *
     * Range: `[0, +∞)`. 0 disables the compensation (darker, under-estimated
     * shadows); larger values brighten/lengthen shadow tails.
     *
     * @default 2
     */
    opticalDepthTailScale?: number;

    /**
     * Whether the cloud shadow (Beer Shadow Map) pass uses temporal
     * accumulation (TAA). When `true`, shadows are temporally stabilized via
     * a 3-frame bootstrap + history reprojection. When `false`, each frame's
     * shadow is used raw — faster, but visibly noisier/flickering.
     *
     * Disabling also turns off shadow temporal jitter (rotated PCF sampling),
     * since without TAA there is nothing to integrate the jitter into.
     *
     * @default true
     */
    shadowTemporalPass?: boolean;

    /**
     * CSM frustum split mode for distributing shadow cascades across the
     * view frustum.
     *
     * - `"uniform"` — equal-sized slices (favors near detail).
     * - `"logarithmic"` — perspective-correct (favors far detail).
     * - `"practical"` — blend of both via {@link shadowSplitLambda}.
     *
     * @default "practical"
     */
    shadowSplitMode?: "uniform" | "logarithmic" | "practical";

    /**
     * Blend factor for the `"practical"` {@link shadowSplitMode}. 0 =
     * purely uniform, 1 = purely logarithmic.
     *
     * Range: `[0, 1]`.
     *
     * @default 0.6
     */
    shadowSplitLambda?: number;

    // ─── Haze (analytical altitude fog) ──────────────────────────────────

    /**
     * Enable analytical altitude-exponential haze below the cloud layer.
     * Cheap approximation for distant fog/horizon haze.
     *
     * @default true (via "high" preset)
     */
    hazeEnabled?: boolean;

    /**
     * Haze density scale (linear multiplier on the extinction term).
     *
     * Range: `[0, +∞)`. Typical 1e-5–1e-4.
     *
     * @default 3e-5
     */
    hazeDensityScale?: number;

    /**
     * Haze altitude falloff exponent. MUST be >0 (used as a divisor in the
     * shader; 0 causes division by zero).
     *
     * Range: `(0, +∞)`. Typical 1e-3–1e-2.
     *
     * @default 1e-3
     */
    hazeExponent?: number;

    /**
     * Haze scattering coefficient (tints the haze with sky/sun color).
     *
     * Range: `[0, +∞)`. Typical 0.5–1.5.
     *
     * @default 0.9
     */
    hazeScatteringCoefficient?: number;

    /**
     * Haze absorption coefficient (darkens the haze).
     *
     * Range: `[0, +∞)`. Typical 0–1.
     *
     * @default 0.5
     */
    hazeAbsorptionCoefficient?: number;

    // ─── Wind / animation ────────────────────────────────────────────────

    /**
     * Weather texture repeat count (tiles the 2D weather map). Larger values
     * pack more (but smaller) cloud systems into view.
     *
     * Range: `(0, +∞)`. Typical 50–300.
     *
     * @default 100
     */
    localWeatherRepeat?: number;

    /**
     * Weather texture scroll velocity (UV units/sec). Drives large-scale
     * cloud movement. Set `[0, 0]` to freeze clouds.
     *
     * Range: any finite `[x, y]`. Typical 1e-4–1e-2; 0.001 ≈ gentle drift.
     *
     * @default [0.001, 0] (clouds drift slowly when enabled)
     */
    localWeatherVelocity?: [number, number];

    /**
     * Shape 3D texture repeat (scales the volumetric noise field). Larger =
     * finer, more numerous cloud shapes.
     *
     * Range: `(0, +∞)`. Typical 1e-4–1e-3.
     *
     * @default 0.0003
     */
    shapeRepeat?: number;

    /**
     * Shape 3D texture scroll velocity. Drives shape evolution/distortion.
     * Set `[0, 0, 0]` to freeze shape.
     *
     * Range: any finite `[x, y, z]`. Typical 1e-4–1e-2.
     *
     * @default [0.001, 0, 0]
     */
    shapeVelocity?: [number, number, number];

    /**
     * Shape-detail 3D texture repeat. High-frequency detail field; usually
     * ~20× `shapeRepeat`.
     *
     * Range: `(0, +∞)`. Typical 1e-3–1e-2.
     *
     * @default 0.006
     */
    shapeDetailRepeat?: number;

    /**
     * Shape-detail 3D texture scroll velocity. Defaults to 1/3 of
     * `shapeVelocity` to keep visual drift proportionate (detail repeats more
     * often).
     *
     * Range: any finite `[x, y, z]`. Typical 1e-4–1e-2.
     *
     * @default [0.0003, 0, 0]
     */
    shapeDetailVelocity?: [number, number, number];

    /**
     * Turbulence (worley/noise) repeat frequency. Adds curl/distortion to the
     * shape field.
     *
     * Range: `(0, +∞)`. Typical 5–50.
     *
     * @default 20
     */
    turbulenceRepeat?: number;

    /**
     * Turbulence displacement magnitude in meters. How far the shape field is
     * warped by turbulence; larger = more dramatic wisping.
     *
     * Range: `[0, +∞)`. Typical 100–1000.
     *
     * @default 350
     */
    turbulenceDisplacement?: number;

    // ─── Sun ─────────────────────────────────────────────────────────────

    /**
     * Apparent angular radius of the sun, in radians. Earth: ~0.00465 rad
     * (0.2666°). Larger values soften shadow penumbras (wider PCF).
     *
     * Range: `(0, π/2]`. Typical 0.004–0.01.
     *
     * @default 0.00465
     */
    sunAngularRadius?: number;
}

/**
 * Aerial perspective (atmospheric scattering applied to the rendered scene)
 * configuration. Controls distance-based haze, transmittance and in-scattering
 * tinted by sky and sun color.
 */
export interface AerialPerspectiveConfig {
    /**
     * Compensate for the geometric error between the depth buffer (flat
     * camera-space Z) and the true ellipsoidal surface distance. Slightly more
     * accurate at grazing angles; minor perf cost.
     *
     * @default false
     */
    correctGeometricError?: boolean;

    /**
     * Apply atmospheric lighting (sky + sun) modulation to the aerial
     * perspective. Disable for a simpler analytical tint.
     *
     * @default false
     */
    lighting?: boolean;

    /**
     * Apply atmospheric transmittance ( Beer-Lambert extinction ) to the
     * scene's existing color. Disable to keep scene colors unmodified by
     * distance absorption.
     *
     * @default false
     */
    transmittance?: boolean;

    /**
     * Apply atmospheric in-scattering (added sky/sun light along the view
     * ray). This is what produces the hazy distance fade.
     *
     * @default false
     */
    inscattering?: boolean;

    /**
     * Also compute moon-direction in-scattering at night. Only meaningful
     * when the sun is below the horizon.
     *
     * @default false
     */
    moonScattering?: boolean;
}
