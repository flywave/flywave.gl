// @ts-nocheck
/* Copyright (C) 2025 flywave.gl contributors */

import {
    abs,
    acos,
    asin,
    atan,
    Break,
    cos,
    dFdx,
    dFdy,
    dot,
    exp,
    float,
    floor,
    Fn,
    If,
    int,
    length,
    log2,
    Loop,
    max,
    min,
    mix,
    normalize,
    oneMinus,
    positionGeometry,
    pow,
    saturate,
    screenCoordinate,
    screenUV,
    sign,
    sin,
    sqrt,
    step,
    struct,
    texture,
    texture3D,
    textureLevel,
    vec2,
    vec3,
    vec4
} from "three/tsl";

import type { CloudUniforms } from "./CloudUniforms";
import { stbn, stbnFixed } from "../tsl/STBNTextureNode";
import {
    getIndirectLuminanceToPoint,
    getSplitScalarIlluminance,
    getSplitScalarIrradiance
} from "../atmosphere/runtime";
import { getAtmosphereContext } from "../atmosphere/AtmosphereContext";
import { rayleighPhaseFunction, miePhaseFunction, getIrradiance } from "../atmosphere/common";
import { getAtmosphereContextBase } from "../atmosphere/AtmosphereContextBase";
import { getAtmosphereContext } from "../atmosphere/AtmosphereContext";

const RECIPROCAL_PI = 1.0 / Math.PI;
const RECIPROCAL_PI4 = 1.0 / (4.0 * Math.PI);

/* -------------------------------------------------------------------------- */
/*  Math utilities                                                            */
/* -------------------------------------------------------------------------- */

export const remap = Fn(([x, a, b]: [any, any, any]) => {
    return x.sub(a).div(b.sub(a));
});

export const remapClamped = Fn(([x, a, b]: [any, any, any]) => {
    return x.sub(a).div(b.sub(a)).clamp(0, 1);
});

/**
 * Screen-space mip level (GLSL: getMipLevel)
 * Uses dFdx/dFdy to estimate texel density in screen pixels
 */
export const createGetMipLevel = (u: CloudUniforms) =>
    Fn(([uv]: [any]) => {
        const coord = uv.mul(u.resolution);
        const ddx = dFdx(coord);
        const ddy = dFdy(coord);
        const deltaMaxSqr = max(dot(ddx, ddx), dot(ddy, ddy)).mul(float(0.1));
        return max(float(0), float(0.5).mul(log2(max(float(1), deltaMaxSqr))));
    });

/* -------------------------------------------------------------------------- */
/*  UV mapping                                                                 */
/* -------------------------------------------------------------------------- */

export const getCubeSphereUv = Fn(([position]: [any]) => {
    const n = normalize(position);
    const f = abs(n);
    const maxF = max(f.x, max(f.y, f.z));
    const c = n.div(maxF);

    const yDom = step(f.x, f.y).mul(step(f.z, f.y));
    const xDom = step(f.y, f.x).mul(step(f.z, f.x)).mul(oneMinus(yDom));
    const zDom = oneMinus(yDom).sub(xDom);

    const signY = step(float(0), c.y);
    const signX = step(float(0), c.x);
    const signZ = step(float(0), c.z);

    const m = vec2(
        yDom
            .mul(mix(n.x, n.x.negate(), signY))
            .add(xDom.mul(mix(n.y.negate(), n.y, signX)))
            .add(zDom.mul(n.x)),
        yDom
            .mul(n.z)
            .add(xDom.mul(n.z))
            .add(zDom.mul(mix(n.y.negate(), n.y, signZ)))
    );

    const m2 = m.mul(m);
    // GLSL: float q = dot(m2.xy, vec2(-2.0, 2.0)) - 3.0;
    const q = m2.x.mul(-2).add(m2.y.mul(2)).sub(3);
    const q2 = q.mul(q);

    // GLSL: uv.x = sqrt(1.5 + m2.x - m2.y - 0.5 * sqrt(-24.0 * m2.x + q2)) * (m.x > 0.0 ? 1.0 : -1.0);
    const uvX = sqrt(
        float(1.5)
            .add(m2.x)
            .sub(m2.y)
            .sub(float(0.5).mul(sqrt(m2.x.mul(-24).add(q2))))
    ).mul(m.x.greaterThan(0).toFloat().mul(2).sub(1));

    // GLSL: uv.y = sqrt(6.0 / (3.0 - uv.x * uv.x)) * m.y;
    const uvY = sqrt(float(6).div(float(3).sub(uvX.mul(uvX)))).mul(m.y);

    return vec2(uvX, uvY).mul(0.5).add(0.5);
});

// OPTIMIZATION: Pre-normalized variant of getCubeSphereUv.
// Before: each marching loop called getCubeSphereUv(position), which did
//   normalize(position) internally, PLUS a separate normalize(position) for
//   surfaceNormal in sampleMedia. That's 2-3 redundant normalize() per step.
// After: caller computes n = normalize(position) once, passes to both
//   getCubeSphereUvNormalized(n) and sampleMedia(..., n).
// Saves ~2 normalize() calls per iteration across 3 marching loops.
export const getCubeSphereUvNormalized = Fn(([n]: [any]) => {
    const f = abs(n);
    const maxF = max(f.x, max(f.y, f.z));
    const c = n.div(maxF);

    const yDom = step(f.x, f.y).mul(step(f.z, f.y));
    const xDom = step(f.y, f.x).mul(step(f.z, f.x)).mul(oneMinus(yDom));
    const zDom = oneMinus(yDom).sub(xDom);

    const signY = step(float(0), c.y);
    const signX = step(float(0), c.x);
    const signZ = step(float(0), c.z);

    const m = vec2(
        yDom
            .mul(mix(n.x, n.x.negate(), signY))
            .add(xDom.mul(mix(n.y.negate(), n.y, signX)))
            .add(zDom.mul(n.x)),
        yDom
            .mul(n.z)
            .add(xDom.mul(n.z))
            .add(zDom.mul(mix(n.y.negate(), n.y, signZ)))
    );

    const m2 = m.mul(m);
    const q = m2.x.mul(-2).add(m2.y.mul(2)).sub(3);
    const q2 = q.mul(q);

    const uvX = sqrt(
        float(1.5)
            .add(m2.x)
            .sub(m2.y)
            .sub(float(0.5).mul(sqrt(m2.x.mul(-24).add(q2))))
    ).mul(m.x.greaterThan(0).toFloat().mul(2).sub(1));

    const uvY = sqrt(float(6).div(float(3).sub(uvX.mul(uvX)))).mul(m.y);

    return vec2(uvX, uvY).mul(0.5).add(0.5);
});

export const getGlobeUv = getCubeSphereUv;

/* -------------------------------------------------------------------------- */
/*  Weather sampling                                                           */
/* -------------------------------------------------------------------------- */

export const shapeAlteringFunction = Fn(([heightFraction, bias]: [any, any]) => {
    const biased = exp(bias.mul(heightFraction.log()));
    const x = biased.mul(2).sub(1).clamp(-1, 1);
    return oneMinus(x.mul(x));
});

export const createSampleWeather = (u: CloudUniforms) =>
    Fn(([uv, height, mipLevel]: [any, any, any]) => {
        // GLSL: textureLod(localWeatherTexture, uv * localWeatherRepeat + localWeatherOffset, mipLevel)
        const weatherUv = uv.mul(u.localWeatherRepeat).add(u.localWeatherOffset);
        const weatherTex = textureLevel(u.localWeatherTexture, weatherUv, mipLevel);
        const localWeather = exp(u.weatherExponents.mul(weatherTex.log()));

        // heightFraction is needed for shapeAlteringFunction; compute locally (lightweight remap)
        const heightFraction = remapClamped(vec4(height), u.minLayerHeights, u.maxLayerHeights);
        const heightScale = shapeAlteringFunction(heightFraction, u.shapeAlteringBiases);
        const factor = oneMinus(u.coverage.mul(heightScale));
        const density = remapClamped(
            mix(localWeather, vec4(1, 1, 1, 1), u.coverageFilterWidths),
            factor,
            factor.add(u.coverageFilterWidths)
        );

        return density;
    });

// Shadow-specific variant: multiplies localWeather by shadowLayerMask (#ifdef SHADOW)
export const createSampleWeatherShadow = (u: CloudUniforms) =>
    Fn(([uv, height, mipLevel]: [any, any, any]) => {
        const weatherUv = uv.mul(u.localWeatherRepeat).add(u.localWeatherOffset);
        const weatherTex = textureLevel(u.localWeatherTexture, weatherUv, mipLevel);
        const localWeather = exp(u.weatherExponents.mul(weatherTex.log()));

        // #ifdef SHADOW: localWeather *= shadowLayerMask;
        localWeather.mulAssign(u.shadowLayerMask);

        const heightFraction = remapClamped(vec4(height), u.minLayerHeights, u.maxLayerHeights);
        const heightScale = shapeAlteringFunction(heightFraction, u.shapeAlteringBiases);
        const factor = oneMinus(u.coverage.mul(heightScale));
        const density = remapClamped(
            mix(localWeather, vec4(1, 1, 1, 1), u.coverageFilterWidths),
            factor,
            factor.add(u.coverageFilterWidths)
        );

        return density;
    });

