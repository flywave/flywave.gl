// @ts-nocheck
/* Copyright (C) 2025 flywave.gl contributors */
import { HalfFloatType, Vector2 } from "three";
import { screenUV } from "three/tsl";
import { NodeUpdateType, RendererUtils, RenderTarget, TempNode } from "three/webgpu";
import { outputTexture } from "../tsl/OutputTextureNode";
import { DEFAULT_STARS_DATA_URL } from "../constants";
import { getAtmosphereContext } from "./AtmosphereContext";
import { Stars } from "./Stars";
const { resetRendererState, restoreRendererState } = RendererUtils;
function createRenderTarget() {
    const renderTarget = new RenderTarget(1, 1, {
        depthBuffer: false,
        type: HalfFloatType
    });
    const texture = renderTarget.texture;
    texture.name = "Stars";
    return renderTarget;
}
const sizeScratch = /*#__PURE__*/ new Vector2();
export class StarsNode extends TempNode {
    static get type() {
        return "StarsNode";
    }
    constructor(data = DEFAULT_STARS_DATA_URL) {
        super("vec3");
        this.updateBeforeType = NodeUpdateType.FRAME;
        this.stars = new Stars(data);
        this.renderTarget = createRenderTarget();
        this.textureNode = outputTexture(this, this.renderTarget.texture);
    }
    getTextureNode() {
        return this.textureNode;
    }
    setSize(width, height) {
        this.renderTarget.setSize(width, height);
        return this;
    }
    updateBefore(frame) {
        const { renderer } = frame;
        const camera = this.stars.camera;
        if (renderer == null || camera == null) {
            return;
        }
        // TODO: Skip rendering if not necessary.
        const size = renderer.getDrawingBufferSize(sizeScratch);
        this.setSize(size.x, size.y);
        this.rendererState = resetRendererState(renderer, this.rendererState);
        renderer.setRenderTarget(this.renderTarget);
        renderer.render(this.stars, camera);
        restoreRendererState(renderer, this.rendererState);
    }
    setup(builder) {
        const atmosphereContext = getAtmosphereContext(builder);
        this.stars.camera = atmosphereContext.camera;
        this.textureNode.uvNode = screenUV;
        return this.textureNode;
    }
    get pointSize() {
        return this.stars.material.pointSize;
    }
    set pointSize(value) {
        this.stars.material.pointSize = value;
    }
    get intensity() {
        return this.stars.material.intensity;
    }
    set intensity(value) {
        this.stars.material.intensity = value;
    }
    dispose() {
        this.renderTarget.dispose();
        this.stars.dispose();
        super.dispose();
    }
}
//# sourceMappingURL=StarsNode.js.map