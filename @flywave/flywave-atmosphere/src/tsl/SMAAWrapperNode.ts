// @ts-nocheck
import {
    HalfFloatType,
    RenderTarget,
    TempNode,
    QuadMesh,
    NodeMaterial,
    RendererUtils,
    NodeUpdateType,
    Vector2
} from "three/webgpu";
import {
    nodeObject,
    convertToTexture,
    texture as tslTexture,
    Fn,
    passTexture,
    uv
} from "three/tsl";
import SMAANode from "three/examples/jsm/tsl/display/SMAANode.js";

const _quadMesh = new QuadMesh();
const _size = new Vector2();
let _rendererState;

class SMAAWrapperNode extends TempNode {
    constructor(inputNode) {
        super("vec4");
        this.inputNode = nodeObject(inputNode);

        this.renderTarget = new RenderTarget(1, 1, {
            depthBuffer: false,
            type: HalfFloatType
        });
        this.renderTarget.texture.name = "SMAAInput";

        this.inputMaterial = new NodeMaterial();
        this.inputMaterial.name = "SMAAWrapper.input";
        this.inputMaterial.fragmentNode = Fn(() => this.inputNode)();

        this.smaaNode = new SMAANode(convertToTexture(tslTexture(this.renderTarget.texture)));
        this.textureOutput = passTexture(this, this.smaaNode.getTextureNode());

        this.updateBeforeType = NodeUpdateType.FRAME;
    }

    setSize(width, height) {
        this.renderTarget.setSize(width, height);
    }

    updateBefore(frame) {
        const { renderer } = frame;

        _rendererState = RendererUtils.resetRendererState(renderer, _rendererState);

        const size = renderer.getDrawingBufferSize(_size);
        this.setSize(size.width, size.height);

        // 1. Render the input chain (toneMapping + clouds + aerial, etc.)
        //    into our intermediate render target.
        renderer.setRenderTarget(this.renderTarget);
        _quadMesh.material = this.inputMaterial;
        _quadMesh.name = "SMAAWrapper [ Input ]";
        _quadMesh.render(renderer);

        RendererUtils.restoreRendererState(renderer, _rendererState);

        // 2. Run SMAANode's 3 passes (edge detection → weights → blend).
        //    We call it explicitly here to guarantee it runs AFTER the input
        //    RT is filled, and only once per frame.
        this.smaaNode.updateBefore(frame);

        return true;
    }

    setup(builder) {
        this.inputMaterial.fragmentNode = Fn(() => this.inputNode)().context(
            builder.getSharedContext()
        );
        this.inputMaterial.needsUpdate = true;

        return this.smaaNode.setup(builder);
    }

    dispose() {
        this.renderTarget.dispose();
        this.inputMaterial.dispose();
        this.smaaNode.dispose();
    }
}

export const smaaWrapped = node => new SMAAWrapperNode(node);
