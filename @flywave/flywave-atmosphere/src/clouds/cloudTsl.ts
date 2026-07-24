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
    screenUV,
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
import { stbn } from "../tsl/STBNTextureNode";
import { getIndirectLuminanceToPoint, getSplitScalarIlluminance } from "../atmosphere/runtime";
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
        const deltaMaxSqr = max(dot(ddx, ddx), dot(ddy, ddy)).mul(u.mipLevelScale);
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
        const heightFraction = remapClamped(vec4(height), u.minLayerHeights, u.maxLayerHeights);

        // GLSL: textureLod(localWeatherTexture, uv * localWeatherRepeat + localWeatherOffset, mipLevel)
        const weatherUv = uv.mul(u.localWeatherRepeat).add(u.localWeatherOffset);
        const weatherTex = texture(u.localWeatherTexture, weatherUv, mipLevel);
        const localWeather = exp(u.weatherExponents.mul(weatherTex.log()));

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

    Loop({ start: 0, end: 8, type: "int" }, () => {
        const bl = exp(opticalDepth.mul(coeffs.y).negate());
        const phase = phaseFunction(cosTheta, coeffs.z, u);
        scattering.addAssign(coeffs.x.mul(bl).mul(phase));
        coeffs.mulAssign(attenuation);
    });

    return scattering;
});

/* -------------------------------------------------------------------------- */
/*  Media sampling                                                             */
/* -------------------------------------------------------------------------- */

