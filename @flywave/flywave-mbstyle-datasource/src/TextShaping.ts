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
    const latin = LATIN_ADVANCE[ch];
    if (latin !== undefined) return latin;
    // CJK ideographs and kana are full-width (≈1em square). Treating them as
    // 1.0 instead of the Latin default 0.6 makes line-break widths match the
    // visual square grid used by Mapbox for CJK text shaping.
    if (isCJK(ch)) return 1.0;
    return DEFAULT_GLYPH_ADVANCE;
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
 * Characters that introduce an explicit break opportunity in CJK text
 * (modeled after mapbox's getCanonicalBreakChance in shaping.ts).
 * Even when CJK breaking is disabled, these act as soft break points.
 */
const CJK_BREAK_CHARS = new Set([
    '\u3000', // ideographic space
    '\u3001', // ideographic comma
    '\u3002', // ideographic full stop
    '\uFF0C', // fullwidth comma
    '\uFF0E', // fullwidth full stop
    '\uFF1A', // fullwidth colon
    '\uFF1B', // fullwidth semicolon
    '\uFF1F', // fullwidth question mark
    '\uFF01', // fullwidth exclamation mark
]);

/**
 * A token is an atomic unit considered during line breaking.
 * For Latin text a token is a run of non-space characters (a "word").
 * For CJK text each ideographic character is its own token.
 *
 * `leadingSep` is the whitespace (or empty string) that should appear
 * *before* this token when joined onto a non-empty line — this lets us
 * preserve the original spacing without emitting double spaces.
 */
interface BreakToken {
    text: string;
    /** Whether a line break is permitted *after* this token. */
    canBreakAfter: boolean;
    /** Separator (e.g. ' ') to insert before this token on a continued line. */
    leadingSep: string;
}

/**
 * Tokenize a line into break-opportunity units. CJK characters each become
 * individual tokens (so any CJK char is a valid break point), while Latin
 * runs are kept as whole words separated by spaces.
 */
function tokenizeForBreak(line: string): BreakToken[] {
    const tokens: BreakToken[] = [];
    let buf = '';
    let pendingSep = '';

    const flushWord = () => {
        if (buf) {
            tokens.push({ text: buf, canBreakAfter: false, leadingSep: pendingSep });
            buf = '';
            pendingSep = '';
        }
    };

    for (const ch of line) {
        if (ch === ' ') {
            flushWord();
            pendingSep = ' '; // a space attaches to the next word as its separator
        } else if (isCJK(ch) || CJK_BREAK_CHARS.has(ch)) {
            flushWord();
            // A CJK ideograph is its own token; breaking is allowed after it.
            // It does not need a space separator before it.
            tokens.push({ text: ch, canBreakAfter: true, leadingSep: pendingSep });
            pendingSep = '';
        } else {
            buf += ch;
        }
    }
    flushWord();
    return tokens;
}

/**
 * Break text into lines based on max-width.
 *
 * Algorithm:
 *  1. Each CJK ideograph is an independent break opportunity (matches Mapbox
 *     behavior — CJK has no inter-word spaces).
 *  2. Latin text uses greedy word wrapping on space boundaries.
 *  3. A single word longer than maxWidth is broken at character boundaries
 *     (char-level fallback), so overlong tokens no longer overflow.
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

        const tokens = tokenizeForBreak(line);
        let currentLine = '';

        for (let i = 0; i < tokens.length; i++) {
            const tok = tokens[i];
            const candidate = currentLine + tok.leadingSep + tok.text;
            const candidateWidth = measureTextWidth(candidate, letterSpacing, glyphLookup, fontName);

            if (candidateWidth <= maxWidth) {
                currentLine = candidate;
                if (tok.canBreakAfter && i < tokens.length - 1) {
                    // Peek: if the next token would overflow, break here.
                    const next = tokens[i + 1];
                    const probe = currentLine + next.leadingSep + next.text;
                    if (measureTextWidth(probe, letterSpacing, glyphLookup, fontName) > maxWidth) {
                        result.push(currentLine);
                        currentLine = '';
                    }
                }
            } else {
                // Token doesn't fit on the current line.
                if (currentLine) {
                    result.push(currentLine);
                    currentLine = '';
                }
                // Try the token alone on a fresh line (drop its leading separator).
                const tokWidth = measureTextWidth(tok.text, letterSpacing, glyphLookup, fontName);
                if (tokWidth <= maxWidth) {
                    currentLine = tok.text;
                } else {
                    // Single token overflows: char-level break fallback so the
                    // word does not spill past maxWidth indefinitely.
                    currentLine = breakOverlongWord(tok.text, maxWidth, letterSpacing, glyphLookup, fontName, result);
                }
            }
        }

        if (currentLine) {
            result.push(currentLine);
        }
    }

    return result.length > 0 ? result : [''];
}

/**
 * Break a single overlong word character-by-character, pushing each filled
 * line into `out` and returning the leftover remainder as the active line.
 */
function breakOverlongWord(
    word: string,
    maxWidth: number,
    letterSpacing: number,
    glyphLookup: GlyphLookup | undefined,
    fontName: string | undefined,
    out: string[],
): string {
    let line = '';
    for (const ch of Array.from(word)) {
        const candidate = line + ch;
        const w = measureTextWidth(candidate, letterSpacing, glyphLookup, fontName);
        if (w <= maxWidth) {
            line = candidate;
        } else {
            if (line) out.push(line);
            line = ch;
        }
    }
    return line;
}

/**
 * Justify a line of text within available width.
 *
 * For `justify: 'auto'`, mgl resolves by the anchor's OWN direction
 * (getAnchorJustification): left anchors left-justify, right anchors
 * right-justify, everything else centers.
 */
export function getJustifyOffset(
    lineWidth: number,
    availableWidth: number,
    justify: 'left' | 'center' | 'right' | 'auto',
    anchor?: string,
): number {
    const extra = availableWidth - lineWidth;
    let effective = justify;
    if (justify === 'auto') {
        // mgl semantics: 'auto' resolves via getAnchorJustification
        // (symbol_layout_shared.ts) — SAME-direction (a left anchor
        // LEFT-justifies so the text grows right of the anchor, combined
        // with align's shiftX = (justify − hAlign)·maxLineLength), and
        // centers for non-horizontal anchors / plain shaping (shaping's
        // justify ternary maps anything but left/right to 0.5).
        switch (anchor) {
            case 'left':
            case 'top-left':
            case 'bottom-left':
                effective = 'left';
                break;
            case 'right':
            case 'top-right':
            case 'bottom-right':
                effective = 'right';
                break;
            default:
                effective = 'center';
        }
    }
    switch (effective) {
        case 'left': return 0;
        case 'right': return extra;
        case 'center': return extra / 2;
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
        anchor,
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
        const offset = getJustifyOffset(line.width, maxLineWidth, justify, anchor);
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
 * Covers both the base Arabic block and the Arabic Presentation Forms
 * (A and B) so that already-shaped text remains recognizable as Arabic.
 */
export function isArabic(char: string): boolean {
    const code = char.codePointAt(0) ?? 0;
    return (code >= 0x0600 && code <= 0x06FF) ||   // Arabic
           (code >= 0x0750 && code <= 0x077F) ||   // Arabic Supplement
           (code >= 0xFB50 && code <= 0xFDFF) ||   // Arabic Presentation Forms-A
           (code >= 0xFE70 && code <= 0xFEFF);     // Arabic Presentation Forms-B
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
 *
 * Dispatches to a simplified UAX#9 Unicode Bidirectional Algorithm
 * (`BidiAlgorithm.uax9Reorder`), which handles mixed LTR/RTL text including
 * numbers and neutrals correctly. For pure-Latin input (no Arabic/Hebrew
 * characters), returns the input unchanged via a fast path so there's no
 * performance cost for the common case.
 *
 * If the algorithm module fails to load for any reason, falls back to the
 * previous run-based reverse.
 */
export function reorderRTL(text: string): string {
    if (!hasRTL(text)) return text;
    try {
        // Lazy-require to avoid a static import cycle (BidiAlgorithm doesn't
        // import from TextShaping, but the deferred load keeps the module
        // graph clean and lets pure-LTR callers skip the cost entirely).
        const { uax9Reorder } = require('./BidiAlgorithm');
        return uax9Reorder(text) as string;
    } catch {
        // Fallback: run-based reverse (split into LTR/RTL runs, reverse each
        // RTL run, reverse the run sequence).
        return fallbackReorderRTL(text);
    }
}

/** Run-based Bidi fallback used only if BidiAlgorithm fails to load. */
function fallbackReorderRTL(text: string): string {
    if (!hasRTL(text)) return text;

    interface Run { text: string; rtl: boolean; }
    const runs: Run[] = [];
    let buf = '';
    let bufRtl = false;
    for (const ch of Array.from(text)) {
        const rtl = isArabic(ch) || isHebrew(ch);
        if (buf && rtl === bufRtl) {
            buf += ch;
        } else {
            if (buf) runs.push({ text: buf, rtl: bufRtl });
            buf = ch;
            bufRtl = rtl;
        }
    }
    if (buf) runs.push({ text: buf, rtl: bufRtl });

    const processed = runs.map((r) => r.rtl ? Array.from(r.text).reverse().join('') : r.text);
    return processed.reverse().join('');
}

/**
 * Arabic letter joining information. Each entry maps a base Arabic letter
 * (U+0600..U+06FF) to its four contextual Presentation Forms:
 *   [isolated, final, initial, medial]
 * drawn from the Arabic Presentation Forms-A / Forms-B blocks.
 *
 * Reference: Unicode 15.0, ArabicSHaping.txt + context-based selection rules.
 * The table covers the letters that actually appear in modern Arabic text;
 * rare letters/ligatures fall through and stay unchanged.
 */
const ARABIC_PRESENTATION_FORMS: Record<number, [number, number, number, number]> = {
    0x0621: [0xFE80, 0xFE80, 0xFE80, 0xFE80], // HAMZA
    0x0622: [0xFE81, 0xFE82, 0xFE81, 0xFE82], // ALEF WITH MADDA ABOVE
    0x0623: [0xFE83, 0xFE84, 0xFE83, 0xFE84], // ALEF WITH HAMZA ABOVE
    0x0624: [0xFE85, 0xFE86, 0xFE85, 0xFE86], // WAW WITH HAMZA ABOVE
    0x0625: [0xFE87, 0xFE88, 0xFE87, 0xFE88], // ALEF WITH HAMZA BELOW
    0x0626: [0xFE89, 0xFE8A, 0xFE8B, 0xFE8C], // YEH WITH HAMZA ABOVE
    0x0627: [0xFE8D, 0xFE8E, 0xFE8D, 0xFE8E], // ALEF
    0x0628: [0xFE8F, 0xFE90, 0xFE91, 0xFE92], // BEH
    0x0629: [0xFE93, 0xFE94, 0xFE93, 0xFE94], // TEH MARBUTA
    0x062A: [0xFE95, 0xFE96, 0xFE97, 0xFE98], // TEH
    0x062B: [0xFE99, 0xFE9A, 0xFE9B, 0xFE9C], // THEH
    0x062C: [0xFE9D, 0xFE9E, 0xFE9F, 0xFEA0], // JEEM
    0x062D: [0xFEA1, 0xFEA2, 0xFEA3, 0xFEA4], // HAH
    0x062E: [0xFEA5, 0xFEA6, 0xFEA7, 0xFEA8], // KHAH
    0x062F: [0xFEA9, 0xFEAA, 0xFEA9, 0xFEAA], // DAL
    0x0630: [0xFEAB, 0xFEAC, 0xFEAB, 0xFEAC], // THAL
    0x0631: [0xFEAD, 0xFEAE, 0xFEAD, 0xFEAE], // REH
    0x0632: [0xFEAF, 0xFEB0, 0xFEAF, 0xFEB0], // ZAIN
    0x0633: [0xFEB1, 0xFEB2, 0xFEB3, 0xFEB4], // SEEN
    0x0634: [0xFEB5, 0xFEB6, 0xFEB7, 0xFEB8], // SHEEN
    0x0635: [0xFEB9, 0xFEBA, 0xFEBB, 0xFEBC], // SAD
    0x0636: [0xFEBD, 0xFEBE, 0xFEBF, 0xFEC0], // DAD
    0x0637: [0xFEC1, 0xFEC2, 0xFEC3, 0xFEC4], // TAH
    0x0638: [0xFEC5, 0xFEC6, 0xFEC7, 0xFEC8], // ZAH
    0x0639: [0xFEC9, 0xFECA, 0xFECB, 0xFECC], // AIN
    0x063A: [0xFECD, 0xFECE, 0xFECF, 0xFED0], // GHAIN
    0x0641: [0xFED1, 0xFED2, 0xFED3, 0xFED4], // FEH
    0x0642: [0xFED5, 0xFED6, 0xFED7, 0xFED8], // QAF
    0x0643: [0xFED9, 0xFEDA, 0xFEDB, 0xFEDC], // KAF
    0x0644: [0xFEDD, 0xFEDE, 0xFEDF, 0xFEE0], // LAM
    0x0645: [0xFEE1, 0xFEE2, 0xFEE3, 0xFEE4], // MEEM
    0x0646: [0xFEE5, 0xFEE6, 0xFEE7, 0xFEE8], // NOON
    0x0647: [0xFEE9, 0xFEEA, 0xFEEB, 0xFEEC], // HEH
    0x0648: [0xFEED, 0xFEEE, 0xFEED, 0xFEEE], // WAW
    0x0649: [0xFEEF, 0xFEF0, 0xFBE8, 0xFBE9], // ALEF MAKSURA
    0x064A: [0xFEF1, 0xFEF2, 0xFEF3, 0xFEF4], // YEH
    // LAM-ALEF ligatures (two source code points collapse to one presentation form)
    // Handled specially below.
};

/**
 * Set of Arabic letters that can join with a following letter (i.e. their
 * *initial* and *medial* forms exist). Letters not in this set only ever
 * take isolated or final forms.
 */
const ARABIC_JOINERS = new Set<number>([
    0x0626, 0x0628, 0x062A, 0x062B, 0x062C, 0x062D, 0x062E,
    0x0633, 0x0634, 0x0635, 0x0636, 0x0637, 0x0638, 0x0639, 0x063A,
    0x0641, 0x0642, 0x0643, 0x0644, 0x0645, 0x0646, 0x0647, 0x0649, 0x064A,
]);

/**
 * Reshape Arabic characters based on position (initial/medial/final/isolated)
 * using the Unicode Arabic Presentation Forms mapping. Non-Arabic characters
 * are passed through unchanged. The input must already be in *visual* order
 * (i.e. after `reorderRTL`).
 */
export function reshapeArabic(text: string): string {
    if (!text) return text;
    const chars = Array.from(text);
    const out: string[] = new Array(chars.length);

    for (let i = 0; i < chars.length; i++) {
        const code = chars[i].codePointAt(0)!;

        // LAM-ALEF ligatures take priority over the per-letter form table:
        // LAM (0x0644) followed by an ALEF variant collapses to a single
        // Presentation Form glyph, consuming both source code points.
        if (code === 0x0644 && i + 1 < chars.length) {
            const next = chars[i + 1].codePointAt(0)!;
            let ligature: number | undefined;
            if (next === 0x0622) ligature = 0xFEF6;       // LAM + ALEF MADDA ABOVE
            else if (next === 0x0623) ligature = 0xFEF8;   // LAM + ALEF HAMZA ABOVE
            else if (next === 0x0625) ligature = 0xFEFA;   // LAM + ALEF HAMZA BELOW
            else if (next === 0x0627) ligature = 0xFEFC;   // LAM + ALEF
            if (ligature !== undefined) {
                out[i] = String.fromCodePoint(ligature);
                out[i + 1] = ''; // collapse the ALEF half
                i++;
                continue;
            }
        }

        const forms = ARABIC_PRESENTATION_FORMS[code];
        if (!forms) {
            out[i] = chars[i];
            continue;
        }

        const prevJoins = i > 0 && joinsBefore(chars[i - 1]);
        const nextJoins = i < chars.length - 1 && joinsAfter(code, chars[i + 1]);

        let idx: number;
        if (prevJoins && nextJoins) idx = 3;       // medial
        else if (prevJoins) idx = 1;                // final
        else if (nextJoins) idx = 2;                // initial
        else idx = 0;                               // isolated
        out[i] = String.fromCodePoint(forms[idx]);
    }
    return out.join('');
}

/** Whether the previous character ends in a shape that joins to the next. */
function joinsBefore(prevChar: string): boolean {
    const code = prevChar.codePointAt(0)!;
    return ARABIC_JOINERS.has(code) ||
        code === 0x0640 /* TATWEEL */ ||
        // Presentation Forms that are themselves medial/initial keep joining.
        (code >= 0xFE8F && code <= 0xFEF4);
}

/** Whether the current letter can join forward to the next character. */
function joinsAfter(curCode: number, _nextChar: string): boolean {
    return ARABIC_JOINERS.has(curCode) || curCode === 0x0640;
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
