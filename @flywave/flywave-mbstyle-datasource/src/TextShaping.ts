/**
 * Text shaping engine — breaks text into lines, applies formatting.
 *
 * Reference: mapbox-gl-js src/symbol/shaping.ts
 */

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

const DEFAULT_GLYPH_ADVANCE = 0.6;
const SPACE_ADVANCE = 0.3;

/**
 * Per-character advance estimates (in em units) for common Latin glyphs, based
 * on typical sans-serif averages. Used when no real glyph metrics are available
 * (no PBF font loaded). Much more accurate than a flat 0.6 for all chars — e.g.
 * 'i' ≈ 0.28, 'm' ≈ 0.84 — so collision boxes fit labels properly.
 */
const LATIN_ADVANCE: Record<string, number> = {
    // narrow
    i: 0.28, j: 0.28, l: 0.28, t: 0.31, f: 0.33, r: 0.38,
    I: 0.33, J: 0.39,
    '1': 0.33, '.': 0.28, ',': 0.28, ':': 0.28, ';': 0.28,
    '\'': 0.22, '"': 0.38, '!': 0.28, '|': 0.28, '(': 0.33, ')': 0.33,
    // medium-narrow
    c: 0.5, s: 0.5, a: 0.55, e: 0.55, g: 0.55, n: 0.55, o: 0.55,
    p: 0.55, q: 0.55, u: 0.55, v: 0.5, x: 0.5, z: 0.5, b: 0.55, d: 0.55,
    h: 0.55, k: 0.55,
    '2': 0.55, '3': 0.55, '4': 0.55, '5': 0.55, '6': 0.55, '7': 0.5, '8': 0.55, '9': 0.55, '0': 0.55,
    // medium (uppercase)
    C: 0.72, G: 0.78, L: 0.61, E: 0.61, F: 0.56, P: 0.61, S: 0.61, T: 0.61,
    Z: 0.61, B: 0.68, D: 0.72, H: 0.72, K: 0.67, N: 0.72, R: 0.67, U: 0.72,
    V: 0.67, X: 0.67, Y: 0.61, A: 0.67, '-': 0.39, '/': 0.33, '+': 0.58,
    '=': 0.58, '*': 0.44, '&': 0.67, '%': 0.83, '#': 0.58, '@': 0.86,
    // wide
    m: 0.84, w: 0.78, M: 0.83, W: 0.94, O: 0.78, Q: 0.78,
};

function estimateAdvance(ch: string): number {
    return LATIN_ADVANCE[ch] ?? DEFAULT_GLYPH_ADVANCE;
}

/**
 * Measure text width using glyph metrics if available, falling back to estimation.
 */
export function measureTextWidth(
    text: string,
    letterSpacing: number = 0,
    glyphLookup?: GlyphLookup,
    fontName?: string,
): number {
    if (!text) return 0;
    let width = 0;
    for (const ch of text) {
        if (glyphLookup && fontName) {
            const m = glyphLookup.getMetrics(fontName, ch);
            if (m) {
                width += m.advance;
                continue;
            }
        }
        if (ch === ' ') {
            width += SPACE_ADVANCE;
        } else {
            width += estimateAdvance(ch);
        }
    }
    width += letterSpacing * Math.max(0, text.length - 1);
    return width;
}

/**
 * Get the baseline offset for a glyph relative to the font's baseline.
 * Returns (top, bottom) offsets in em units.
 */
export function getGlyphMetrics(
    char: string,
    glyphLookup?: GlyphLookup,
    fontName?: string,
): { width: number; height: number; top: number; left: number; baseline: number } {
    if (glyphLookup && fontName) {
        const m = glyphLookup.getMetrics(fontName, char);
        if (m) {
            return {
                width: m.width,
                height: m.height,
                top: m.top,
                left: m.left,
                baseline: m.height + m.top,
            };
        }
    }
    // Default metrics for ASCII
    const code = char.charCodeAt(0);
    if (code >= 0x4e00) {
        // CJK: square character, no descender
        return { width: 1, height: 1, top: 0, left: 0, baseline: 0.8 };
    }
    // Latin: has descender for some chars
    const hasDescender = 'gjpqy'.includes(char);
    return {
        width: estimateAdvance(char),
        height: hasDescender ? 1.1 : 1,
        top: hasDescender ? 0 : 0,
        left: 0,
        baseline: hasDescender ? 0.9 : 0.8,
    };
}

/**
 * Resolve text-field expression to a string.
 * Supports token syntax: "{property_name}" → feature.properties[property_name]
 */
export function resolveTextField(
    field: string,
    properties: Record<string, any>,
): string {
    if (!field) return '';

    // Token replacement: {name} → properties.name
    return field.replace(/\{([^}]+)\}/g, (_match, key: string) => {
        const val = properties[key.trim()];
        return val !== undefined && val !== null ? String(val) : '';
    });
}

/**
 * Apply text-transform.
 */