/* -------------------------------------------------------------------------- */
/*  Layer density                                                              */
/* -------------------------------------------------------------------------- */

export const createGetLayerDensity = (u: CloudUniforms) =>
    Fn(([heightFraction]: [any]) => {
        return u.densityProfileExpTerms
            .mul(exp(u.densityProfileExponents.mul(heightFraction)))
            .add(u.densityProfileLinearTerms.mul(heightFraction))
            .add(u.densityProfileConstantTerms);
    });

/* -------------------------------------------------------------------------- */
/*  Phase function and multiple scattering                                     */
/* -------------------------------------------------------------------------- */

export const henyeyGreenstein = Fn(([g, cosTheta]: [any, any]) => {
    const g2 = g.mul(g);
    const denom = max(
        vec2(1e-7),
        exp(vec2(1.5).mul(float(1).add(g2).sub(g.mul(2).mul(cosTheta)).log()))
    );
    return float(RECIPROCAL_PI4).mul(oneMinus(g2).div(denom));
});

// Draine phase function for large particles (approximate Mie).
// Ref: https://research.nvidia.com/labs/rtr/approximate-mie/
const drainePhase = Fn(([cosTheta, g, alpha]: [any, any, any]) => {
    const g2 = g.mul(g);
    const u = cosTheta;
    const numerator = float(1)
        .sub(g2)
        .mul(float(1).add(alpha.mul(u.mul(u))));
    const denominator = float(4)
        .mul(float(1).add(alpha.mul(float(1).add(g2.mul(2))).div(float(3))))
        .mul(float(Math.PI))
        .mul(pow(float(1).add(g2).sub(g.mul(2).mul(u)), float(1.5)));
    return numerator.div(denominator);
});

// Dual-HG phase function with configurable anisotropy.
const dualHG = Fn(([cosTheta, attenuation, u]: any) => {
    const g = vec2(u.scatterAnisotropy1, u.scatterAnisotropy2).mul(attenuation);
    const weights = vec2(float(1).sub(u.scatterAnisotropyMix), u.scatterAnisotropyMix);
    return dot(henyeyGreenstein(g, cosTheta), weights);
});

// Accurate Mie-fitted phase function (Draine + HG blend, d=10 fit params).
const accurateMiePhase = Fn(([cosTheta, attenuation]: [any, any]) => {
    const gHG = float(0.988176691700256);
    const gD = float(0.5556712547839497);
    const alpha = float(21.995520856274638);
    const weight = float(0.4819554318404214);
    const hg = henyeyGreenstein(vec2(gHG).mul(attenuation), cosTheta).x;
    const dr = drainePhase(cosTheta, gD.mul(attenuation), alpha);
    return mix(hg, dr, weight);
});

export const phaseFunction = Fn(([cosTheta, attenuation, u]: [any, any, any]) => {
    const dual = dualHG(cosTheta, attenuation, u);
    const accurate = accurateMiePhase(cosTheta, attenuation);
    return u.accuratePhaseFunction.greaterThan(float(0.5)).select(accurate, dual);
});

export const approximateMultipleScattering = Fn(([opticalDepth, cosTheta, u]: [any, any, any]) => {
    const coeffs = vec3(1).toVar();
    const attenuation = vec3(0.5, 0.5, 0.5);
    const scattering = float(0).toVar();

    if (u.accuratePhaseFunction.value > 0.5) {
        Loop({ start: 0, end: 8, type: "int" }, () => {
            const bl = exp(opticalDepth.mul(coeffs.y).negate());
            const phase = accurateMiePhase(cosTheta, coeffs.z);
            scattering.addAssign(coeffs.x.mul(bl).mul(phase));
            coeffs.mulAssign(attenuation);
        });
    } else {
        Loop({ start: 0, end: 8, type: "int" }, () => {
            const bl = exp(opticalDepth.mul(coeffs.y).negate());
            const phase = dualHG(cosTheta, coeffs.z, u);
            scattering.addAssign(coeffs.x.mul(bl).mul(phase));
            coeffs.mulAssign(attenuation);
        });
    }

    return scattering;
});

/* -------------------------------------------------------------------------- */
/*  Media sampling                                                             */
/* -------------------------------------------------------------------------- */

export const createSampleMedia = (u: CloudUniforms) => {
    const getLayerDensity = createGetLayerDensity(u);

    return Fn(
        ([heightFraction, density, position, uv, mipLevel, jitter, cameraPosition, surfaceNormal]: [
            any,
            any,
            any,
            any,
            any,
            any,
            any,
            any
        ]) => {
            // OPTIMIZATION: surfaceNormal is now passed from caller.
            // Before: const surfaceNormal = normalize(position);
            //   This was called on every sample, duplicating the normalize()
            //   already done by the caller for getCubeSphereUv.
            // After: caller computes normalize(position) once, passes it as
            //   the 8th parameter. Saves 1 normalize() per sampleMedia call.
            const localWeatherSpeed = length(u.localWeatherOffset);
            const evolution = surfaceNormal.negate().mul(localWeatherSpeed.mul(2e4));

            // Turbulence (match reference: no mip level, implicit derivatives)
            const turbulenceUv = uv.mul(u.localWeatherRepeat).mul(u.turbulenceRepeat);
            const turbTex = texture(u.turbulenceTexture, turbulenceUv).rgb.mul(2).sub(1);
            const turbWeight = dot(
                density,
                remapClamped(heightFraction, vec4(0.3, 0.3, 0.3, 0.3), vec4(0, 0, 0, 0))
            );
            const turbulence = u.turbulenceDisplacement.mul(turbTex).mul(turbWeight);

            // Shape texture
            const shapePosition = position
                .add(evolution)
                .add(turbulence)
                .mul(u.shapeRepeat)
                .add(u.shapeOffset);
            const shape = texture3D(u.shapeTexture, shapePosition).r;
            density.assign(
                remapClamped(density, oneMinus(shape).mul(u.shapeAmounts), vec4(1, 1, 1, 1))
            );

            // Shape detail: only when any layer has shapeDetailAmount > 0 (matches reference #ifdef SHAPE_DETAIL)
            const hasDetail = u.shapeDetailAmounts.x
                .add(u.shapeDetailAmounts.y)
                .add(u.shapeDetailAmounts.z)
                .add(u.shapeDetailAmounts.w)
                .greaterThan(0);
            If(hasDetail, () => {
                If(mipLevel.mul(0.5).add(jitter.sub(0.5).mul(0.5)).lessThan(0.5), () => {
                    const detailPosition = position
                        .add(turbulence)
                        .mul(u.shapeDetailRepeat)
                        .add(u.shapeDetailOffset);
                    const detail = texture3D(u.shapeDetailTexture, detailPosition).r;
                    const detailPow = pow(detail, float(6));
                    const modifier = mix(
                        vec4(detailPow),
                        oneMinus(vec4(detail)),
                        remapClamped(
                            heightFraction,
                            vec4(0.2, 0.2, 0.2, 0.2),
                            vec4(0.4, 0.4, 0.4, 0.4)
                        )
                    );
                    const modMixed = mix(vec4(0, 0, 0, 0), modifier, u.shapeDetailAmounts);
                    density.assign(
                        remapClamped(density.mul(2), modMixed.mul(0.5), vec4(1, 1, 1, 1))
                    );
                });
            });

            // Apply density profile
            const layerDensity = getLayerDensity(heightFraction);
            density.assign(density.mul(u.densityScales).mul(layerDensity).clamp(0, 1));

            const densitySum = density.x.add(density.y).add(density.z).add(density.w);
            const weight = density.div(densitySum.max(1e-7));
            const skyGradient = dot(heightFraction.mul(0.5).add(0.5), weight);

            const scattering = densitySum.mul(u.scatteringCoefficient);
            const extinction = densitySum.mul(u.absorptionCoefficient).add(scattering);

            return vec4(scattering, extinction, skyGradient, 0);
        }
    );
};

/* -------------------------------------------------------------------------- */
/*  marchOpticalDepth (secondary raymarch)                                      */
/*  Takes maxIterationCount (e.g. 2 for sun, 3 for ground) to determine the    */
/*  number of steps. Matches reference GLSL int(remap(...) - jitter) clamping. */
/* -------------------------------------------------------------------------- */

