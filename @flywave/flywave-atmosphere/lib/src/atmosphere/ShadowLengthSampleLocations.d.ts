import { Points } from "three";
import { type NodeMaterial } from "three/webgpu";
import type { ShadowLengthNode } from "./ShadowLengthNode";
export declare class ShadowLengthSampleLocations extends Points {
    material: NodeMaterial;
    constructor(shadowLengthNode: ShadowLengthNode);
    dispose(): void;
}
