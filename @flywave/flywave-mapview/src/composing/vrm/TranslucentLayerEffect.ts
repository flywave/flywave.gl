// @ts-nocheck
import {
    Color,
    DataTexture,
    FloatType,
    RGBAFormat,
    LinearFilter,
    Scene,
    type Object3D
} from "three";
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

/** Object3D.layers bit for translucent objects (bit 10) */
export const TRANSLUCENT_LAYER_BIT = 10;

/**
 * Data manager for translucent layer effect.
 *
 * Objects registered via `addObject` get bit 10 enabled on their layers mask.
 * The ViewRenderManager creates a second `pass()` node using a camera that
 * only sees layer bit 10. This second pass has its own depth buffer, so
 * terrain does NOT occlude translucent objects — underground portions are
 * fully visible. The two pass outputs are blended in post-processing.
 *
 * Zero modifications to any material. Zero shader recompilations.
 */
export class TranslucentLayerEffect {
    private readonly layers: Map<string, InternalLayerConfig> = new Map();
    private readonly layerIndices: Map<string, number> = new Map();
    private nextLayerIndex: number = 0;

    private layerDataTexture: DataTexture;
    private needsLayerTextureUpdate: boolean = false;

    private readonly registeredObjects: Set<Object3D> = new Set();

    constructor() {
        this.layerDataTexture = this.createLayerDataTexture();
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

    private flushDataTexture(): void {
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
        if (this.registeredObjects.has(object)) return;
        if (!this.layers.has(layerId)) {
            this.addLayer(layerId);
        }
        object.traverse(child => {
            child.layers.enable(TRANSLUCENT_LAYER_BIT);
        });
        this.registeredObjects.add(object);
    }

    removeObject(object: Object3D): void {
        if (!this.registeredObjects.has(object)) return;
        object.traverse(child => {
            child.layers.disable(TRANSLUCENT_LAYER_BIT);
        });
        this.registeredObjects.delete(object);
    }

    get hasObjects(): boolean {
        return this.registeredObjects.size > 0;
    }

    getLayerDataTexture(): DataTexture {
        return this.layerDataTexture;
    }

    updateLayerDataTexture(): void {
        this.flushDataTexture();
    }

    getLayerCount(): number {
        return this.nextLayerIndex;
    }

    setSize(_width: number, _height: number): void {}
    renderLayerPasses(): void {}
    getLayerIDTexture() {
        return null;
    }

    dispose(): void {
        for (const obj of this.registeredObjects) {
            obj.traverse(child => {
                child.layers.disable(TRANSLUCENT_LAYER_BIT);
            });
        }
        this.layerDataTexture.dispose();
        this.registeredObjects.clear();
        this.layers.clear();
        this.layerIndices.clear();
    }
}
