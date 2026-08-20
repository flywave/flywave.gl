export interface ShapedLine {
    text: string;
    width: number;
    position: [number, number];
}
export interface ShapedText {
    lines: ShapedLine[];
    top: number;
    bottom: number;
    left: number;
    right: number;
    writingMode: 'horizontal' | 'vertical';
}
export interface GlyphMetrics {
    glyphId: number;
    width: number;
    height: number;
    left: number;
    top: number;
    advance: number;
}
export interface GlyphLookup {
    getMetrics(font: string, char: string): GlyphMetrics | undefined;
}
export declare function measureTextWidth(text: string, letterSpacing?: number, glyphLookup?: GlyphLookup, fontName?: string): number;
export declare function getGlyphMetrics(char: string, glyphLookup?: GlyphLookup, fontName?: string): {
    width: number;
    height: number;
    top: number;
    left: number;
    baseline: number;
};
export declare function resolveTextField(field: string, properties: Record<string, any>): string;
export declare function applyTextTransform(text: string, transform: string): string;
export declare function wrapText(text: string, maxWidth: number, letterSpacing?: number, glyphLookup?: GlyphLookup, fontName?: string): string[];
export declare function getJustifyOffset(lineWidth: number, availableWidth: number, justify: 'left' | 'center' | 'right' | 'auto', anchor?: string): number;
export declare function getAnchorOffset(textWidth: number, textHeight: number, anchor: string): [number, number];
export declare function shapeText(text: string, options: {
    fontSize: number;
    maxWidth: number;
    lineHeight: number;
    letterSpacing: number;
    justify: 'left' | 'center' | 'right' | 'auto';
    anchor: string;
    transform: string;
    writingMode?: ('horizontal' | 'vertical')[];
    glyphLookup?: GlyphLookup;
    fontName?: string;
}): ShapedText;
export interface TextQuad {
    x: number;
    y: number;
    width: number;
    height: number;
    uvMin: [number, number];
    uvMax: [number, number];
}
export declare function generateTextQuads(shaped: ShapedText, fontSize: number, letterSpacing?: number): TextQuad[];
export declare function isCJK(char: string): boolean;
export declare function isArabic(char: string): boolean;
export declare function isHebrew(char: string): boolean;
export declare function hasRTL(text: string): boolean;
export declare function reorderRTL(text: string): string;
export declare function reshapeArabic(text: string): string;
export declare function shapeRTLText(text: string, transform: string): string;
//# sourceMappingURL=TextShaping.d.ts.map