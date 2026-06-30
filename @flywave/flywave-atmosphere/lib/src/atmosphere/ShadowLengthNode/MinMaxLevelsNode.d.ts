import type { CSMShadowNode } from "three/examples/jsm/csm/CSMShadowNode.js";
import { type NodeBuilder, type NodeFrame, type TextureNode, type UniformNode } from "three/webgpu";
import { Node } from "../../tsl/node";
export declare class MinMaxLevelsNode extends Node {
    static get type(): string;
    csmShadowNode: CSMShadowNode;
    sliceUVDirectionNode: TextureNode;
    shadowDepthNodes: TextureNode[];
    epipolarSliceCount: UniformNode<number>;
    maxSliceSampleCount: UniformNode<number>;
    firstCascade: UniformNode<number>;
    private readonly textureNode;
    private readonly renderTargetA;
    private readonly renderTargetB;
    private readonly gatherMaterial;
    private readonly mipmapMaterial;
    private readonly mesh;
    private rendererState?;
    private readonly mipmapSourceNode;
    private readonly mipmapOffsetNode;
    constructor();
    getTextureNode(): TextureNode;
    private render;
    update({ renderer }: NodeFrame): void;
    private setupGatherNode;
    private setupMipmapNode;
    setup(builder: NodeBuilder): unknown;
    dispose(): void;
}