export const createMarchOpticalDepth = (u: CloudUniforms) => {
    const sampleWeather = createSampleWeather(u);
    const sampleMedia = createSampleMedia(u);

    return Fn(
        ([rayOrigin, rayDirection, jitter, mipLevel, maxIterationCount]: [
            any,
            any,
            any,
            any,
            any
        ]) => {
            const maxIter = maxIterationCount.toFloat();
            const inRange = maxIter.add(1).sub(float(1));
            const mapped = float(1).add(inRange.mul(mipLevel.negate().add(1)));
            const rawCount = max(float(0), mapped.sub(jitter));
            const iterationCount = rawCount.floor();

            const isZero = iterationCount.lessThanEqual(0.5);

            const safeCount = max(iterationCount, float(1));
            const initialStepSize = u.minSecondaryStepSize.div(safeCount);

            const opticalDepth = float(0).toVar();
            const currentStepSize = initialStepSize.toVar();
            const currentDist = initialStepSize.mul(jitter).toVar();
            const lastDist = float(0).toVar();
            const stepsTaken = float(0).toVar();

            Loop({ start: 0, end: 16, type: "int" }, () => {
                If(stepsTaken.greaterThanEqual(iterationCount), () => {
                    Break();
                });

                const position = currentDist.mul(rayDirection).add(rayOrigin);
                const height = length(position).sub(u.bottomRadius);
                // OPTIMIZATION: compute n once, reuse for both UV and media.
                // Before: uv = getGlobeUv(position) — did normalize(position) internally.
                //         sampleMedia(..., rayOrigin) — did normalize(position) for surfaceNormal.
                // After:  n = normalize(position) computed once.
                //         uv = getCubeSphereUvNormalized(n) — no internal normalize.
                //         sampleMedia(..., n) — receives pre-computed n.
                // Saves 1 normalize() per iteration.
                const n = normalize(position);
                const uv = getCubeSphereUvNormalized(n);
                const heightFraction = remapClamped(
                    vec4(height),
                    u.minLayerHeights,
                    u.maxLayerHeights
                );
                const density = sampleWeather(uv, height, mipLevel);
                const media = sampleMedia(
                    heightFraction,
                    density,
                    position,
                    uv,
                    mipLevel,
                    jitter,
                    rayOrigin,
                    n
                );

                opticalDepth.addAssign(media.y.mul(currentStepSize));
                lastDist.assign(currentDist);

                currentDist.addAssign(currentStepSize);
                currentStepSize.mulAssign(u.secondaryStepScale);
                stepsTaken.addAssign(float(1));
            });

            const finalOpticalDepth = isZero.select(float(0.5), opticalDepth);
            const totalDistance = isZero.select(float(0), lastDist);

            return vec2(finalOpticalDepth, totalDistance);
        }
    );
};

/* -------------------------------------------------------------------------- */
/*  marchShadowLength (shadow length for aerial perspective)                   */
/*  Approximated without shadow map using marchOpticalDepth                    */
/* -------------------------------------------------------------------------- */

export const createMarchShadowLength = (u: CloudUniforms, sampleShadowOpticalDepth: any) => {
    return Fn(([rayOrigin, rayDirection, rayNearFar, jitter]: [any, any, any, any]) => {
        const shadowLength = float(0).toVar();
        const maxRayDistance = rayNearFar.y.sub(rayNearFar.x).toVar();
        const stepSize = u.minShadowLengthStepSize.toVar();
        const rayDistance = stepSize.mul(jitter).toVar();
        const attenuation = float(1).toVar();
        const attenuationFactor = float(1).sub(5e-4);

        Loop({ start: 0, end: u.maxShadowLengthIterationCount, type: "int" }, () => {
            If(rayDistance.greaterThan(maxRayDistance), () => {
                Break();
            });

            const position = rayDistance.mul(rayDirection).add(rayOrigin);
            const opticalDepth = sampleShadowOpticalDepth(position, float(0), float(0)).toConst();
            shadowLength.addAssign(
                oneMinus(exp(opticalDepth.negate())).mul(stepSize).mul(attenuation)
            );
            stepSize.mulAssign(u.perspectiveStepScale);
            rayDistance.addAssign(stepSize);
            attenuation.mulAssign(attenuationFactor);
        });

        return shadowLength;
    });
};

/* -------------------------------------------------------------------------- */
/*  Structured Volume Sampling for shadow march                                */
/*  https://github.com/huwb/volsample                                          */
/* -------------------------------------------------------------------------- */

const getIcosahedralStructureNormal = Fn(([direction, jitter]: [any, any]) => {
    const a = float(0.85065080835204);
    const b = float(0.5257311121191336);
    const kT = float(0.6180339887498948);
    const kT2 = float(0.38196601125010515);

    const absD = abs(direction);
    const selector1 = dot(absD, vec3(1, kT2, kT.negate()));
    const selector2 = dot(absD, vec3(kT.negate(), 1, kT2));
    const selector3 = dot(absD, vec3(kT2, kT.negate(), 1));

    const v1 = selector1.greaterThan(0).select(vec3(a, b, 0), vec3(b.negate(), 0, a));
    const v2 = selector2.greaterThan(0).select(vec3(0, a, b), vec3(a, b.negate(), 0));
    const v3 = selector3.greaterThan(0).select(vec3(b, 0, a), vec3(0, a, b.negate()));

    const octantSign = sign(direction);
    const s1 = v1.mul(octantSign);
    const s2 = v2.mul(octantSign);
    const s3 = v3.mul(octantSign);

    const base = vec3(0.5, 0.5, 1);
    const dot1 = dot(s1, base);
    const dot2 = dot(s2, base);
    const dot3 = dot(s3, base);

    const w1 = exp(vec3(dot1, dot2, dot3).mul(40));
    const wSum = w1.x.add(w1.y).add(w1.z);
    const w = w1.div(wSum);

    return jitter.lessThan(w.x).select(s1, jitter.lessThan(w.x.add(w.y)).select(s2, s3));
});

const intersectStructuredPlanes = Fn(
    ([normal, rayOrigin, rayDirection, samplePeriod]: [any, any, any, any]) => {
        const NoD = dot(rayDirection, normal);
        const stepSize = samplePeriod.div(NoD.abs());
        let stepOffset = dot(rayOrigin, normal).mod(samplePeriod).negate().div(NoD);
        stepOffset = stepOffset.lessThan(0).select(stepOffset.add(stepSize), stepOffset);
        return vec2(stepOffset, stepSize);
    }
);

/* -------------------------------------------------------------------------- */
/*  Shadow march (BSM render pass): raymarch clouds from sun's POV             */
/*  Returns vec4(frontDepth, meanExtinction, maxOpticalDepth, tail)            */
/*  NOTE: velocity is computed OUTSIDE this Fn (at material level) using       */
/*  mrt() at the top level, because TSL's mrt() cannot be returned from Fn().  */
/* -------------------------------------------------------------------------- */

const SHADOW_MAX_ITERATIONS = 64; // Static upper bound for WGSL loop; dynamic break uses uniform

