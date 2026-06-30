import type { Node } from "../tsl/node";
export declare const getSolarLuminance: () => Node;
export declare const getIndirectLuminance: (camera: Node<"vec3">, rayDirection: Node<"vec3">, shadowLength: Node<"vec2">, lightDirection: Node<"vec3">) => Node;
export declare const getIndirectLuminanceToPoint: (camera: Node<"vec3">, point: Node<"vec3">, shadowLength: Node<"vec2">, lightDirection: Node<"vec3">) => Node;
export declare const getSplitIlluminance: (point: Node<"vec3">, normal: Node<"vec3">, lightDirection: Node<"vec3">) => Node;
export declare const getIndirectIlluminance: (point: Node<"vec3">, normal: Node<"vec3">, lightDirection: Node<"vec3">) => Node;
export declare const getSplitScalarIlluminance: (point: Node<"vec3">, lightDirection: Node<"vec3">) => Node;
