import { Node, type NodeBuilder, type NodeFrame, type Renderer, type Texture3DNode, type TextureNode } from "three/webgpu";
import type { AnyFloatType } from "../tsl/types";
import { AtmosphereParameters } from "./AtmosphereParameters";
import type { AtmosphereLUTTexture3DName, AtmosphereLUTTextureName } from "./AtmosphereLUTTypes";
export declare class AtmosphereLUTNode extends Node {
    static get type(): string;
    parameters: AtmosphereParameters;
    textureType?: AnyFloatType;
    private textures?;
    private readonly textureNodes;
    private currentVersion?;
    private updating;
    private disposeQueue;
    constructor(parameters?: AtmosphereParameters, textureType?: AnyFloatType);
    getTextureNode(name: AtmosphereLUTTextureName): TextureNode;
    getTextureNode(name: AtmosphereLUTTexture3DName): Texture3DNode;
    private dispatchUpdate;
    private performCompute;
    updateTextures(renderer: Renderer): Promise<void>;
    updateBefore({ renderer }: NodeFrame): void;
    setup(builder: NodeBuilder): unknown;
    dispose(): void;
}
