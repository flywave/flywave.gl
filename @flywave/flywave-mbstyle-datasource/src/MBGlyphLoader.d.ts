import * as THREE from 'three';
export interface GlyphMetrics {
    glyphId: number;
    width: number;
    height: number;
    left: number;
    top: number;
    advance: number;
    uvMin: [number, number];
    uvMax: [number, number];
}
export interface GlyphAtlasData {
    texture: THREE.Texture;
    getMetrics(font: string, char: string): GlyphMetrics | undefined;
}
export declare function loadGlyphMetrics(fontStack: string, ranges: number[], glyphUrlTemplate: string, out?: Map<string, GlyphMetrics>): Promise<Map<string, GlyphMetrics>>;
export declare class MBGlyphLoader {
    private m_atlasCanvas;
    private m_atlasCtx;
    private m_atlasTexture;
    private m_metrics;
    private m_cursorX;
    private m_cursorY;
    private m_rowHeight;
    private m_loadedRanges;
    private m_usePBF;
    constructor();
    loadGlyphRange(fontStack: string, range: number, glyphUrlTemplate: string): Promise<void>;
    private packPBFGlyphs;
    private packPBFGlyph;
    private buildFallbackGlyphs;
    private updateTexture;
    getAtlas(): THREE.Texture | null;
    getMetrics(font: string, char: string): GlyphMetrics | undefined;
    isUsingPBF(): boolean;
    dispose(): void;
}
//# sourceMappingURL=MBGlyphLoader.d.ts.map