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

import { type Camera, type Vector2, type Vector4, HalfFloatType, RenderTarget, RGFormat, type NodeBuilder, type NodeFrame, type SampleNode, type TextureNode, type UniformNode, NodeMaterial, NodeUpdateType, QuadMesh, RendererUtils } from "three/webgpu";
import { float, Fn, max, min, uniform, uv, vec2, vec4 } from "three/tsl";



import { bvecAnd, bvecNot } from "../../tsl/bvec";
import { Node } from "../../tsl/node";
import { outputTexture } from "../../tsl/OutputTextureNode";
import { textureGather } from "../../tsl/sampling";
import { getCameraZUnit, getOutermostScreenPixelCoords, transformUVToNDC } from "./common";

const { resetRendererState, restoreRendererState } = RendererUtils;

export class UnwarpEpipolarNode extends Node {
    static override get type(): string {
        return "UnwarpEpipolarNode";
    }

    sliceEndpointsNode!: TextureNode;
    coordinateNode!: TextureNode;
    epipolarShadowLengthNode!: TextureNode;
    viewZUnitNode!: TextureNode | SampleNode; // Must be filterable

    camera!: Camera;

    epipolarSliceCount!: UniformNode<number>; // float
    maxSliceSampleCount!: UniformNode<number>; // float
    screenSize!: UniformNode<Vector2>; // vec2
    lightScreenPosition!: UniformNode<Vector4>; // vec4

    refinementThreshold = uniform(0.03);

    private readonly _textureNode: TextureNode;
    private readonly renderTarget: RenderTarget;
    private readonly material = new NodeMaterial();
    private readonly mesh = new QuadMesh(this.material);
    private _rendererState?: RendererUtils.RendererState;

    constructor() {
        super();
        this.updateType = NodeUpdateType.FRAME; // After CSM's updateBefore
        this.material.name = "UnwarpEpipolar";
        this.mesh.name = "UnwarpEpipolar";

        const renderTarget = new RenderTarget(1, 1, {
            depthBuffer: false,
            type: HalfFloatType,
            format: RGFormat
        });
        const texture = renderTarget.texture;
        texture.name = "UnwarpEpipolar";
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

        const { width, height } = this.screenSize.value;
        this.renderTarget.setSize(width, height);

        this._rendererState = resetRendererState(renderer, this._rendererState);

        renderer.setRenderTarget(this.renderTarget);
        this.mesh.render(renderer);

        restoreRendererState(renderer, this._rendererState);
    }

