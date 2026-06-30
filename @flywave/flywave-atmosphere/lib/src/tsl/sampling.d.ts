import type { TextureNode } from "three/webgpu";
import type { Node } from "./node";
export declare const textureGather: (textureNode: TextureNode, uvNode: Node<"vec2">, component?: unknown) => Node;
