import { type RenderTargetOptions, type Texture } from "three";
import { Node, NodeUpdateType, type NodeBuilder, type NodeFrame, type TextureNode } from "three/webgpu";
export interface RenderTargetNodeOptions extends RenderTargetOptions {
    name?: string;
    resolutionScale?: number;
    updateBeforeType?: NodeUpdateType;
}
export declare class RenderTargetNode extends Node {
    static get type(): string;
    inputNode: Node | null;
    resolutionScale: number;
    private readonly textureNode;
    private readonly renderTarget;
    private readonly material;
    private readonly mesh;
    private rendererState?;
    constructor(inputNode?: Node | null, { name, resolutionScale, updateBeforeType, ...options }?: RenderTargetNodeOptions);
    getTexture(): Texture;
    getTextureNode(): TextureNode;
    setSize(width: number, height: number): this;
    updateBefore({ renderer }: NodeFrame): void;
    setup(builder: NodeBuilder): unknown;
    dispose(): void;
}
export declare const renderTarget: (...args: ConstructorParameters<typeof RenderTargetNode>) => RenderTargetNode;
type TextureNodeLike = Node & {
    isTextureNode?: boolean;
    isSampleNode?: boolean;
    getTextureNode?: () => TextureNode;
};
export declare function convertToTexture(node: TextureNodeLike, options?: RenderTargetNodeOptions): TextureNode;
export declare function convertToTexture(node?: TextureNodeLike | null, options?: RenderTargetNodeOptions): TextureNode | null;
export {};
