// @ts-nocheck
/* Copyright (C) 2025 flywave.gl contributors */

import { Matrix3, Matrix4, Vector2 } from "three";
import type { DirectLightData, LightingContext } from "three/src/nodes/TSL.js";
import {
    clamp,
    cos,
    dFdx,
    dFdy,
    dot,
    float,
    fract,
    If,
    max,
    min,
    mix,
    normalView,
    positionView,
    renderGroup,
    screenCoordinate,
    sin,
    sqrt,
    step,
    texture,
    uniform,
    vec2,
    vec4
} from "three/tsl";
import { AnalyticLightNode, NodeUpdateType, type NodeBuilder, type NodeFrame } from "three/webgpu";

import { getAtmosphereContext, type AtmosphereContext } from "./AtmosphereContext";
import type { AtmosphereLight } from "./AtmosphereLight";
import { getTransmittanceToSun } from "./common";
import { getIndirectIlluminance } from "./runtime";

const rotationScratch = /*#__PURE__*/ new Matrix3();

const MAX_CASCADES = 4;

export class AtmosphereLightNode extends AnalyticLightNode<AtmosphereLight> {
    static override get type(): string {
        return "AtmosphereLightNode";
    }

    private atmosphereContext?: AtmosphereContext;

    private readonly intensity = uniform(1).setGroup(renderGroup);
    private readonly directionECEF = uniform("vec3").setGroup(renderGroup);

    // Cloud shadow uniforms (updated each frame from AtmosphereContext)
    private readonly cloudShadowEnabled = uniform(0).setGroup(renderGroup);
    private readonly cloudShadowCascadeCount = uniform(0).setGroup(renderGroup);
    private readonly cloudShadowFar = uniform(50000).setGroup(renderGroup);
    private readonly cloudShadowTopHeight = uniform(8000).setGroup(renderGroup);
    private readonly cloudShadowMatrices = Array.from({ length: MAX_CASCADES }, () =>
        uniform(new Matrix4()).setGroup(renderGroup)
    );
    private readonly cloudShadowIntervals = Array.from({ length: MAX_CASCADES }, () =>
        uniform(new Vector2(0, 1)).setGroup(renderGroup)
    );
    private readonly cloudShadowTexelSize = uniform(new Vector2(1 / 512, 1 / 512)).setGroup(
        renderGroup
    );
    private cloudShadowTextureNodes: any[] = [null, null, null, null];
    private cloudShadowRawTextureNodes: any[] = [null, null, null, null];
    private _cloudShadowTexReady = false;

    private _setupDone = false;

    constructor(light?: AtmosphereLight | null) {
        super(light);
        this.updateBeforeType = NodeUpdateType.FRAME;
    }

    override customCacheKey(): number {
        const baseKey = super.customCacheKey?.() ?? 0;
        return baseKey * 2 + (this._cloudShadowTexReady ? 1 : 0);
    }

    override updateBefore(frame: NodeFrame): void {
        const { light, atmosphereContext } = this;
        if (light == null || atmosphereContext == null) {
            return;
        }
        const { matrixWorldToECEF } = atmosphereContext;
        light.position
            .copy(this.directionECEF.value)
            .applyMatrix3(
                // WORKAROUND: We cannot use matrixECEFToWorld here because nothing uses
                // it in the node graph, therefore it is not updated.
                rotationScratch.setFromMatrix4(matrixWorldToECEF.value).transpose()
            )
            .multiplyScalar(light.distance)
            .add(light.target.position);

        // Sync cloud shadow uniforms from AtmosphereContext
        const ctx = this.atmosphereContext;
        if (ctx?.cloudShadowEnabled) {
            this.cloudShadowEnabled.value = 1;
            this.cloudShadowCascadeCount.value = ctx.cloudShadowCascadeCount;
            this.cloudShadowFar.value = ctx.cloudShadowFar;
            this.cloudShadowTopHeight.value = ctx.cloudShadowTopHeight;
            this.cloudShadowTexelSize.value.set(1 / 512, 1 / 512);
            for (let i = 0; i < MAX_CASCADES; i++) {
                if (i < ctx.cloudShadowCascadeCount) {
                    this.cloudShadowMatrices[i].value.copy(ctx.cloudShadowMatrices[i]);
                    this.cloudShadowIntervals[i].value.copy(ctx.cloudShadowIntervals[i]);
                    if (!this._cloudShadowTexReady && ctx.cloudShadowTextureNodes[i]) {
                        this.cloudShadowTextureNodes[i] = ctx.cloudShadowTextureNodes[i];
                    }
                    if (!this._cloudShadowTexReady && ctx.cloudShadowRawTextureNodes[i]) {
                        this.cloudShadowRawTextureNodes[i] = ctx.cloudShadowRawTextureNodes[i];
                    }
                }
            }
            if (this.cloudShadowTextureNodes[0] != null) {
                this._cloudShadowTexReady = true;
            }
        } else {
            this.cloudShadowEnabled.value = 0;
        }
    }

