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
import { Fn, If, max, min, screenCoordinate, uint, uvec2, vec4 } from "three/tsl";
import { NodeMaterial, NodeUpdateType, QuadMesh, RendererUtils } from "three/webgpu";
import { bvecAnd, bvecNot } from "../../tsl/bvec";
import { outputTexture } from "../../tsl/OutputTextureNode";
import { Node } from "../../tsl/node";
import { getAtmosphereContext } from "../AtmosphereContext";
import { FLOAT_MAX, isValidScreenLocation, transformSliceToUnit, transformUnitToShadowUV } from "./common";
const { resetRendererState, restoreRendererState } = RendererUtils;
export class SliceUVDirectionNode extends Node {
    static get type() {
        return "SliceUVDirectionNode";
    }
    constructor() {
        super();
        this.material = new NodeMaterial();
        this.mesh = new QuadMesh(this.material);
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
        this.textureNode = outputTexture(this, renderTarget.texture);
    }
    getTextureNode() {
        return this.textureNode;
    }
    update({ renderer }) {
        if (renderer == null) {
            return;
        }
        const { cascades: cascadeCount } = this.csmShadowNode;
        this.renderTarget.setSize(this.epipolarSliceCount.value, cascadeCount - this.firstCascade.value);
        this.rendererState = resetRendererState(renderer, this.rendererState);
        renderer.setRenderTarget(this.renderTarget);
        this.mesh.render(renderer);
        restoreRendererState(renderer, this.rendererState);
    }
    setupFragmentNode(builder) {
        const { sliceEndpointsNode, screenSize, camera, firstCascade, shadowMapTexelSize, shadowCascadeArray, shadowMatrixArray } = this;
        const { cameraPositionUnit } = getAtmosphereContext(builder);
        return Fn(() => {
            const sliceIndex = uint(screenCoordinate.x);
            const sliceEndpoints = sliceEndpointsNode.load(uvec2(sliceIndex, 0)).toConst();
            const result = vec4(-10000, -10000, 0, 0).toVar();
            If(isValidScreenLocation(sliceEndpoints.xy, screenSize), () => {
                const cascadeIndex = uint(screenCoordinate.y).add(firstCascade);
                const shadowMatrix = shadowMatrixArray.element(cascadeIndex);
                const sliceExitUnit = transformSliceToUnit(sliceEndpoints.zw, shadowCascadeArray.element(cascadeIndex).y, camera).toConst();
                const sliceExitUV = transformUnitToShadowUV(sliceExitUnit, shadowMatrix).xy.toConst();
                const sliceOriginUV = transformUnitToShadowUV(cameraPositionUnit, shadowMatrix).xy.toVar();
                const sliceDirection = sliceExitUV.sub(sliceOriginUV).toVar();
                sliceDirection.divAssign(max(sliceDirection.x.abs(), sliceDirection.y.abs()));
                const boundaryMinMaxXYXY = vec4(0, 0, 1, 1)
                    .add(vec4(0.5, 0.5, -0.5, -0.5).mul(shadowMapTexelSize.xyxy))
                    .toConst();
                If(sliceOriginUV.xyxy
                    .sub(boundaryMinMaxXYXY)
                    .mul(vec4(1, 1, -1, -1))
                    .lessThan(0)
                    .any(), () => {
                    const isValidIntersection = sliceDirection.xyxy
                        .abs()
                        .greaterThan(1e-6)
                        .toVar();
                    const distanceToBoundaries = boundaryMinMaxXYXY
                        .sub(sliceOriginUV.xyxy)
                        .div(sliceDirection.xyxy.add(vec4(bvecNot(isValidIntersection))))
                        .toVar();
                    isValidIntersection.assign(bvecAnd(isValidIntersection, distanceToBoundaries.greaterThan(0)));
                    const intersectionYXYX = sliceOriginUV.yxyx
                        .add(distanceToBoundaries.mul(sliceDirection.yxyx))
                        .toConst();
                    isValidIntersection.assign(bvecAnd(isValidIntersection, bvecAnd(intersectionYXYX.greaterThanEqual(boundaryMinMaxXYXY.yxyx), intersectionYXYX.lessThanEqual(boundaryMinMaxXYXY.wzwz))));
                    distanceToBoundaries.assign(vec4(isValidIntersection)
                        .mul(distanceToBoundaries)
                        .add(vec4(bvecNot(isValidIntersection)).mul(vec4(FLOAT_MAX))));
                    const minDistance = min(distanceToBoundaries.x, distanceToBoundaries.y, distanceToBoundaries.z, distanceToBoundaries.w).toConst();
                    sliceOriginUV.assign(sliceOriginUV.add(minDistance.mul(sliceDirection)));
                });
                sliceDirection.mulAssign(shadowMapTexelSize);
                result.assign(vec4(sliceDirection, sliceOriginUV));
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
//# sourceMappingURL=SliceUVDirectionNode.js.map