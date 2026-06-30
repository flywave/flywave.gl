// @ts-nocheck
import { Matrix4 } from "three";
import { nodeImmutable, positionLocal, positionPrevious, sub, uniform } from "three/tsl";
import { NodeUpdateType, TempNode } from "three/webgpu";
export class HighpVelocityNode extends TempNode {
    static get type() {
        return "HighpVelocityNode";
    }
    constructor() {
        super("vec3");
        this.currentProjectionMatrix = uniform("mat4");
        this.previousProjectionMatrix = uniform("mat4");
        this.currentModelViewMatrix = uniform("mat4");
        this.previousModelViewMatrix = uniform("mat4");
        this.objectModelViewMatrices = new WeakMap();
        this.updateType = NodeUpdateType.FRAME;
        this.updateBeforeType = NodeUpdateType.OBJECT;
        this.updateAfterType = NodeUpdateType.OBJECT;
    }
    setProjectionMatrix(value) {
        this.projectionMatrix = value;
        return this;
    }
    update({ camera }) {
        if (camera == null)
            return;
        const { currentProjectionMatrix: current, previousProjectionMatrix: previous } = this;
        const projectionMatrix = this.projectionMatrix ?? camera.projectionMatrix;
        if (previous.value == null) {
            previous.value = new Matrix4().copy(projectionMatrix);
        }
        else {
            previous.value.copy(current.value);
        }
        current.value.copy(projectionMatrix);
    }
    updateBefore({ object, camera }) {
        if (object == null || camera == null)
            return;
        const { currentModelViewMatrix: current, previousModelViewMatrix: previous, objectModelViewMatrices: matrices } = this;
        current.value.multiplyMatrices(camera.matrixWorldInverse, object.matrixWorld);
        previous.value = matrices.get(object) ?? current.value;
    }
    updateAfter({ object }) {
        if (object == null)
            return;
        const { currentModelViewMatrix: current, objectModelViewMatrices: matrices } = this;
        let matrix = matrices.get(object);
        if (matrix == null) {
            matrix = new Matrix4();
            matrices.set(object, matrix);
        }
        matrix.copy(current.value);
    }
    setup(builder) {
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
//# sourceMappingURL=HighpVelocityNode.js.map