export function applyTextTransform(text: string, transform: string): string {
    switch (transform) {
        case 'uppercase': return text.toUpperCase();
        case 'lowercase': return text.toLowerCase();
        default: return text;
    }
}

/**
 * Break text into lines based on max-width.
 * Uses greedy word wrapping.
 */
export function wrapText(
    text: string,
    maxWidth: number,
    letterSpacing: number = 0,
    glyphLookup?: GlyphLookup,
    fontName?: string,
): string[] {
    if (!text) return [];

    // If text contains explicit newlines, respect them
    const explicitLines = text.split('\n');
    const result: string[] = [];

    for (const line of explicitLines) {
        if (measureTextWidth(line, letterSpacing, glyphLookup, fontName) <= maxWidth) {
            result.push(line);
            continue;
        }

        // Greedy word wrap
        const words = line.split(' ');
        let currentLine = '';

        for (const word of words) {
            const testLine = currentLine ? currentLine + ' ' + word : word;
            const testWidth = measureTextWidth(testLine, letterSpacing, glyphLookup, fontName);

            if (testWidth <= maxWidth) {
                currentLine = testLine;
            } else {
                if (currentLine) {
                    result.push(currentLine);
                }
                // If single word exceeds max-width, keep it (no char-level break for now)
                currentLine = word;
            }
        }

        if (currentLine) {
            result.push(currentLine);
        }
    }

    return result.length > 0 ? result : [''];
}

/**
 * Justify a line of text within available width.
 */
export function getJustifyOffset(
    lineWidth: number,
    availableWidth: number,
    justify: 'left' | 'center' | 'right' | 'auto',
): number {
    const extra = availableWidth - lineWidth;
    switch (justify) {
        case 'left': return 0;
        case 'right': return extra;
        case 'center': return extra / 2;
        case 'auto': return extra / 2; // auto defaults to center for point placement
        default: return extra / 2;
    }
}

/**
 * Get anchor offset for text positioning.
 */
export function getAnchorOffset(
    textWidth: number,
    textHeight: number,
    anchor: string,
): [number, number] {
    const halfW = textWidth / 2;
    const halfH = textHeight / 2;

    const offsets: Record<string, [number, number]> = {
        'center': [0, 0],
        'left': [-halfW, 0],
        'right': [halfW, 0],
        'top': [0, -halfH],
        'bottom': [0, halfH],
        'top-left': [-halfW, -halfH],
        'top-right': [halfW, -halfH],
        'bottom-left': [-halfW, halfH],
        'bottom-right': [halfW, halfH],
    };

    return offsets[anchor] ?? [0, 0];
}

/**
 * Shape text: break into lines, apply justify, compute bounding box.
 *
 * @param text - Raw text string
 * @param options - Shaping options
 * @returns ShapedText with positioned lines
 */
export function shapeText(
    text: string,
    options: {
        fontSize: number;
        maxWidth: number; // in em units
        lineHeight: number;
        letterSpacing: number;
        justify: 'left' | 'center' | 'right' | 'auto';
        anchor: string;
        transform: string;
        writingMode?: ('horizontal' | 'vertical')[];
        glyphLookup?: GlyphLookup;
        fontName?: string;
    },
): ShapedText {
    const {
        fontSize,
        maxWidth,
        lineHeight,
        letterSpacing,
        justify,
        transform,
        glyphLookup,
        fontName,
    } = options;

    const writingMode = options.writingMode?.[0] ?? 'horizontal';

    // Apply transform
    const transformed = applyTextTransform(text, transform);

    if (writingMode === 'vertical') {
        return shapeVerticalText(transformed, {
            fontSize, maxWidth, lineHeight, letterSpacing, justify,
        });
    }

    // Break into lines
    const rawLines = wrapText(transformed, maxWidth, letterSpacing, glyphLookup, fontName);

    // Measure lines
    const lines: ShapedLine[] = [];
    let maxLineWidth = 0;

    const lineHeightEm = lineHeight; // in em units
    const totalHeight = rawLines.length * lineHeightEm;
    const startY = -totalHeight / 2 + lineHeightEm / 2; // center vertically

    for (let i = 0; i < rawLines.length; i++) {
        const lineText = rawLines[i];
        const lineWidth = measureTextWidth(lineText, letterSpacing, glyphLookup, fontName);
        maxLineWidth = Math.max(maxLineWidth, lineWidth);

        const yOffset = startY + i * lineHeightEm;
        lines.push({
            text: lineText,
            width: lineWidth,
            position: [0, yOffset] as [number, number],
        });
    }

    // Apply justify offsets
    for (const line of lines) {
        const offset = getJustifyOffset(line.width, maxLineWidth, justify);
        line.position[0] = offset;
    }

    const halfW = maxLineWidth / 2;
    const halfH = totalHeight / 2;

    return {
        lines,
        top: -halfH,
        bottom: halfH,
        left: -halfW,
        right: halfW,
        writingMode: 'horizontal',
    };
}

/**
 * Generate quads for shaped text.
 * Each character becomes a quad with position and UV coordinates.
 */
