import { RenderTarget, type RenderTargetOptions, type Texture } from "three";
import { TempNode, type NodeBuilder, type TextureNode } from "three/webgpu";
export declare abstract class FilterNode extends TempNode {
    static get type(): string;
    inputNode: TextureNode | null;
    resolutionScale: number;
    private outputNode?;
    private readonly renderTargets;
    constructor(inputNode?: TextureNode | null);
    protected createRenderTarget(name?: string, options?: RenderTargetOptions): RenderTarget;
    getTextureNode(): TextureNode;
    abstract setSize(width: number, height: number): this;
    protected get outputTexture(): Texture | null;
    protected set outputTexture(value: Texture | null);
    setup(builder: NodeBuilder): unknown;
    dispose(): void;
}
