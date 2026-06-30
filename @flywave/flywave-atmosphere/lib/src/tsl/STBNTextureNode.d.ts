import { Texture3DNode, type NodeBuilder } from "three/webgpu";
export declare class STBNTextureNode extends Texture3DNode {
    url: string;
    private dataPromise?;
    constructor();
    customCacheKey(): number;
    setup(builder: NodeBuilder): unknown;
    clone(): Texture3DNode;
}
export declare const stbnTexture: never;
export declare const stbn: any;
