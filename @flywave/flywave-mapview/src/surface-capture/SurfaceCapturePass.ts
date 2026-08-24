/* Copyright (C) 2026 flywave.gl contributors */

import { MapView, MapViewEventNames, type RenderEvent } from "@flywave/flywave-mapview";
import * as THREE from "three/webgpu";
import { vec4, uniform } from "three/tsl";

import { SurfaceType } from "./SurfaceTypes";

/**
 * Layer bit used during the capture render. Objects are temporarily enabled
 * on this layer so the capture camera (sharing the main RTE camera) skips
 * everything that was not collected. Keep distinct from other layer users.
 */
const CAPTURE_LAYER_BIT = 12;

/**
 * Renders all tagged surface meshes of a {@link MapView} into an internal
 * render target once per frame, right before the main pass:
 *
 * - color attachment: per-pixel {@link SurfaceType} id (red channel, float)
 * - depth attachment: scene depth of the closest captured surfaces
 *
 * Both attachments share the exact viewport and camera of the main pass
 * (the relative-to-eye camera), so draped materials can sample them at
 * `screenUV` and reconstruct the captured surface position in view space
 * without any further bookkeeping. Nothing is written back to the main
 * framebuffer; the pass is invisible by itself.
 *
 * Meshes participate by being tagged via {@link setCaptureSurfaceType}.
 * Data sources tag their tile meshes at creation time; application code can
 * tag arbitrary objects the same way.
 */
export class SurfaceCapturePass {
    /** Scales the capture resolution relative to the drawing buffer. */
    public resolutionScale = 1;

    private readonly m_mapView: MapView;
    private readonly m_willRenderListener: (event: RenderEvent) => void;
    private m_renderTarget: THREE.RenderTarget | null = null;
    private m_typeTarget: THREE.RenderTarget | null = null;
    private m_typeMaterial: THREE.MeshBasicNodeMaterial | null = null;
    private m_enabled = true;
    private m_capturedAny = false;
    private readonly m_scratchSize = new THREE.Vector2();

    constructor(mapView: MapView) {
        this.m_mapView = mapView;
        this.m_willRenderListener = () => this.render();
        mapView.addEventListener(MapViewEventNames.WillRender, this.m_willRenderListener);
    }

    /** Toggle the pass without tearing down its GPU resources. */
    public get enabled(): boolean {
        return this.m_enabled;
    }

    public set enabled(value: boolean) {
        this.m_enabled = value;
    }

    /** Whether the last frame captured any tagged geometry. */
    public get capturedAny(): boolean {
        return this.m_capturedAny;
    }

    /** Depth of the closest captured surface per pixel, displaced exactly as
     * in the main pass (each mesh renders with its own material). */
    public get depthTexture(): THREE.Texture | null {
        return this.m_renderTarget?.depthTexture ?? null;
    }

    /** Per-pixel {@link SurfaceType} id in the red channel (`0` = nothing). */
    public get typeTexture(): THREE.Texture | null {
        return this.m_typeTarget?.texture ?? null;
    }

    /** Detach from the map view and release GPU resources. */
    public dispose(): void {
        this.m_mapView.removeEventListener(MapViewEventNames.WillRender, this.m_willRenderListener);
        this.m_renderTarget?.dispose();
        this.m_renderTarget = null;
        this.m_typeTarget?.dispose();
        this.m_typeTarget = null;
        this.m_typeMaterial?.dispose();
        this.m_typeMaterial = null;
    }

    private ensureTypeMaterial(): THREE.MeshBasicNodeMaterial {
        if (this.m_typeMaterial !== null) {
            return this.m_typeMaterial;
        }
        const typeValue = uniform(SurfaceType.None);
        // Resolved live per rendered object: each tagged mesh carries its own id.
        typeValue.onObjectUpdate(({ object }) => {
            const surfaceType = (object as unknown as { captureSurfaceType?: number })
                .captureSurfaceType;
            return typeof surfaceType === "number" ? surfaceType : SurfaceType.None;
        });
        const material = new THREE.MeshBasicNodeMaterial();
        material.colorNode = vec4(typeValue, 0, 0, 1);
        // Mandatory: while rendering, the WebGPU backend force-copies each
        // rendered object's `transparent` flag onto the override material
        // (Renderer.js). A single RedFormat attachment yields scalar fragment
        // output without an alpha channel, so any configured blending that
        // reads src alpha fails pipeline validation. NoBlending short-circuits
        // blend setup entirely, regardless of the forced transparency state.
        material.blending = THREE.NoBlending;
        material.transparent = false;
        material.depthTest = true;
        material.depthWrite = true;
        this.m_typeMaterial = material;
        return material;
    }

