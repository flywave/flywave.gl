import { uniform } from "three/tsl";
import { NodeMaterial, QuadMesh, RendererUtils } from "three/webgpu";
import { FilterNode } from "./FilterNode";
const { resetRendererState, restoreRendererState } = RendererUtils;
export class SeparableFilterNode extends FilterNode {
    static get type() {
        return "SeparableFilterNode";
    }
    constructor(inputNode) {
        super(inputNode);
        this.iterations = 1;
        this.material = new NodeMaterial();
        this.mesh = new QuadMesh(this.material);
        this.inputTexelSize = uniform("vec2");
        this.direction = uniform("vec2");
        const typeName = this.constructor.type.replace(/Node$/, "");
        this.material.name = typeName;
        this.mesh.name = typeName;
        this.horizontalRT = this.createRenderTarget("Horizontal");
        this.verticalRT = this.createRenderTarget("Vertical");
        this.outputTexture = this.verticalRT.texture;
    }
    setSize(width, height) {
        const { resolutionScale } = this;
        const w = Math.max(Math.round(width * resolutionScale), 1);
        const h = Math.max(Math.round(height * resolutionScale), 1);
        this.horizontalRT.setSize(w, h);
        this.verticalRT.setSize(w, h);
        return this;
    }
    updateBefore({ renderer }) {
        if (renderer == null) {
            return;
        }
        const { inputNode, direction, horizontalRT, verticalRT, mesh } = this;
        if (inputNode == null) {
            return;
        }
        const { width, height } = inputNode.value;
        this.setSize(width, height);
        this.inputTexelSize.value.set(1 / width, 1 / height);
        const originalTexture = inputNode.value;
        this.rendererState = resetRendererState(renderer, this.rendererState);
        for (let i = 0; i < this.iterations; ++i) {
            direction.value.set(1, 0);
            renderer.setRenderTarget(horizontalRT);
            mesh.render(renderer);
            inputNode.value = horizontalRT.texture;
            direction.value.set(0, 1);
            renderer.setRenderTarget(verticalRT);
            mesh.render(renderer);
            inputNode.value = verticalRT.texture;
        }
        restoreRendererState(renderer, this.rendererState);
        inputNode.value = originalTexture;
    }
    setup(builder) {
        const { material } = this;
        material.fragmentNode = this.setupOutputNode(builder);
        material.needsUpdate = true;
        return super.setup(builder);
    }
    dispose() {
        this.horizontalRT.dispose();
        this.verticalRT.dispose();
        this.material.dispose();
        this.mesh.geometry.dispose();
        super.dispose();
    }
}
//# sourceMappingURL=SeparableFilterNode.js.map