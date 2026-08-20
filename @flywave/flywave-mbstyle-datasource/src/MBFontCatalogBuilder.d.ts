import { FontCatalog } from '@flywave/flywave-text-canvas';
import { ParsedGlyph } from './GlyphPBFParser';
import { GlyphMetrics } from './MBGlyphLoader';
export declare function buildFontCatalogFromPBF(fontName: string, glyphs: Map<number, ParsedGlyph>): FontCatalog;
export declare function buildFontCatalogFromMetrics(fontName: string, metrics: Map<string, GlyphMetrics>, glyphUrlTemplate: string): Promise<FontCatalog>;
//# sourceMappingURL=MBFontCatalogBuilder.d.ts.map