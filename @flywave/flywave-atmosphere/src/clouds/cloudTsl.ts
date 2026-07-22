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
        const mipLevelScale = float(0.1);
        // GLSL: coord = uv * resolution (screen pixels)
        const coord = uv.mul(u.resolution);
        const ddx = dFdx(coord);
        const ddy = dFdy(coord);
        const deltaMaxSqr = max(dot(ddx, ddx), dot(ddy, ddy)).mul(mipLevelScale);
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

    const m = vec2().toVar();

    // GLSL: if (all(greaterThan(f.yy, f.xz)))
    // = f.y > f.x && f.y > f.z
    If(f.y.greaterThan(f.x), () => {
        If(f.y.greaterThan(f.z), () => {
            // Y dominant
            If(c.y.greaterThan(0), () => {
                m.assign(vec2(n.x.negate(), n.z));
            }).Else(() => {
                m.assign(n.xz);
            });
        }).Else(() => {
            // Z dominant (f.z >= f.y > f.x)
            If(c.z.greaterThan(0), () => {
                m.assign(n.xy);
            }).Else(() => {
                m.assign(vec2(n.x, n.y.negate()));
            });
        });
    }).Else(() => {
        // f.x >= f.y
        If(f.x.greaterThan(f.z), () => {
            // X dominant
            If(c.x.greaterThan(0), () => {
                m.assign(n.yz);
            }).Else(() => {
                m.assign(vec2(n.y.negate(), n.z));
            });
        }).Else(() => {
            // Z dominant (f.z >= f.x >= f.y)
            If(c.z.greaterThan(0), () => {
                m.assign(n.xy);
            }).Else(() => {
                m.assign(vec2(n.x, n.y.negate()));
            });
        });
    });

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

    // 8 octaves manually unrolled (JS for-loops don't work inside TSL Fn)
    {
        const bl = exp(opticalDepth.mul(coeffs.y).negate());
        const phase = phaseFunction(cosTheta, coeffs.z, u);
        scattering.addAssign(coeffs.x.mul(bl).mul(phase));
        coeffs.mulAssign(attenuation);
    }
    {
        const bl = exp(opticalDepth.mul(coeffs.y).negate());
        const phase = phaseFunction(cosTheta, coeffs.z, u);
        scattering.addAssign(coeffs.x.mul(bl).mul(phase));
        coeffs.mulAssign(attenuation);
    }
    {
        const bl = exp(opticalDepth.mul(coeffs.y).negate());
        const phase = phaseFunction(cosTheta, coeffs.z, u);
        scattering.addAssign(coeffs.x.mul(bl).mul(phase));
        coeffs.mulAssign(attenuation);
    }
    {
        const bl = exp(opticalDepth.mul(coeffs.y).negate());
        const phase = phaseFunction(cosTheta, coeffs.z, u);
        scattering.addAssign(coeffs.x.mul(bl).mul(phase));
        coeffs.mulAssign(attenuation);
    }
    {
        const bl = exp(opticalDepth.mul(coeffs.y).negate());
        const phase = phaseFunction(cosTheta, coeffs.z, u);
        scattering.addAssign(coeffs.x.mul(bl).mul(phase));
        coeffs.mulAssign(attenuation);
    }
    {
        const bl = exp(opticalDepth.mul(coeffs.y).negate());
        const phase = phaseFunction(cosTheta, coeffs.z, u);
        scattering.addAssign(coeffs.x.mul(bl).mul(phase));
        coeffs.mulAssign(attenuation);
    }
    {
        const bl = exp(opticalDepth.mul(coeffs.y).negate());
        const phase = phaseFunction(cosTheta, coeffs.z, u);
        scattering.addAssign(coeffs.x.mul(bl).mul(phase));
        coeffs.mulAssign(attenuation);
    }
    {
        const bl = exp(opticalDepth.mul(coeffs.y).negate());
        const phase = phaseFunction(cosTheta, coeffs.z, u);
        scattering.addAssign(coeffs.x.mul(bl).mul(phase));
    }

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
            const opticalDepth = float(0).toVar();
            const totalDistance = float(0).toVar();
            // Reference GLSL:
            //   int i = int(max(0.0, remap(mipLevel, 0, 1, maxIterCount+1, 1) - jitter))
            const maxIter = maxIterationCount.toFloat();
            const rawCount = max(
                float(0),
                remap(mipLevel, float(0), float(1), maxIter.add(1), float(1)).sub(jitter)
            );
            const iterationCount = rawCount.floor();

            If(iterationCount.lessThanEqual(0.5), () => {
                opticalDepth.assign(float(0.5));
            }).Else(() => {
                const stepSize = u.minSecondaryStepSize.div(iterationCount).toVar();
                totalDistance.assign(stepSize.mul(jitter));

                {
                    const pos = totalDistance.mul(rayDirection).add(rayOrigin);
                    const h = length(pos).sub(u.bottomRadius);
                    const uv = getGlobeUv(pos);
                    const hf = remapClamped(vec4(h), u.minLayerHeights, u.maxLayerHeights);
                    const density = sampleWeather(uv, h, mipLevel);
                    const media = sampleMedia(hf, density, pos, uv, mipLevel, jitter, rayOrigin);
                    opticalDepth.addAssign(media.y.mul(stepSize));
                    totalDistance.addAssign(stepSize);
                    stepSize.mulAssign(u.secondaryStepScale);
                }

                If(iterationCount.greaterThan(1.5), () => {
                    const pos = totalDistance.mul(rayDirection).add(rayOrigin);
                    const h = length(pos).sub(u.bottomRadius);
                    const uv = getGlobeUv(pos);
                    const hf = remapClamped(vec4(h), u.minLayerHeights, u.maxLayerHeights);
                    const density = sampleWeather(uv, h, mipLevel);
                    const media = sampleMedia(hf, density, pos, uv, mipLevel, jitter, rayOrigin);
                    opticalDepth.addAssign(media.y.mul(stepSize));
                    totalDistance.addAssign(stepSize);
                    stepSize.mulAssign(u.secondaryStepScale);
                });

                If(iterationCount.greaterThan(2.5), () => {
                    const pos = totalDistance.mul(rayDirection).add(rayOrigin);
                    const h = length(pos).sub(u.bottomRadius);
                    const uv = getGlobeUv(pos);
                    const hf = remapClamped(vec4(h), u.minLayerHeights, u.maxLayerHeights);
                    const density = sampleWeather(uv, h, mipLevel);
                    const media = sampleMedia(hf, density, pos, uv, mipLevel, jitter, rayOrigin);
                    opticalDepth.addAssign(media.y.mul(stepSize));
                    totalDistance.addAssign(stepSize);
                    stepSize.mulAssign(u.secondaryStepScale);
                });

                If(iterationCount.greaterThan(3.5), () => {
                    const pos = totalDistance.mul(rayDirection).add(rayOrigin);
                    const h = length(pos).sub(u.bottomRadius);
                    const uv = getGlobeUv(pos);
                    const hf = remapClamped(vec4(h), u.minLayerHeights, u.maxLayerHeights);
                    const density = sampleWeather(uv, h, mipLevel);
                    const media = sampleMedia(hf, density, pos, uv, mipLevel, jitter, rayOrigin);
                    opticalDepth.addAssign(media.y.mul(stepSize));
                    totalDistance.addAssign(stepSize);
                    stepSize.mulAssign(u.secondaryStepScale);
                });
            });

            return vec2(opticalDepth, totalDistance);
        }
    );
};

