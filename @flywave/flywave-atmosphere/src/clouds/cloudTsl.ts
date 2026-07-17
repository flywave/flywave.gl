// @ts-nocheck
/* Copyright (C) 2025 flywave.gl contributors */

import {
    abs,
    Break,
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
    texture,
    texture3D,
    vec2,
    vec3,
    vec4
} from "three/tsl";

import type { CloudUniforms } from "./CloudUniforms";

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

/* -------------------------------------------------------------------------- */
/*  UV mapping                                                                 */
/* -------------------------------------------------------------------------- */

export const getCubeSphereUv = Fn(([position]: [any]) => {
    const n = normalize(position);
    const f = abs(n);
    const maxF = max(f.x, max(f.y, f.z));
    const c = n.div(maxF);

    const isY = f.y.greaterThan(f.x).and(f.y.greaterThan(f.z));
    const isX = f.x.greaterThan(f.y).and(f.x.greaterThan(f.z));

    const m = vec2().toVar();

    If(isY, () => {
        If(c.y.greaterThan(0), () => {
            m.assign(vec2(n.x.negate(), n.z));
        }).Else(() => {
            m.assign(n.xz);
        });
    })
        .ElseIf(isX, () => {
            If(c.x.greaterThan(0), () => {
                m.assign(n.yz);
            }).Else(() => {
                m.assign(vec2(n.y.negate(), n.z));
            });
        })
        .Else(() => {
            If(c.z.greaterThan(0), () => {
                m.assign(n.xy);
            }).Else(() => {
                m.assign(vec2(n.x, n.y.negate()));
            });
        });

    const m2 = m.mul(m);
    const q = m2.x.mul(-2).add(m2.y.mul(2)).sub(3);
    const q2 = q.mul(q);

    const uvX = sqrt(
        float(1.5)
            .add(m2.x)
            .sub(m2.y)
            .sub(float(0.5).mul(sqrt(m2.x.mul(-24).add(q2))))
    ).mul(m.x.greaterThan(0).toFloat().mul(2).sub(1));
    const uvY = sqrt(
        float(6)
            .div(float(3).sub(uvX.mul(uvX)))
            .mul(m.y)
    );

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

    for (let i = 0; i < 8; i++) {
        const bl = exp(opticalDepth.mul(coeffs.y).negate());
        const phase = phaseFunction(cosTheta, coeffs.z);
        scattering.addAssign(coeffs.x.mul(bl).mul(phase));
        if (i < 7) coeffs.mulAssign(attenuation);
    }

    return scattering;
});

/* -------------------------------------------------------------------------- */
/*  Media sampling                                                             */
/* -------------------------------------------------------------------------- */

