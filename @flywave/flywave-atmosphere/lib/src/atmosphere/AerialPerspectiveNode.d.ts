import { TempNode, type NodeBuilder, type TextureNode } from "three/webgpu";
import type { Node } from "../tsl/node";
import { type SkyNode } from "./SkyNode";
declare const CAMERA = "CAMERA";
declare const BACKDROP = "BACKDROP";
type AerialPerspectiveNodeScope = typeof CAMERA | typeof BACKDROP;
export declare class AerialPerspectiveNode extends TempNode {
    static get type(): string;
    private readonly scope;
    colorNode: Node<"vec4">;
    depthNode: TextureNode;
    shadowLengthNode: Node<"vec2"> | null;
    skyNode: SkyNode | null;
    normalNode: Node<"vec3"> | null;
    cameraPositionUnit: Node<"vec3"> | null;
    rayDirectionECEF: Node<"vec3"> | null;
    correctGeometricError: boolean;
    lighting: boolean;
    transmittance: boolean;
    inscattering: boolean;
    moonScattering: boolean;
    constructor(scope: AerialPerspectiveNodeScope, colorNode: Node<"vec4">, depthNode: TextureNode, shadowLengthNode?: Node<"vec2"> | null);
    customCacheKey(): number;
    setup(builder: NodeBuilder): unknown;
    /** @deprecated Use inscattering instead. */
    get inscatter(): boolean;
    /** @deprecated Use inscattering instead. */
    set inscatter(value: boolean);
}
export declare const aerialPerspective: (colorNode: Node<"vec4">, depthNode: TextureNode, shadowLengthNode?: Node<"vec2"> | null) => AerialPerspectiveNode;
export declare const aerialPerspectiveBackdrop: (shadowLengthNode?: Node<"vec2"> | null) => AerialPerspectiveNode;
export {};