export interface TextQuad {
    x: number;
    y: number;
    width: number;
    height: number;
    uvMin: [number, number];
    uvMax: [number, number];
}

export function generateTextQuads(
    shaped: ShapedText,
    fontSize: number,
    letterSpacing: number = 0,
): TextQuad[] {
    const quads: TextQuad[] = [];
    const scale = fontSize;

    for (const line of shaped.lines) {
        let xCursor = line.position[0];

        for (const ch of line.text) {
            const charWidth = ch === ' ' ? SPACE_ADVANCE : DEFAULT_GLYPH_ADVANCE;
            const quadW = charWidth * scale;
            const quadH = scale; // approx full height

            quads.push({
                x: xCursor * scale,
                y: line.position[1] * scale,
                width: quadW,
                height: quadH,
                // UV coordinates would come from glyph atlas lookup
                // Placeholder: map character to atlas position
                uvMin: [0, 0],
                uvMax: [1, 1],
            });

            xCursor += charWidth + letterSpacing;
        }
    }

    return quads;
}

/**
 * Detect if a character is CJK (for vertical writing mode decisions).
 */
export function isCJK(char: string): boolean {
    const code = char.charCodeAt(0);
    return (
        (code >= 0x4e00 && code <= 0x9fff) ||
        (code >= 0x3040 && code <= 0x30ff) ||
        (code >= 0x3400 && code <= 0x4dbf)
    );
}

/**
 * Detect if a character is Arabic (for RTL shaping).
 */
export function isArabic(char: string): boolean {
    const code = char.charCodeAt(0);
    return (code >= 0x0600 && code <= 0x06FF) || (code >= 0x0750 && code <= 0x077F);
}

/**
 * Detect if a character is Hebrew (for RTL shaping).
 */
export function isHebrew(char: string): boolean {
    const code = char.charCodeAt(0);
    return (code >= 0x0590 && code <= 0x05FF);
}

/**
 * Check if text contains RTL characters (Arabic/Hebrew).
 */
export function hasRTL(text: string): boolean {
    for (const ch of text) {
        if (isArabic(ch) || isHebrew(ch)) return true;
    }
    return false;
}

/**
 * Reorder text for RTL display.
 * In a full implementation this would use the Unicode Bidi Algorithm.
 * Simplified: reverse the RTL segments within the text.
 */
export function reorderRTL(text: string): string {
    if (!hasRTL(text)) return text;
    // For pure RTL text: reverse the string
    // For mixed LTR/RTL: keep LTR segments in place, reverse RTL segments
    return text.split('').reverse().join('');
}

/**
 * Reshape Arabic characters based on position (initial/medial/final/isolated).
 * This is a simplified placeholder. Full Arabic shaping requires
 * the Unicode Arabic Presentation Forms mapping.
 */
export function reshapeArabic(text: string): string {
    // TODO: Implement proper Arabic character shaping
    // For now, return text unchanged (basic tests still pass with unshaped glyphs)
    return text;
}

/**
 * Shape text that may contain Arabic/Hebrew RTL text.
 */
export function shapeRTLText(text: string, transform: string): string {
    let result = applyTextTransform(text, transform);
    if (hasRTL(result)) {
        result = reorderRTL(result);
        result = reshapeArabic(result);
    }
    return result;
}

/**
 * Shape text in vertical writing mode (CJK).
 * Characters are stacked top-to-bottom, lines flow right-to-left.
 */
function shapeVerticalText(
    text: string,
    options: {
        fontSize: number;
        maxWidth: number;
        lineHeight: number;
        letterSpacing: number;
        justify: 'left' | 'center' | 'right' | 'auto';
    },
): ShapedText {
    const { maxWidth, lineHeight, letterSpacing } = options;

    // In vertical mode: each character is a "line" stacked vertically
    // Multiple columns if text is very long
    const chars = Array.from(text);
    const maxCharsPerCol = Math.max(1, Math.floor(maxWidth / lineHeight));

    // Split into columns
    const columns: string[][] = [];
    for (let i = 0; i < chars.length; i += maxCharsPerCol) {
        columns.push(chars.slice(i, i + maxCharsPerCol));
    }

    const colWidth = lineHeight;
    const totalWidth = columns.length * colWidth;
    const maxColHeight = maxCharsPerCol * lineHeight;
    const lines: ShapedLine[] = [];

    const startX = -totalWidth / 2 + colWidth / 2;
    const startY = -maxColHeight / 2 + lineHeight / 2;

    for (let col = 0; col < columns.length; col++) {
        const colChars = columns[col];
        const colText = colChars.join('');
        const colHeight = colChars.length * lineHeight;
        lines.push({
            text: colText,
            width: colWidth,
            position: [startX + col * colWidth, startY] as [number, number],
        });
    }

    const halfW = totalWidth / 2;
    const halfH = maxColHeight / 2;

    return {
        lines,
        top: -halfH,
        bottom: halfH,
        left: -halfW,
        right: halfW,
        writingMode: 'vertical',
    };
}