/* -------------------------------------------------------------------------- */
/*  marchShadowLength (shadow length for aerial perspective)                   */
/*  Approximated without shadow map using marchOpticalDepth                    */
/* -------------------------------------------------------------------------- */

export const createMarchShadowLength = (u: CloudUniforms) => {
    const marchOpticalDepth = createMarchOpticalDepth(u);

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
            const opticalDepth = marchOpticalDepth(
                position,
                u.sunDirection,
                jitter,
                float(0),
                u.maxIterationCountToSun
            ).x;
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
            const density = sampleWeather(uv, height, float(0));
            const maxDensity = max(density.x, max(density.y, max(density.z, density.w)));

            If(maxDensity.greaterThan(u.minDensity), () => {
                const media = sampleMedia(
                    heightFraction,
                    density,
                    position,
                    uv,
                    float(0),
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

        const sampleOD = (uvOffset: any): any => {
            // Rotate PCF offset by temporal angle
            const rotated = vec2(
                jitter.cosA.mul(uvOffset.x).sub(jitter.sinA.mul(uvOffset.y)),
                jitter.sinA.mul(uvOffset.x).add(jitter.cosA.mul(uvOffset.y))
            );
            const uv = shadowUV.add(rotated).add(jitter.subTexel);
            const inB = step(float(0), uv.x)
                .mul(step(uv.x, float(1)))
                .mul(step(float(0), uv.y))
                .mul(step(uv.y, float(1)));
            const shadow = texture(tex, uv);
            const distFront = max(float(0), distanceToTop.sub(distanceOffset).sub(shadow.r));
            const od = min(shadow.b.add(shadow.a), shadow.g.mul(distFront));
            return inB.greaterThan(0.5).select(od, float(0));
        };

        // PCF radius: base radius + sun angular radius contribution.
        // Sun angular radius creates physical penumbra: at distance d from
        // cloud top, penumbra width ≈ d × tan(sunAngularRadius).
        // We approximate by scaling PCF radius with sun angular size.
        const sunPenumbra = distanceToTop.mul(u.sunAngularRadius);
        const r = u.maxShadowFilterRadius.add(sunPenumbra);
        const texel = u.shadowTexelSize;
        const offsetPP = vec2(r, r).mul(texel);
        const offsetMP = vec2(r.negate(), r).mul(texel);
        const offsetPM = vec2(r, r.negate()).mul(texel);
        const offsetMM = vec2(r.negate(), r.negate()).mul(texel);

        const odSum = sampleOD(vec2(0, 0))
            .add(sampleOD(offsetPP))
            .add(sampleOD(offsetMP))
            .add(sampleOD(offsetPM))
            .add(sampleOD(offsetMM));
        const od = odSum.div(float(5));

        const fullBounds = baseInBounds.mul(step(float(0), distanceToTop));
        return fullBounds.greaterThan(0.5).select(od, float(0));
    };

    return Fn(([rayPosition, distanceOffset]: [any, any]): any => {
        const posUncorrected = rayPosition.sub(u.altitudeCorrection);

        // Light direction is -sunDirection (sunDirection points FROM scene TO sun)
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

        const jitter = getJitterRotation();

        // Always sample all cascades (texture selection must be compile-time).
        // Max 3 cascades supported (matching SHADOW_CASCADE_COUNT).
        const od0 = sampleCascadePCF(0, posUncorrected, distanceToTop, distanceOffset, jitter);
        const od1 = sampleCascadePCF(1, posUncorrected, distanceToTop, distanceOffset, jitter);
        const od2 = sampleCascadePCF(2, posUncorrected, distanceToTop, distanceOffset, jitter);

        // Cascade selection by view distance from camera with smooth fade.
        // Fade zone = 10% of cascade range on each side of the boundary.
        const viewDist = length(rayPosition.sub(u.cameraPosition));
        const c0End = u.shadowIntervals[0].y.mul(u.shadowFar);
        const c1End = u.shadowIntervals[1].y.mul(u.shadowFar);
        const fade0 = c0End.mul(float(0.1));
        const fade1 = c1End.mul(float(0.1));

        // Gate by cascadeCount
        const c1Valid = u.shadowCascadeCount.greaterThan(1);
        const c2Valid = u.shadowCascadeCount.greaterThan(2);

        // Blend weight for cascade 0→1 transition:
        // w0 = 1 when dist < c0End - fade0, 0 when dist > c0End + fade0
        const w0 = saturate(c0End.add(fade0).sub(viewDist).div(fade0.mul(2)));
        // When only 1 cascade, force w0 = 1
        const w0Final = c1Valid.select(w0, float(1));

        // Blend weight for cascade 1→2 transition:
        // w1 = 1 when dist < c1End - fade1, 0 when dist > c1End + fade1
        const w1 = saturate(c1End.add(fade1).sub(viewDist).div(fade1.mul(2)));
        const w1Final = c2Valid.select(w1, float(1));

        // Stage 1: blend c0/c1
        const od01 = mix(od1, od0, w0Final);
        // Stage 2: blend (c0/c1) with c2
        const od012 = mix(od2, od01, w1Final);

        return od012;
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
            const phase = phaseFunction(cosTheta, float(0.2), u);
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
            const rayStartTexelsPerPixel = float(1);

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
                        debugSunIrrSum.addAssign(sunIrradiance.mul(0.01));

                        const sunMarchResult = marchOpticalDepth(
                            position,
                            u.sunDirection,
                            jitter,
                            mipLevel,
                            u.maxIterationCountToSun
                        ).toConst();
                        const opticalDepth = sunMarchResult.x.toVar();
                        const sunRayDistance = sunMarchResult.y;

                        // STEP 9m: output mipLevel only
                        debugSunIrrSum.addAssign(vec3(mipLevel, float(0), float(0)));

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
                            // Reference: groundIrradiance = skyIrr + (1-coverage)*sunIrr
                            // at ground level. We use the per-pixel sky/sun we just
                            // computed and an approximate ground-level reduction.
                            const groundIrradianceVal = skyIrradiance.add(
                                oneMinus(u.coverage).mul(sunIrradiance)
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
                        debugSunIrrSum.addAssign(radiance.mul(0.001));

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
                        debugSunIrrSum.addAssign(transmittanceIntegral.mul(integral).mul(0.01));

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
            // STEP 9a: return opticalDepth accumulation
            return marchCloudsResultStruct(vec4(debugSunIrrSum, float(1)), frontDepth);
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
    const marchShadowLength = createMarchShadowLength(u);
    const sampleWeather = createSampleWeather(u);
    const sampleMedia = createSampleMedia(u);
    const marchOpticalDepth = createMarchOpticalDepth(u);
    const sampleShadowOpticalDepth = createSampleShadowOpticalDepth(u);
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
        const resultFrontDepth = float(-1).toVar();
        const resultVelocity = vec2(0, 0).toVar();

        // Modes 30-39 bypass normal march. Compute debug color unconditionally
        // (so sampleWeather runs outside If), then select between debug/march result.
        const debugMode = u.debugMode;

        // Shared debug sample position: rayNear + 2000m
        const debugPos31 = cameraPosition.add(rayDirection.mul(rayNear.max(0).add(2000)));
        const debugHeight31 = length(debugPos31).sub(u.bottomRadius);
        const debugUv31 = getCubeSphereUv(debugPos31);
        const debugWeather31 = sampleWeather(debugUv31, debugHeight31, float(0));

        const debugHeightFraction31 = remapClamped(
            vec4(debugHeight31),
            u.minLayerHeights,
            u.maxLayerHeights
        );
        const m31Density = debugWeather31.toVar();
        const debugWeatherUv34 = debugUv31.mul(u.localWeatherRepeat).add(u.localWeatherOffset);
        const debugLocalWeather34 = exp(
            u.weatherExponents.mul(texture(u.localWeatherTexture, debugWeatherUv34, float(0)).log())
        );
        const debugMedia33 = sampleMedia(
            debugHeightFraction31,
            m31Density,
            debugPos31,
            debugUv31,
            float(0),
            float(0),
            cameraPosition
        );
        const debugPosLen = length(debugPos31);
        const camPosLen = length(cameraPosition);

        // STEP 8g: radianceIntegral, alpha=1
        If(shouldMarch.greaterThan(0.5), () => {
            const origin = rayNear.mul(rayDirection).add(cameraPosition);
            const marchResult = marchClouds(
                origin,
                rayDirection,
                vec2(rayNear, rayFar),
                cosTheta,
                jitter
            ).toConst();
            resultColor.assign(vec4(marchResult.get("color").rgb, 1));
        });
        resultFrontDepth.assign(float(-1));
        resultVelocity.assign(vec2(0));

        return cloudRendererResultStruct(resultColor, resultFrontDepth, resultVelocity);
        resultFrontDepth.assign(float(-1));
        resultVelocity.assign(vec2(0));

        return cloudRendererResultStruct(resultColor, resultFrontDepth, resultVelocity);

        // Debug modes 10-39 are applied as FINAL overrides (after march + haze)
        // to prevent normal pipeline from overwriting debug colors.
        If(debugMode.equal(0).and(shouldMarch.greaterThan(0.5)), () => {
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

                const frontWorld = u.ecefToWorld.mul(vec4(frontPosition, 1)).xyz;
                const prevClip = u.prevViewProjection.mul(vec4(frontWorld, 1));
                const prevUv = prevClip.xy.div(prevClip.w).mul(0.5).add(0.5);
                resultVelocity.assign(screenUV.sub(prevUv));
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

        // DEBUG OVERRIDE: modes 90+ overwrite final color after all processing
        // Mode 90: pure red (test visibility)
        If(debugMode.equal(90), () => {
            resultColor.assign(vec4(1, 0, 0, 1));
            resultFrontDepth.assign(float(-1));
            resultVelocity.assign(vec2(0));
        });

        // Modes 10-39: moved here as FINAL overrides so march+haze don't clobber them
        If(debugMode.equal(10), () => {
            resultColor.assign(
                vec4(rayNear.max(0).div(200000), rayFar.max(0).div(200000), shouldMarch, 1)
            );
            resultFrontDepth.assign(float(-1));
            resultVelocity.assign(vec2(0));
        });
        If(debugMode.equal(11), () => {
            resultColor.assign(
                vec4(u.cameraHeight.div(2000), intersectsGround, mu.mul(0.5).add(0.5), 1)
            );
            resultFrontDepth.assign(float(-1));
            resultVelocity.assign(vec2(0));
        });
        If(debugMode.equal(12), () => {
            resultColor.assign(vec4(rayDirection.mul(0.5).add(0.5), 1));
            resultFrontDepth.assign(float(-1));
            resultVelocity.assign(vec2(0));
        });
        If(debugMode.equal(23), () => {
            resultColor.assign(vec4(positionGeometry, 1));
            resultFrontDepth.assign(float(-1));
            resultVelocity.assign(vec2(0));
        });
        If(debugMode.equal(24), () => {
            resultColor.assign(vec4(rayDirection, 1));
            resultFrontDepth.assign(float(-1));
            resultVelocity.assign(vec2(0));
        });
        If(debugMode.equal(25), () => {
            resultColor.assign(vec4(positionGeometry.mul(0.5).add(0.5), 1));
            resultFrontDepth.assign(float(-1));
            resultVelocity.assign(vec2(0));
        });
        If(debugMode.equal(26), () => {
            const ndc = screenUV.mul(2).sub(1);
            resultColor.assign(vec4(ndc.x, ndc.y, float(0), float(1)));
            resultFrontDepth.assign(float(-1));
            resultVelocity.assign(vec2(0));
        });
        If(debugMode.equal(27), () => {
            resultColor.assign(
                vec4(
                    cameraPosition.x.div(1e7),
                    cameraPosition.y.div(1e7),
                    cameraPosition.z.div(1e7),
                    1
                )
            );
            resultFrontDepth.assign(float(-1));
            resultVelocity.assign(vec2(0));
        });
        If(debugMode.equal(28), () => {
            resultColor.assign(
                vec4(
                    debugPos31.x.div(debugPosLen).mul(0.5).add(0.5),
                    debugPos31.y.div(debugPosLen).mul(0.5).add(0.5),
                    0.5,
                    1
                )
            );
            resultFrontDepth.assign(float(-1));
            resultVelocity.assign(vec2(0));
        });
        If(debugMode.equal(29), () => {
            resultColor.assign(
                vec4(
                    cameraPosition.x.div(camPosLen).mul(0.5).add(0.5),
                    cameraPosition.y.div(camPosLen).mul(0.5).add(0.5),
                    0.5,
                    1
                )
            );
            resultFrontDepth.assign(float(-1));
            resultVelocity.assign(vec2(0));
        });
        If(debugMode.equal(31), () => {
            resultColor.assign(vec4(m31Density.x, m31Density.y, m31Density.z, m31Density.w));
            resultFrontDepth.assign(float(-1));
            resultVelocity.assign(vec2(0));
        });
        If(debugMode.equal(32), () => {
            resultColor.assign(
                vec4(
                    debugHeightFraction31.x,
                    debugHeightFraction31.y,
                    debugHeightFraction31.z,
                    debugHeightFraction31.w
                )
            );
            resultFrontDepth.assign(float(-1));
            resultVelocity.assign(vec2(0));
        });
        If(debugMode.equal(33), () => {
            resultColor.assign(vec4(debugMedia33.xyz, 1));
            resultFrontDepth.assign(float(-1));
            resultVelocity.assign(vec2(0));
        });
        If(debugMode.equal(34), () => {
            resultColor.assign(debugLocalWeather34);
            resultFrontDepth.assign(float(-1));
            resultVelocity.assign(vec2(0));
        });
        If(debugMode.equal(35), () => {
            resultColor.assign(
                vec4(
                    debugWeatherUv34.x.sub(debugWeatherUv34.x.floor()),
                    debugWeatherUv34.y.sub(debugWeatherUv34.y.floor()),
                    0.5,
                    1
                )
            );
            resultFrontDepth.assign(float(-1));
            resultVelocity.assign(vec2(0));
        });
        If(debugMode.equal(36), () => {
            resultColor.assign(vec4(texture3D(u.shapeTexture, vec3(0.5, 0.5, screenUV.x)).r));
            resultFrontDepth.assign(float(-1));
            resultVelocity.assign(vec2(0));
        });
        If(debugMode.equal(37), () => {
            resultColor.assign(
                texture(
                    u.localWeatherTexture,
                    debugUv31.mul(u.localWeatherRepeat).add(u.localWeatherOffset)
                )
            );
            resultFrontDepth.assign(float(-1));
            resultVelocity.assign(vec2(0));
        });
        If(debugMode.equal(38), () => {
            resultColor.assign(texture(u.localWeatherTexture, vec2(0.5)));
            resultFrontDepth.assign(float(-1));
            resultVelocity.assign(vec2(0));
        });
        If(debugMode.equal(39), () => {
            resultColor.assign(vec4(debugUv31, debugHeight31.div(10000), 1));
            resultFrontDepth.assign(float(-1));
            resultVelocity.assign(vec2(0));
        });

        // Mode 91: per-pixel sun irradiance via LUT (same fixed pos as ref)
        const debugPos91 = cameraPosition.add(rayDirection.mul(rayNear.max(0).add(2000)));
        const debugPosUnit91 = debugPos91.mul(u.worldToUnit);
        const debugIrr91 = getSplitScalarIlluminance(debugPosUnit91, u.sunDirection).toConst();
        If(debugMode.equal(91), () => {
            resultColor.assign(vec4(debugIrr91.get("direct"), 1));
            resultFrontDepth.assign(float(-1));
            resultVelocity.assign(vec2(0));
        });
        // Mode 92: per-pixel sky irradiance via LUT
        If(debugMode.equal(92), () => {
            resultColor.assign(vec4(debugIrr91.get("indirect"), 1));
            resultFrontDepth.assign(float(-1));
            resultVelocity.assign(vec2(0));
        });

        // Mode 93: test PI2 constant for comparison
        If(debugMode.equal(93), () => {
            resultColor.assign(vec4(Math.PI * 2, Math.PI * 2, Math.PI * 2, 1));
            resultFrontDepth.assign(float(-1));
            resultVelocity.assign(vec2(0));
        });

        // Mode 94: test rayleigh phase value for comparison
        If(debugMode.equal(94), () => {
            const phase93 = float(0.0746);
            resultColor.assign(vec4(phase93, phase93, phase93, 1));
            resultFrontDepth.assign(float(-1));
            resultVelocity.assign(vec2(0));
        });

        // Mode 95: raw irradiance LUT value (indirect / 2π)
        If(debugMode.equal(95), () => {
            resultColor.assign(vec4(debugIrr91.get("indirect").div(Math.PI * 2), 1));
            resultFrontDepth.assign(float(-1));
            resultVelocity.assign(vec2(0));
        });

        // Mode 96: debug raw height
        If(debugMode.equal(96), () => {
            resultColor.assign(vec4(debugHeight31, debugHeight31, debugHeight31, 1));
            resultFrontDepth.assign(float(-1));
            resultVelocity.assign(vec2(0));
        });

        // Mode 97: debug cameraPosition full vector
        If(debugMode.equal(97), () => {
            resultColor.assign(vec4(cameraPosition.x, cameraPosition.y, cameraPosition.z, 1));
            resultFrontDepth.assign(float(-1));
            resultVelocity.assign(vec2(0));
        });

        // Mode 98: BSM shadow optical depth at sample position
        If(debugMode.equal(98), () => {
            const samplePos = cameraPosition.add(rayDirection.mul(rayNear.max(0).add(2000)));
            const shadowOD = sampleShadowOpticalDepth(samplePos, float(0));
            const shadowODVal = shadowOD.mul(float(0.1));
            resultColor.assign(vec4(shadowODVal, shadowODVal, shadowODVal, float(1)));
            resultFrontDepth.assign(float(-1));
            resultVelocity.assign(vec2(0));
        });

        // Mode 99: dump bsmCond components for primary march sample position
        If(debugMode.equal(99), () => {
            // Use hardcoded ref rayDirection for entire image
            const refDir = vec3(0.29150391, 0.57421875, -0.76464844);
            const refDot = dot(refDir, cameraPosition).mul(2);
            const refRMin = u.bottomRadius.add(u.minHeight);
            const refR2 = dot(cameraPosition, cameraPosition);
            const refCMin = refR2.sub(refRMin.mul(refRMin));
            const refDisc = refDot.mul(refDot).sub(refCMin.mul(4));
            const refQ = sqrt(refDisc.max(0));
            const refFarMin = refDot.negate().add(refQ).mul(0.5);
            resultColor.assign(vec4(refFarMin.div(1e5), refDot.div(1e5), float(0), float(1)));
            resultFrontDepth.assign(float(-1));
            resultVelocity.assign(vec2(0));
        });

        return cloudRendererResultStruct(resultColor, resultFrontDepth, resultVelocity);
    });

    return { render, shadowMarch: shadowMarchFactory };
};
