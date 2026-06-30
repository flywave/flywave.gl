import { type Camera } from "three";
import { TempNode, type NodeBuilder, type NodeFrame, type TextureNode } from "three/webgpu";
import type { Node } from "./node";
interface SupportedCamera extends Camera {
    updateProjectionMatrix(): void;
    setViewOffset(fullWidth: number, fullHeight: number, x: number, y: number, width: number, height: number): void;
    clearViewOffset(): void;
}
export declare class TemporalAntialiasNode extends TempNode {
    static get type(): string;
    inputNode: TextureNode;
    depthNode: TextureNode;
    velocityNode: TextureNode;
    camera: SupportedCamera;
    temporalAlpha: import("three/webgpu").UniformNode<"float", number>;
    varianceGamma: import("three/webgpu").UniformNode<"float", number>;
    velocityThreshold: import("three/webgpu").UniformNode<"float", number>;
    depthError: import("three/webgpu").UniformNode<"float", number>;
    debugShowRejection: boolean;
    private readonly textureNode;
    private resolveRT;
    private historyRT;
    private previousDepthTexture?;
    private readonly resolveMaterial;
    private readonly mesh;
    private rendererState?;
    private needsSyncRenderPipeline;
    private needsClearHistory;
    private readonly resolveNode;
    private readonly historyNode;
    private readonly previousDepthNode;
    private readonly originalProjectionMatrix;
    private jitterIndex;
    constructor(inputNode: TextureNode, depthNode: TextureNode, velocityNode: TextureNode, camera: Camera);
    customCacheKey(): number;
    private createRenderTarget;
    getTextureNode(): TextureNode;
    setSize(width: number, height: number): this;
    private clearHistory;
    private setViewOffset;
    private clearViewOffset;
    private copyDepthTexture;
    private swapBuffers;
    updateBefore({ renderer }: NodeFrame): void;
    private setupResolveNode;
    setup(builder: NodeBuilder): unknown;
    dispose(): void;
}
/**
 * @deprecated Function signature has been changed. Use
 *   temporalAntialias(inputNode, depthNode, velocityNode, camera)
 */
export declare function temporalAntialias(velocityNodeImmutable: unknown): (inputNode: Node, depthNode: TextureNode, velocityNode: TextureNode, camera: Camera) => TemporalAntialiasNode;
export declare function temporalAntialias(inputNode: Node, depthNode: TextureNode, velocityNode: TextureNode, camera: Camera): TemporalAntialiasNode;
export {};
