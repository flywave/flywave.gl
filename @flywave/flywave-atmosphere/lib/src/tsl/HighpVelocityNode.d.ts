import { Matrix4 } from "three";
import { TempNode, type NodeBuilder, type NodeFrame } from "three/webgpu";
export declare class HighpVelocityNode extends TempNode {
    static get type(): string;
    projectionMatrix?: Matrix4 | null;
    private readonly currentProjectionMatrix;
    private readonly previousProjectionMatrix;
    private readonly currentModelViewMatrix;
    private readonly previousModelViewMatrix;
    private readonly objectModelViewMatrices;
    constructor();
    setProjectionMatrix(value: Matrix4 | null): this;
    update({ camera }: NodeFrame): void;
    updateBefore({ object, camera }: NodeFrame): void;
    updateAfter({ object }: NodeFrame): void;
    setup(builder: NodeBuilder): unknown;
}
export declare const highpVelocity: never;
