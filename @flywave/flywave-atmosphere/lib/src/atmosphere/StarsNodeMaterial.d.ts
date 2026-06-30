import { type BufferAttribute } from "three";
import { PointsNodeMaterial, type NodeBuilder } from "three/webgpu";
import type { Node } from "../tsl/node";
export declare class StarsNodeMaterial extends PointsNodeMaterial {
    pointSize: import("three/webgpu").UniformNode<"float", number>;
    intensity: import("three/webgpu").UniformNode<"float", number>;
    magnitudeRange: number[];
    positionBuffer?: BufferAttribute;
    magnitudeBuffer?: BufferAttribute;
    colorBuffer?: BufferAttribute;
    constructor();
    setupNormal(): Node;
    setup(builder: NodeBuilder): void;
}
