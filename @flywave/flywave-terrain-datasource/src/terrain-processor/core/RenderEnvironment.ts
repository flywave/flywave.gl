/* Copyright (C) 2025 flywave.gl contributors */

import * as THREE from "three";

import { DEFAULT_RENDER_HEIGHT, DEFAULT_RENDER_WIDTH } from "../constants";

/**
 * Manages WebGL rendering context, targets, scenes, and cameras
 */
export class RenderEnvironment {
    private readonly m_renderer: THREE.WebGLRenderer;
    private readonly m_renderTarget: THREE.WebGLRenderTarget;
    private readonly m_scene: THREE.Scene;
    private readonly m_camera: THREE.OrthographicCamera;

    constructor(externalRenderer?: THREE.WebGLRenderer) {
        this.m_renderer = externalRenderer ?? this.createDefaultRenderer();
        this.m_renderTarget = new THREE.WebGLRenderTarget(
            DEFAULT_RENDER_WIDTH,
            DEFAULT_RENDER_HEIGHT
        );
        this.m_scene = this.createScene();
        this.m_camera = this.createCamera();
    }

    private createDefaultRenderer(): THREE.WebGLRenderer {
        const renderer = new THREE.WebGLRenderer({
            antialias: true,
            canvas: new OffscreenCanvas(DEFAULT_RENDER_WIDTH, DEFAULT_RENDER_HEIGHT),
            preserveDrawingBuffer: true
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

    getRenderer(): THREE.WebGLRenderer {
        return this.m_renderer;
    }

    getRenderTarget(): THREE.WebGLRenderTarget {
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

    render(width: number, height: number): Uint8ClampedArray {
        const buffer = new Uint8ClampedArray(width * height * 4);

        this.m_renderer.setSize(width, height, false);
        this.m_renderTarget.setSize(width, height);

        this.m_renderer.setRenderTarget(this.m_renderTarget);
        this.m_renderer.clear();
        this.m_renderer.render(this.m_scene, this.m_camera);
        this.m_renderer.readRenderTargetPixels(this.m_renderTarget, 0, 0, width, height, buffer);

        return buffer;
    }

    renderToTexture(width: number, height: number): THREE.WebGLRenderTarget {
        const webglRenderTarget = new THREE.WebGLRenderTarget(width, height);

        this.m_renderer.setSize(width, height, false);

        this.m_renderer.setRenderTarget(webglRenderTarget);
        this.m_renderer.clear();
        this.m_renderer.render(this.m_scene, this.m_camera);
        return webglRenderTarget;
    }

    dispose(): void {
        this.clearScene();
        this.m_renderTarget.dispose();
        if (!this.m_renderer.getContext().isContextLost()) {
            this.m_renderer.dispose();
        }
    }
}

// Global singleton instance
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
