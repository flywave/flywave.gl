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
import { FloatType, RenderTarget } from "three";
import { float, Fn, If, max, mix, uint, uv, uvec4, vec2, vec4 } from "three/tsl";
import { NodeMaterial, NodeUpdateType, QuadMesh, RendererUtils } from "three/webgpu";
import { bvecAnd, bvecNot } from "../../tsl/bvec";
import { FnVar } from "../../tsl/FnVar";
import { outputTexture } from "../../tsl/OutputTextureNode";
import { Node } from "../../tsl/node";
import { FLOAT_MAX, getOutermostScreenPixelCoords, isValidScreenLocation } from "./common";
const { resetRendererState, restoreRendererState } = RendererUtils;
export class SliceEndpointsNode extends Node {
    static get type() {
        return "SliceEndpointsNode";
    }
    constructor() {
        super();
        this.material = new NodeMaterial();
        this.mesh = new QuadMesh(this.material);
        this.updateType = NodeUpdateType.FRAME; // After CSM's updateBefore
        this.material.name = "SliceEndpoints";
        this.mesh.name = "SliceEndpoints";
        const renderTarget = new RenderTarget(1, 1, {
            depthBuffer: false,
            type: FloatType
        });
        const texture = renderTarget.texture;
        texture.name = "SliceEndpoints";
        this.renderTarget = renderTarget;
        this.textureNode = outputTexture(this, renderTarget.texture);
    }
    getTextureNode() {
        return this.textureNode;
    }
    update({ renderer }) {
        if (renderer == null) {
            return;
        }
        this.renderTarget.setSize(this.epipolarSliceCount.value, 1);
        this.rendererState = resetRendererState(renderer, this.rendererState);
        renderer.setRenderTarget(this.renderTarget);
        this.mesh.render(renderer);
        restoreRendererState(renderer, this.rendererState);
    }
    setupFragmentNode(builder) {
        const { maxSliceSampleCount, epipolarSliceCount, screenSize, lightScreenPosition, isLightOnScreen } = this;
        const getEpipolarLineEntryPoint = FnVar((exitPoint) => {
            const entryPoint = lightScreenPosition.xy.toVar();
            If(isLightOnScreen.not(), () => {
                const rayDirection = exitPoint.xy.sub(lightScreenPosition.xy).toVar();
                const distanceToExitBoundary = rayDirection.length().toConst();
                rayDirection.divAssign(distanceToExitBoundary);
                const boundaries = getOutermostScreenPixelCoords(screenSize).toConst();
                const isCorrectIntersection = rayDirection.xyxy.abs().greaterThan(1e-5).toVar();
                const distanceToBoundaries = boundaries
                    .sub(lightScreenPosition.xyxy)
                    .div(rayDirection.xyxy.add(vec4(bvecNot(isCorrectIntersection))))
                    .toVar();
                isCorrectIntersection.assign(bvecAnd(isCorrectIntersection, distanceToBoundaries.lessThan(distanceToExitBoundary.sub(1e-4))));
                distanceToBoundaries.assign(vec4(isCorrectIntersection)
                    .mul(distanceToBoundaries)
                    .add(vec4(bvecNot(isCorrectIntersection)).mul(-FLOAT_MAX)));
                const firstIntersectionDistance = max(distanceToBoundaries.x, distanceToBoundaries.y, distanceToBoundaries.z, distanceToBoundaries.w).toConst();
                entryPoint.assign(lightScreenPosition.xy.add(rayDirection.mul(firstIntersectionDistance)));
            });
            return entryPoint;
        });
        return Fn(() => {
            const uvNode = uv().toConst();
            const epipolarSlice = uvNode.x
                .sub(float(0.5).div(epipolarSliceCount))
                .saturate()
                .toConst();
            const boundary = uint(epipolarSlice.mul(4).floor().clamp(0, 3)).toConst();
            const posOnBoundary = epipolarSlice.mul(4).fract().toConst();
            const boundaryFlags = uvec4(boundary).equal(uvec4(0, 1, 2, 3)).toConst();
            const outermostScreenPixelCoords = getOutermostScreenPixelCoords(screenSize).toConst();
            const isInvalidBoundary = lightScreenPosition.xyxy
                .sub(outermostScreenPixelCoords)
                .mul(vec4(1, 1, -1, -1))
                .lessThanEqual(0)
                .toConst();
            const result = vec4(-1000, -1000, -100, -100).toVar();
            If(bvecAnd(isInvalidBoundary, boundaryFlags).any().not(), () => {
                const boundaryX = vec4(0, posOnBoundary, 1, posOnBoundary.oneMinus());
                const boundaryY = vec4(posOnBoundary.oneMinus(), 0, posOnBoundary, 1);
                const exitPointOnBoundary = vec2(boundaryX.dot(vec4(boundaryFlags)), boundaryY.dot(vec4(boundaryFlags))).toConst();
                const exitPoint = mix(outermostScreenPixelCoords.xy, outermostScreenPixelCoords.zw, exitPointOnBoundary).toVar();
                const entryPoint = getEpipolarLineEntryPoint(exitPoint).toVar();
                If(isValidScreenLocation(entryPoint, screenSize), () => {
                    const epipolarSliceScreenLength = exitPoint
                        .sub(entryPoint)
                        .mul(screenSize.div(2))
                        .length()
                        .toConst();
                    exitPoint.assign(entryPoint.add(exitPoint
                        .sub(entryPoint)
                        .mul(maxSliceSampleCount.div(epipolarSliceScreenLength).max(1))));
                });
                result.assign(vec4(entryPoint, exitPoint));
            });
            return result;
        })();
    }
    setup(builder) {
        const { material } = this;
        material.fragmentNode = this.setupFragmentNode(builder);
        material.needsUpdate = true;
        return this.textureNode;
    }
    dispose() {
        this.renderTarget.dispose();
        this.material.dispose();
        this.mesh.geometry.dispose();
        super.dispose();
    }
}
//# sourceMappingURL=SliceEndpointsNode.js.map