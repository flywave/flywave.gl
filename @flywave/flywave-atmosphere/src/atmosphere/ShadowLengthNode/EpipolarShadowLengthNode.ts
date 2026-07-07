// @ts-nocheck
/* Copyright (C) 2025 flywave.gl contributors */

// Based on Intel's Outdoor Light Scattering Sample: https://github.com/GameTechDev/OutdoorLightScattering

/**
 * Copyright 2017 Intel Corporation.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not
 * use this file except in compliance with the License. You may obtain a copy of
 * the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS, WITHOUT
 * WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the
 * License for the specific language governing permissions and limitations under
 * the License.
 *
 * Modified from the original source code.
 */

/* eslint-disable max-nested-callbacks */

import { HalfFloatType, RenderTarget, RGFormat, type PerspectiveCamera } from "three";
import type { CSMShadowNode } from "three/examples/jsm/csm/CSMShadowNode.js";
import {
    and,
    Break,
    float,
    Fn,
    If,
    int,
    ivec2,
    Loop,
    max,
    min,
    screenCoordinate,
    uint,
    uniform,
    vec2,
    vec3,
    vec4
} from "three/tsl";
import {
    NodeMaterial,
    NodeUpdateType,
    QuadMesh,
    RendererUtils,
    type NodeBuilder,
    type NodeFrame,
    type TextureNode,
    type UniformArrayNode,
    type UniformNode
} from "three/webgpu";

import { FnVar } from "../../tsl/FnVar";
import { outputTexture } from "../../tsl/OutputTextureNode";
import { raySpheresIntersections } from "../../tsl/math";
import { Node } from "../../tsl/node";

import { getAtmosphereContext } from "../AtmosphereContext";
import { HALF_FLOAT_MAX, transformSliceToUnit, transformUnitToShadowUV } from "./common";

const { resetRendererState, restoreRendererState } = RendererUtils;

const getRaySphereIntersections = /*#__PURE__*/ FnVar(
    (
        rayOrigin: Node<"vec3">,
        rayDirection: Node<"vec3">,
        sphereCenter: Node<"vec3">,
        sphereRadius: Node<"vec2">
    ): Node<"vec4"> => {
        const intersections = raySpheresIntersections(
            rayOrigin,
            rayDirection,
            sphereCenter,
            sphereRadius
        ).toConst();
        return vec4(
            intersections.get("near").x,
            intersections.get("far").x,
            intersections.get("near").y,
            intersections.get("far").y
        );
    }
);

export class EpipolarShadowLengthNode extends Node {
    static override get type(): string {
        return "EpipolarShadowLengthNode";
    }

    csmShadowNode!: CSMShadowNode;
    coordinateNode!: TextureNode;
    sliceUVDirectionNode!: TextureNode;
    minMaxLevelsNode!: TextureNode;
    shadowDepthNodes!: TextureNode[];

    camera!: PerspectiveCamera;

    epipolarSliceCount!: UniformNode<number>; // float
    maxSliceSampleCount!: UniformNode<number>; // float
    firstCascade!: UniformNode<number>; // uint
    maxShadowStep!: UniformNode<number>; // float
    shadowCascadeArray!: UniformArrayNode; // vec2[]
    shadowMatrixArray!: UniformArrayNode; // mat4[]

    private readonly _textureNode: TextureNode;
    private readonly renderTarget: RenderTarget;
    private readonly material = new NodeMaterial();
    private readonly mesh = new QuadMesh(this.material);
    private _rendererState?: RendererUtils.RendererState;

    constructor() {
        super();
        this.updateType = NodeUpdateType.FRAME; // After CSM's updateBefore
        this.material.name = "EpipolarShadowLength";
        this.mesh.name = "EpipolarShadowLength";

        const renderTarget = new RenderTarget(1, 1, {
            depthBuffer: false,
            type: HalfFloatType,
            format: RGFormat
        });
        const texture = renderTarget.texture;
        texture.name = "EpipolarShadowLength";
        this.renderTarget = renderTarget;

        this._textureNode = outputTexture(this, renderTarget.texture);
    }

    getTextureNode(): TextureNode {
        return this._textureNode;
    }

    override update({ renderer }: NodeFrame): void {
        if (renderer == null) {
            return;
        }

        this.renderTarget.setSize(this.maxSliceSampleCount.value, this.epipolarSliceCount.value);

        this._rendererState = resetRendererState(renderer, this._rendererState);

        renderer.setRenderTarget(this.renderTarget);
        this.mesh.render(renderer);

        restoreRendererState(renderer, this._rendererState);
    }

