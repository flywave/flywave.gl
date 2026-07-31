/* Copyright (C) 2025 flywave.gl contributors */

import * as THREE from "three/webgpu";
import { WebGPURenderer } from "three/webgpu";

import { DEFAULT_RENDER_HEIGHT, DEFAULT_RENDER_WIDTH } from "../constants";

export class RenderEnvironment {
    private readonly m_renderer: WebGPURenderer;
    private readonly m_renderTarget: THREE.RenderTarget;
    private readonly m_scene: THREE.Scene;
    private readonly m_camera: THREE.OrthographicCamera;
    private m_initPromise: Promise<void>;

    constructor(externalRenderer?: WebGPURenderer) {
        this.m_renderer = externalRenderer ?? this.createDefaultRenderer();
        this.m_renderTarget = new THREE.RenderTarget(DEFAULT_RENDER_WIDTH, DEFAULT_RENDER_HEIGHT);
        this.m_scene = this.createScene();
        this.m_camera = this.createCamera();
        this.m_initPromise = this.m_renderer.init().then(() => {});
    }

    private createDefaultRenderer(): WebGPURenderer {
        const renderer = new WebGPURenderer({
            antialias: true,
            canvas: new OffscreenCanvas(DEFAULT_RENDER_WIDTH, DEFAULT_RENDER_HEIGHT)
        });
        renderer.setSize(DEFAULT_RENDER_WIDTH, DEFAULT_RENDER_HEIGHT, false);
        renderer.setClearColor(0x000000, 0);
        return renderer;
    }

    private createScene(): THREE.Scene {
        const scene = new THREE.Scene();
        scene.background = null;
        return scene;
    }

    private createCamera(): THREE.OrthographicCamera {
        const camera = new THREE.OrthographicCamera(0, 1, 1, 0, 0.001, 10);
        camera.position.z = 2;
        return camera;
    }

    getRenderer(): WebGPURenderer {
        return this.m_renderer;
    }

    getRenderTarget(): THREE.RenderTarget {
        return this.m_renderTarget;
    }

    getScene(): THREE.Scene {
        return this.m_scene;
    }

    getCamera(): THREE.OrthographicCamera {
        return this.m_camera;
    }

    clearScene(): void {
        while (this.m_scene.children.length > 0) {
            const child = this.m_scene.children[0];
            if (child instanceof THREE.Mesh) {
                child.geometry.dispose();
                if (Array.isArray(child.material)) {
                    child.material.forEach(m => m.dispose());
                } else {
                    child.material.dispose();
                }
            }
            this.m_scene.remove(child);
        }
    }

    setupCamera(
        left: number,
        right: number,
        top: number,
        bottom: number,
        position?: THREE.Vector3
    ): void {
        this.m_camera.left = left;
        this.m_camera.right = right;
        this.m_camera.top = top;
        this.m_camera.bottom = bottom;
        if (position) {
            this.m_camera.position.copy(position);
        }
        this.m_camera.updateProjectionMatrix();
    }

    async render(width: number, height: number): Promise<Uint8ClampedArray> {
        await this.m_initPromise;
        this.m_renderer.setSize(width, height, false);
        this.m_renderTarget.setSize(width, height);
        this.m_renderer.setRenderTarget(this.m_renderTarget);
        this.m_renderer.render(this.m_scene, this.m_camera);
        const buffer = await this.m_renderer.readRenderTargetPixelsAsync(
            this.m_renderTarget,
            0,
            0,
            width,
            height
        );
        return new Uint8ClampedArray(buffer.buffer);
    }

    async renderToTexture(width: number, height: number): Promise<THREE.RenderTarget> {
        await this.m_initPromise;
        const renderTarget = new THREE.RenderTarget(width, height);
        this.m_renderer.setSize(width, height, false);
        this.m_renderer.setRenderTarget(renderTarget);
        this.m_renderer.render(this.m_scene, this.m_camera);
        return renderTarget;
    }

    dispose(): void {
        this.clearScene();
        this.m_renderTarget.dispose();
        this.m_renderer.dispose();
    }
}

let globalRenderEnvironment: RenderEnvironment | null = null;

export function getGlobalRenderEnvironment(): RenderEnvironment {
    if (!globalRenderEnvironment) {
        globalRenderEnvironment = new RenderEnvironment();
    }
    return globalRenderEnvironment;
}

export function setGlobalRenderEnvironment(env: RenderEnvironment): void {
    globalRenderEnvironment?.dispose();
    globalRenderEnvironment = env;
}