export const createShadowMarchClouds = (u: CloudUniforms, cascadeIndex: number = 0) => {
    const sampleWeather = createSampleWeatherShadow(u);
    const sampleMedia = createSampleMedia(u);
    // Bake cascade index into shader (constant for compiled material)
    const invMat = u.inverseShadowMatrices[cascadeIndex];
    // Per-cascade mip level: [0.0, 0.5, 1.0, 2.0] (matching reference shadow.frag)
    const SHADOW_MIP_LEVELS = [0.0, 0.5, 1.0, 2.0];
    const cascadeMipLevel = float(SHADOW_MIP_LEVELS[cascadeIndex] ?? 0.0);

    return Fn((): any => {
        // Unproject near plane of orthographic frustum (GLSL convention: z=-1)
        const clip = vec3(screenUV.mul(2).sub(1), float(-1));
        const point = invMat.mul(vec4(clip, float(1)));
        const pDiv = point.xyz.div(point.w);
        const sunPosition = u.worldToECEF.mul(vec4(pDiv, float(1))).xyz.add(u.altitudeCorrection);

        const rayDirection = u.sunDirection.negate().normalize();

        const a = sunPosition;
        const b = dot(rayDirection, a).mul(2);
        const aa = dot(a, a);

        const shadowTopR = u.bottomRadius.add(u.shadowTopHeight);
        const cTop = aa.sub(shadowTopR.mul(shadowTopR));
        const discTop = b.mul(b).sub(cTop.mul(4));
        const rayNearMiss = discTop.lessThan(0);
        const rayNear = max(
            float(0),
            rayNearMiss.select(float(0), b.negate().sub(sqrt(discTop)).mul(0.5))
        );

        const shadowBottomR = u.bottomRadius.add(u.shadowBottomHeight);
        const cBottom = aa.sub(shadowBottomR.mul(shadowBottomR));
        const discBottom = b.mul(b).sub(cBottom.mul(4));
        const rayFarMiss = discBottom.lessThan(0);
        const rayFar = rayFarMiss.select(float(1e6), b.negate().sub(sqrt(discBottom)).mul(0.5));
        const rayFarClamped = rayFar.lessThan(0).select(float(1e6), rayFar);

        const maxRayDistance = rayFarClamped.sub(rayNear).max(0);
        const rayOrigin = rayNear.mul(rayDirection).add(sunPosition);

        // Structured Volume Sampling: icosahedral plane-based step sizes
        const samplePeriod = maxRayDistance
            .div(u.shadowMaxIterationCount.toFloat())
            .clamp(u.shadowMinStepSize, u.shadowMaxStepSize);
        const structNormal = getIcosahedralStructureNormal(rayDirection, stbn);
        const svsResult = intersectStructuredPlanes(
            structNormal,
            rayOrigin,
            rayDirection,
            samplePeriod
        );
        const rayDistance = svsResult.x.sub(svsResult.y.mul(stbn)).toVar();
        const stepSize = svsResult.y.toVar();

        const extinctionSum = float(0).toVar();
        const maxOpticalDepth = float(0).toVar();
        const maxOpticalDepthTail = float(0).toVar();
        const transmittanceIntegral = float(1).toVar();
        const weightedDistanceSum = float(0).toVar();
        const transmittanceSum = float(0).toVar();
        const sampleCount = float(0).toVar();

        const iterCount = float(0).toVar();

        Loop({ start: 0, end: SHADOW_MAX_ITERATIONS, type: "int" }, () => {
            If(rayDistance.greaterThan(maxRayDistance), () => {
                Break();
            });
            If(iterCount.greaterThanEqual(u.shadowMaxIterationCount), () => {
                Break();
            });

            const position = rayDistance.mul(rayDirection).add(rayOrigin);
            const height = length(position).sub(u.bottomRadius);

            // Gap-skip: skip empty space between cloud layers (matches main march)
            const gtInt = step(u.minIntervalHeights, vec3(height));
            const ltInt = step(vec3(height), u.maxIntervalHeights);
            const inInterval = gtInt.mul(ltInt);
            const isGap = inInterval.x.add(inInterval.y).add(inInterval.z).greaterThan(0.5);

            If(isGap, () => {
                rayDistance.addAssign(stepSize);
                iterCount.addAssign(float(1));
            }).Else(() => {
                const n = normalize(position);
                const uv = getCubeSphereUvNormalized(n);
                const heightFraction = remapClamped(
                    vec4(height),
                    u.minLayerHeights,
                    u.maxLayerHeights
                );
                const density = sampleWeather(uv, height, cascadeMipLevel);
                const maxDensity = max(density.x, max(density.y, max(density.z, density.w)));

                If(maxDensity.greaterThan(u.minDensity), () => {
                    const media = sampleMedia(
                        heightFraction,
                        density,
                        position,
                        uv,
                        cascadeMipLevel,
                        stbn,
                        rayOrigin,
                        n
                    );
                    const extinction = media.y;

                    If(extinction.greaterThan(u.minExtinction), () => {
                        extinctionSum.addAssign(extinction);
                        maxOpticalDepth.addAssign(extinction.mul(stepSize));
                        transmittanceIntegral.mulAssign(exp(extinction.negate().mul(stepSize)));
                        weightedDistanceSum.addAssign(rayDistance.mul(transmittanceIntegral));
                        transmittanceSum.addAssign(transmittanceIntegral);
                        sampleCount.addAssign(float(1));
                    });
                });

                rayDistance.addAssign(stepSize);
                iterCount.addAssign(float(1));
            });

            If(transmittanceIntegral.lessThanEqual(u.shadowMinTransmittance), () => {
                maxOpticalDepthTail.assign(
                    min(
                        float(2)
                            .mul(stepSize)
                            .mul(exp(float(1).sub(sampleCount))),
                        stepSize.mul(0.5)
                    )
                );
                Break();
            });
        });

        const noSamples = sampleCount.equal(0);
        const frontDepth = min(weightedDistanceSum.div(transmittanceSum.max(1e-7)), maxRayDistance);
        const meanExtinction = extinctionSum.div(sampleCount.max(1e-7));

        return vec4(
            noSamples.select(maxRayDistance, frontDepth),
            noSamples.select(float(0), meanExtinction),
            noSamples.select(float(0), maxOpticalDepth),
            noSamples.select(float(0), maxOpticalDepthTail)
        );
    });
};

/* -------------------------------------------------------------------------- */
/*  Shadow sampling: reconstruct optical depth from BSM texture                 */
/* -------------------------------------------------------------------------- */

export const createSampleShadowOpticalDepth = (u: CloudUniforms) => {
    // Helper: compute cascade-specific projection (UV + inBounds) for given index.
    // Input position is in corrected ECEF; convert to world space (matching reference).
    const projectCascade = (cascadeIdx: number, positionECEF: any) => {
        const mat = u.shadowMatrices[cascadeIdx];
        const worldPos = u.ecefToWorld.mul(vec4(positionECEF.sub(u.altitudeCorrection), 1)).xyz;
        const clip = mat.mul(vec4(worldPos, 1));
        const clipDiv = clip.xy.div(clip.w);
        const shadowUV = clipDiv.mul(0.5).add(0.5);

        const inBounds = step(float(0), shadowUV.x)
            .mul(step(shadowUV.x, float(1)))
            .mul(step(float(0), shadowUV.y))
            .mul(step(shadowUV.y, float(1)));

        return { shadowUV, inBounds };
    };

    const getJitterRotation = () => {
        // Interleaved Gradient Noise (IGN) - standard implementation (Epic Games)
        // Reference: IGN(gl_FragCoord.xy + temporalJitter * resolution)
        const magic = vec3(0.06711056, 0.00583715, 52.9829189);
        const coord = screenCoordinate.add(u.temporalJitter.mul(u.resolution));
        const ign = magic.z.mul(dot(coord, magic.xy).fract()).fract();
        const angle = ign.mul(float(Math.PI * 2));
        const cosA = cos(angle);
        const sinA = sin(angle);
        return { cosA, sinA };
    };

    const sampleCascadeSingle = (
        cascadeIdx: number,
        positionECEF: any,
        distanceToTop: any,
        distanceOffset: any,
        jitter: any
    ) => {
        const { shadowUV, inBounds: baseInBounds } = projectCascade(cascadeIdx, positionECEF);
        const tex = u.shadowTextureNodes[cascadeIdx];
        const uv = shadowUV;
        const shadow = texture(tex, uv);
        const distFront = max(float(0), distanceToTop.sub(distanceOffset).sub(shadow.r));
        const od = min(shadow.b.add(shadow.a), shadow.g.mul(distFront));
        const fullBounds = baseInBounds.mul(step(float(0), distanceToTop));
        return fullBounds.greaterThan(0.5).select(od, float(0));
    };

    // Helper: sample one cascade's BSM texture with 16-tap rotated PCF.
    const sampleCascadePCF = (
        cascadeIdx: number,
        positionECEF: any,
        distanceToTop: any,
        distanceOffset: any,
        jitter: any
    ) => {
        const { shadowUV, inBounds: baseInBounds } = projectCascade(cascadeIdx, positionECEF);
        const tex = u.shadowTextureNodes[cascadeIdx];

        const r = u.maxShadowFilterRadius;
        const texel = u.shadowTexelSize;

        const SHADOW_SAMPLE_COUNT = 8;
        const odSum = float(0).toVar();
        const loopIdx = float(0).toVar();
        Loop({ start: 0, end: SHADOW_SAMPLE_COUNT, type: "int" }, () => {
            const goldenAngle = float(2.39996323);
            const fi = loopIdx;
            const angle = fi.mul(goldenAngle);
            const vogelR = sqrt(fi.add(float(0.5)).div(float(SHADOW_SAMPLE_COUNT)));
            const ox = cos(angle).mul(vogelR);
            const oy = sin(angle).mul(vogelR);

            const rotated = vec2(
                jitter.cosA.mul(ox).sub(jitter.sinA.mul(oy)),
                jitter.sinA.mul(ox).add(jitter.cosA.mul(oy))
            );
            const uv = shadowUV.add(rotated.mul(r).mul(texel));
            const shadow = texture(tex, uv);
            const distFront = max(float(0), distanceToTop.sub(distanceOffset).sub(shadow.r));
            const od = min(shadow.b.add(shadow.a), shadow.g.mul(distFront));
            odSum.addAssign(od);
            loopIdx.addAssign(float(1));
        });

        const od = odSum.div(float(SHADOW_SAMPLE_COUNT));

        const fullBounds = baseInBounds.mul(step(float(0), distanceToTop));
        return fullBounds.greaterThan(0.5).select(od, float(0));
    };

    return Fn(([rayPosition, distanceOffset, radius]: [any, any, any]): any => {
        // rayPosition is in corrected ECEF (same as reference).
        // Compute distance to shadow top along sunDirection (NOT negated).
        // Matches reference: raySphereSecondIntersection(rayPosition, sunDirection, 0, bottomRadius + shadowTopHeight)
        const a = rayPosition;
        const b = dot(u.sunDirection, a).mul(2);
        const shadowTopR = u.bottomRadius.add(u.shadowTopHeight);
        const c = dot(a, a).sub(shadowTopR.mul(shadowTopR));
        const disc = b.mul(b).sub(c.mul(4));
        const distanceToTop = disc
            .lessThan(0)
            .select(float(-1), b.negate().add(sqrt(disc)).mul(0.5));

        const earlyOut = distanceToTop.lessThanEqual(0);
        const jitter = getJitterRotation();
        const jitterVal = stbn;

        // Stochastic cascade selection (matches reference getFadedCascadeIndex)
        const worldPos = u.ecefToWorld.mul(vec4(rayPosition.sub(u.altitudeCorrection), 1)).xyz;
        const viewPos = u.shadowViewMatrix.mul(vec4(worldPos, 1));
        const orthoDepth = u.shadowCameraFar
            .add(viewPos.z)
            .div(u.shadowCameraFar.sub(u.shadowCameraNear));

        const sampleCascade = (idx: number) =>
            radius
                .lessThan(0.1)
                .select(
                    sampleCascadeSingle(idx, rayPosition, distanceToTop, distanceOffset, jitter),
                    sampleCascadePCF(idx, rayPosition, distanceToTop, distanceOffset, jitter)
                );

        const od = float(0).toVar();

        If(earlyOut.not(), () => {
            const i0x = u.shadowIntervals[0].x;
            const i0y = u.shadowIntervals[0].y;
            const i1x = u.shadowIntervals[1].x;
            const i1y = u.shadowIntervals[1].y;

            const cascadeIdx = int(0).toVar();
            const useNext = float(0).toVar();

            const c0Center = i0x.add(i0y).mul(0.5);
            const c0Closest = orthoDepth.lessThan(c0Center).select(i0x, i0y);
            const c0Margin = c0Closest.mul(c0Closest).mul(0.5);
            const c0IntX = i0x.sub(c0Margin.mul(0.5));
            const c0IntY = i0y.add(c0Margin.mul(0.5));
            const c0Alpha = min(orthoDepth.sub(c0IntX), c0IntY.sub(orthoDepth))
                .div(c0Margin.max(1e-7))
                .clamp(0, 1);

            const c1Center = i1x.add(i1y).mul(0.5);
            const c1Closest = orthoDepth.lessThan(c1Center).select(i1x, i1y);
            const c1Margin = c1Closest.mul(c1Closest).mul(0.5);
            const c1IntX = i1x.sub(c1Margin.mul(0.5));
            const c1IntY = i1y.add(c1Margin.mul(0.5));
            const c1Alpha = orthoDepth.sub(c1IntX).div(c1Margin.max(1e-7)).clamp(0, 1);

            If(u.shadowCascadeCount.greaterThan(2).and(orthoDepth.greaterThanEqual(c1IntY)), () => {
                cascadeIdx.assign(int(2));
            })
                .ElseIf(
                    u.shadowCascadeCount.greaterThan(1).and(orthoDepth.greaterThanEqual(c0IntY)),
                    () => {
                        cascadeIdx.assign(int(1));
                        If(
                            u.shadowCascadeCount
                                .greaterThan(2)
                                .and(orthoDepth.greaterThanEqual(c1IntX))
                                .and(c1Alpha.lessThan(1)),
                            () => {
                                useNext.assign(
                                    jitterVal.lessThanEqual(c1Alpha).select(float(1), float(0))
                                );
                            }
                        );
                    }
                )
                .Else(() => {
                    cascadeIdx.assign(int(0));
                    If(
                        u.shadowCascadeCount
                            .greaterThan(1)
                            .and(orthoDepth.greaterThanEqual(c0IntX))
                            .and(c0Alpha.lessThan(1)),
                        () => {
                            useNext.assign(
                                jitterVal.lessThanEqual(c0Alpha).select(float(1), float(0))
                            );
                        }
                    );
                });

            const finalIdx = useNext.greaterThan(0.5).select(cascadeIdx.add(int(1)), cascadeIdx);

            If(finalIdx.equal(int(0)), () => {
                od.assign(sampleCascade(0));
            })
                .ElseIf(finalIdx.equal(int(1)), () => {
                    od.assign(sampleCascade(1));
                })
                .Else(() => {
                    od.assign(sampleCascade(2));
                });
        });

        return od;
    });
};