export const createSampleMedia = (u: CloudUniforms) => {
    const getLayerDensity = createGetLayerDensity(u);

    return Fn(
        ([heightFraction, density, position, uv, mipLevel, jitter, cameraPosition]: [
            any,
            any,
            any,
            any,
            any,
            any,
            any
        ]) => {
            const surfaceNormal = normalize(position);
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

            Loop({ start: 0, end: 128, type: "int" }, () => {
                If(stepsTaken.greaterThanEqual(iterationCount), () => {
                    Break();
                });

                const position = currentDist.mul(rayDirection).add(rayOrigin);
                const height = length(position).sub(u.bottomRadius);
                const uv = getGlobeUv(position);
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
                    rayOrigin
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
            const opticalDepth = sampleShadowOpticalDepth(position, float(0)).toConst();
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
/*  Shadow march (BSM render pass): raymarch clouds from sun's POV             */
/*  Outputs vec4(frontDepth, meanExtinction, maxOpticalDepth, maxOpticalDepthTail) */
/* -------------------------------------------------------------------------- */

const SHADOW_MAX_ITERATIONS = 48;

export const createShadowMarchClouds = (u: CloudUniforms, cascadeIndex: number = 0) => {
    const sampleWeather = createSampleWeather(u);
    const sampleMedia = createSampleMedia(u);
    // Bake cascade index into shader (constant for compiled material)
    const invMat = u.inverseShadowMatrices[cascadeIndex];
    // Per-cascade mip level: [0.0, 0.5, 1.0, 2.0] (matching reference shadow.frag)
    const SHADOW_MIP_LEVELS = [0.0, 0.5, 1.0, 2.0];
    const cascadeMipLevel = float(SHADOW_MIP_LEVELS[cascadeIndex] ?? 0.0);

    return Fn((): any => {
        const clip = screenUV.mul(2).sub(1);
        const point = invMat.mul(vec4(clip, float(-1), float(1)));
        const pDiv = point.xyz.div(point.w);
        const sunPosition = pDiv.add(u.altitudeCorrection);

        const rayDirection = u.sunDirection.negate().normalize();

        const a = sunPosition;
        const b = dot(rayDirection, a).mul(2);
        const aa = dot(a, a);

        const shadowTopR = u.bottomRadius.add(u.shadowTopHeight);
        const cTop = aa.sub(shadowTopR.mul(shadowTopR));
        const discTop = b.mul(b).sub(cTop.mul(4));
        const rayNear = max(
            float(0),
            b
                .negate()
                .sub(sqrt(discTop.max(0)))
                .mul(0.5)
        );

        const shadowBottomR = u.bottomRadius.add(u.minHeight);
        const cBottom = aa.sub(shadowBottomR.mul(shadowBottomR));
        const discBottom = b.mul(b).sub(cBottom.mul(4));
        const rayFar = b
            .negate()
            .sub(sqrt(discBottom.max(0)))
            .mul(0.5);

        const maxRayDistance = rayFar.sub(rayNear).max(0);
        const rayOrigin = rayNear.mul(rayDirection).add(sunPosition);

        const stepSize = maxRayDistance
            .div(float(SHADOW_MAX_ITERATIONS))
            .max(u.minStepSize)
            .toVar();
        const rayDistance = stepSize.mul(stbn).toVar();

        const extinctionSum = float(0).toVar();
        const maxOpticalDepth = float(0).toVar();
        const maxOpticalDepthTail = float(0).toVar();
        const transmittanceIntegral = float(1).toVar();
        const weightedDistanceSum = float(0).toVar();
        const transmittanceSum = float(0).toVar();
        const sampleCount = float(0).toVar();

        Loop({ start: 0, end: SHADOW_MAX_ITERATIONS, type: "int" }, () => {
            If(rayDistance.greaterThan(maxRayDistance), () => {
                Break();
            });

            const position = rayDistance.mul(rayDirection).add(rayOrigin);
            const height = length(position).sub(u.bottomRadius);
            const uv = getGlobeUv(position);
            const heightFraction = remapClamped(vec4(height), u.minLayerHeights, u.maxLayerHeights);
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
                    rayOrigin
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

            If(transmittanceIntegral.lessThanEqual(u.minTransmittance), () => {
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

            rayDistance.addAssign(stepSize);
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
    // Helper: compute cascade-specific projection (UV + inBounds) for given index
    const projectCascade = (cascadeIdx: number, posUncorrected: any) => {
        const mat = u.shadowMatrices[cascadeIdx];
        const clip = mat.mul(vec4(posUncorrected, 1));
        const clipDiv = clip.xy.div(clip.w);
        const shadowUV = clipDiv.mul(0.5).add(0.5);

        const inBounds = step(float(0), shadowUV.x)
            .mul(step(shadowUV.x, float(1)))
            .mul(step(float(0), shadowUV.y))
            .mul(step(shadowUV.y, float(1)));

        return { shadowUV, inBounds };
    };

    // Per-frame rotation matrix for PCF taps + sub-texel jitter.
    // Uses frame counter to cycle through 8 rotations, giving temporal
    // softening when combined with TAA in the resolve pass.
    const getJitterRotation = () => {
        const angle = u.frame.mod(float(8)).mul(float(Math.PI / 4));
        const cosA = cos(angle);
        const sinA = sin(angle);
        // Sub-texel jitter: rotate by angle, scale to half texel
        const subTexel = vec2(cosA, sinA).mul(u.shadowTexelSize.mul(float(0.5)));
        return { cosA, sinA, subTexel };
    };

    const sampleCascadeSingle = (
        cascadeIdx: number,
        posUncorrected: any,
        distanceToTop: any,
        distanceOffset: any,
        jitter: any
    ) => {
        const { shadowUV, inBounds: baseInBounds } = projectCascade(cascadeIdx, posUncorrected);
        const tex = u.shadowTextureNodes[cascadeIdx];
        const uv = shadowUV.add(jitter.subTexel);
        const shadow = texture(tex, uv);
        const distFront = max(float(0), distanceToTop.sub(distanceOffset).sub(shadow.r));
        const od = min(shadow.b.add(shadow.a), shadow.g.mul(distFront));
        const fullBounds = baseInBounds.mul(step(float(0), distanceToTop));
        return fullBounds.greaterThan(0.5).select(od, float(0));
    };

    // Helper: sample one cascade's BSM texture with 5-tap rotated PCF + temporal jitter.
    const sampleCascadePCF = (
        cascadeIdx: number,
        posUncorrected: any,
        distanceToTop: any,
        distanceOffset: any,
        jitter: any
    ) => {
        const { shadowUV, inBounds: baseInBounds } = projectCascade(cascadeIdx, posUncorrected);
        const tex = u.shadowTextureNodes[cascadeIdx];

        const sunPenumbra = distanceToTop.mul(u.sunAngularRadius);
        const r = u.maxShadowFilterRadius.add(sunPenumbra);
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
            const uv = shadowUV.add(rotated.mul(r).mul(texel)).add(jitter.subTexel);
            const inB = step(float(0), uv.x)
                .mul(step(uv.x, float(1)))
                .mul(step(float(0), uv.y))
                .mul(step(uv.y, float(1)));
            const shadow = texture(tex, uv);
            const distFront = max(float(0), distanceToTop.sub(distanceOffset).sub(shadow.r));
            const od = min(shadow.b.add(shadow.a), shadow.g.mul(distFront));
            odSum.addAssign(inB.greaterThan(0.5).select(od, float(0)));
            loopIdx.addAssign(float(1));
        });

        const od = odSum.div(float(SHADOW_SAMPLE_COUNT));

        const fullBounds = baseInBounds.mul(step(float(0), distanceToTop));
        return fullBounds.greaterThan(0.5).select(od, float(0));
    };

    return Fn(([rayPosition, distanceOffset, radius]: [any, any, any]): any => {
        const posUncorrected = rayPosition.sub(u.altitudeCorrection);

        const rayDir = u.sunDirection.negate();
        const a = posUncorrected;
        const b = dot(rayDir, a).mul(2);
        const shadowTopR = u.bottomRadius.add(u.shadowTopHeight);
        const c = dot(a, a).sub(shadowTopR.mul(shadowTopR));
        const disc = b.mul(b).sub(c.mul(4));
        const distanceToTop = b
            .negate()
            .add(sqrt(disc.max(0)))
            .mul(0.5);

        const earlyOut = distanceToTop.lessThanEqual(0);
        const jitter = getJitterRotation();

        const viewDist = length(rayPosition.sub(u.cameraPosition));
        const c0End = u.shadowIntervals[0].y.mul(u.shadowFar);
        const c1End = u.shadowIntervals[1].y.mul(u.shadowFar);
        const c1Valid = u.shadowCascadeCount.greaterThan(1);
        const c2Valid = u.shadowCascadeCount.greaterThan(2);

        // Fade margin: 10% of each cascade range
        const c0FadeRange = c0End.sub(u.shadowIntervals[0].x.mul(u.shadowFar)).mul(0.1);
        const c1FadeRange = c1End.sub(u.shadowIntervals[1].x.mul(u.shadowFar)).mul(0.1);

        const od = float(0).toVar();

        const sampleCascade = (idx: number) =>
            radius
                .lessThan(0.1)
                .select(
                    sampleCascadeSingle(idx, posUncorrected, distanceToTop, distanceOffset, jitter),
                    sampleCascadePCF(idx, posUncorrected, distanceToTop, distanceOffset, jitter)
                );

        If(earlyOut.not(), () => {
            // c2 region
            If(viewDist.greaterThan(c1End).and(c2Valid), () => {
                od.assign(sampleCascade(2));
            })
                // c1 region (with c0↔c1 fade at lower boundary, c1↔c2 fade at upper)
                .ElseIf(viewDist.greaterThan(c0End).and(c1Valid), () => {
                    // Fade between c1 and c2 near upper boundary
                    const c1UpperFade = viewDist
                        .sub(c1End.sub(c1FadeRange))
                        .div(c1FadeRange.max(1e-7))
                        .clamp(0, 1);
                    const od1 = sampleCascade(1);
                    If(c2Valid.and(c1UpperFade.greaterThan(0)), () => {
                        const od2 = sampleCascade(2);
                        od.assign(mix(od1, od2, c1UpperFade));
                    }).Else(() => {
                        od.assign(od1);
                    });
                })
                // c0 region (with c0↔c1 fade at upper boundary)
                .Else(() => {
                    const c0UpperFade = viewDist
                        .sub(c0End.sub(c0FadeRange))
                        .div(c0FadeRange.max(1e-7))
                        .clamp(0, 1);
                    const od0 = sampleCascade(0);
                    If(c1Valid.and(c0UpperFade.greaterThan(0)), () => {
                        const od1 = sampleCascade(1);
                        od.assign(mix(od0, od1, c0UpperFade));
                    }).Else(() => {
                        od.assign(od0);
                    });
                });
        });

        return od;
    });
};

export const createSampleShadowOpticalDepthSingle = (u: CloudUniforms) => {
    const projectCascade = (cascadeIdx: number, posUncorrected: any) => {
        const mat = u.shadowMatrices[cascadeIdx];
        const clip = mat.mul(vec4(posUncorrected, 1));
        const clipDiv = clip.xy.div(clip.w);
        const shadowUV = clipDiv.mul(0.5).add(0.5);

        const inBounds = step(float(0), shadowUV.x)
            .mul(step(shadowUV.x, float(1)))
            .mul(step(float(0), shadowUV.y))
            .mul(step(shadowUV.y, float(1)));

        return { shadowUV, inBounds };
    };

    const getJitterRotation = () => {
        const angle = u.frame.mod(float(8)).mul(float(Math.PI / 4));
        const cosA = cos(angle);
        const sinA = sin(angle);
        const subTexel = vec2(cosA, sinA).mul(u.shadowTexelSize.mul(float(0.5)));
        return { cosA, sinA, subTexel };
    };

    const sampleCascadeSingle = (
        cascadeIdx: number,
        posUncorrected: any,
        distanceToTop: any,
        distanceOffset: any,
        jitter: any
    ) => {
        const { shadowUV, inBounds: baseInBounds } = projectCascade(cascadeIdx, posUncorrected);
        const tex = u.shadowTextureNodes[cascadeIdx];
        const uv = shadowUV.add(jitter.subTexel);
        const shadow = texture(tex, uv);
        const distFront = max(float(0), distanceToTop.sub(distanceOffset).sub(shadow.r));
        const od = min(shadow.b.add(shadow.a), shadow.g.mul(distFront));
        const fullBounds = baseInBounds.mul(step(float(0), distanceToTop));
        return fullBounds.greaterThan(0.5).select(od, float(0));
    };

    return Fn(([rayPosition, distanceOffset]: [any, any]): any => {
        const posUncorrected = rayPosition.sub(u.altitudeCorrection);

        const rayDir = u.sunDirection.negate();
        const a = posUncorrected;
        const b = dot(rayDir, a).mul(2);
        const shadowTopR = u.bottomRadius.add(u.shadowTopHeight);
        const c = dot(a, a).sub(shadowTopR.mul(shadowTopR));
        const disc = b.mul(b).sub(c.mul(4));
        const distanceToTop = b
            .negate()
            .add(sqrt(disc.max(0)))
            .mul(0.5);

        const earlyOut = distanceToTop.lessThanEqual(0);
        const jitter = getJitterRotation();

        const viewDist = length(rayPosition.sub(u.cameraPosition));
        const c0End = u.shadowIntervals[0].y.mul(u.shadowFar);
        const c1End = u.shadowIntervals[1].y.mul(u.shadowFar);

        const c1Valid = u.shadowCascadeCount.greaterThan(1);
        const c2Valid = u.shadowCascadeCount.greaterThan(2);

        const od = float(0).toVar();

        If(earlyOut.not(), () => {
            If(viewDist.greaterThan(c1End).and(c2Valid), () => {
                od.assign(
                    sampleCascadeSingle(2, posUncorrected, distanceToTop, distanceOffset, jitter)
                );
            })
                .ElseIf(viewDist.greaterThan(c0End).and(c1Valid), () => {
                    od.assign(
                        sampleCascadeSingle(
                            1,
                            posUncorrected,
                            distanceToTop,
                            distanceOffset,
                            jitter
                        )
                    );
                })
                .Else(() => {
                    od.assign(
                        sampleCascadeSingle(
                            0,
                            posUncorrected,
                            distanceToTop,
                            distanceOffset,
                            jitter
                        )
                    );
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

            // Inscattered light using atmosphere LUT irradiance at cloud layer
            const samplePos = rayOrigin.add(rayDirection.mul(maxRayDistance.mul(0.5)));
            const splitIrr = getSplitScalarIlluminance(
                samplePos.mul(u.worldToUnit),
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
            const baseMip = getMipLevel(initialUv.mul(u.localWeatherRepeat));
            // Reference: multiply by mipLevelScale (0.25 for temporal upscale)
            const scaledMip = baseMip.mul(u.mipLevelScale);
            const cameraAdjustedMip = mix(
                float(0),
                scaledMip,
                min(float(1), float(0.2).mul(camHeight).div(u.maxHeight))
            );
            const rayStartTexelsPerPixel = pow(float(2), cameraAdjustedMip);

            Loop({ start: 0, end: u.maxIterationCount, type: "int" }, () => {
                If(rayDistance.greaterThan(maxRayDistance), () => {
                    Break();
                });

                debugStepCount.addAssign(float(1));

                const position = rayDistance.mul(rayDirection).add(rayOrigin);
                const height = length(position).sub(u.bottomRadius);
                const uv = getGlobeUv(position);
                // GLSL: mipLevel = log2(max(1.0, rayStartTexelsPerPixel + rayDistance * 1e-5))
                const mipLevel = log2(
                    max(float(1), rayStartTexelsPerPixel.add(rayDistance.mul(1e-5)))
                );

                // Skip gaps between cloud layers (insideLayerIntervals)
                const gtInt = step(u.minIntervalHeights, vec3(height));
                const ltInt = step(vec3(height), u.maxIntervalHeights);
                const inInterval = gtInt.mul(ltInt);
                const isGap = inInterval.x.add(inInterval.y).add(inInterval.z).greaterThan(0.5);

                const heightFraction = remapClamped(
                    vec4(height),
                    u.minLayerHeights,
                    u.maxLayerHeights
                ).toVar();
                const density = sampleWeather(uv, height, mipLevel).toVar();

                // Skip empty space: check if any density component > minDensity
                const maxDensity = max(density.x, max(density.y, max(density.z, density.w)));
                const isEmpty = maxDensity.lessThanEqual(u.minDensity);
                // Skip if gap OR empty: use step arithmetic instead of .or()
                const skipCond = isGap.toFloat().add(isEmpty.toFloat()).greaterThan(0.5);

                If(skipCond, () => {
                    stepSize.mulAssign(u.perspectiveStepScale);
                    rayDistance.addAssign(mix(stepSize, u.maxStepSize, min(float(1), mipLevel)));
                }).Else(() => {
                    const media = sampleMedia(
                        heightFraction,
                        density,
                        position,
                        uv,
                        mipLevel,
                        jitter,
                        rayOrigin
                    );
                    const mediaScattering = media.x;
                    const mediaExtinction = media.y;
                    const skyGradient = media.z;

                    If(mediaExtinction.greaterThan(u.minExtinction), () => {
                        // Per-pixel LUT lookup (matches reference ACCURATE_SUN_SKY_LIGHT):
                        // getCloudsSunSkyIrradiance(position * METER_TO_LENGTH_UNIT, ...)
                        const posUnit = position.mul(u.worldToUnit);
                        const splitIrr = getSplitScalarIlluminance(
                            posUnit,
                            u.sunDirection
                        ).toConst();
                        const sunIrradiance = splitIrr.get("direct");
                        const skyIrradiance = splitIrr.get("indirect");

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

                        const heightGate = step(height, u.shadowTopHeight);
                        const cascadeGate = u.shadowCascadeCount
                            .greaterThan(0)
                            .select(float(1), float(0));
                        const bsmCond = heightGate.mul(cascadeGate);
                        const surfaceNormal = normalize(position);
                        const sunDotNormal = dot(u.sunDirection, surfaceNormal);
                        const shadowRadius = u.maxShadowFilterRadius.mul(
                            sunDotNormal.sub(0.1).div(float(0).sub(0.1)).clamp(0, 1)
                        );
                        const shadowOD = sampleShadowOpticalDepth(
                            position,
                            sunRayDistance,
                            shadowRadius
                        ).toConst();
                        opticalDepth.addAssign(shadowOD.mul(bsmCond));

                        let radiance = sunIrradiance.mul(
                            approximateMultipleScattering(opticalDepth, cosTheta, u)
                        );

                        radiance = radiance.add(
                            skyIrradiance
                                .mul(float(RECIPROCAL_PI4))
                                .mul(skyGradient)
                                .mul(u.skyLightScale)
                        );

                        // Ground bounce: light reflected from ground illuminates cloud bottoms
                        // GLSL: if (height < shadowTopHeight && mipLevel < 0.5)
                        // Gate by maxIterationCountToGround: when 0, skip entirely.
                        const groundBounceCond = step(height, u.shadowTopHeight)
                            .mul(step(mipLevel, float(0.5)))
                            .mul(u.maxIterationCountToGround.greaterThan(0));
                        If(groundBounceCond.greaterThan(0.5), () => {
                            const groundDir = normalize(position).negate();
                            const opticalDepthToGround = marchOpticalDepth(
                                position,
                                groundDir,
                                jitter,
                                mipLevel,
                                u.maxIterationCountToGround
                            ).x;
                            // Ground irradiance: project to ground level and compute
                            // (matches reference getGroundSunSkyIrradiance)
                            const groundPosition = position.sub(normalize(position).mul(height));
                            const groundIrr = getSplitScalarIlluminance(
                                groundPosition.mul(u.worldToUnit),
                                u.sunDirection
                            ).toConst();
                            const groundSkyIrr = groundIrr.get("indirect");
                            const groundSunIrr = groundIrr.get("direct");
                            const groundIrradianceVal = groundSkyIrr.add(
                                oneMinus(u.coverage).mul(groundSunIrr)
                            );
                            const groundAlbedo = float(0.3);
                            const bouncedRadiance = groundAlbedo
                                .mul(float(RECIPROCAL_PI))
                                .mul(groundIrradianceVal)
                                .mul(exp(opticalDepthToGround.negate()));
                            radiance = radiance.add(
                                bouncedRadiance.mul(float(RECIPROCAL_PI4)).mul(u.groundBounceScale)
                            );
                        });

                        // STEP 8k: accumulate radiance before mediaScattering
                        // debugSunIrrSum.addAssign(radiance.mul(0.001));

                        radiance = radiance.mul(mediaScattering);

                        radiance = radiance.mul(
                            oneMinus(
                                u.powderScale.mul(
                                    exp(mediaExtinction.mul(u.powderExponent).negate())
                                )
                            )
                        );

                        const transmittance = exp(mediaExtinction.mul(stepSize).negate());
                        const clampedExt = max(mediaExtinction, float(1e-7));
                        const integral = radiance.sub(radiance.mul(transmittance)).div(clampedExt);

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

                If(transmittanceIntegral.lessThanEqual(u.minTransmittance), () => {
                    Break();
                });
            });

            const alpha = remapClamped(transmittanceIntegral, float(1), u.minTransmittance);
            const frontDepth = transmittanceSum
                .greaterThan(0)
                .select(weightedDistanceSum.div(transmittanceSum), float(-1));
            // DEBUG override: when u.debugMode==78, return step count in alpha channel
            // (marchClouds can't access debugMode directly; instead, hack via marchResult struct)
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
        velocity: "vec2"
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

        const r = length(cameraPosition);
        const mu = dot(cameraPosition, rayDirection).div(r);
        const muNeg = step(mu, float(0));
        const groundDisc = r.mul(r).mul(mu.mul(mu).sub(1)).add(bottomRadius.mul(bottomRadius));
        const groundHit = step(float(0), groundDisc);
        const intersectsGround = muNeg.mul(groundHit);

        const b = dot(rayDirection, cameraPosition).mul(2);
        const r2 = dot(cameraPosition, cameraPosition);

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

        const debugMode = u.debugMode;

        // STEP 8g: marchClouds + aerial perspective + haze
        If(shouldMarch.greaterThan(0.5), () => {
            const origin = rayNear.mul(rayDirection).add(cameraPosition);
            const marchResult = marchClouds(
                origin,
                rayDirection,
                vec2(rayNear, rayFar),
                cosTheta,
                jitter
            ).toConst();

            resultColor.assign(marchResult.get("color"));

            const marchedFrontDepth = marchResult.get("frontDepth").toConst();
            const hitClouds = marchedFrontDepth.greaterThanEqual(0).toConst();
            If(hitClouds, () => {
                const frontDepth = rayNear.add(marchedFrontDepth);
                const frontPosition = cameraPosition.add(frontDepth.mul(rayDirection));

                const shadowLen = float(0).toVar();
                If(u.maxShadowLengthIterationCount.greaterThan(0), () => {
                    const shadowRayFar = min(frontDepth, u.maxShadowLengthRayDistance);
                    shadowLen.assign(
                        marchShadowLength(
                            cameraPosition,
                            rayDirection,
                            vec2(float(0), shadowRayFar),
                            jitter
                        )
                    );
                });

                const luminanceTransfer = getIndirectLuminanceToPoint(
                    cameraPosition.mul(u.worldToUnit),
                    frontPosition.mul(u.worldToUnit),
                    vec2(shadowLen.mul(u.worldToUnit), float(0)),
                    u.sunDirection
                ).toConst();
                const transmittance = luminanceTransfer.get("transmittance");
                const inscatter = luminanceTransfer.get("luminance");
                resultColor.rgb.assign(
                    resultColor.rgb.mul(transmittance).add(inscatter.mul(resultColor.a))
                );

                resultFrontDepth.assign(frontDepth);

                const frontWorld = u.ecefToWorld.mul(
                    vec4(frontPosition.sub(u.altitudeCorrection), 1)
                ).xyz;
                const curClip = u.viewProjection.mul(vec4(frontWorld, 1));
                const curUv = curClip.xy.div(curClip.w).mul(0.5).add(0.5);
                const prevClip = u.prevViewProjection.mul(vec4(frontWorld, 1));
                const prevUv = prevClip.xy.div(prevClip.w).mul(0.5).add(0.5);
                resultVelocity.assign(curUv.sub(prevUv));
            });

            // Non-cloud pixels: compute velocity using sceneDistance
            If(hitClouds.not(), () => {
                const ncDepth = sceneDistance.greaterThan(0).select(sceneDistance, rayFar);
                const ncPosition = cameraPosition.add(ncDepth.mul(rayDirection));
                const ncWorld = u.ecefToWorld.mul(
                    vec4(ncPosition.sub(u.altitudeCorrection), 1)
                ).xyz;
                const ncCurClip = u.viewProjection.mul(vec4(ncWorld, 1));
                const ncCurUv = ncCurClip.xy.div(ncCurClip.w).mul(0.5).add(0.5);
                const ncPrevClip = u.prevViewProjection.mul(vec4(ncWorld, 1));
                const ncPrevUv = ncPrevClip.xy.div(ncPrevClip.w).mul(0.5).add(0.5);
                resultFrontDepth.assign(ncDepth);
                resultVelocity.assign(ncCurUv.sub(ncPrevUv));
            });
        });

        // Apply haze (analytical fog) after cloud march and before debug overrides.
        // Haze ray extends from camera near plane to the cloud top or scene distance.
        If(u.hazeEnabled.greaterThan(0), () => {
            const hazeOrigin = rayNear.mul(rayDirection).add(cameraPosition);
            // Haze ray distance: up to scene distance, clamped to cloud layer top
            const hazeRayDist = min(sceneDistance, rayFar);
            const shadowLen = float(0);
            const haze = approximateHaze(
                hazeOrigin,
                rayDirection,
                hazeRayDist,
                cosTheta,
                shadowLen
            ).toConst();
            // Alpha-blend haze over existing color
            resultColor.rgb.assign(resultColor.rgb.mix(haze.rgb, haze.a));
            resultColor.a.assign(resultColor.a.mul(float(1).sub(haze.a)).add(haze.a));
        });

        return cloudRendererResultStruct(resultColor, resultFrontDepth, resultVelocity);
    });

    return { render, shadowMarch: shadowMarchFactory };
};
