import { texture, uniform } from "three/tsl";
import { NodeMaterial, QuadMesh, RendererUtils } from "three/webgpu";
import { FilterNode } from "./FilterNode";
const { resetRendererState, restoreRendererState } = RendererUtils;
export class DualMipmapFilterNode extends FilterNode {
    static get type() {
        return "DualMipmapFilterNode";
    }
    constructor(inputNode, levels) {
        super(inputNode);
        this.downsampleRTs = [];
        this.upsampleRTs = [];
        this.downsampleMaterial = new NodeMaterial();
        this.upsampleMaterial = new NodeMaterial();
        this.mesh = new QuadMesh();
        this.inputTexelSize = uniform("vec2");
        this.downsampleNode = texture();
        const typeName = this.constructor.type.replace(/Node$/, "");
        this.downsampleMaterial.name = `${typeName} [Downsample]`;
        this.upsampleMaterial.name = `${typeName} [Upsample]`;
        this.mesh.name = typeName;
        for (let i = 0; i < levels; ++i) {
            this.downsampleRTs[i] = this.createRenderTarget(`Downsample ${i}`);
            if (i < levels - 1) {
                this.upsampleRTs[i] = this.createRenderTarget(`Upsample ${i}`);
            }
        }
        this.outputTexture = this.upsampleRTs[0].texture;
    }
    setSize(width, height) {
        const { resolutionScale } = this;
        let w = Math.max(Math.round(width * resolutionScale), 1);
        let h = Math.max(Math.round(height * resolutionScale), 1);
        const { downsampleRTs, upsampleRTs } = this;
        for (let i = 0; i < downsampleRTs.length; ++i) {
            w = Math.max(Math.round(w / 2), 1);
            h = Math.max(Math.round(h / 2), 1);
            downsampleRTs[i].setSize(w, h);
            if (i < upsampleRTs.length) {
                upsampleRTs[i].setSize(w, h);
            }
        }
        return this;
    }
    updateBefore({ renderer }) {
        if (renderer == null) {
            return;
        }
        const { inputNode, downsampleRTs, upsampleRTs, mesh, inputTexelSize, downsampleNode } = this;
        if (inputNode == null) {
            return;
        }
        const { width, height } = inputNode.value;
        this.setSize(width, height);
        const originalTexture = inputNode.value;
        this.rendererState = resetRendererState(renderer, this.rendererState);
        mesh.material = this.downsampleMaterial;
        for (const renderTarget of downsampleRTs) {
            const { width, height } = inputNode.value;
            inputTexelSize.value.set(1 / width, 1 / height);
            renderer.setRenderTarget(renderTarget);
            mesh.render(renderer);
            inputNode.value = renderTarget.texture;
        }
        mesh.material = this.upsampleMaterial;
        for (let i = upsampleRTs.length - 1; i >= 0; --i) {
            const renderTarget = upsampleRTs[i];
            const { width, height } = inputNode.value;
            inputTexelSize.value.set(1 / width, 1 / height);
            downsampleNode.value = downsampleRTs[i].texture;
            renderer.setRenderTarget(renderTarget);
            mesh.render(renderer);
            inputNode.value = renderTarget.texture;
        }
        restoreRendererState(renderer, this.rendererState);
        inputNode.value = originalTexture;
    }
    setup(builder) {
        const { downsampleMaterial, upsampleMaterial } = this;
        downsampleMaterial.fragmentNode = this.setupDownsampleNode(builder);
        upsampleMaterial.fragmentNode = this.setupUpsampleNode(builder);
        downsampleMaterial.needsUpdate = true;
        upsampleMaterial.needsUpdate = true;
        return super.setup(builder);
    }
    dispose() {
        for (const downsampleRT of this.downsampleRTs) {
            downsampleRT.dispose();
        }
        for (const upsampleRT of this.upsampleRTs) {
            upsampleRT.dispose();
        }
        this.downsampleMaterial.dispose();
        this.upsampleMaterial.dispose();
        this.mesh.geometry.dispose();
        super.dispose();
    }
}
//# sourceMappingURL=DualMipmapFilterNode.js.map