export const createSampleShadowOpticalDepthSingle = (u: CloudUniforms) => {
    const projectCascade = (cascadeIdx: number, positionECEF: any) => {
        const mat = u.shadowMatrices[cascadeIdx];
        // ECEF → world: ecefToWorldMatrix × (positionECEF - altitudeCorrection)
        const worldPos = u.ecefToWorld.mul(vec4(positionECEF.sub(u.altitudeCorrection), 1)).xyz;
        const clip = mat.mul(vec4(worldPos, 1));
        const clipDiv = clip.xy.div(clip.w);
        const shadowUV = clipDiv.mul(0.5).add(0.5);

        const inBounds = step(float(0), shadowUV.x)
            .mul(step(shadowUV.x, float(1)))
            .mul(step(float(0), shadowUV.y))
            .mul(step(shadowUV.y, float(1)));

        return { shadowUV, inBounds };
    };

    const getJitterRotation = () => {
        const magic = vec3(0.06711056, 0.00583715, 52.9829189);
        const coord = screenCoordinate.add(u.temporalJitter.mul(u.resolution));
        const ign = magic.z.mul(dot(coord, magic.xy).fract()).fract();
        const angle = ign.mul(float(Math.PI * 2));
        const cosA = cos(angle);
        const sinA = sin(angle);
        return { cosA, sinA };
    };

    const sampleCascadeSingle = (
        cascadeIdx: number,
        positionECEF: any,
        distanceToTop: any,
        distanceOffset: any,
        jitter: any
    ) => {
        const { shadowUV, inBounds: baseInBounds } = projectCascade(cascadeIdx, positionECEF);
        const tex = u.shadowTextureNodes[cascadeIdx];
        const uv = shadowUV;
        const shadow = texture(tex, uv);
        const distFront = max(float(0), distanceToTop.sub(distanceOffset).sub(shadow.r));
        const od = min(shadow.b.add(shadow.a), shadow.g.mul(distFront));
        const fullBounds = baseInBounds.mul(step(float(0), distanceToTop));
        return fullBounds.greaterThan(0.5).select(od, float(0));
    };

    return Fn(([rayPosition, distanceOffset, radius]: [any, any, any]): any => {
        // Distance to shadow top along sunDirection (NOT negated).
        const a = rayPosition;
        const b = dot(u.sunDirection, a).mul(2);
        const shadowTopR = u.bottomRadius.add(u.shadowTopHeight);
        const c = dot(a, a).sub(shadowTopR.mul(shadowTopR));
        const disc = b.mul(b).sub(c.mul(4));
        const distanceToTop = disc
            .lessThan(0)
            .select(float(-1), b.negate().add(sqrt(disc)).mul(0.5));

        const earlyOut = distanceToTop.lessThanEqual(0);
        const jitter = getJitterRotation();
        const jitterVal = stbn;

        // Stochastic cascade selection (matches reference getFadedCascadeIndex)
        const worldPos = u.ecefToWorld.mul(vec4(rayPosition.sub(u.altitudeCorrection), 1)).xyz;
        const viewPos = u.shadowViewMatrix.mul(vec4(worldPos, 1));
        // viewZToOrthographicDepth: (far + viewZ) / (far - near)
        const orthoDepth = u.shadowCameraFar
            .add(viewPos.z)
            .div(u.shadowCameraFar.sub(u.shadowCameraNear));

        const sampleCascade = (idx: number) =>
            sampleCascadeSingle(idx, rayPosition, distanceToTop, distanceOffset, jitter);

        const od = float(0).toVar();

        If(earlyOut.not(), () => {
            // Compute cascade index with stochastic fade
            // Interval 0: [0, c0End], Interval 1: [c0End, c1End], Interval 2: [c1End, 1]
            const i0x = u.shadowIntervals[0].x;
            const i0y = u.shadowIntervals[0].y;
            const i1x = u.shadowIntervals[1].x;
            const i1y = u.shadowIntervals[1].y;

            // Check each cascade for fade
            const cascadeIdx = int(0).toVar();
            const useNext = float(0).toVar();

            // Check cascade 0 → 1 boundary
            const c0Center = i0x.add(i0y).mul(0.5);
            const c0Closest = orthoDepth.lessThan(c0Center).select(i0x, i0y);
            const c0Margin = c0Closest.mul(c0Closest).mul(0.5);
            const c0IntX = i0x.sub(c0Margin.mul(0.5));
            const c0IntY = i0y.add(c0Margin.mul(0.5));
            const c0Alpha = min(orthoDepth.sub(c0IntX), c0IntY.sub(orthoDepth))
                .div(c0Margin.max(1e-7))
                .clamp(0, 1);

            // Check cascade 1 → 2 boundary
            const c1Center = i1x.add(i1y).mul(0.5);
            const c1Closest = orthoDepth.lessThan(c1Center).select(i1x, i1y);
            const c1Margin = c1Closest.mul(c1Closest).mul(0.5);
            const c1IntX = i1x.sub(c1Margin.mul(0.5));
            const c1IntY = i1y.add(c1Margin.mul(0.5));
            const c1Alpha = orthoDepth.sub(c1IntX).div(c1Margin.max(1e-7)).clamp(0, 1);

            If(u.shadowCascadeCount.greaterThan(2).and(orthoDepth.greaterThanEqual(c1IntY)), () => {
                cascadeIdx.assign(int(2));
            })
                .ElseIf(
                    u.shadowCascadeCount.greaterThan(1).and(orthoDepth.greaterThanEqual(c0IntY)),
                    () => {
                        // In c1 region, possibly fading to c2
                        cascadeIdx.assign(int(1));
                        If(
                            u.shadowCascadeCount
                                .greaterThan(2)
                                .and(orthoDepth.greaterThanEqual(c1IntX))
                                .and(c1Alpha.lessThan(1)),
                            () => {
                                useNext.assign(
                                    jitterVal.lessThanEqual(c1Alpha).select(float(1), float(0))
                                );
                            }
                        );
                    }
                )
                .Else(() => {
                    // In c0 region, possibly fading to c1
                    cascadeIdx.assign(int(0));
                    If(
                        u.shadowCascadeCount
                            .greaterThan(1)
                            .and(orthoDepth.greaterThanEqual(c0IntX))
                            .and(c0Alpha.lessThan(1)),
                        () => {
                            useNext.assign(
                                jitterVal.lessThanEqual(c0Alpha).select(float(1), float(0))
                            );
                        }
                    );
                });

            const finalIdx = useNext.greaterThan(0.5).select(cascadeIdx.add(int(1)), cascadeIdx);

            If(finalIdx.equal(int(0)), () => {
                od.assign(sampleCascade(0));
            })
                .ElseIf(finalIdx.equal(int(1)), () => {
                    od.assign(sampleCascade(1));
                })
                .Else(() => {
                    od.assign(sampleCascade(2));
                });
        });

        return od;
    });
};