    private setupFragmentNode(builder: NodeBuilder): Node<"vec2"> {
        const {
            sliceEndpointsNode,
            coordinateNode,
            epipolarShadowLengthNode,
            refinementThreshold,
            viewZUnitNode,
            camera,
            maxSliceSampleCount,
            epipolarSliceCount,
            screenSize,
            lightScreenPosition
        } = this;

        return Fn(() => {
            const uvNode = uv().toConst();
            const positionNDC = transformUVToNDC(uvNode).toConst();
            const cameraZ = getCameraZUnit(camera, uvNode, viewZUnitNode).toConst();

            const rayDirection = positionNDC.sub(lightScreenPosition.xy).normalize().toConst();

            const boundaries = getOutermostScreenPixelCoords(screenSize).toConst();
            const halfSpaceEquationTerms = positionNDC.xxyy
                .sub(boundaries.xzyw)
                .mul(rayDirection.yyxx)
                .toConst();
            const halfSpaceFlags = halfSpaceEquationTerms.xyyx
                .lessThan(halfSpaceEquationTerms.zzww)
                .toConst();

            const sectorFlags = bvecAnd(
                halfSpaceFlags.wxyz,
                bvecNot(halfSpaceFlags.xyzw)
            ).toConst();

            const distanceToBoundaries = boundaries
                .sub(lightScreenPosition.xyxy)
                .div(rayDirection.xyxy.add(vec4(rayDirection.xyxy.abs().lessThan(1e-6))))
                .toConst();
            const distanceToExitBoundary = vec4(sectorFlags).dot(distanceToBoundaries).toConst();
            const exitPoint = lightScreenPosition.xy
                .add(rayDirection.mul(distanceToExitBoundary))
                .toConst();

            const epipolarSlice = vec4(0, 0.25, 0.5, 0.75)
                .add(
                    exitPoint.yxyx
                        .sub(boundaries.wxyz)
                        .mul(vec4(-1, 1, 1, -1))
                        .div(boundaries.wzwz.sub(boundaries.yxyx))
                        .saturate()
                        .div(4)
                )
                .toConst();
            const epipolarSliceValue = vec4(sectorFlags).dot(epipolarSlice).toConst();

            const precedingSliceIndex = min(
                epipolarSliceValue.mul(epipolarSliceCount).floor(),
                epipolarSliceCount.sub(1)
            ).toConst();

            const sourceSliceV0 = precedingSliceIndex
                .div(epipolarSliceCount)
                .add(float(0.5).div(epipolarSliceCount))
                .toConst();
            const sourceSliceV1 = sourceSliceV0
                .add(float(1).div(epipolarSliceCount))
                .fract()
                .toConst();
            const sourceSliceV = [sourceSliceV0, sourceSliceV1];

            const sliceWeight1 = epipolarSliceValue
                .mul(epipolarSliceCount)
                .sub(precedingSliceIndex)
                .toConst();
            const sliceWeight0 = sliceWeight1.oneMinus().toConst();
            const sliceWeights = [sliceWeight0, sliceWeight1];

            const shadowLength = vec2(0).toVar();
            const totalWeight = float(0).toVar();

            for (let i = 0; i < 2; ++i) {
                const sliceEndpoints = sliceEndpointsNode
                    .sample(vec2(sourceSliceV[i], 0.5))
                    .toConst();

                const sliceDirection = sliceEndpoints.zw.sub(sliceEndpoints.xy).toConst();
                const sliceLengthSquare = sliceDirection.dot(sliceDirection).toConst();

                const samplePositionOnLine = positionNDC
                    .sub(sliceEndpoints.xy)
                    .dot(sliceDirection)
                    .div(sliceLengthSquare.max(1e-8))
                    .toConst();
                const sampleIndex = samplePositionOnLine.mul(maxSliceSampleCount.sub(1)).toConst();

                const precedingSampleIndex = sampleIndex.floor().toConst();
                const uWeight = sampleIndex.sub(precedingSampleIndex).toConst();
                const precedingSampleU = precedingSampleIndex
                    .add(0.5)
                    .div(maxSliceSampleCount)
                    .toConst();

                const shadowLengthUV = vec2(precedingSampleU, sourceSliceV[i]).toConst();

                const shadowLengthTextureSize = vec2(
                    maxSliceSampleCount,
                    epipolarSliceCount
                ).toConst();
                const sourceLocationsCameraZ = textureGather(
                    coordinateNode,
                    shadowLengthUV.add(vec2(0.5).div(shadowLengthTextureSize)),
                    2
                ).wz;

                const maxZ = max(sourceLocationsCameraZ, max(cameraZ, 1)).toConst();
                const depthWeights = refinementThreshold
                    .div(
                        cameraZ.sub(sourceLocationsCameraZ).abs().div(maxZ).max(refinementThreshold)
                    )
                    .saturate()
                    .toVar();
                depthWeights.assign(depthWeights.pow4());

                const bilateralUWeight = vec2(uWeight.oneMinus(), uWeight)
                    .mul(depthWeights)
                    .mul(sliceWeights[i])
                    .toVar();
                bilateralUWeight.mulAssign(
                    vec2(
                        samplePositionOnLine
                            .sub(0.5)
                            .abs()
                            .lessThan(maxSliceSampleCount.sub(1).reciprocal().add(0.5))
                    )
                );
                const subpixelUOffset = bilateralUWeight.y
                    .div(bilateralUWeight.x.add(bilateralUWeight.y).max(0.001))
                    .toVar();
                subpixelUOffset.divAssign(shadowLengthTextureSize.x);

                const filteredShadowLength = bilateralUWeight.x
                    .add(bilateralUWeight.y)
                    .mul(
                        epipolarShadowLengthNode.sample(
                            shadowLengthUV.add(vec2(subpixelUOffset, 0))
                        ).xy
                    )
                    .toConst();
                shadowLength.addAssign(filteredShadowLength);

                totalWeight.addAssign(bilateralUWeight.dot(vec2(1)));
            }

            return totalWeight
                .greaterThan(1e-6)
                .select(shadowLength.div(totalWeight), 0)
                .uniformFlow();
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
