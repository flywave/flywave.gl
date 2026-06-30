// @ts-nocheck
import { HalfFloatType, RenderTarget, Vector2 } from "three";
import { Node, NodeMaterial, NodeUpdateType, QuadMesh, RendererUtils } from "three/webgpu";
import invariant from "tiny-invariant";
import { outputTexture } from "./OutputTextureNode";
const { resetRendererState, restoreRendererState } = RendererUtils;
function createRenderTarget(name, options) {
    const renderTarget = new RenderTarget(1, 1, {
        depthBuffer: false,
        type: HalfFloatType,
        ...options
    });
    const texture = renderTarget.texture;
    texture.name = name;
    return renderTarget;
}
const sizeScratch = /*#__PURE__*/ new Vector2();
export class RenderTargetNode extends Node {
    static get type() {
        return "RenderTargetNode";
    }
    constructor(inputNode = null, { name = "RenderTarget", resolutionScale = 1, updateBeforeType = NodeUpdateType.FRAME, ...options } = {}) {
        super();
        this.material = new NodeMaterial();
        this.mesh = new QuadMesh(this.material);
        this.updateBeforeType = updateBeforeType;
        this.material.name = name;
        this.mesh.name = name;
        this.inputNode = inputNode;
        this.resolutionScale = resolutionScale;
        this.renderTarget = createRenderTarget(name, options);
        this.textureNode = outputTexture(this, this.renderTarget.texture);
    }
    getTexture() {
        return this.renderTarget.texture;
    }
    getTextureNode() {
        return this.textureNode;
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
        const { width, height } = renderer.getDrawingBufferSize(sizeScratch);
        this.setSize(width, height);
        this.rendererState = resetRendererState(renderer, this.rendererState);
        renderer.setRenderTarget(this.renderTarget);
        this.mesh.render(renderer);
        restoreRendererState(renderer, this.rendererState);
    }
    setup(builder) {
        invariant(this.inputNode != null, "inputNode cannot be null during setup.");
        const { material } = this;
        material.fragmentNode = this.inputNode.context(builder.getSharedContext());
        material.needsUpdate = true;
        return this.textureNode;
    }
    dispose() {
        this.renderTarget.dispose();
        this.material.dispose();
        this.mesh.geometry.dispose();
        super.dispose();
    }
}
export const renderTarget = (...args) => new RenderTargetNode(...args);
export function convertToTexture(node, options) {
    if (node == null) {
        return null;
    }
    let textureNode;
    if (node.isTextureNode === true || node.isSampleNode === true) {
        textureNode = node;
    }
    else if (node.getTextureNode != null) {
        textureNode = node.getTextureNode();
    }
    else {
        textureNode = new RenderTargetNode(node, options).getTextureNode();
    }
    return textureNode;
}
//# sourceMappingURL=RenderTargetNode.js.map