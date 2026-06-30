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
import { type Camera, type Vector2, type Vector4 } from "three";
import { type NodeBuilder, type NodeFrame, type SampleNode, type TextureNode, type UniformNode } from "three/webgpu";
import { Node } from "../../tsl/node";
export declare class UnwarpEpipolarNode extends Node {
    static get type(): string;
    sliceEndpointsNode: TextureNode;
    coordinateNode: TextureNode;
    epipolarShadowLengthNode: TextureNode;
    viewZUnitNode: TextureNode | SampleNode;
    camera: Camera;
    epipolarSliceCount: UniformNode<number>;
    maxSliceSampleCount: UniformNode<number>;
    screenSize: UniformNode<Vector2>;
    lightScreenPosition: UniformNode<Vector4>;
    refinementThreshold: UniformNode<"float", number>;
    private readonly textureNode;
    private readonly renderTarget;
    private readonly material;
    private readonly mesh;
    private rendererState?;
    constructor();
    getTextureNode(): TextureNode;
    update({ renderer }: NodeFrame): void;
    private setupFragmentNode;
    setup(builder: NodeBuilder): unknown;
    dispose(): void;
}