export const createSampleMedia = (u: CloudUniforms) => {
    const getLayerDensity = createGetLayerDensity(u);

    return Fn(
        ([heightFraction, density, position, uv, jitter, cameraPosition]: [
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

            // Shape texture — same as GLSL: (position + evolution) * shapeRepeat
            const shapePosition = position.add(evolution).mul(u.shapeRepeat).add(u.shapeOffset);
            const shape = texture3D(u.shapeTexture, shapePosition).r;
            density.assign(
                remapClamped(density, oneMinus(shape).mul(u.shapeAmounts), vec4(1, 1, 1, 1))
            );

            // Shape detail
            const detailPosition = position.mul(u.shapeDetailRepeat).add(u.shapeDetailOffset);
            const detail = texture3D(u.shapeDetailTexture, detailPosition).r;
            const detailPow = pow(detail, float(6));
            const modifier = mix(
                vec4(detailPow),
                oneMinus(vec4(detail)),
                remapClamped(heightFraction, vec4(0.2, 0.2, 0.2, 0.2), vec4(0.4, 0.4, 0.4, 0.4))
            );
            const modMixed = mix(vec4(0, 0, 0, 0), modifier, u.shapeDetailAmounts);
            density.assign(remapClamped(density.mul(2), modMixed.mul(0.5), vec4(1, 1, 1, 1)));

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

    return Fn(([rayOrigin, rayDirection, jitter]: [any, any, any]) => {
        const opticalDepth = float(0).toVar();
        const stepSize = u.minSecondaryStepSize.div(float(2)).toVar();
        const rayDistance = stepSize.mul(jitter).toVar();

        // 2 iterations manually unrolled
        {
            const position = rayDistance.mul(rayDirection).add(rayOrigin);
            const height = length(position).sub(u.bottomRadius);
            const uv = getGlobeUv(position);
            const heightFraction = remapClamped(vec4(height), u.minLayerHeights, u.maxLayerHeights);
            const density = sampleWeather(uv, height);
            const media = sampleMedia(heightFraction, density, position, uv, jitter, rayOrigin);
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
            const media = sampleMedia(heightFraction, density, position, uv, jitter, rayOrigin);
            opticalDepth.addAssign(media.y.mul(stepSize));
            rayDistance.addAssign(stepSize);
            stepSize.mulAssign(u.secondaryStepScale);
        }

        return opticalDepth;
    });
};

/* -------------------------------------------------------------------------- */
/*  marchClouds (primary raymarch)                                             */
/* -------------------------------------------------------------------------- */

export const createMarchClouds = (u: CloudUniforms) => {
    const sampleWeather = createSampleWeather(u);
    const sampleMedia = createSampleMedia(u);
    const marchOpticalDepth = createMarchOpticalDepth(u);

    return Fn(
        ([rayOrigin, rayDirection, rayNearFar, cosTheta, jitter]: [any, any, any, any, any]) => {
            const radianceIntegral = vec3(0).toVar();
            const transmittanceIntegral = float(1).toVar();

            const maxRayDistance = rayNearFar.y.sub(rayNearFar.x).toVar();
            const stepSize = u.minStepSize
                .add(u.perspectiveStepScale.sub(1).mul(rayNearFar.x))
                .toVar();
            const rayDistance = stepSize.mul(jitter).mul(2).toVar();
            const mipLevel = log2(max(float(1), rayDistance.mul(1e-5))).toVar();

            Loop({ start: 0, end: 500, type: "int" }, () => {
                If(rayDistance.greaterThan(maxRayDistance), () => {
                    Break();
                });

                const position = rayDistance.mul(rayDirection).add(rayOrigin);
                const height = length(position).sub(u.bottomRadius);

                const uv = getGlobeUv(position);
                const heightFraction = remapClamped(
                    vec4(height),
                    u.minLayerHeights,
                    u.maxLayerHeights
                ).toVar();
                const density = sampleWeather(uv, height).toVar();

                // Skip empty space: check if any density component > minDensity
                const maxDensity = max(density.x, max(density.y, max(density.z, density.w)));
                const isEmpty = maxDensity.lessThanEqual(u.minDensity);

                If(isEmpty, () => {
                    stepSize.mulAssign(u.perspectiveStepScale);
                    rayDistance.addAssign(mix(stepSize, u.maxStepSize, min(float(1), mipLevel)));
                }).Else(() => {
                    const media = sampleMedia(
                        heightFraction,
                        density,
                        position,
                        uv,
                        jitter,
                        rayOrigin
                    );
                    const mediaScattering = media.x;
                    const mediaExtinction = media.y;
                    const skyGradient = media.z;

                    If(mediaExtinction.greaterThan(u.minExtinction), () => {
                        const alpha = remapClamped(height, u.minHeight, u.maxHeight);
                        const sunIrradiance = mix(u.sunIrradianceMin, u.sunIrradianceMax, alpha);

                        const opticalDepth = marchOpticalDepth(position, u.sunDirection, jitter);

                        let radiance = sunIrradiance.mul(
                            approximateMultipleScattering(opticalDepth, cosTheta)
                        );

                        const skyIrradiance = mix(u.skyIrradianceMin, u.skyIrradianceMax, alpha);
                        radiance = radiance.add(
                            skyIrradiance
                                .mul(float(RECIPROCAL_PI4))
                                .mul(skyGradient)
                                .mul(u.skyLightScale)
                        );

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
                    });

                    stepSize.mulAssign(u.perspectiveStepScale);
                    rayDistance.addAssign(stepSize);
                });

                If(transmittanceIntegral.lessThanEqual(u.minTransmittance), () => {
                    Break();
                });
            });

            const alpha = remapClamped(transmittanceIntegral, float(1), u.minTransmittance);
            return vec4(radianceIntegral, alpha);
        }
    );
};

/* -------------------------------------------------------------------------- */
/*  Main cloud render function                                                 */
/* -------------------------------------------------------------------------- */

export const createCloudRenderer = (u: CloudUniforms) => {
    const marchClouds = createMarchClouds(u);

    return Fn(([cameraPosition, rayDirection, sceneDistance]: [any, any, any]) => {
        const cosTheta = dot(u.sunDirection, rayDirection);
        const jitter = float(0.5);

        const bottomRadius = u.bottomRadius;

        const cameraHeight = length(cameraPosition).sub(bottomRadius);

        const r = length(cameraPosition);
        const mu = dot(cameraPosition, rayDirection).div(r);
        const intersectsGround = mu
            .lessThan(0)
            .and(
                r
                    .mul(r)
                    .mul(mu.mul(mu).sub(1))
                    .add(bottomRadius.mul(bottomRadius))
                    .greaterThanEqual(0)
            );

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
            If(intersectsGround, () => {
                rayNear.assign(float(-1));
                rayFar.assign(float(-1));
            }).Else(() => {
                rayNear.assign(farMin);
                rayFar.assign(min(farMax, u.maxRayDistance));
            });
        })
            .ElseIf(cameraHeight.lessThan(u.maxHeight), () => {
                If(intersectsGround, () => {
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
                If(intersectsGround, () => {
                    rayFar.assign(nearMin);
                });
            });

        rayFar.assign(min(rayFar, sceneDistance));

        // GLSL: intersectsGround = any(lessThan(rayNearFar, vec2(0.0)))
        //       intersectsScene = rayNearFar.y < rayNearFar.x
        const intersectsGroundRay = rayNear.lessThan(0).or(rayFar.lessThan(0));
        const intersectsScene = rayFar.lessThan(rayNear);
        const shouldMarch = intersectsGroundRay.not().and(intersectsScene.not());

        const result = vec4(0, 0, 0, 0).toVar();

        If(shouldMarch, () => {
            const origin = rayNear.mul(rayDirection).add(cameraPosition);
            result.assign(
                marchClouds(origin, rayDirection, vec2(rayNear, rayFar), cosTheta, jitter)
            );
        });

        return result;
    });
};
