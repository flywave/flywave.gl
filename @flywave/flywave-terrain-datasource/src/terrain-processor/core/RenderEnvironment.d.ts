import * as THREE from "three";
/**
 * Manages WebGL rendering context, targets, scenes, and cameras
 */
export declare class RenderEnvironment {
    private readonly m_renderer;
    private readonly m_renderTarget;
    private readonly m_scene;
    private readonly m_camera;
    constructor(externalRenderer?: THREE.WebGLRenderer);
    private createDefaultRenderer;
    private createScene;
    private createCamera;
    getRenderer(): THREE.WebGLRenderer;
    getRenderTarget(): THREE.WebGLRenderTarget;
    getScene(): THREE.Scene;
    getCamera(): THREE.OrthographicCamera;
    clearScene(): void;
    setupCamera(left: number, right: number, top: number, bottom: number, position?: THREE.Vector3): void;
    render(width: number, height: number): Uint8ClampedArray;
    renderToTexture(width: number, height: number): THREE.WebGLRenderTarget;
    dispose(): void;
}
export declare function getGlobalRenderEnvironment(): RenderEnvironment;
export declare function setGlobalRenderEnvironment(env: RenderEnvironment): void;
