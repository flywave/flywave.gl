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

    constructor(image: HTMLImageElement | ImageBitmap, icons: Map<string, SpriteIconInfo>) {
        this.texture = new THREE.Texture(image);
        this.texture.needsUpdate = true;
        this.texture.minFilter = THREE.LinearFilter;
        this.texture.magFilter = THREE.LinearFilter;
        this.icons = icons;
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
