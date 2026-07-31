/* Copyright (C) 2025 flywave.gl contributors */

import { LRUCache } from "@flywave/flywave-lrucache";
import * as THREE from "three/webgpu";
import { RenderTarget, NodeMaterial, type Renderer, RendererUtils, QuadMesh } from "three/webgpu";

import { type Font, type FontMetrics } from "./FontCatalog";
import { GlyphData } from "./GlyphData";
import { GlyphClearMaterial, GlyphCopyMaterial } from "./TextMaterials";

const MAX_TEXTURE_SIZE = 4096;

export interface GlyphCacheEntry {
    glyphData: GlyphData;
    location: THREE.Vector2;
}

export class GlyphTextureCache {
    private readonly m_cacheWidth: number;
    private readonly m_cacheHeight: number;
    private readonly m_textureSize: THREE.Vector2;
    private readonly m_entryCache: LRUCache<string, GlyphCacheEntry>;

    private readonly m_rt: RenderTarget;
    private readonly m_clearMaterial: GlyphClearMaterial;
    private readonly m_copyMaterial: GlyphCopyMaterial;
    private readonly m_clearQuad: QuadMesh;
    private readonly m_copyQuad: QuadMesh;

    private readonly m_copyTextureSet: Set<THREE.Texture>;
    private readonly m_copyTransform: THREE.Matrix3;
    private readonly m_copyPositions: THREE.Vector2[];
    private m_copyGeometryDrawCount: number;
    private m_clearGeometryDrawCount: number;

    private static readonly DEFAULT_CAPABILITIES = {
        isWebGL2: true,
        logarithmicDepthBuffer: false
    };

    constructor(
        readonly capacity: number,
        readonly entryWidth: number,
        readonly entryHeight: number
    ) {
        const nRows = Math.floor(Math.sqrt(capacity));
        this.m_cacheHeight = nRows * nRows < capacity ? nRows + 1 : nRows;
        this.m_cacheWidth = nRows * this.m_cacheHeight < capacity ? nRows + 1 : nRows;

        this.m_textureSize = new THREE.Vector2(
            this.m_cacheWidth * entryWidth,
            this.m_cacheHeight * entryHeight
        );
        if (this.m_textureSize.y > MAX_TEXTURE_SIZE || this.m_textureSize.x > MAX_TEXTURE_SIZE) {
            console.warn("GlyphTextureCache texture size exceeds MAX_TEXTURE_SIZE.");
        }

        this.m_entryCache = new LRUCache<string, GlyphCacheEntry>(capacity);
        this.initCacheEntries();

        this.m_rt = new RenderTarget(this.m_textureSize.x, this.m_textureSize.y, {
            wrapS: THREE.ClampToEdgeWrapping,
            wrapT: THREE.ClampToEdgeWrapping,
            depthBuffer: false,
            stencilBuffer: false
        });
        this.m_rt.texture.colorSpace = THREE.NoColorSpace;

        this.m_copyTextureSet = new Set<THREE.Texture>();
        this.m_copyTransform = new THREE.Matrix3();
        this.m_copyPositions = [
            new THREE.Vector2(),
            new THREE.Vector2(),
            new THREE.Vector2(),
            new THREE.Vector2()
        ];
        this.m_copyGeometryDrawCount = 0;
        this.m_clearGeometryDrawCount = 0;

        this.m_clearMaterial = new GlyphClearMaterial({
            rendererCapabilities: GlyphTextureCache.DEFAULT_CAPABILITIES
        });
        this.m_copyMaterial = new GlyphCopyMaterial({
            rendererCapabilities: GlyphTextureCache.DEFAULT_CAPABILITIES
        });
        this.m_clearQuad = new QuadMesh(this.m_clearMaterial as THREE.Material);
        this.m_copyQuad = new QuadMesh(this.m_copyMaterial as THREE.Material);
    }

    dispose(): void {
        this.m_entryCache.clear();
        this.m_rt.dispose();
        (this.m_clearMaterial as THREE.Material).dispose();
        (this.m_copyMaterial as THREE.Material).dispose();
        this.m_copyTextureSet.clear();
    }

    get texture(): THREE.Texture {
        return this.m_rt.texture;
    }
    get textureSize(): THREE.Vector2 {
        return this.m_textureSize;
    }

    add(hash: string, glyph: GlyphData): void {
        const entry = this.m_entryCache.get(hash);
        if (entry !== undefined) return;
        const oldestEntry = this.m_entryCache.oldest;
        if (oldestEntry === null) throw new Error("GlyphTextureCache is uninitialized!");
        this.clearCacheEntry(oldestEntry.value);
        this.copyGlyphToCache(hash, glyph, oldestEntry.value.location);
    }

    has(hash: string): boolean {
        return this.m_entryCache.has(hash);
    }
    get(hash: string): GlyphCacheEntry | undefined {
        return this.m_entryCache.get(hash);
    }

    clear(): void {
        this.m_copyGeometryDrawCount = 0;
        this.m_clearGeometryDrawCount = 0;
        this.m_entryCache.clear();
        this.m_copyTextureSet.clear();
        this.initCacheEntries();
    }

