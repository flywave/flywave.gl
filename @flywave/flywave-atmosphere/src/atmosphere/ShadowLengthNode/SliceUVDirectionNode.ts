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

import { type Camera, type Vector2, FloatType, RenderTarget, type NodeBuilder, type NodeFrame, type TextureNode, type UniformArrayNode, type UniformNode, NodeMaterial, NodeUpdateType, QuadMesh, RendererUtils } from "three/webgpu";
import { Fn, If, max, min, screenCoordinate, uint, uvec2, vec4 } from "three/tsl";
import type { CSMShadowNode } from "three/examples/jsm/csm/CSMShadowNode.js";



import { bvecAnd, bvecNot } from "../../tsl/bvec";
import { Node } from "../../tsl/node";
import { outputTexture } from "../../tsl/OutputTextureNode";
import { getAtmosphereContext } from "../AtmosphereContext";
import {
    FLOAT_MAX,
    isValidScreenLocation,
    transformSliceToUnit,
    transformUnitToShadowUV
} from "./common";

const { resetRendererState, restoreRendererState } = RendererUtils;

export class SliceUVDirectionNode extends Node {
    static override get type(): string {
        return "SliceUVDirectionNode";
    }

    depthNode!: TextureNode;
    csmShadowNode!: CSMShadowNode;
    sliceEndpointsNode!: TextureNode;

    camera!: Camera;

    epipolarSliceCount!: UniformNode<number>; // float
    maxSliceSampleCount!: UniformNode<number>; // float
    firstCascade!: UniformNode<number>; // uint
    screenSize!: UniformNode<Vector2>; // vec2
    shadowMapTexelSize!: UniformNode<Vector2>; // vec2
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
        this.material.name = "SliceUVDirection";
        this.mesh.name = "SliceUVDirection";

        const renderTarget = new RenderTarget(1, 1, {
            depthBuffer: false,
            type: FloatType
        });
        const texture = renderTarget.texture;
        texture.name = "SliceUVDirection";
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

        const { cascades: cascadeCount } = this.csmShadowNode;
        this.renderTarget.setSize(
            this.epipolarSliceCount.value,
            cascadeCount - this.firstCascade.value
        );

        this._rendererState = resetRendererState(renderer, this._rendererState);

        renderer.setRenderTarget(this.renderTarget);
        this.mesh.render(renderer);

        restoreRendererState(renderer, this._rendererState);
    }

    private setupFragmentNode(builder: NodeBuilder): Node<"vec4"> {
        const {
            sliceEndpointsNode,
            screenSize,
            camera,
            firstCascade,
            shadowMapTexelSize,
            shadowCascadeArray,
            shadowMatrixArray
        } = this;

        const { cameraPositionUnit } = getAtmosphereContext(builder);

        return Fn(() => {
            const sliceIndex = uint(screenCoordinate.x);

            const sliceEndpoints = sliceEndpointsNode.load(uvec2(sliceIndex, 0)).toConst();

            const result = vec4(-10000, -10000, 0, 0).toVar();

            If(isValidScreenLocation(sliceEndpoints.xy, screenSize), () => {
                const cascadeIndex = uint(screenCoordinate.y).add(firstCascade);
                const shadowMatrix = shadowMatrixArray.element(cascadeIndex);

                const sliceExitUnit = transformSliceToUnit(
                    sliceEndpoints.zw,
                    shadowCascadeArray.element(cascadeIndex).y,
                    camera
                ).toConst();
                const sliceExitUV = transformUnitToShadowUV(
                    sliceExitUnit,
                    shadowMatrix
                ).xy.toConst();

                const sliceOriginUV = transformUnitToShadowUV(
                    cameraPositionUnit,
                    shadowMatrix
                ).xy.toVar();

                const sliceDirection = sliceExitUV.sub(sliceOriginUV).toVar();
                sliceDirection.divAssign(max(sliceDirection.x.abs(), sliceDirection.y.abs()));

                const boundaryMinMaxXYXY = vec4(0, 0, 1, 1)
                    .add(vec4(0.5, 0.5, -0.5, -0.5).mul(shadowMapTexelSize.xyxy))
                    .toConst();
                If(
                    sliceOriginUV.xyxy
                        .sub(boundaryMinMaxXYXY)
                        .mul(vec4(1, 1, -1, -1))
                        .lessThan(0)
                        .any(),
                    () => {
                        const isValidIntersection = sliceDirection.xyxy
                            .abs()
                            .greaterThan(1e-6)
                            .toVar();
                        const distanceToBoundaries = boundaryMinMaxXYXY
                            .sub(sliceOriginUV.xyxy)
                            .div(sliceDirection.xyxy.add(vec4(bvecNot(isValidIntersection))))
                            .toVar();

                        isValidIntersection.assign(
                            bvecAnd(isValidIntersection, distanceToBoundaries.greaterThan(0))
                        );
                        const intersectionYXYX = sliceOriginUV.yxyx
                            .add(distanceToBoundaries.mul(sliceDirection.yxyx))
                            .toConst();

                        isValidIntersection.assign(
                            bvecAnd(
                                isValidIntersection,
                                bvecAnd(
                                    intersectionYXYX.greaterThanEqual(boundaryMinMaxXYXY.yxyx),
                                    intersectionYXYX.lessThanEqual(boundaryMinMaxXYXY.wzwz)
                                )
                            )
                        );
                        distanceToBoundaries.assign(
                            vec4(isValidIntersection)
                                .mul(distanceToBoundaries)
                                .add(vec4(bvecNot(isValidIntersection)).mul(vec4(FLOAT_MAX)))
                        );
                        const minDistance = min(
                            distanceToBoundaries.x,
                            distanceToBoundaries.y,
                            distanceToBoundaries.z,
                            distanceToBoundaries.w
                        ).toConst();

                        sliceOriginUV.assign(sliceOriginUV.add(minDistance.mul(sliceDirection)));
                    }
                );

                sliceDirection.mulAssign(shadowMapTexelSize);

                result.assign(vec4(sliceDirection, sliceOriginUV));
            });

            return result;
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