/* -------------------------------------------------------------------------- */
/*  approximateHaze (analytical altitude-exponential fog)                     */
/*  Based on https://iquilezles.org/articles/fog/                             */
/* -------------------------------------------------------------------------- */

export const createApproximateHaze = (u: CloudUniforms) => {
    const remapClamped = Fn(([x, a, b]: [any, any, any]): any => {
        return saturate(x.sub(a).div(b.sub(a)));
    });

    return Fn(
        ([rayOrigin, rayDirection, maxRayDistance, cosTheta, shadowLength]: [
            any,
            any,
            any,
            any,
            any
        ]): any => {
            // Coverage modulation: haze ramps in as cloud coverage goes from 0.2 to 0.4
            const modulation = remapClamped(u.coverage, float(0.2), float(0.4));

            // Exponential density at camera altitude
            const heightTerm = u.cameraHeight.mul(modulation);
            const earlyOut = heightTerm.lessThan(0);
            const density = modulation
                .mul(u.hazeDensityScale)
                .mul(exp(u.cameraHeight.negate().mul(u.hazeExponent)));
            const skipHaze = earlyOut.or(density.lessThan(1e-7));

            // Blend surface normal between origin (ground) and horizon
            const normalAtOrigin = rayOrigin.normalize();
            const projOntoRay = dot(rayOrigin, rayDirection).mul(rayDirection);
            const normalAtHorizon = rayOrigin.sub(projOntoRay).div(u.bottomRadius);
            const blendAlpha = remapClamped(
                dot(normalAtOrigin, normalAtHorizon),
                float(0.9),
                float(1.0)
            );
            const normal = mix(normalAtOrigin, normalAtHorizon, blendAlpha);

            // Analytical optical depth (Iñigo Quílez exponential fog integral)
            const angle = max(dot(normal, rayDirection), float(1e-5));
            const exponent = angle.mul(u.hazeExponent);
            const linearTerm = density.div(u.hazeExponent).div(angle);

            const expTerm = float(1).sub(exp(maxRayDistance.mul(exponent).negate()));
            const shadowExpTerm = float(1).sub(
                exp(min(maxRayDistance, shadowLength).mul(exponent).negate())
            );

            const opticalDepth = expTerm.mul(linearTerm);
            const shadowOpticalDepth = max(expTerm.sub(shadowExpTerm).mul(linearTerm), float(0));
            const transmittance = saturate(float(1).sub(exp(opticalDepth.negate())));
            const shadowTransmittance = saturate(float(1).sub(exp(shadowOpticalDepth.negate())));

            // Illuminance at camera position (matches reference vGroundIrradiance)
            const splitIrr = getSplitScalarIlluminance(
                rayOrigin.mul(u.worldToUnit),
                u.sunDirection
            ).toConst();
            const sunIrr = splitIrr.get("direct");
            const skyIrr = splitIrr.get("indirect");

            // Sun inscatter with phase function and shadow awareness
            const phase = phaseFunction(cosTheta, float(1.0), u);
            let inscatter = sunIrr.mul(phase).mul(shadowTransmittance);
            // Sky inscatter (isotropic)
            inscatter.addAssign(
                skyIrr.mul(float(RECIPROCAL_PI4)).mul(u.skyLightScale).mul(transmittance)
            );
            // Single-scattering albedo
            const albedo = u.hazeScatteringCoefficient.div(
                u.hazeAbsorptionCoefficient.add(u.hazeScatteringCoefficient)
            );
            inscatter.mulAssign(albedo);

            // Gate by hazeEnabled and early-out conditions
            const enabled = u.hazeEnabled.greaterThan(0);
            const shouldRender = enabled.and(skipHaze.not());
            const result = vec4(inscatter, transmittance);
            return shouldRender.select(result, vec4(0, 0, 0, 0));
        }
    );
};

/* -------------------------------------------------------------------------- */
/*  marchClouds (primary raymarch)                                             */
/* -------------------------------------------------------------------------- */

const marchCloudsResultStruct = /*#__PURE__*/ struct(
    {
        color: "vec4",
        frontDepth: "float"
    },
    "MarchCloudsResult"
);

