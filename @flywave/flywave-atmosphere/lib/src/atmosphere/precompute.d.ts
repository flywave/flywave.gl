import type { Texture3DNode } from "three/webgpu";
import type { Node } from "../tsl/node";
export declare const computeTransmittanceTexture: (fragCoord: Node<"vec2">) => Node;
export declare const computeIrradianceTexture: (scatteringNode: Texture3DNode, higherOrderScatteringTexture: Texture3DNode, fragCoord: Node<"vec2">) => Node;
