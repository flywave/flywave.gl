// @ts-nocheck
/* Copyright (C) 2025 flywave.gl contributors */

import {
    abs,
    acos,
    asin,
    atan,
    Break,
    dFdx,
    dFdy,
    dot,
    exp,
    float,
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
    pow,
    sqrt,
    step,
    struct,
    texture,
    texture3D,
    vec2,
    vec3,
    vec4
} from "three/tsl";

import type { CloudUniforms } from "./CloudUniforms";
import { stbn } from "../tsl/STBNTextureNode";
import { getIndirectLuminanceToPoint } from "../atmosphere/runtime";

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
 * Uses dFdx/dFdy to estimate texel density
 */
export const createGetMipLevel = (u: CloudUniforms) =>
    Fn(([uv]: [any]) => {
        const mipLevelScale = float(0.1);
        const coord = uv.mul(u.localWeatherRepeat);
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
    Fn(([uv, height]: [any, any]) => {
        const heightFraction = remapClamped(vec4(height), u.minLayerHeights, u.maxLayerHeights);

        const weatherUv = uv.mul(u.localWeatherRepeat).add(u.localWeatherOffset);
        const weatherTex = texture(u.localWeatherTexture, weatherUv);
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

export const phaseFunction = Fn(([cosTheta, attenuation]: [any, any]) => {
    const g = vec2(0.7, -0.2).mul(attenuation);
    const weights = vec2(0.5, 0.5);
    return dot(henyeyGreenstein(g, cosTheta), weights);
});

export const approximateMultipleScattering = Fn(([opticalDepth, cosTheta]: [any, any]) => {
    const coeffs = vec3(1).toVar();
    const attenuation = vec3(0.5, 0.5, 0.5);
    const scattering = float(0).toVar();

    // 8 octaves manually unrolled (JS for-loops don't work inside TSL Fn)
    {
        const bl = exp(opticalDepth.mul(coeffs.y).negate());
        const phase = phaseFunction(cosTheta, coeffs.z);
        scattering.addAssign(coeffs.x.mul(bl).mul(phase));
        coeffs.mulAssign(attenuation);
    }
    {
        const bl = exp(opticalDepth.mul(coeffs.y).negate());
        const phase = phaseFunction(cosTheta, coeffs.z);
        scattering.addAssign(coeffs.x.mul(bl).mul(phase));
        coeffs.mulAssign(attenuation);
    }
    {
        const bl = exp(opticalDepth.mul(coeffs.y).negate());
        const phase = phaseFunction(cosTheta, coeffs.z);
        scattering.addAssign(coeffs.x.mul(bl).mul(phase));
        coeffs.mulAssign(attenuation);
    }
    {
        const bl = exp(opticalDepth.mul(coeffs.y).negate());
        const phase = phaseFunction(cosTheta, coeffs.z);
        scattering.addAssign(coeffs.x.mul(bl).mul(phase));
        coeffs.mulAssign(attenuation);
    }
    {
        const bl = exp(opticalDepth.mul(coeffs.y).negate());
        const phase = phaseFunction(cosTheta, coeffs.z);
        scattering.addAssign(coeffs.x.mul(bl).mul(phase));
        coeffs.mulAssign(attenuation);
    }
    {
        const bl = exp(opticalDepth.mul(coeffs.y).negate());
        const phase = phaseFunction(cosTheta, coeffs.z);
        scattering.addAssign(coeffs.x.mul(bl).mul(phase));
        coeffs.mulAssign(attenuation);
    }
    {
        const bl = exp(opticalDepth.mul(coeffs.y).negate());
        const phase = phaseFunction(cosTheta, coeffs.z);
        scattering.addAssign(coeffs.x.mul(bl).mul(phase));
        coeffs.mulAssign(attenuation);
    }
    {
        const bl = exp(opticalDepth.mul(coeffs.y).negate());
        const phase = phaseFunction(cosTheta, coeffs.z);
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

            // Turbulence
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

            // Shape detail (conditional like GLSL: only when close enough)
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
                    remapClamped(heightFraction, vec4(0.2, 0.2, 0.2, 0.2), vec4(0.4, 0.4, 0.4, 0.4))
                );
                const modMixed = mix(vec4(0, 0, 0, 0), modifier, u.shapeDetailAmounts);
                density.assign(remapClamped(density.mul(2), modMixed.mul(0.5), vec4(1, 1, 1, 1)));
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
/*  marchOpticalDepth (secondary raymarch toward sun)                           */
/* -------------------------------------------------------------------------- */

export const createMarchOpticalDepth = (u: CloudUniforms) => {
    const sampleWeather = createSampleWeather(u);
    const sampleMedia = createSampleMedia(u);

    return Fn(([rayOrigin, rayDirection, jitter, mipLevel]: [any, any, any, any]) => {
        const opticalDepth = float(0).toVar();
        // stepSize based on mipLevel: closer (mipLevel=0) → more steps → smaller stepSize
        const maxIter = u.maxIterationCountToSun.toFloat();
        const iterationCount = max(
            float(1),
            remap(mipLevel, float(0), float(1), maxIter.add(1), float(1)).sub(jitter)
        );
        const stepSize = u.minSecondaryStepSize.div(iterationCount).toVar();
        const rayDistance = stepSize.mul(jitter).toVar();

        // 2 iterations manually unrolled
        {
            const position = rayDistance.mul(rayDirection).add(rayOrigin);
            const height = length(position).sub(u.bottomRadius);
            const uv = getGlobeUv(position);
            const heightFraction = remapClamped(vec4(height), u.minLayerHeights, u.maxLayerHeights);
            const density = sampleWeather(uv, height);
            const media = sampleMedia(
                heightFraction,
                density,
                position,
                uv,
                float(0),
                jitter,
                rayOrigin
            );
            opticalDepth.addAssign(media.y.mul(stepSize));
            rayDistance.addAssign(stepSize);
            stepSize.mulAssign(u.secondaryStepScale);
        }
        {
            const position = rayDistance.mul(rayDirection).add(rayOrigin);
            const height = length(position).sub(u.bottomRadius);
            const uv = getGlobeUv(position);
            const heightFraction = remapClamped(vec4(height), u.minLayerHeights, u.maxLayerHeights);
            const density = sampleWeather(uv, height);
            const media = sampleMedia(
                heightFraction,
                density,
                position,
                uv,
                float(0),
                jitter,
                rayOrigin
            );
            opticalDepth.addAssign(media.y.mul(stepSize));
            rayDistance.addAssign(stepSize);
            stepSize.mulAssign(u.secondaryStepScale);
        }

        return opticalDepth;
    });
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

        Loop({ start: 0, end: 64, type: "int" }, () => {
            If(rayDistance.greaterThan(maxRayDistance), () => {
                Break();
            });

            const position = rayDistance.mul(rayDirection).add(rayOrigin);
            const opticalDepth = marchOpticalDepth(position, u.sunDirection, jitter, float(0));
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

    return Fn(
        ([
            rayOrigin,
            rayDirection,
            rayNearFar,
            cosTheta,
            jitter,
            sunIrrMin,
            skyIrrMin,
            sunIrrMax,
            skyIrrMax,
            groundIrradiance
        ]: [any, any, any, any, any, any, any, any, any, any]) => {
            const radianceIntegral = vec3(0).toVar();
            const transmittanceIntegral = float(1).toVar();
            // For frontDepth calculation (aerial perspective)
            const weightedDistanceSum = float(0).toVar();
            const transmittanceSum = float(0).toVar();

            const maxRayDistance = rayNearFar.y.sub(rayNearFar.x).toVar();
            const stepSize = u.minStepSize
                .add(u.perspectiveStepScale.sub(1).mul(rayNearFar.x))
                .toVar();
            const rayDistance = stepSize.mul(jitter).mul(2).toVar();
            // GLSL: mipLevel = getMipLevel(globeUv * localWeatherRepeat) * mipLevelScale
            //        mix(0, mipLevel, min(1, 0.2 * cameraHeight / maxHeight))
            const camHeight = u.cameraHeight;
            const mipLevelBase = float(0).toVar();
            const mipLevel = float(0).toVar();

            Loop({ start: 0, end: 500, type: "int" }, () => {
                If(rayDistance.greaterThan(maxRayDistance), () => {
                    Break();
                });

                const position = rayDistance.mul(rayDirection).add(rayOrigin);
                const height = length(position).sub(u.bottomRadius);
                const uv = getGlobeUv(position);
                // Compute mipLevel using screen-space derivatives
                mipLevelBase.assign(getMipLevel(uv));
                mipLevel.assign(
                    mix(
                        float(0),
                        mipLevelBase,
                        min(float(1), float(0.2).mul(camHeight).div(u.maxHeight))
                    )
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
                const density = sampleWeather(uv, height).toVar();

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
                        const alpha = remapClamped(height, u.minHeight, u.maxHeight);
                        const sunIrradiance = mix(sunIrrMin, sunIrrMax, alpha);

                        const opticalDepth = marchOpticalDepth(
                            position,
                            u.sunDirection,
                            jitter,
                            mipLevel
                        );

                        let radiance = sunIrradiance.mul(
                            approximateMultipleScattering(opticalDepth, cosTheta)
                        );

                        const skyIrradiance = mix(skyIrrMin, skyIrrMax, alpha);
                        radiance = radiance.add(
                            skyIrradiance
                                .mul(float(RECIPROCAL_PI4))
                                .mul(skyGradient)
                                .mul(u.skyLightScale)
                        );

                        // Ground bounce: light reflected from ground illuminates cloud bottoms
                        // GLSL: if (height < shadowTopHeight && mipLevel < 0.5)
                        const groundBounceCond = step(height, u.shadowTopHeight).mul(
                            step(mipLevel, float(0.5))
                        );
                        If(groundBounceCond.greaterThan(0.5), () => {
                            const groundDir = normalize(position).negate();
                            const opticalDepthToGround = marchOpticalDepth(
                                position,
                                groundDir,
                                jitter,
                                mipLevel
                            );
                            const groundAlbedo = float(0.3);
                            const bouncedRadiance = groundAlbedo
                                .mul(float(RECIPROCAL_PI))
                                .mul(groundIrradiance)
                                .mul(exp(opticalDepthToGround.negate()));
                            radiance = radiance.add(
                                bouncedRadiance.mul(float(RECIPROCAL_PI4)).mul(u.groundBounceScale)
                            );
                        });

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

                        radianceIntegral.addAssign(transmittanceIntegral.mul(integral));
                        transmittanceIntegral.mulAssign(transmittance);

                        // Accumulate for frontDepth (aerial perspective)
                        weightedDistanceSum.addAssign(oneMinus(transmittance).mul(rayDistance));
                        transmittanceSum.addAssign(oneMinus(transmittance));
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
        frontDepth: "float"
    },
    "CloudRendererResult"
);

export const createCloudRenderer = (u: CloudUniforms) => {
    const marchClouds = createMarchClouds(u);
    const marchShadowLength = createMarchShadowLength(u);

    return Fn(
        ([
            cameraPosition,
            rayDirection,
            sceneDistance,
            sunIrrMin,
            skyIrrMin,
            sunIrrMax,
            skyIrrMax,
            groundIrradiance
        ]: [any, any, any, any, any, any, any, any]) => {
            const cosTheta = dot(u.sunDirection, rayDirection);
            const jitter = stbn;

            const bottomRadius = u.bottomRadius;

            const cameraHeight = u.cameraHeight;

            const r = length(cameraPosition);
            const mu = dot(cameraPosition, rayDirection).div(r);
            // GLSL: mu < 0.0 && r*r*(mu*mu-1) + bottomRadius² >= 0
            // Use arithmetic for bool: AND = multiply, condition = step
            const muNeg = step(mu, float(0)); // 1 if mu <= 0
            const groundDisc = r.mul(r).mul(mu.mul(mu).sub(1)).add(bottomRadius.mul(bottomRadius));
            const groundHit = step(float(0), groundDisc); // 1 if disc >= 0
            const intersectsGround = muNeg.mul(groundHit); // 1 if both true

            // Scalar ray-sphere for individual radii
            const b = dot(rayDirection, cameraPosition);
            const r2 = dot(cameraPosition, cameraPosition);

            const rMin = bottomRadius.add(u.minHeight);
            const cMin = r2.sub(rMin.mul(rMin));
            const dMin = b.mul(b).sub(cMin);
            const nearMin = b.negate().sub(sqrt(dMin.max(0)));
            const farMin = b.negate().add(sqrt(dMin.max(0)));

            const rMax = bottomRadius.add(u.maxHeight);
            const cMax = r2.sub(rMax.mul(rMax));
            const dMax = b.mul(b).sub(cMax);
            const nearMax = b.negate().sub(sqrt(dMax.max(0)));
            const farMax = b.negate().add(sqrt(dMax.max(0)));

            const rayNear = float(-1).toVar();
            const rayFar = float(-1).toVar();

            If(cameraHeight.lessThan(u.minHeight), () => {
                If(intersectsGround.greaterThan(0.5), () => {
                    rayNear.assign(float(-1));
                    rayFar.assign(float(-1));
                }).Else(() => {
                    rayNear.assign(farMin);
                    rayFar.assign(min(farMax, u.maxRayDistance));
                });
            })
                .ElseIf(cameraHeight.lessThan(u.maxHeight), () => {
                    If(intersectsGround.greaterThan(0.5), () => {
                        rayNear.assign(float(0));
                        rayFar.assign(nearMin);
                    }).Else(() => {
                        rayNear.assign(float(0));
                        rayFar.assign(farMax);
                    });
                })
                .Else(() => {
                    rayNear.assign(nearMax);
                    rayFar.assign(farMax);
                    If(intersectsGround.greaterThan(0.5), () => {
                        rayFar.assign(nearMin);
                    });
                });

            rayFar.assign(min(rayFar, sceneDistance));

            // GLSL: shouldMarch = !any(lessThan(rayNearFar, vec2(0))) && !(rayFar < rayNear)
            // Use step for bool arithmetic (TSL .and/.or/.not don't work correctly)
            const nearValid = step(float(0), rayNear); // 1 if rayNear >= 0
            const farValid = step(float(0), rayFar); // 1 if rayFar >= 0
            const farGteNear = step(rayNear, rayFar); // 1 if rayFar >= rayNear
            const shouldMarch = nearValid.mul(farValid).mul(farGteNear);

            const result = vec4(0, 0, 0, 0).toVar();

            If(shouldMarch.greaterThan(0.5), () => {
                const origin = rayNear.mul(rayDirection).add(cameraPosition);
                const marchResult = marchClouds(
                    origin,
                    rayDirection,
                    vec2(rayNear, rayFar),
                    cosTheta,
                    jitter,
                    sunIrrMin,
                    skyIrrMin,
                    sunIrrMax,
                    skyIrrMax,
                    groundIrradiance
                ).toConst();

                result.assign(marchResult.get("color"));

                // GLSL: applyAerialPerspective(cameraPosition, frontPosition, shadowLength, color)
                // Use flywave's getIndirectLuminanceToPoint to apply atmosphere to clouds
                const marchedFrontDepth = marchResult.get("frontDepth").toConst();
                const hitClouds = marchedFrontDepth.greaterThanEqual(0).toConst();
                If(hitClouds, () => {
                    const frontDepth = rayNear.add(marchedFrontDepth);
                    const frontPosition = cameraPosition.add(frontDepth.mul(rayDirection));

                    // GLSL: marchShadowLength before applyAerialPerspective
                    // Shadow ray: from camera to min(frontDepth, maxShadowLengthRayDistance)
                    const shadowRayFar = min(frontDepth, u.maxShadowLengthRayDistance);
                    const shadowLen = marchShadowLength(
                        cameraPosition,
                        rayDirection,
                        vec2(float(0), shadowRayFar),
                        jitter
                    ).toConst();

                    // GLSL: applyAerialPerspective(cameraPosition, frontPosition, shadowLength, color)
                    const luminanceTransfer = getIndirectLuminanceToPoint(
                        cameraPosition,
                        frontPosition,
                        vec2(shadowLen, float(0)),
                        u.sunDirection
                    ).toConst();
                    const transmittance = luminanceTransfer.get("transmittance");
                    const inscatter = luminanceTransfer.get("luminance");
                    // GLSL: color.rgb = color.rgb * transmittance + inscatter * color.a
                    result.rgb.assign(result.rgb.mul(transmittance).add(inscatter.mul(result.a)));
                });
            });

            return result;
        }
    );
};