export const createMarchClouds = (u: CloudUniforms): any => {
    const sampleWeather = createSampleWeather(u);
    const sampleMedia = createSampleMedia(u);
    const marchOpticalDepth = createMarchOpticalDepth(u);
    const getMipLevel = createGetMipLevel(u);
    const sampleShadowOpticalDepth = createSampleShadowOpticalDepth(u);

    return Fn(
        ([rayOrigin, rayDirection, rayNearFar, cosTheta, jitter]: [any, any, any, any, any]) => {
            const radianceIntegral = vec3(0).toVar();
            const debugSunIrrSum = vec3(0).toVar();
            const debugStepCount = float(0).toVar();
            const transmittanceIntegral = float(1).toVar();
            const weightedDistanceSum = float(0).toVar();
            const transmittanceSum = float(0).toVar();
            const debugOpticalDepth = float(-1).toVar();

            const maxRayDistance = rayNearFar.y.sub(rayNearFar.x).toVar();
            const stepSize = u.minStepSize
                .add(u.perspectiveStepScale.sub(1).mul(rayNearFar.x))
                .toVar();
            const rayDistance = stepSize.mul(jitter).mul(2).toVar();
            const camHeight = u.cameraHeight;

            // GLSL: compute base mip from screen-space derivatives (once before loop)
            // float mipLevel = getMipLevel(globeUv * localWeatherRepeat) * mipLevelScale;
            // mipLevel = mix(0.0, mipLevel, min(1.0, 0.2 * cameraHeight / maxHeight));
            // rayStartTexelsPerPixel = pow(2.0, mipLevel);
            const initialUv = getGlobeUv(rayOrigin);
            const baseMip = getMipLevel(initialUv.mul(u.localWeatherRepeat)).mul(u.mipLevelScale);
            const cameraAdjustedMip = mix(
                float(0),
                baseMip,
                min(float(1), float(0.2).mul(camHeight).div(u.maxHeight))
            );
            const rayStartTexelsPerPixel = pow(float(2), cameraAdjustedMip);

            // Precompute irradiance at minHeight and maxHeight for per-step height interpolation.
            // Matches reference getCloudsSunSkyIrradiance (non-accurate path):
            //   alpha = remapClamped(height, minHeight, maxHeight)
            //   skyIrr = mix(minSky, maxSky, alpha)
            //   sunIrr = mix(minSun, maxSun, alpha)
            const minUnit = u.bottomRadius.add(u.minHeight).mul(u.worldToUnit);
            const maxUnit = u.bottomRadius.add(u.maxHeight).mul(u.worldToUnit);
            const surfaceNormal = normalize(rayOrigin);
            const minIrr = getSplitScalarIlluminance(
                surfaceNormal.mul(minUnit),
                u.sunDirection
            ).toConst();
            const maxIrr = getSplitScalarIlluminance(
                surfaceNormal.mul(maxUnit),
                u.sunDirection
            ).toConst();
            const minSunIrradiance = minIrr.get("direct");
            const maxSunIrradiance = maxIrr.get("direct");
            const minSkyIrradiance = minIrr.get("indirect");
            const maxSkyIrradiance = maxIrr.get("indirect");

            Loop({ start: 0, end: u.maxIterationCount, type: "int" }, () => {
                If(rayDistance.greaterThan(maxRayDistance), () => {
                    Break();
                });

                debugStepCount.addAssign(float(1));

                const position = rayDistance.mul(rayDirection).add(rayOrigin);
                const height = length(position).sub(u.bottomRadius);
                // OPTIMIZATION: same normalize() reuse as other loops.
                const n = normalize(position);
                const uv = getCubeSphereUvNormalized(n);
                // GLSL: mipLevel = log2(max(1.0, rayStartTexelsPerPixel + rayDistance * 1e-5))
                const mipLevel = log2(
                    max(float(1), rayStartTexelsPerPixel.add(rayDistance.mul(1e-5)))
                );

                // Skip gaps between cloud layers (insideLayerIntervals) - BEFORE weather sample
                const gtInt = step(u.minIntervalHeights, vec3(height));
                const ltInt = step(vec3(height), u.maxIntervalHeights);
                const inInterval = gtInt.mul(ltInt);
                const isGap = inInterval.x.add(inInterval.y).add(inInterval.z).greaterThan(0.5);

                If(isGap, () => {
                    stepSize.mulAssign(u.perspectiveStepScale);
                    rayDistance.addAssign(mix(stepSize, u.maxStepSize, min(float(1), mipLevel)));
                }).Else(() => {
                    const heightFraction = remapClamped(
                        vec4(height),
                        u.minLayerHeights,
                        u.maxLayerHeights
                    ).toVar();
                    const density = sampleWeather(uv, height, mipLevel).toVar();

                    // Skip empty space
                    const maxDensity = max(density.x, max(density.y, max(density.z, density.w)));
                    const isEmpty = maxDensity.lessThanEqual(u.minDensity);

                    If(isEmpty, () => {
                        stepSize.mulAssign(u.perspectiveStepScale);
                        rayDistance.addAssign(
                            mix(stepSize, u.maxStepSize, min(float(1), mipLevel))
                        );
                    }).Else(() => {
                        const media = sampleMedia(
                            heightFraction,
                            density,
                            position,
                            uv,
                            mipLevel,
                            jitter,
                            rayOrigin,
                            n
                        );
                        const mediaScattering = media.x;
                        const mediaExtinction = media.y;
                        const skyGradient = media.z;

                        If(mediaExtinction.greaterThan(u.minExtinction), () => {
                            // Per-step height-interpolated irradiance (matches reference)
                            const irrAlpha = remapClamped(height, u.minHeight, u.maxHeight);
                            const sunIrradiance = mix(minSunIrradiance, maxSunIrradiance, irrAlpha);
                            const skyIrradiance = mix(minSkyIrradiance, maxSkyIrradiance, irrAlpha);

                            // STEP 8i: accumulate sunIrradiance for debug
                            // debugSunIrrSum.addAssign(sunIrradiance.mul(0.01));

                            const sunMarchResult = marchOpticalDepth(
                                position,
                                u.sunDirection,
                                jitter,
                                mipLevel,
                                u.maxIterationCountToSun
                            ).toConst();
                            const opticalDepth = sunMarchResult.x.toVar();
                            const sunRayDistance = sunMarchResult.y;

                            // BSM shadow: cascade frustum coordinate mapping needs rewrite
                            If(height.lessThan(u.shadowTopHeight), () => {
                                const shadowOD = sampleShadowOpticalDepth(
                                    position,
                                    sunRayDistance,
                                    u.maxShadowFilterRadius.mul(
                                        remapClamped(dot(u.sunDirection, n), float(0.1), float(0))
                                    ),
                                    jitter
                                ).toVar();
                                opticalDepth.addAssign(shadowOD);
                            });

                            let radiance = sunIrradiance.mul(
                                approximateMultipleScattering(opticalDepth, cosTheta, u)
                            );

                            // Ground bounce: disabled (maxIterationCountToGround=0, matches reference medium preset)

                            // Sky irradiance
                            radiance = radiance.add(
                                skyIrradiance
                                    .mul(RECIPROCAL_PI4)
                                    .mul(skyGradient)
                                    .mul(u.skyLightScale)
                            );

                            radiance = radiance.mul(mediaScattering);

                            // Powder effect
                            radiance = radiance.mul(
                                float(1).sub(
                                    u.powderScale.mul(
                                        exp(mediaExtinction.mul(u.powderExponent).negate())
                                    )
                                )
                            );

                            const transmittance = exp(mediaExtinction.mul(stepSize).negate());
                            const clampedExt = max(mediaExtinction, float(1e-7));
                            const integral = radiance
                                .sub(radiance.mul(transmittance))
                                .div(clampedExt);

                            // STEP 8n: accumulate integral WITH transmittanceIntegral
                            // debugSunIrrSum.addAssign(transmittanceIntegral.mul(integral).mul(0.01));

                            radianceIntegral.addAssign(transmittanceIntegral.mul(integral));
                            transmittanceIntegral.mulAssign(transmittance);

                            // Accumulate for frontDepth (aerial perspective)
                            weightedDistanceSum.addAssign(transmittanceIntegral.mul(rayDistance));
                            transmittanceSum.addAssign(transmittanceIntegral);
                        });

                        stepSize.mulAssign(u.perspectiveStepScale);
                        rayDistance.addAssign(stepSize);
                    });
                });

                If(transmittanceIntegral.lessThanEqual(u.minTransmittance), () => {
                    Break();
                });
            });

            const alpha = remapClamped(transmittanceIntegral, float(1), u.minTransmittance);
            const frontDepth = transmittanceSum
                .greaterThan(0)
                .select(weightedDistanceSum.div(transmittanceSum), float(-1));
            return marchCloudsResultStruct(vec4(radianceIntegral, alpha), frontDepth);
        }
    );
};

/* -------------------------------------------------------------------------- */
/*  Main cloud render function                                                 */
/* -------------------------------------------------------------------------- */

const cloudRendererResultStruct = /*#__PURE__*/ struct(
    {
        color: "vec4",
        frontDepth: "float",
        velocity: "vec2",
        shadowLength: "float"
    },
    "CloudRendererResult"
);