    override update(frame: NodeFrame): void {
        super.update(frame);

        const { light, atmosphereContext } = this;
        if (light == null || atmosphereContext == null) {
            return;
        }
        switch (light.body) {
            case "sun":
                this.intensity.value = light.intensity;
                this.directionECEF.value.copy(atmosphereContext.sunDirectionECEF.value);
                break;
            case "moon":
                this.intensity.value = light.intensity * 2.5e-6; // TODO: Consider moon phase
                this.directionECEF.value.copy(atmosphereContext.moonDirectionECEF.value);
                break;
        }
    }

    override setup(builder: NodeBuilder): unknown {
        this.atmosphereContext ??= getAtmosphereContext(builder);
        return super.setup(builder);
    }

    override setupDirect(builder: NodeBuilder): DirectLightData | undefined {
        const { light, atmosphereContext } = this;
        if (light == null || atmosphereContext == null) {
            return;
        }

        const { intensity, directionECEF } = this;
        const { direct, indirect } = light;
        const { worldToUnit, solarIrradiance, sunRadianceToLuminance, luminanceScale } =
            atmosphereContext.parametersNode;
        const { matrixViewToECEF, matrixECEFToView, altitudeCorrectionECEF } = atmosphereContext;

        // Derive the ECEF normal vector and the unit-space position of the vertex.
        const normalECEF = matrixViewToECEF.mul(vec4(normalView, 0)).xyz;
        let positionECEF = matrixViewToECEF.mul(vec4(positionView, 1)).xyz;
        if (atmosphereContext.correctAltitude) {
            positionECEF = positionECEF.add(altitudeCorrectionECEF);
        }
        const positionUnit = positionECEF.mul(worldToUnit).toConst();

        // Compute the indirect illuminance to store it in the context.
        const indirectIlluminance = getIndirectIlluminance(
            positionUnit,
            normalECEF,
            directionECEF
        ).mul(indirect.select(1, 0).uniformFlow());

        // Yes, it's an indirect but should be fine to update it here.
        const lightingContext = builder.context as unknown as LightingContext;
        lightingContext.irradiance.addAssign(indirectIlluminance.mul(intensity));

        // Derive the view-space light direction.
        const directionView = matrixECEFToView.mul(vec4(directionECEF, 0)).xyz;

        // Compute the direct luminance of the light.
        // Fortunately, the apparent sizes of the sun and moon are close, we use
        // the result of getTransmittanceToSun for the moon as well.
        const radius = positionUnit.length().toConst();
        const cosLight = positionUnit.dot(directionECEF).div(radius);
        const transmittance = getTransmittanceToSun(
            atmosphereContext.lutNode.getTextureNode("transmittance"),
            radius,
            cosLight
        );

        let directLuminance = solarIrradiance
            .mul(transmittance)
            .mul(sunRadianceToLuminance.mul(luminanceScale))
            .mul(intensity)
            .mul(direct.select(1, 0).uniformFlow());

        // Cloud shadow: sample BSM to attenuate direct sun light.
        // Only apply when sun is above local horizon (cosLight > 0).
        // When sun is below horizon, directLuminance ≈ 0 anyway, but distanceToTop
        // would compute an enormous value (ray through Earth), causing artifacts.
        if (this._cloudShadowTexReady) {
            const cloudTransmittance = cosLight
                .greaterThan(0)
                .select(this._sampleCloudShadow(positionECEF, directionECEF), float(1));
            directLuminance = directLuminance.mul(cloudTransmittance);
        }

        return {
            lightDirection: directionView,
            lightColor: directLuminance.mul(this.colorNode)
        };
    }

