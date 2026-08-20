import { StyleSpecification } from './MBStyleSpec';
export interface ResolvedSource {
    sourceId: string;
    type: 'vector' | 'raster' | 'raster-dem' | 'geojson';
    tileUrls: string[];
    minzoom: number;
    maxzoom: number;
    attribution?: string;
}
export interface SpriteData {
    json: Record<string, SpriteIconInfo>;
    image: HTMLImageElement | ImageBitmap | HTMLCanvasElement;
}
export interface SpriteIconInfo {
    x: number;
    y: number;
    width: number;
    height: number;
    pixelRatio: number;
    sdf?: boolean;
}
export declare class MBStyleManager {
    private m_style;
    private m_resolvedSources;
    private m_spriteData;
    private m_accessToken;
    loadStyle(style: StyleSpecification | string, accessToken?: string): Promise<void>;
    private fetchUrlImports;
    private resolveImportUrl;
    private mergeImports;
    reloadSources(): Promise<void>;
    private resolveSources;
    private resolveTileUrl;
    loadSprite(spriteUrl: string): Promise<SpriteData | undefined>;
    private buildSpriteFromIconSet;
    getStyle(): StyleSpecification | undefined;
    getResolvedSources(): Map<string, ResolvedSource>;
    getResolvedSource(sourceId: string): ResolvedSource | undefined;
    getLayers(): import("./MBStyleSpec").LayerSpecification[];
    getSpriteData(): SpriteData | undefined;
}
//# sourceMappingURL=MBStyleManager.d.ts.map