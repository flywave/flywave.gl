import { uniform } from "three/tsl";
import { NodeMaterial, QuadMesh, RendererUtils } from "three/webgpu";
import { FilterNode } from "./FilterNode";
const { resetRendererState, restoreRendererState } = RendererUtils;
export class SingleFilterNode extends FilterNode {
    static get type() {
        return "SingleFilterNode";
    }
    constructor(inputNode) {
        super(inputNode);
        this.material = new NodeMaterial();
        this.mesh = new QuadMesh(this.material);
        this.inputTexelSize = uniform("vec2");
        const typeName = this.constructor.type.replace(/Node$/, "");
        this.material.name = typeName;
        this.mesh.name = typeName;
        this.renderTarget = this.createRenderTarget();
        this.outputTexture = this.renderTarget.texture;
    }
    setSize(width, height) {
        const { resolutionScale } = this;
        const w = Math.max(Math.round(width * resolutionScale), 1);
        const h = Math.max(Math.round(height * resolutionScale), 1);
        this.renderTarget.setSize(w, h);
        return this;
    }
    updateBefore({ renderer }) {
        if (renderer == null) {
            return;
        }
        const { inputNode } = this;
        if (inputNode == null) {
            return;
        }
        const { width, height } = inputNode.value;
        this.setSize(width, height);
        this.inputTexelSize.value.set(1 / width, 1 / height);
        this.rendererState = resetRendererState(renderer, this.rendererState);
        renderer.setRenderTarget(this.renderTarget);
        this.mesh.render(renderer);
        restoreRendererState(renderer, this.rendererState);
    }
    setup(builder) {
        const { material } = this;
        material.fragmentNode = this.setupOutputNode(builder);
        material.needsUpdate = true;
        return super.setup(builder);
    }
    dispose() {
        this.renderTarget.dispose();
        this.material.dispose();
        this.mesh.geometry.dispose();
        super.dispose();
    }
}
//# sourceMappingURL=SingleFilterNode.js.map