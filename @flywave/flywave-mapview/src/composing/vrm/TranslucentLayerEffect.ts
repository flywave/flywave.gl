// @ts-nocheck
import {
    Color,
    DataTexture,
    FloatType,
    RGBAFormat,
    LinearFilter,
    type Object3D,
    type Scene,
    type Camera,
    type WebGLRenderer,
    RenderTarget,
    DepthTexture,
    ShaderMaterial
} from "three";
import { Fn, texture, uniform, vec4, vec3, float, uv, Loop, int } from "three/tsl";
import type { Renderer } from "three/webgpu";

import { ITranslucentLayerConfig } from "@flywave/flywave-datasource-protocol";

interface InternalLayerConfig extends ITranslucentLayerConfig {
    parsedColor?: Color;
}

const BLEND_MODE_MAP: Record<string, number> = {
    mix: 0.0,
    add: 1.0,
    multiply: 2.0,
    screen: 3.0
};

const PIXELS_PER_LAYER = 2;
const LAYERS_PER_ROW = 128;

export class TranslucentLayerEffect {
    private readonly renderer: Renderer;
    private readonly scene: Scene;
    private readonly camera: Camera;

    private readonly layers: Map<string, InternalLayerConfig> = new Map();
    private readonly layerIndices: Map<string, number> = new Map();
    private nextLayerIndex: number = 0;

    private layerDataTexture: DataTexture;
    private layerIDMaterial: ShaderMaterial;

    private readonly normalObjects: Set<Object3D> = new Set();
    private readonly backgroundObjects: Set<Object3D> = new Set();

    private layerIDRT?: RenderTarget;
    private layerColorRT?: RenderTarget;

    private needsLayerTextureUpdate: boolean = false;

    constructor(renderer: Renderer, scene: Scene, camera: Camera) {
        this.renderer = renderer;
        this.scene = scene;
        this.camera = camera;
        this.layerDataTexture = this.createLayerDataTexture();
        this.layerIDMaterial = this.createLayerIDMaterial();
    }

    private createLayerDataTexture(): DataTexture {
        const width = LAYERS_PER_ROW * PIXELS_PER_LAYER;
        const data = new Float32Array(width * 4);
        const tex = new DataTexture(data, width, 1, RGBAFormat, FloatType);
        tex.minFilter = LinearFilter;
        tex.magFilter = LinearFilter;
        tex.needsUpdate = true;
        return tex;
    }

    private createLayerIDMaterial(): ShaderMaterial {
        return new ShaderMaterial({
            uniforms: { layerIndex: { value: -1.0 } },
            vertexShader: `
                uniform float layerIndex;
                varying float vLayerIndex;
                void main() {
                    vLayerIndex = layerIndex;
                    #include <begin_vertex>
                    #include <project_vertex>
                }
            `,
            fragmentShader: `
                varying float vLayerIndex;
                void main() {
                    if (vLayerIndex < 0.0) {
                        gl_FragColor = vec4(0.0, 0.0, 0.0, 0.0);
                    } else {
                        gl_FragColor = vec4((vLayerIndex + 1.0) / 256.0, 0.0, 0.0, 1.0);
                    }
                }
            `,
            depthTest: true,
            depthWrite: true
        });
    }

    private ensureRenderTargets(width: number, height: number): void {
        if (this.layerIDRT == null) {
            this.layerIDRT = new RenderTarget(width, height, { type: FloatType });
            this.layerColorRT = new RenderTarget(width, height, {
                type: FloatType,
                depthTexture: new DepthTexture(width, height)
            });
        } else {
            this.layerIDRT.setSize(width, height);
            this.layerColorRT!.setSize(width, height);
        }
    }

    private updateLayerDataTexture(): void {
        if (!this.needsLayerTextureUpdate) return;
        const arr = this.layerDataTexture.image.data as Float32Array;
        arr.fill(0);

        for (const [layerId, config] of this.layers) {
            const idx = this.layerIndices.get(layerId);
            if (idx === undefined) continue;
            const offset = idx * PIXELS_PER_LAYER * 4;
            const color = config.parsedColor ?? new Color(1, 0.5, 0.2);
            arr[offset] = config.mixFactor ?? 0.3;
            arr[offset + 1] = BLEND_MODE_MAP[config.blendMode ?? "mix"] ?? 0.0;
            arr[offset + 2] = color.r;
            arr[offset + 3] = color.g;
            arr[offset + 4] = color.b;
            arr[offset + 5] = config.occlusionDistance ?? 10.0;
            arr[offset + 6] = 0;
            const useObjColor = config.useObjectColor !== false ? 1.0 : 0.0;
            const objColorMix = config.objectColorMix ?? 0.5;
            arr[offset + 7] = useObjColor + objColorMix * 0.0001;
        }
        this.layerDataTexture.needsUpdate = true;
        this.needsLayerTextureUpdate = false;
    }

    // ================ Public API ================