    private ensureRenderTarget(width: number, height: number): THREE.RenderTarget {
        let target = this.m_renderTarget;
        if (target === null || target.width !== width || target.height !== height) {
            target?.dispose();
            target = new THREE.RenderTarget(width, height, {
                minFilter: THREE.NearestFilter,
                magFilter: THREE.NearestFilter,
                depthBuffer: true,
                stencilBuffer: false
            });
            const depthTexture = new THREE.DepthTexture(width, height);
            depthTexture.minFilter = THREE.NearestFilter;
            depthTexture.magFilter = THREE.NearestFilter;
            target.depthTexture = depthTexture;
            this.m_renderTarget = target;
        }
        return target;
    }

    private ensureTypeTarget(width: number, height: number): THREE.RenderTarget {
        let target = this.m_typeTarget;
        if (target === null || target.width !== width || target.height !== height) {
            target?.dispose();
            target = new THREE.RenderTarget(width, height, {
                minFilter: THREE.NearestFilter,
                magFilter: THREE.NearestFilter,
                depthBuffer: false,
                stencilBuffer: false
            });
            target.texture.format = THREE.RedFormat;
            target.texture.type = THREE.FloatType;
            this.m_typeTarget = target;
        }
        return target;
    }

    private render(): void {
        if (!this.m_enabled) {
            return;
        }
        const view = this.m_mapView;
        const renderer = view.renderer;
        const scene = view.scene;
        const camera = view.getRteCamera();

        renderer.getDrawingBufferSize(this.m_scratchSize);
        const width = Math.max(1, Math.floor(this.m_scratchSize.x * this.resolutionScale));
        const height = Math.max(1, Math.floor(this.m_scratchSize.y * this.resolutionScale));
        const renderTarget = this.ensureRenderTarget(width, height);

        // Collect tagged meshes fresh every frame: tile objects come and go
        // with the scene graph rebuild.
        const tagged: THREE.Mesh[] = [];
        scene.traverse(object => {
            const mesh = object as THREE.Mesh;
            if (mesh.isMesh !== true) {
                return;
            }
            const surfaceType = (mesh as unknown as { captureSurfaceType?: number })
                .captureSurfaceType;
            if (typeof surfaceType === "number" && surfaceType > SurfaceType.None) {
                tagged.push(mesh);
            }
        });
        this.m_capturedAny = tagged.length > 0;
        if (!this.m_capturedAny) {
            return;
        }

        for (const mesh of tagged) {
            mesh.layers.enable(CAPTURE_LAYER_BIT);
        }
        const previousMask = camera.layers.mask;
        camera.layers.set(CAPTURE_LAYER_BIT);

        const overrideMaterial = scene.overrideMaterial;
        scene.overrideMaterial = null;

        try {
            // Pass A — displaced depth: tagged meshes render with their OWN
            // materials so per-tile vertex displacement (DEM heightmaps read
            // per object via material node updates) matches the main pass.
            camera.layers.set(CAPTURE_LAYER_BIT);
            renderer.setRenderTarget(renderTarget);
            renderer.clear(true, true, false);
            renderer.render(scene, camera);

            // Pass B — conservative type ids: pure override material with
            // depth testing disabled paints every captured-surface pixel,
            // independent of displacement or occlusion within the set.
            const typeTarget = this.ensureTypeTarget(width, height);
            const previousAutoClear = renderer.autoClear;
            renderer.autoClear = false;
            scene.overrideMaterial = this.ensureTypeMaterial();
            this.ensureTypeMaterial().depthTest = false;
            this.ensureTypeMaterial().depthWrite = false;
            renderer.setRenderTarget(typeTarget);
            renderer.clear(true, false, false);
            renderer.render(scene, camera);
            renderer.autoClear = previousAutoClear;
            renderer.setRenderTarget(null);
        } finally {
            scene.overrideMaterial = overrideMaterial;
            camera.layers.mask = previousMask;
            for (const mesh of tagged) {
                mesh.layers.disable(CAPTURE_LAYER_BIT);
            }
        }
    }
}