export const createCloudRenderer = (u: CloudUniforms) => {
    const marchClouds = createMarchClouds(u);
    const sampleWeather = createSampleWeather(u);
    const sampleMedia = createSampleMedia(u);
    const marchOpticalDepth = createMarchOpticalDepth(u);
    const sampleShadowOpticalDepth = createSampleShadowOpticalDepth(u);
    const sampleShadowOpticalDepthSingle = createSampleShadowOpticalDepthSingle(u);
    const marchShadowLength = createMarchShadowLength(u, sampleShadowOpticalDepthSingle);
    const approximateHaze = createApproximateHaze(u);
    // Return a factory that produces a fresh Fn per cascade (bakes cascadeIndex in closure)
    const shadowMarchFactory = (cascadeIndex: number = 0) =>
        createShadowMarchClouds(u, cascadeIndex);

    const render = Fn(([cameraPosition, rayDirection, sceneDistance]: [any, any, any]) => {
        const cosTheta = dot(u.sunDirection, rayDirection);
        const jitter = stbn;

        const bottomRadius = u.bottomRadius;
        const cameraHeight = u.cameraHeight;

        const r = length(u.cameraPosition);
        const mu = dot(u.cameraPosition, rayDirection).div(r);
        const muNeg = step(mu, float(0));
        const groundDisc = r.mul(r).mul(mu.mul(mu).sub(1)).add(bottomRadius.mul(bottomRadius));
        const groundHit = step(float(0), groundDisc);
        const intersectsGround = muNeg.mul(groundHit);

        const b = dot(rayDirection, u.cameraPosition).mul(2);
        const r2 = dot(u.cameraPosition, u.cameraPosition);

        // bottomRadius sphere intersection (for haze ground clamp)
        const cGround = r2.sub(bottomRadius.mul(bottomRadius));
        const dGround = b.mul(b).sub(cGround.mul(4));
        const QGround = sqrt(dGround.max(0));
        const nearGround = b.negate().sub(QGround).mul(0.5);

        const rMin = bottomRadius.add(u.minHeight);
        const cMin = r2.sub(rMin.mul(rMin));
        const dMin = b.mul(b).sub(cMin.mul(4));
        const QMin = sqrt(dMin.max(0));
        const nearMin = b.negate().sub(QMin).mul(0.5);
        const farMin = b.negate().add(QMin).mul(0.5);

        const rMax = bottomRadius.add(u.maxHeight);
        const cMax = r2.sub(rMax.mul(rMax));
        const dMax = b.mul(b).sub(cMax.mul(4));
        const QMax = sqrt(dMax.max(0));
        const nearMax = b.negate().sub(QMax).mul(0.5);
        const farMax = b.negate().add(QMax).mul(0.5);

        // Haze ray intersection: maxHeight sphere (matches reference intersections.second.z)
        const rHazeMax = bottomRadius.add(u.maxHeight);
        const cHazeMax = r2.sub(rHazeMax.mul(rHazeMax));
        const dHazeMax = b.mul(b).sub(cHazeMax.mul(4));
        const QHazeMax = sqrt(dHazeMax.max(0));
        const farHazeMax = b.negate().add(QHazeMax).mul(0.5);
        // Haze ray far: clamp to scene depth (matches reference)
        const hazeRayFarRaw = intersectsGround.greaterThan(0.5).select(nearGround, farHazeMax);
        const hazeRayFar = sceneDistance
            .greaterThan(0)
            .select(min(hazeRayFarRaw, sceneDistance), hazeRayFarRaw);

        const aboveMin = cameraHeight.greaterThanEqual(u.minHeight);
        const aboveMax = cameraHeight.greaterThanEqual(u.maxHeight);
        const noGround = intersectsGround.lessThanEqual(0.5);

        const nearBelow = noGround.select(farMin, float(-1));
        const farBelow = noGround.select(min(farMax, u.maxRayDistance), float(-1));
        const farInside = noGround.select(farMax, nearMin);
        const farAbove = noGround.select(farMax, nearMin);

        const rayNear = aboveMax.select(nearMax, aboveMin.select(float(0), nearBelow));
        const rayFar = min(
            aboveMax.select(farAbove, aboveMin.select(farInside, farBelow)),
            sceneDistance
        );

        const nearValid = step(float(0), rayNear);
        const farValid = step(float(0), rayFar);
        const farGteNear = step(rayNear, rayFar);
        const shouldMarch = nearValid.mul(farValid).mul(farGteNear);

        const resultColor = vec4(0, 0, 0, 0).toVar();
        const resultFrontDepth = rayFar.toVar();
        const resultVelocity = vec2(0, 0).toVar();
        const resultShadowLen = float(0).toVar();

        const debugMode = u.debugMode;

        If(shouldMarch.greaterThan(0.5), () => {
            const origin = rayNear.mul(rayDirection).add(u.cameraPosition);
            const marchResult = marchClouds(
                origin,
                rayDirection,
                vec2(rayNear, rayFar),
                cosTheta,
                jitter
            ).toConst();

            resultColor.assign(marchResult.get("color"));

            // Debug: globe UV at entry point
            If(debugMode.equal(float(201)), () => {
                const debugUv = getGlobeUv(origin);
                resultColor.assign(vec4(debugUv, 0, 1));
            });
            // Debug: weather texture value at entry point
            If(debugMode.equal(float(202)), () => {
                const debugUv = getGlobeUv(origin);
                const wUv = debugUv.mul(u.localWeatherRepeat).add(u.localWeatherOffset);
                const wVal = textureLevel(u.localWeatherTexture, wUv, float(0));
                resultColor.assign(vec4(wVal.rgb, 1));
            });
            // Debug: shape texture value at entry point
            If(debugMode.equal(float(203)), () => {
                const debugUv = getGlobeUv(origin);
                const shapePos = origin.mul(u.shapeRepeat);
                const shapeVal = texture3D(u.shapeTexture, shapePos).r;
                resultColor.assign(vec4(shapeVal, shapeVal, shapeVal, 1));
            });
            // Debug: camera height normalized
            If(debugMode.equal(float(204)), () => {
                const h = u.cameraHeight
                    .sub(u.minHeight)
                    .div(u.maxHeight.sub(u.minHeight))
                    .clamp(0, 1);
                resultColor.assign(vec4(h, h, h, 1));
            });
            // Debug: ray direction (XY) as color
            If(debugMode.equal(float(205)), () => {
                resultColor.assign(vec4(rayDirection.xy.mul(0.5).add(0.5), 0, 1));
            });
            // Debug: STBN noise value
            If(debugMode.equal(float(207)), () => {
                const s = stbn.toVar();
                resultColor.assign(vec4(s, s, s, 1));
            });
            // Debug: camera position as color (normalized)
            If(debugMode.equal(float(206)), () => {
                const cp = u.cameraPosition.mul(1e-7);
                resultColor.assign(vec4(cp.xy, 0, 1));
            });

            const marchedFrontDepth = marchResult.get("frontDepth").toConst();
            const hitClouds = marchedFrontDepth.greaterThanEqual(0).toConst();
            If(hitClouds, () => {
                const frontDepth = rayNear.add(marchedFrontDepth);
                const frontPosition = u.cameraPosition.add(frontDepth.mul(rayDirection));

                const shadowLen = float(0).toVar();
                If(u.maxShadowLengthIterationCount.greaterThan(0), () => {
                    const shadowRayFar = min(frontDepth, u.maxShadowLengthRayDistance);
                    const shadowRayNear = float(1); // camera near plane
                    shadowLen.assign(
                        marchShadowLength(
                            shadowRayNear.mul(rayDirection).add(u.cameraPosition),
                            rayDirection,
                            vec2(shadowRayNear, shadowRayFar),
                            jitter
                        )
                    );
                });

                resultShadowLen.assign(shadowLen);

                // Apply aerial perspective to clouds
                {
                    const result = getIndirectLuminanceToPoint(
                        cameraPosition.mul(u.worldToUnit),
                        frontPosition.mul(u.worldToUnit),
                        vec2(shadowLen.mul(u.worldToUnit), float(0)),
                        u.sunDirection
                    ).toConst();
                    const inscatter = result.get("luminance");
                    const transmittance = result.get("transmittance");
                    resultColor.assign(
                        vec4(
                            resultColor.rgb.mul(transmittance).add(inscatter.mul(resultColor.a)),
                            resultColor.a
                        )
                    );
                }

                resultFrontDepth.assign(frontDepth);

                const frontWorld = u.ecefToWorld.mul(
                    vec4(frontPosition.sub(u.altitudeCorrection), 1)
                ).xyz;
                const curClip = u.viewProjection.mul(vec4(frontWorld, 1));
                const curUv = curClip.xy.div(curClip.w).mul(0.5).add(0.5);
                const prevClip = u.prevViewProjection.mul(vec4(frontWorld, 1));
                const prevUv = prevClip.xy.div(prevClip.w).mul(0.5).add(0.5);
                const vel = curUv.sub(prevUv);
                resultVelocity.assign(vec2(vel.x, vel.y.negate()));
            });

            // Non-cloud pixels: compute shadowLength + velocity
            If(hitClouds.not(), () => {
                // Only march shadow length when haze is enabled (avoids expensive march for sky pixels)
                If(
                    u.hazeEnabled
                        .greaterThan(0)
                        .and(u.maxShadowLengthIterationCount.greaterThan(0)),
                    () => {
                        const shadowRayFar = min(
                            sceneDistance.greaterThan(0).select(sceneDistance, rayFar),
                            u.maxShadowLengthRayDistance
                        );
                        resultShadowLen.assign(
                            marchShadowLength(
                                u.cameraPosition.add(rayDirection.mul(float(1))),
                                rayDirection,
                                vec2(float(1), shadowRayFar),
                                jitter
                            )
                        );
                    }
                );

                const ncDepth = sceneDistance.greaterThan(0).select(sceneDistance, rayFar);
                const ncPosition = u.cameraPosition.add(ncDepth.mul(rayDirection));
                const ncWorld = u.ecefToWorld.mul(
                    vec4(ncPosition.sub(u.altitudeCorrection), 1)
                ).xyz;
                const ncCurClip = u.viewProjection.mul(vec4(ncWorld, 1));
                const ncCurUv = ncCurClip.xy.div(ncCurClip.w).mul(0.5).add(0.5);
                const ncPrevClip = u.prevViewProjection.mul(vec4(ncWorld, 1));
                const ncPrevUv = ncPrevClip.xy.div(ncPrevClip.w).mul(0.5).add(0.5);
                resultFrontDepth.assign(ncDepth);
                const ncVel = ncCurUv.sub(ncPrevUv);
                resultVelocity.assign(vec2(ncVel.x, ncVel.y.negate()));
            });
        });

        // Haze
        If(u.hazeEnabled.greaterThan(0), () => {
            const hazeClampedFar = mix(
                hazeRayFar,
                min(resultFrontDepth, hazeRayFar),
                resultColor.a
            );
            const haze = approximateHaze(
                float(1).mul(rayDirection).add(u.cameraPosition),
                rayDirection,
                hazeClampedFar.sub(1),
                cosTheta,
                resultShadowLen
            ).toConst();
            resultColor.rgb.assign(mix(resultColor.rgb, haze.rgb, haze.a));
            resultColor.a.assign(resultColor.a.mul(float(1).sub(haze.a)).add(haze.a));
        });

        return cloudRendererResultStruct(
            resultColor,
            resultFrontDepth,
            resultVelocity,
            resultShadowLen
        );
    });

    return { render, shadowMarch: shadowMarchFactory };
};
