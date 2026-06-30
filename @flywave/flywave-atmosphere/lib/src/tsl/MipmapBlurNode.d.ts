import type { NodeBuilder, TextureNode, UniformNode, Vector2 } from "three/webgpu";
import { DualMipmapFilterNode } from "./DualMipmapFilterNode";
import type { Node } from "./node";
export declare const mipmapBlurDownsample: (inputNode: TextureNode, texelSize: Node<"vec2"> | UniformNode<Vector2>) => Node<"vec4">;
export declare const mipmapBlurUpsample: (inputNode: TextureNode, texelSize: Node<"vec2"> | UniformNode<Vector2>) => Node<"vec4">;
export declare class MipmapBlurNode extends DualMipmapFilterNode {
    static get type(): string;
    resolutionScale: number;
    constructor(inputNode?: TextureNode | null, levels?: number);
    protected setupDownsampleNode(builder: NodeBuilder): Node;
    protected setupUpsampleNode(builder: NodeBuilder): Node;
}
export declare const mipmapBlur: (...args: ConstructorParameters<typeof MipmapBlurNode>) => MipmapBlurNode;
