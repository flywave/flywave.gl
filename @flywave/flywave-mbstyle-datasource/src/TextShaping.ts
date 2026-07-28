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

const DEFAULT_GLYPH_ADVANCE = 0.6; // em units per character
const SPACE_ADVANCE = 0.3;

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
 * Measure approximate text width in em units.
 */
export function measureTextWidth(
    text: string,
    letterSpacing: number = 0,
): number {
    let width = 0;
    for (const ch of text) {
        if (ch === ' ') {
            width += SPACE_ADVANCE;
        } else {
            width += DEFAULT_GLYPH_ADVANCE;
        }
    }
    // Add letter spacing between characters
    width += letterSpacing * Math.max(0, text.length - 1);
    return width;
}

/**
 * Break text into lines based on max-width.
 * Uses greedy word wrapping.
 */
export function wrapText(
    text: string,
    maxWidth: number,
    letterSpacing: number = 0,
): string[] {
    if (!text) return [];

    // If text contains explicit newlines, respect them
    const explicitLines = text.split('\n');
    const result: string[] = [];

    for (const line of explicitLines) {
        if (measureTextWidth(line, letterSpacing) <= maxWidth) {
            result.push(line);
            continue;
        }

        // Greedy word wrap
        const words = line.split(' ');
        let currentLine = '';

        for (const word of words) {
            const testLine = currentLine ? currentLine + ' ' + word : word;
            const testWidth = measureTextWidth(testLine, letterSpacing);

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
    },
): ShapedText {
    const {
        fontSize,
        maxWidth,
        lineHeight,
        letterSpacing,
        justify,
        transform,
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
    const rawLines = wrapText(transformed, maxWidth, letterSpacing);

    // Measure lines
    const lines: ShapedLine[] = [];
    let maxLineWidth = 0;

    const lineHeightEm = lineHeight; // in em units
    const totalHeight = rawLines.length * lineHeightEm;
    const startY = -totalHeight / 2 + lineHeightEm / 2; // center vertically

    for (let i = 0; i < rawLines.length; i++) {
        const lineText = rawLines[i];
        const lineWidth = measureTextWidth(lineText, letterSpacing);
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
        (code >= 0x4e00 && code <= 0x9fff) ||   // CJK Unified Ideographs
        (code >= 0x3040 && code <= 0x30ff) ||   // Hiragana + Katakana
        (code >= 0x3400 && code <= 0x4dbf)      // CJK Extension A
    );
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
