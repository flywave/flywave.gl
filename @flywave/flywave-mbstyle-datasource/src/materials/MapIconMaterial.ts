import * as THREE from 'three';

export interface MapIconMaterialParams {
    'icon-image': string;
    'icon-size': number;
    'icon-color': string;
    'icon-opacity': number;
    'icon-rotate': number;
    'icon-offset': [number, number];
    'icon-rotation-alignment': 'map' | 'viewport' | 'auto';
}

const DEFAULTS: MapIconMaterialParams = {
    'icon-image': '',
    'icon-size': 1,
    'icon-color': '#ffffff',
    'icon-opacity': 1,
    'icon-rotate': 0,
    'icon-offset': [0, 0],
    'icon-rotation-alignment': 'auto',
};

export interface SpriteIconInfo {
    x: number;
    y: number;
    width: number;
    height: number;
    pixelRatio: number;
    sdf?: boolean;
}

/** Per-frame shared sprite atlas resource */
export class SpriteAtlas {
    readonly texture: THREE.Texture;
    readonly icons: Map<string, SpriteIconInfo>;
    private m_canvas: HTMLCanvasElement | null = null;
    private m_ctx: CanvasRenderingContext2D | null = null;
    private m_cursorX = 0;
    private m_cursorY = 0;
    private m_rowHeight = 0;

    constructor(image: HTMLImageElement | ImageBitmap, icons: Map<string, SpriteIconInfo>) {
        this.texture = new THREE.Texture(image);
        this.texture.needsUpdate = true;
        this.texture.minFilter = THREE.LinearFilter;
        this.texture.magFilter = THREE.LinearFilter;
        this.icons = icons;
        // Initialize canvas for dynamic additions (from the initial image).
        this.initCanvas(image);
    }

    private initCanvas(image: HTMLImageElement | ImageBitmap): void {
        if (typeof document === 'undefined') return;
        const w = (image as HTMLImageElement).naturalWidth ?? (image as ImageBitmap).width ?? image.width;
        const h = (image as HTMLImageElement).naturalHeight ?? (image as ImageBitmap).height ?? image.height;
        // Create a larger canvas to accommodate dynamic additions.
        const canvasW = Math.max(w * 2, 1024);
        const canvasH = Math.max(h * 2, 1024);
        this.m_canvas = document.createElement('canvas');
        this.m_canvas.width = canvasW;
        this.m_canvas.height = canvasH;
        this.m_ctx = this.m_canvas.getContext('2d')!;
        this.m_ctx.drawImage(image as any, 0, 0);
        this.m_cursorX = w;
        this.m_cursorY = 0;
        this.m_rowHeight = 0;
        // Replace the texture image with the canvas for dynamic updates.
        (this.texture as any).image = this.m_canvas;
        this.texture.needsUpdate = true;
    }

    /**
     * Dynamically add an icon to the atlas at runtime (addImage operation).
     * The icon is drawn to the canvas at the current cursor position.
     */
    addIcon(name: string, image: HTMLImageElement | HTMLCanvasElement | ImageBitmap, sdf: boolean = false): boolean {
        if (!this.m_ctx || !this.m_canvas) return false;
        if (this.icons.has(name)) return false;

        const w = (image as any).naturalWidth ?? (image as any).width;
        const h = (image as any).naturalHeight ?? (image as any).height;
        const padding = 2;

        // Simple row-packing.
        if (this.m_cursorX + w + padding > this.m_canvas.width) {
            this.m_cursorX = 0;
            this.m_cursorY += this.m_rowHeight + padding;
            this.m_rowHeight = 0;
        }
        if (this.m_cursorY + h + padding > this.m_canvas.height) return false;

        this.m_ctx.drawImage(image as any, this.m_cursorX, this.m_cursorY);
        this.icons.set(name, {
            x: this.m_cursorX, y: this.m_cursorY,
            width: w, height: h, pixelRatio: 1, sdf,
        });
        this.m_cursorX += w + padding;
        this.m_rowHeight = Math.max(this.m_rowHeight, h);
        this.texture.needsUpdate = true;
        return true;
    }

    /** Remove an icon from the atlas (removeImage operation). */
    removeIcon(name: string): boolean {
        return this.icons.delete(name);
    }

    getIconUv(name: string): { uvMin: [number, number]; uvMax: [number, number] } | undefined {
        const info = this.icons.get(name);
        if (!info) return undefined;
        const texW = this.texture.image.width;
        const texH = this.texture.image.height;
        return {
            uvMin: [info.x / texW, info.y / texH],
            uvMax: [(info.x + info.width) / texW, (info.y + info.height) / texH],
        };
    }

    dispose() {
        this.texture.dispose();
    }
}

/**
 * Sprite-based icon material for Mapbox symbol layer icon-image rendering.
 * Each icon is rendered as a THREE.Sprite with UV coordinates into the sprite atlas.
 */
export class MapIconMaterial extends THREE.SpriteMaterial {
    private m_paint: MapIconMaterialParams;
    private m_spriteAtlas: SpriteAtlas | null = null;
    private m_uvOffset = new THREE.Vector2(0, 0);
    private m_uvScale = new THREE.Vector2(1, 1);
    private m_iconWidth = 32;
    private m_iconHeight = 32;

    constructor(paint: Partial<MapIconMaterialParams> = {}) {
        super({
            transparent: true,
            depthWrite: false,
        });
        this.m_paint = { ...DEFAULTS, ...paint };

        const self = this;
        this.onBeforeCompile = (shader: THREE.WebGLProgramParametersWithUniforms) => {
            shader.uniforms.uUvOffset = { value: self.m_uvOffset };
            shader.uniforms.uUvScale = { value: self.m_uvScale };
            shader.fragmentShader = shader.fragmentShader.replace(
                '#include <common>',
                `#include <common>\nuniform vec2 uUvOffset;\nuniform vec2 uUvScale;`
            );
            shader.fragmentShader = shader.fragmentShader.replace(
                'texture2D( map, vUv )',
                'texture2D( map, uUvOffset + vUv * uUvScale )'
            );
        };

        this.applyPaint();
    }

    setPaint(paint: Partial<MapIconMaterialParams>) {
        Object.assign(this.m_paint, paint);
        this.applyPaint();
    }

    setSpriteAtlas(atlas: SpriteAtlas | null) {
        this.m_spriteAtlas = atlas;
        this.applyPaint();
    }

    getPaint(): Readonly<MapIconMaterialParams> {
        return this.m_paint;
    }

    private applyPaint() {
        const p = this.m_paint;
        this.color.set(p['icon-color']);
        this.opacity = p['icon-opacity'];
        this.rotation = (p['icon-rotate'] ?? 0) * Math.PI / 180;

        if (this.m_spriteAtlas) {
            const uv = this.m_spriteAtlas.getIconUv(p['icon-image']);
            if (uv) {
                this.m_uvOffset.set(uv.uvMin[0], uv.uvMin[1]);
                this.m_uvScale.set(uv.uvMax[0] - uv.uvMin[0], uv.uvMax[1] - uv.uvMin[1]);
                this.map = this.m_spriteAtlas.texture;

                const iconInfo = this.m_spriteAtlas.icons.get(p['icon-image']);
                if (iconInfo) {
                    this.m_iconWidth = iconInfo.width;
                    this.m_iconHeight = iconInfo.height;
                }
            }
        }

        this.needsUpdate = true;
    }

    get iconWidth(): number { return this.m_iconWidth; }
    get iconHeight(): number { return this.m_iconHeight; }

    dispose(): void {
        super.dispose();
    }
}