    private setupFragmentNode(builder: NodeBuilder): Node<"vec2"> {
        const {
            csmShadowNode,
            coordinateNode,
            sliceUVDirectionNode,
            minMaxLevelsNode,
            shadowDepthNodes,
            camera,
            epipolarSliceCount,
            firstCascade,
            maxShadowStep,
            shadowCascadeArray,
            shadowMatrixArray
        } = this;

        const { cascades: cascadeCount } = csmShadowNode;
        const { cameraPositionUnit, parameters } = getAtmosphereContext(builder);
        const { worldToUnit } = parameters;

        const biasedCameraFar = uniform("float").onRenderUpdate(
            () => camera.far * worldToUnit * 0.999999
        );

        const sampleShadow = FnVar(
            (
                shadowUVInLightSpace: Node<"vec2">,
                cascadeIndex: Node<"int">,
                depthInLightSpace: Node<"float">
            ): Node<"float"> => {
                const isInLight = float(0).toVar();
                for (let cascade = 0; cascade < cascadeCount; ++cascade) {
                    If(cascadeIndex.equal(cascade), () => {
                        isInLight.assign(
                            shadowDepthNodes[cascade]
                                .sample(shadowUVInLightSpace.xy)
                                .compare(depthInLightSpace)
                        );
                    });
                }
                return isInLight;
            }
        );

        const processCascade = FnVar(
            (
                cascadeIndex: Node<"int">,
                rayEndCameraZ: Node<"float">,
                cascadeStartCameraZ: Node<"float">,
                cascadeEndCameraZ: Node<"float">,
                fullRayLength: Node<"float">,
                viewDirection: Node<"vec3">,
                rayTopIntersection: Node<"vec2">
            ): Node<"vec2"> => {
                const sliceIndex = uint(screenCoordinate.y);
                const minMaxShadowMapSize = int(minMaxLevelsNode.size().x).toConst();

                const rayEndRatio = min(rayEndCameraZ, cascadeEndCameraZ)
                    .div(rayEndCameraZ)
                    .toConst();
                const rayStartRatio = cascadeStartCameraZ.div(rayEndCameraZ).toConst();
                const distanceToRayStart = fullRayLength.mul(rayStartRatio).toVar();
                const distanceToRayEnd = fullRayLength.mul(rayEndRatio).toVar();

                distanceToRayStart.assign(max(distanceToRayStart, rayTopIntersection.x));
                distanceToRayEnd.assign(max(distanceToRayEnd, rayTopIntersection.x));

                const rayEnd = cameraPositionUnit
                    .add(viewDirection.mul(distanceToRayEnd))
                    .toConst();
                const rayStart = cameraPositionUnit
                    .add(viewDirection.mul(distanceToRayStart))
                    .toConst();

                const rayLength = distanceToRayEnd.sub(distanceToRayStart).toConst();

                const totalShadowLength = float(0).toVar();
                const firstShadowMoment = float(0).toVar();
                const totalMarchedLength = float(0).toVar();

                If(rayLength.lessThanEqual(10 * worldToUnit).not(), () => {
                    const shadowMatrix = shadowMatrixArray.element(cascadeIndex);
                    const startUVAndDepthInLightSpace = transformUnitToShadowUV(
                        rayStart,
                        shadowMatrix
                    );
                    const endUVAndDepthInLightSpace = transformUnitToShadowUV(rayEnd, shadowMatrix);

                    const shadowTraceDirection = endUVAndDepthInLightSpace
                        .sub(startUVAndDepthInLightSpace)
                        .toVar();
                    const traceLengthInShadowUVSpace = max(
                        shadowTraceDirection.xy.length(),
                        1e-7
                    ).toConst();
                    shadowTraceDirection.divAssign(traceLengthInShadowUVSpace);

                    const relativeCascadeIndex = cascadeIndex.sub(firstCascade).toConst();
                    const sliceUVDirectionAndOrigin = sliceUVDirectionNode
                        .load(ivec2(sliceIndex, relativeCascadeIndex))
                        .toConst();
                    const sliceDirectionUV = sliceUVDirectionAndOrigin.xy.toConst();
                    const shadowUVStepLength = sliceDirectionUV.length().toConst();
                    const sliceOriginUV = sliceUVDirectionAndOrigin.zw.toConst();

                    const rayStepLengthUnit = rayLength
                        .mul(shadowUVStepLength.div(traceLengthInShadowUVSpace))
                        .toConst();

                    const distanceMarchedInCascade = float(0).toVar();
                    const currentShadowUVAndDepthInLightSpace = startUVAndDepthInLightSpace.toVar();

                    const minLevel = 0;
                    const currentSamplePosition = uint(
                        startUVAndDepthInLightSpace.xy
                            .sub(sliceOriginUV)
                            .length()
                            .div(shadowUVStepLength)
                            .add(0.5)
                    ).toVar();
                    const currentTreeLevel = uint(0).toVar();
                    const levelDataOffset = minMaxShadowMapSize.negate().toVar();
                    const stepScale = float(1).toVar();
                    const maxStepScale = maxShadowStep;

                    const shadowUVAndDepthStep = shadowTraceDirection
                        .mul(shadowUVStepLength)
                        .toConst();
                    const minMaxTextureYIndex = uint(sliceIndex)
                        .add(uint(cascadeIndex.sub(firstCascade)).mul(epipolarSliceCount))
                        .toConst();

                    Loop(distanceMarchedInCascade.lessThan(rayLength), () => {
                        const currentDepthInLightSpace = currentShadowUVAndDepthInLightSpace.z
                            .clamp(1e-7, 1)
                            .toConst();
                        const isInLight = float(0).toVar();

                        If(
                            and(
                                stepScale.mul(2).lessThan(maxStepScale),
                                currentSamplePosition
                                    .bitAnd(uint(2).shiftLeft(currentTreeLevel).sub(1))
                                    .equal(0)
                            ),
                            () => {
                                levelDataOffset.addAssign(
                                    minMaxShadowMapSize.shiftRight(currentTreeLevel)
                                );
                                currentTreeLevel.addAssign(1);
                                stepScale.mulAssign(2);
                            }
                        );

                        Loop(currentTreeLevel.greaterThan(minLevel), () => {
                            const nextLightSpaceDepth = currentShadowUVAndDepthInLightSpace.z.add(
                                shadowUVAndDepthStep.z.mul(stepScale.sub(1))
                            );
                            const startEndDepthOnRaySection = vec2(
                                currentShadowUVAndDepthInLightSpace.z,
                                nextLightSpaceDepth
                            )
                                .saturate()
                                .toConst();

                            const minMaxTextureCoord = ivec2(
                                int(currentSamplePosition.shiftRight(currentTreeLevel)).add(
                                    levelDataOffset
                                ),
                                minMaxTextureYIndex
                            );
                            const currentMinMaxDepth = minMaxLevelsNode
                                .load(minMaxTextureCoord)
                                .xy.toConst();

                            isInLight.assign(
                                builder.renderer.reversedDepthBuffer
                                    ? startEndDepthOnRaySection
                                          .greaterThanEqual(currentMinMaxDepth.yy)
                                          .all()
                                    : startEndDepthOnRaySection
                                          .lessThanEqual(currentMinMaxDepth.xx)
                                          .all()
                            );
                            const isInShadow = (
                                builder.renderer.reversedDepthBuffer
                                    ? startEndDepthOnRaySection
                                          .lessThan(currentMinMaxDepth.xx)
                                          .all()
                                    : startEndDepthOnRaySection
                                          .greaterThan(currentMinMaxDepth.yy)
                                          .all()
                            ).toConst();

                            If(isInLight.or(isInShadow), () => {
                                Break();
                            });
                            currentTreeLevel.subAssign(1);
                            levelDataOffset.subAssign(
                                minMaxShadowMapSize.shiftRight(currentTreeLevel)
                            );
                            stepScale.divAssign(2);
                        });

                        If(currentTreeLevel.lessThanEqual(minLevel), () => {
                            isInLight.assign(
                                sampleShadow(
                                    currentShadowUVAndDepthInLightSpace.xy,
                                    cascadeIndex,
                                    currentDepthInLightSpace
                                )
                            );
                        });

                        const remainingDistance = rayLength
                            .sub(distanceMarchedInCascade)
                            .max(0)
                            .toConst();
                        const integrationStep = rayStepLengthUnit
                            .mul(stepScale)
                            .min(remainingDistance)
                            .toConst();

                        currentShadowUVAndDepthInLightSpace.addAssign(
                            shadowUVAndDepthStep.mul(stepScale)
                        );
                        currentSamplePosition.addAssign(uint(1).shiftLeft(currentTreeLevel));
                        distanceMarchedInCascade.addAssign(rayStepLengthUnit.mul(stepScale));

                        const shadowStepLength = integrationStep
                            .mul(isInLight.oneMinus())
                            .toConst();
                        const centerStepDistance = distanceToRayStart
                            .add(totalMarchedLength)
                            .add(integrationStep.mul(0.5));

                        totalShadowLength.addAssign(shadowStepLength);
                        firstShadowMoment.addAssign(shadowStepLength.mul(centerStepDistance));
                        totalMarchedLength.addAssign(integrationStep);
                    });
                });

                return vec2(totalShadowLength, firstShadowMoment);
            }
        );

        return Fn(() => {
            const { parametersNode } = getAtmosphereContext(builder);
            const { topRadius, bottomRadius } = parametersNode;

            const coordinate = coordinateNode.load(screenCoordinate).toConst();
            const sampleLocation = coordinate.xy;
            const rayEndCameraZ = coordinate.z.toVar();

            const totalShadowLength = vec2(0).toVar();
            const fullRayLength = float(0).toVar();

            If(
                sampleLocation
                    .abs()
                    .greaterThan(1 + 1e-3)
                    .any()
                    .not(),
                () => {
                    const rayTermination = transformSliceToUnit(
                        sampleLocation,
                        rayEndCameraZ,
                        camera
                    ).toConst();
                    const fullRay = rayTermination.sub(cameraPositionUnit).toConst();
                    fullRayLength.assign(fullRay.length());
                    const viewDirection = fullRay.div(fullRayLength).toConst();

                    const intersections = getRaySphereIntersections(
                        cameraPositionUnit,
                        viewDirection,
                        vec3(0),
                        vec2(topRadius, bottomRadius)
                    ).toConst();
                    const rayTopIntersection = intersections.xy;
                    const rayBottomIntersection = intersections.zw;

                    If(rayTopIntersection.y.greaterThan(0), () => {
                        const rayLength = fullRayLength.toVar();
                        If(rayEndCameraZ.greaterThanEqual(biasedCameraFar), () => {
                            rayLength.assign(HALF_FLOAT_MAX);
                        });
                        rayLength.assign(min(rayLength, rayTopIntersection.y));
                        If(rayBottomIntersection.x.greaterThan(0), () => {
                            rayLength.assign(min(rayLength, rayBottomIntersection.x));
                        });

                        rayEndCameraZ.mulAssign(rayLength.div(fullRayLength));

                        Loop(
                            {
                                start: firstCascade,
                                end: cascadeCount,
                                condition: "<"
                            },
                            ({ i: cascadeIndex }) => {
                                const shadowCascade = shadowCascadeArray.element(cascadeIndex);
                                const cascadeStartCameraZ = shadowCascade.x;
                                const cascadeEndCameraZ = shadowCascade.y;

                                If(rayEndCameraZ.lessThan(cascadeStartCameraZ), () => {
                                    Break();
                                });

                                totalShadowLength.addAssign(
                                    processCascade(
                                        cascadeIndex,
                                        rayEndCameraZ,
                                        cascadeStartCameraZ,
                                        cascadeEndCameraZ,
                                        rayLength,
                                        viewDirection,
                                        rayTopIntersection
                                    )
                                );
                            }
                        );
                    });
                }
            );

            If(totalShadowLength.x.greaterThan(1e-6), () => {
                const distanceToFirstShadow = totalShadowLength.y
                    .div(totalShadowLength.x)
                    .sub(totalShadowLength.x.mul(0.5))
                    .clamp(0, fullRayLength.sub(totalShadowLength.x).max(0))
                    .toConst();
                totalShadowLength.y.assign(
                    distanceToFirstShadow
                        .lessThan(worldToUnit)
                        .select(0, distanceToFirstShadow)
                        .uniformFlow()
                );
            }).Else(() => {
                totalShadowLength.y.assign(fullRayLength);
            });

            return totalShadowLength;
        })();
    }

    override setup(builder: NodeBuilder): unknown {
        const { material } = this;
        material.fragmentNode = this.setupFragmentNode(builder);
        material.needsUpdate = true;

        return this._textureNode;
    }

    override dispose(): void {
        this.renderTarget.dispose();
        this.material.dispose();
        this.mesh.geometry.dispose();
        super.dispose();
    }
}