    /**
     * Sample the cloud Beer Shadow Map to compute sun transmittance.
     * Returns exp(-opticalDepth) in [0, 1].
     *
     * Mirrors reference aerialPerspectiveEffect.frag + clouds.frag projectCascade:
     *   distanceToTop = raySphereSecondIntersection(pos, sunDir, bottomRadius + shadowTopHeight)
     *   cascadeIndex = select by view depth
     *   shadow = texture(shadowBuffer, vec3(uv, cascadeIndex))
     *   opticalDepth = min(shadow.b, shadow.g * max(0, distanceToTop - shadow.r))
     */
    private _sampleCloudShadow(positionECEF: any, sunDirection: any): any {
        const ctx = this.atmosphereContext!;
        const bottomRadiusMeters = float(ctx.parameters.bottomRadius);
        const shadowTopHeight = this.cloudShadowTopHeight;
        const altitudeCorrection = ctx.altitudeCorrectionECEF;
        const ecefToWorld = ctx.matrixECEFToWorld;

        // Distance to shadow layer top along sun direction (ECEF meters).
        // Matches reference raySphereSecondIntersection.
        const a = positionECEF;
        const b = dot(sunDirection, a).mul(2);
        const shadowTopR = bottomRadiusMeters.add(shadowTopHeight);
        const c = dot(a, a).sub(shadowTopR.mul(shadowTopR));
        const disc = b.mul(b).sub(c.mul(4));
        const distanceToTop = b
            .negate()
            .add(sqrt(disc.max(0)))
            .mul(0.5);

        // worldPos for cascade projection (same as cloudTsl.ts projectCascade)
        const worldPos = ecefToWorld.mul(vec4(positionECEF.sub(altitudeCorrection), 1)).xyz;

        // Compute screen-space shadow texel size via cascade-0 UV derivatives.
        // This MUST be outside cascade If() branches because dFdx/dFdy are undefined
        // in divergent control flow on GPU. Cascade-0 texel size is representative
        // for all cascades (same shadow map size).
        const c0Clip = this.cloudShadowMatrices[0].mul(vec4(worldPos, 1));
        const c0UV = c0Clip.xy.div(c0Clip.w).mul(0.5).add(0.5);
        const shadowSize = float(512);
        const texelsPerPixel = max(
            dFdx(c0UV).length().mul(shadowSize),
            dFdy(c0UV).length().mul(shadowSize)
        ).max(float(1e-7));
        const screenPixelsPerTexel = float(1).div(texelsPerPixel);
        // remapClamped(screenPixelsPerTexel, 10, 50, 0, maxShadowFilterRadius)
        // = clamp((screenPixelsPerTexel - 10) / 40, 0, 1) * maxShadowFilterRadius(=4.0)
        const adaptiveRadius = screenPixelsPerTexel.sub(10).div(40).clamp(0, 1).mul(4);

        // Interleaved Gradient Noise for per-pixel PCF rotation (deterministic, stable)
        const ign = fract(
            float(52.9829189).mul(fract(dot(screenCoordinate, vec2(0.06711056, 0.00583715))))
        );
        const pcfAngle = ign.mul(float(6.283185307179586));
        const filterRadius = adaptiveRadius.mul(this.cloudShadowTexelSize);

        const od = float(0).toVar();

        const N = 8;
        const goldenAngle = float(2.39996322972865332);

        const projectAndSample = (idx: number) => {
            const mat = this.cloudShadowMatrices[idx];
            const clip = mat.mul(vec4(worldPos, 1));
            const clipDiv = clip.xy.div(clip.w);
            const shadowUV = clipDiv.mul(0.5).add(0.5);

            // 8-tap Vogel disk PCF with IGN rotation and adaptive radius
            const odSum = float(0).toVar();
            for (let i = 0; i < N; i++) {
                const fi = float(i);
                const r = sqrt(fi.add(float(0.5)).div(float(N)));
                const theta = fi.mul(goldenAngle).add(pcfAngle);
                const ox = cos(theta).mul(r);
                const oy = sin(theta).mul(r);
                const uv = shadowUV.add(vec2(ox, oy).mul(filterRadius));
                // Use temporally-resolved shadow texture for temporal stability.
                // Raw BSM textures have 8-frame SVS noise (frame%8 controls sampling
                // pattern) that causes visible flickering on ground during camera movement.
                // The temporal resolve's slow EMA + velocity reprojection eliminates
                // frame-to-frame variation while keeping cascade alignment correct.
                const shadow = texture(this.cloudShadowTextureNodes[idx], uv);
                const distFront = max(float(0), distanceToTop.sub(shadow.r));
                odSum.addAssign(min(shadow.b, shadow.g.mul(distFront)));
            }
            const sampleOd = odSum.div(float(N));

            const inBounds = shadowUV.x
                .greaterThanEqual(0)
                .and(shadowUV.x.lessThanEqual(1))
                .and(shadowUV.y.greaterThanEqual(0))
                .and(shadowUV.y.lessThanEqual(1));
            return inBounds.select(sampleOd, float(0));
        };

        // Cascade selection: use view depth directly (positionView.z).
        const viewDist = positionView.z.negate();

        const c0End = this.cloudShadowIntervals[0].y.mul(this.cloudShadowFar);
        const c1End = this.cloudShadowIntervals[1].y.mul(this.cloudShadowFar);
        const c1Valid = this.cloudShadowCascadeCount.greaterThan(1);
        const c2Valid = this.cloudShadowCascadeCount.greaterThan(2);

        // Fade margins matching cloudTsl.ts pattern (10% of cascade range, smooth mix)
        const c0FadeRange = c0End
            .sub(this.cloudShadowIntervals[0].x.mul(this.cloudShadowFar))
            .mul(float(0.1));
        const c1FadeRange = c1End
            .sub(this.cloudShadowIntervals[1].x.mul(this.cloudShadowFar))
            .mul(float(0.1));

        If(distanceToTop.greaterThan(0), () => {
            If(viewDist.greaterThan(c1End).and(c2Valid), () => {
                od.assign(projectAndSample(2));
            })
                .ElseIf(viewDist.greaterThan(c0End).and(c1Valid), () => {
                    const c1UpperFade = clamp(
                        viewDist.sub(c1End.sub(c1FadeRange)).div(c1FadeRange.max(float(1e-7))),
                        float(0),
                        float(1)
                    );
                    const od1 = projectAndSample(1);
                    If(c2Valid.and(c1UpperFade.greaterThan(0)), () => {
                        od.assign(mix(od1, projectAndSample(2), c1UpperFade));
                    }).Else(() => {
                        od.assign(od1);
                    });
                })
                .Else(() => {
                    const c0UpperFade = clamp(
                        viewDist.sub(c0End.sub(c0FadeRange)).div(c0FadeRange.max(float(1e-7))),
                        float(0),
                        float(1)
                    );
                    const od0 = projectAndSample(0);
                    If(c1Valid.and(c0UpperFade.greaterThan(0)), () => {
                        od.assign(mix(od0, projectAndSample(1), c0UpperFade));
                    }).Else(() => {
                        od.assign(od0);
                    });
                });
        });

        return od.negate().exp();
    }
}
