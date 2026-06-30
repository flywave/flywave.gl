// @ts-nocheck
import { HalfFloatType, RenderTarget } from "three";
import { NodeUpdateType, TempNode } from "three/webgpu";
import invariant from "tiny-invariant";
import { outputTexture } from "./OutputTextureNode";
export class FilterNode extends TempNode {
    static get type() {
        return "FilterNode";
    }
    constructor(inputNode = null) {
        super("vec4");
        this.resolutionScale = 1;
        this.renderTargets = [];
        this.updateBeforeType = NodeUpdateType.FRAME;
        this.inputNode = inputNode;
    }
    createRenderTarget(name, options) {
        const renderTarget = new RenderTarget(1, 1, {
            depthBuffer: false,
            type: HalfFloatType,
            ...options
        });
        const texture = renderTarget.texture;
        const typeName = this.constructor.type.replace(/Node$/, "");
        texture.name = name != null ? `${typeName} [${name}]` : typeName;
        this.renderTargets.push(renderTarget);
        return renderTarget;
    }
    getTextureNode() {
        const { outputNode } = this;
        invariant(outputNode != null, "outputNode cannot be null.");
        return outputNode;
    }
    get outputTexture() {
        return this.outputNode?.value ?? null;
    }
    set outputTexture(value) {
        this.outputNode = value != null ? outputTexture(this, value) : undefined;
    }
    setup(builder) {
        const { inputNode, outputNode } = this;
        invariant(inputNode != null, "inputNode cannot be null during setup.");
        invariant(outputNode != null, "outputNode cannot be null during setup.");
        outputNode.uvNode = inputNode.uvNode;
        return outputNode;
    }
    dispose() {
        for (const renderTarget of this.renderTargets) {
            renderTarget.dispose();
        }
        super.dispose();
    }
}
//# sourceMappingURL=FilterNode.js.map