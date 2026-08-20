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
export interface SpriteIconInfo {
    x: number;
    y: number;
    width: number;
    height: number;
    pixelRatio: number;
    sdf?: boolean;
}
export declare class SpriteAtlas {
    readonly texture: THREE.Texture;
    readonly icons: Map<string, SpriteIconInfo>;
    private m_canvas;
    private m_ctx;
    private m_cursorX;
    private m_cursorY;
    private m_rowHeight;
    private m_pristine;
    private m_themed;
    constructor(image: HTMLImageElement | ImageBitmap | HTMLCanvasElement, icons: Map<string, SpriteIconInfo>);
    private initCanvas;
    addIcon(name: string, image: HTMLImageElement | HTMLCanvasElement | ImageBitmap, sdf?: boolean): boolean;
    removeIcon(name: string): boolean;
    applyColorTheme(lut: import('../MBColorTheme').ColorThemeLut | null): void;
    get isThemed(): boolean;
    getIconUv(name: string): {
        uvMin: [number, number];
        uvMax: [number, number];
    } | undefined;
    dispose(): void;
}
export declare class MapIconMaterial extends THREE.SpriteMaterial {
    private m_paint;
    private m_spriteAtlas;
    private m_uvOffset;
    private m_uvScale;
    private m_iconWidth;
    private m_iconHeight;
    constructor(paint?: Partial<MapIconMaterialParams>);
    setPaint(paint: Partial<MapIconMaterialParams>): void;
    setSpriteAtlas(atlas: SpriteAtlas | null): void;
    getPaint(): Readonly<MapIconMaterialParams>;
    private applyPaint;
    get iconWidth(): number;
    get iconHeight(): number;
    dispose(): void;
}
//# sourceMappingURL=MapIconMaterial.d.ts.map