    addLayer(layerId: string, config: ITranslucentLayerConfig = {}): void {
        if (this.layers.has(layerId)) {
            this.updateLayer(layerId, config);
            return;
        }
        const parsedColor = config.color ? new Color(config.color) : new Color(1, 0.5, 0.2);
        this.layers.set(layerId, { ...config, parsedColor });
        this.layerIndices.set(layerId, this.nextLayerIndex++);
        this.needsLayerTextureUpdate = true;
    }

    updateLayer(layerId: string, config: Partial<ITranslucentLayerConfig>): void {
        const existing = this.layers.get(layerId);
        if (!existing) throw new Error(`Layer "${layerId}" does not exist`);
        let parsedColor = existing.parsedColor;
        if (config.color && config.color !== existing.color) {
            parsedColor = new Color(config.color);
        }
        this.layers.set(layerId, { ...existing, ...config, parsedColor });
        this.needsLayerTextureUpdate = true;
    }

    removeLayer(layerId: string): void {
        this.layers.delete(layerId);
        this.layerIndices.delete(layerId);
        this.reindexLayers();
        this.needsLayerTextureUpdate = true;
    }

    private reindexLayers(): void {
        const sorted = Array.from(this.layers.keys());
        this.layerIndices.clear();
        this.nextLayerIndex = 0;
        for (const id of sorted) {
            this.layerIndices.set(id, this.nextLayerIndex++);
        }
    }

    addObject(object: Object3D, layerId: string): void {
        if (!this.layers.has(layerId)) {
            this.addLayer(layerId);
        }
        const config = this.layers.get(layerId)!;
        object.userData.__layerId = layerId;
        object.userData.__layerIndex = this.layerIndices.get(layerId)!;
        if (config.mode === "background") {
            this.backgroundObjects.add(object);
        } else {
            this.normalObjects.add(object);
        }
    }

    removeObject(object: Object3D): void {
        this.normalObjects.delete(object);
        this.backgroundObjects.delete(object);
        delete object.userData.__layerId;
        delete object.userData.__layerIndex;
    }

    setSize(width: number, height: number): void {
        this.ensureRenderTargets(width, height);
    }

    /**
     * Render translucent objects to layer RTs. Called before the main pipeline render.
     */
    renderLayerPasses(): void {
        this.updateLayerDataTexture();
        const total = this.normalObjects.size + this.backgroundObjects.size;
        if (total === 0) return;

        const canvas = (this.renderer as unknown as { domElement: HTMLCanvasElement }).domElement;
        const w = canvas?.clientWidth || 1;
        const h = canvas?.clientHeight || 1;
        this.ensureRenderTargets(w, h);

        const allObjects = [...this.normalObjects, ...this.backgroundObjects];

        const savedOverride = this.scene.overrideMaterial;
        const savedBg = this.scene.background;
        const savedAutoClear = (this.renderer as unknown as { autoClear: boolean }).autoClear;
        const r = this.renderer as unknown as {
            setRenderTarget: (rt: unknown) => void;
            render: (s: unknown, c: unknown) => void;
            autoClear: boolean;
            setClearColor: (c: number, a: number) => void;
        };

        try {
            r.autoClear = true;
            this.scene.background = null;

            // Pass 1: Layer ID
            this.scene.overrideMaterial = this.layerIDMaterial;
            r.setRenderTarget(this.layerIDRT);
            r.setClearColor(0x000000, 0);

            for (const obj of allObjects) {
                obj.userData.__renderingLayerID = true;
                const idx = obj.userData.__layerIndex ?? -1;
                this.layerIDMaterial.uniforms.layerIndex.value = idx;
                this.layerIDMaterial.uniformsNeedUpdate = true;
                r.render(this.scene, this.camera);
            }

            // Pass 2: Color + Depth
            this.scene.overrideMaterial = null;
            r.setRenderTarget(this.layerColorRT);
            r.setClearColor(0x000000, 0);
            r.render(this.scene, this.camera);
        } finally {
            this.scene.overrideMaterial = savedOverride;
            this.scene.background = savedBg;
            r.autoClear = savedAutoClear;
            r.setRenderTarget(null);
        }
    }

    getLayerIDTexture() {
        return this.layerIDRT?.texture ?? null;
    }

    getLayerColorTexture() {
        return this.layerColorRT?.texture ?? null;
    }

    getLayerDepthTexture() {
        return this.layerColorRT?.depthTexture ?? null;
    }

    getLayerDataTexture() {
        return this.layerDataTexture;
    }

    getLayerCount(): number {
        return this.nextLayerIndex;
    }

    dispose(): void {
        this.layerIDRT?.dispose();
        this.layerColorRT?.dispose();
        this.layerDataTexture.dispose();
        this.layerIDMaterial.dispose();
        this.normalObjects.clear();
        this.backgroundObjects.clear();
        this.layers.clear();
        this.layerIndices.clear();
    }
}