    update(renderer: Renderer): void {
        const willClear = this.m_clearGeometryDrawCount > 0;
        const willCopy = this.m_copyGeometryDrawCount > 0;
        if (!willClear && !willCopy) return;

        const rendererState = RendererUtils.resetRendererState(renderer, undefined);
        renderer.autoClear = false;
        renderer.setRenderTarget(this.m_rt);

        if (willClear) {
            for (let i = 0; i < this.m_clearRects.length; i++) {
                this.m_clearMaterial.clearRectUniform.value.copy(this.m_clearRects[i]);
                (this.m_clearMaterial as THREE.Material).needsUpdate = true;
                this.m_clearQuad.render(renderer);
            }
            this.m_clearRects.length = 0;
            this.m_clearGeometryDrawCount = 0;
        }

        if (willCopy) {
            for (let i = 0; i < this.m_copyEntries.length; i++) {
                const entry = this.m_copyEntries[i];
                this.m_copyMaterial.setSourceTexture(entry.srcTexture);
                this.m_copyMaterial.srcRectUniform.value.copy(entry.srcRect);
                this.m_copyMaterial.dstRectUniform.value.copy(entry.dstRect);
                (this.m_copyMaterial as THREE.Material).needsUpdate = true;
                this.m_copyQuad.render(renderer);
            }
            this.m_copyEntries.length = 0;
            this.m_copyTextureSet.clear();
            this.m_copyGeometryDrawCount = 0;
        }

        RendererUtils.restoreRendererState(renderer, rendererState);
    }

    private m_clearRects: THREE.Vector4[] = [];
    private m_copyEntries: {
        srcTexture: THREE.Texture;
        srcRect: THREE.Vector4;
        dstRect: THREE.Vector4;
    }[] = [];

    private initCacheEntries() {
        const dummyMetrics: FontMetrics = {
            size: 0,
            distanceRange: 0,
            base: 0,
            lineHeight: 0,
            lineGap: 0,
            capHeight: 0,
            xHeight: 0
        };
        const dummyFont: Font = { name: "", metrics: dummyMetrics, charset: "" };
        const dummyGlyphData = new GlyphData(
            0,
            "",
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            THREE.Texture.DEFAULT_IMAGE,
            dummyFont
        );
        for (let i = 0; i < this.m_cacheHeight; i++) {
            for (let j = 0; j < this.m_cacheWidth; j++) {
                this.m_entryCache.set(`Dummy_${i * this.m_cacheHeight + j}`, {
                    glyphData: dummyGlyphData,
                    location: new THREE.Vector2(j, i)
                });
            }
        }
    }

    private copyGlyphToCache(hash: string, glyph: GlyphData, cacheLocation: THREE.Vector2) {
        const padX = Math.floor((this.entryWidth - glyph.width) / 2);
        const padY = Math.floor((this.entryHeight - glyph.height) / 2);
        this.m_copyTransform.set(
            1.0,
            0.0,
            cacheLocation.x * this.entryWidth - glyph.offsetX + padX,
            0.0,
            1.0,
            cacheLocation.y * this.entryHeight - glyph.positions[0].y + padY,
            0.0,
            0.0,
            0.0
        );
        for (let i = 0; i < 4; ++i) {
            this.m_copyPositions[i].set(glyph.positions[i].x, glyph.positions[i].y);
            this.m_copyPositions[i].applyMatrix3(this.m_copyTransform);
        }

        const dstX0 = this.m_copyPositions[0].x / this.m_textureSize.x;
        const dstY0 = this.m_copyPositions[0].y / this.m_textureSize.y;
        const dstX1 = this.m_copyPositions[3].x / this.m_textureSize.x;
        const dstY1 = this.m_copyPositions[3].y / this.m_textureSize.y;

        const srcX0 = glyph.sourceTextureCoordinates[0].x;
        const srcY0 = glyph.sourceTextureCoordinates[0].y;
        const srcX1 = glyph.sourceTextureCoordinates[3].x;
        const srcY1 = glyph.sourceTextureCoordinates[3].y;

        this.m_copyEntries.push({
            srcTexture: glyph.texture,
            srcRect: new THREE.Vector4(srcX0, srcY0, srcX1, srcY1),
            dstRect: new THREE.Vector4(dstX0, dstY0, dstX1, dstY1)
        });
        ++this.m_copyGeometryDrawCount;

        const u0 = dstX0;
        const v0 = dstY0;
        const u1 = dstX1;
        const v1 = dstY1;
        glyph.dynamicTextureCoordinates[0].set(u0, v0);
        glyph.dynamicTextureCoordinates[1].set(u1, v0);
        glyph.dynamicTextureCoordinates[2].set(u0, v1);
        glyph.dynamicTextureCoordinates[3].set(u1, v1);
        glyph.isInCache = true;
        this.m_entryCache.set(hash, { glyphData: glyph, location: cacheLocation });
    }

    private clearCacheEntry(entry: GlyphCacheEntry) {
        entry.glyphData.isInCache = false;
        const x0 = (entry.location.x * this.entryWidth) / this.m_textureSize.x;
        const y0 = (entry.location.y * this.entryHeight) / this.m_textureSize.y;
        const x1 = ((entry.location.x + 1) * this.entryWidth) / this.m_textureSize.x;
        const y1 = ((entry.location.y + 1) * this.entryHeight) / this.m_textureSize.y;
        this.m_clearRects.push(new THREE.Vector4(x0, y0, x1, y1));
        ++this.m_clearGeometryDrawCount;
    }
}
