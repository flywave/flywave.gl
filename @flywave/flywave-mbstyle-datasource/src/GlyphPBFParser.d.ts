export interface ParsedGlyph {
    id: number;
    width: number;
    height: number;
    left: number;
    top: number;
    advance: number;
    bitmap: Uint8Array;
}
export interface ParsedFontstack {
    name: string;
    range: string;
    glyphs: Map<number, ParsedGlyph>;
}
export declare function parseGlyphPBF(data: ArrayBuffer | Uint8Array): ParsedFontstack | null;
//# sourceMappingURL=GlyphPBFParser.d.ts.map