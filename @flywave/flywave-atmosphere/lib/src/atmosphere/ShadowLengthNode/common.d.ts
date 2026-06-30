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
import type { Camera } from "three";
import type { SampleNode, TextureNode } from "three/webgpu";
import type { Node } from "../../tsl/node";
export declare const FLOAT_MAX = 3.402823466e+38;
export declare const HALF_FLOAT_MAX = 65504;
export declare const transformUVToNDC: import("../../tsl/FnLayout").ShaderFn<readonly unknown[]>;
export declare const transformNDCToUV: import("../../tsl/FnLayout").ShaderFn<readonly unknown[]>;
export declare const transformUnitToShadowUV: import("../../tsl/FnLayout").ShaderFn<readonly unknown[]>;
export declare const getOutermostScreenPixelCoords: (screenSize: Node<"vec2">) => Node;
export declare const isValidScreenLocation: (xy: Node<"vec2">, screenSize: Node<"vec2">) => Node;
export declare const transformSliceToUnit: (sampleLocation: Node<"vec2">, cameraZUnit: Node<"float">, camera: Camera) => Node;
export declare const getCameraZUnit: (camera: Camera, uv: Node<"vec2">, viewZUnitNode: TextureNode | SampleNode) => Node;
