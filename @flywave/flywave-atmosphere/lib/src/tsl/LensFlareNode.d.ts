import { TempNode, type NodeBuilder, type TextureNode } from "three/webgpu";
import { DownsampleThresholdNode } from "./DownsampleThresholdNode";
import { GaussianBlurNode } from "./GaussianBlurNode";
import { LensGhostNode } from "./LensGhostNode";
import { LensGlareNode } from "./LensGlareNode";
import { LensHaloNode } from "./LensHaloNode";
import { MipmapSurfaceBlurNode } from "./MipmapSurfaceBlurNode";
import type { Node } from "./node";
import { type RenderTargetNode } from "./RenderTargetNode";
export declare class LensFlareNode extends TempNode {
    static get type(): string;
    inputNode: TextureNode | null;
    thresholdNode: DownsampleThresholdNode;
    blurNode: GaussianBlurNode;
    ghostNode: LensGhostNode;
    haloNode: LensHaloNode;
    bloomNode: MipmapSurfaceBlurNode;
    glareNode: LensGlareNode;
    bloomIntensity: import("three/webgpu").UniformNode<"float", number>;
    featuresNode: RenderTargetNode;
    constructor(inputNode?: TextureNode | null);
    setup(builder: NodeBuilder): unknown;
    getDebugInternalTexturesNode(uvNode?: Node<"vec2">): Node<"vec3">;
    dispose(): void;
}
export declare const lensFlare: (inputNode?: Node | null) => LensFlareNode;
