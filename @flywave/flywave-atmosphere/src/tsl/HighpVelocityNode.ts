// @ts-nocheck
import { Matrix4, type Object3D } from "three";
import { nodeImmutable, positionLocal, positionPrevious, sub, uniform } from "three/tsl";
import { NodeUpdateType, TempNode, type NodeBuilder, type NodeFrame } from "three/webgpu";

export class HighpVelocityNode extends TempNode {
    static override get type(): string {
        return "HighpVelocityNode";
    }

    projectionMatrix?: Matrix4 | null;

    private readonly currentProjectionMatrix = uniform("mat4");
    private readonly previousProjectionMatrix = uniform("mat4");
    private readonly currentModelViewMatrix = uniform("mat4");
    private readonly previousModelViewMatrix = uniform("mat4");
    private readonly objectModelViewMatrices = new WeakMap<Object3D, Matrix4>();

    constructor() {
        super("vec3");
        this.updateType = NodeUpdateType.FRAME;
        this.updateBeforeType = NodeUpdateType.OBJECT;
        this.updateAfterType = NodeUpdateType.OBJECT;
    }

    setProjectionMatrix(value: Matrix4 | null): this {
        this.projectionMatrix = value;
        return this;
    }

    override update({ camera }: NodeFrame): void {
        if (camera == null) return;
        const { currentProjectionMatrix: current, previousProjectionMatrix: previous } = this;
        const projectionMatrix = this.projectionMatrix ?? camera.projectionMatrix;
        if (previous.value == null) {
            previous.value = new Matrix4().copy(projectionMatrix);
        } else {
            previous.value.copy(current.value);
        }
        current.value.copy(projectionMatrix);
    }

    override updateBefore({ object, camera }: NodeFrame): void {
        if (object == null || camera == null) return;
        const {
            currentModelViewMatrix: current,
            previousModelViewMatrix: previous,
            objectModelViewMatrices: matrices
        } = this;
        current.value.multiplyMatrices(camera.matrixWorldInverse, object.matrixWorld);
        previous.value = matrices.get(object) ?? current.value;
    }

    override updateAfter({ object }: NodeFrame): void {
        if (object == null) return;
        const { currentModelViewMatrix: current, objectModelViewMatrices: matrices } = this;
        let matrix = matrices.get(object);
        if (matrix == null) {
            matrix = new Matrix4();
            matrices.set(object, matrix);
        }
        matrix.copy(current.value);
    }

    override setup(builder: NodeBuilder): unknown {
        const currentClip = this.currentProjectionMatrix
            .mul(this.currentModelViewMatrix)
            .mul(positionLocal)
            .toVertexStage();
        const previousClip = this.previousProjectionMatrix
            .mul(this.previousModelViewMatrix)
            .mul(positionPrevious)
            .toVertexStage();
        const currentNDC = currentClip.xyz.div(currentClip.w);
        const previousNDC = previousClip.xyz.div(previousClip.w);
        return sub(currentNDC, previousNDC);
    }
}

export const highpVelocity = nodeImmutable(HighpVelocityNode);
