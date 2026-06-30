import { TempNode, type NodeBuilder, type NodeFrame, type TextureNode, type UniformNode } from "three/webgpu";
import { Stars } from "./Stars";
export declare class StarsNode extends TempNode {
    static get type(): string;
    stars: Stars;
    private readonly textureNode;
    private readonly renderTarget;
    private rendererState?;
    constructor(data?: string | ArrayBufferLike);
    getTextureNode(): TextureNode;
    setSize(width: number, height: number): this;
    updateBefore(frame: NodeFrame): void;
    setup(builder: NodeBuilder): unknown;
    get pointSize(): UniformNode<number>;
    set pointSize(value: UniformNode<number>);
    get intensity(): UniformNode<number>;
    set intensity(value: UniformNode<number>);
    dispose(): void;
}
