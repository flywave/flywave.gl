"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.measureTextWidth = measureTextWidth;
exports.getGlyphMetrics = getGlyphMetrics;
exports.resolveTextField = resolveTextField;
exports.applyTextTransform = applyTextTransform;
exports.wrapText = wrapText;
exports.getJustifyOffset = getJustifyOffset;
exports.getAnchorOffset = getAnchorOffset;
exports.shapeText = shapeText;
exports.generateTextQuads = generateTextQuads;
exports.isCJK = isCJK;
exports.isArabic = isArabic;
exports.isHebrew = isHebrew;
exports.hasRTL = hasRTL;
exports.reorderRTL = reorderRTL;
exports.reshapeArabic = reshapeArabic;
exports.shapeRTLText = shapeRTLText;
const DEFAULT_GLYPH_ADVANCE = 0.6;
const SPACE_ADVANCE = 0.3;
const LATIN_ADVANCE = {
    i: 0.28, j: 0.28, l: 0.28, t: 0.31, f: 0.33, r: 0.38,
    I: 0.33, J: 0.39,
    '1': 0.33, '.': 0.28, ',': 0.28, ':': 0.28, ';': 0.28,
    '\'': 0.22, '"': 0.38, '!': 0.28, '|': 0.28, '(': 0.33, ')': 0.33,
    c: 0.5, s: 0.5, a: 0.55, e: 0.55, g: 0.55, n: 0.55, o: 0.55,
    p: 0.55, q: 0.55, u: 0.55, v: 0.5, x: 0.5, z: 0.5, b: 0.55, d: 0.55,
    h: 0.55, k: 0.55,
    '2': 0.55, '3': 0.55, '4': 0.55, '5': 0.55, '6': 0.55, '7': 0.5, '8': 0.55, '9': 0.55, '0': 0.55,
    C: 0.72, G: 0.78, L: 0.61, E: 0.61, F: 0.56, P: 0.61, S: 0.61, T: 0.61,
    Z: 0.61, B: 0.68, D: 0.72, H: 0.72, K: 0.67, N: 0.72, R: 0.67, U: 0.72,
    V: 0.67, X: 0.67, Y: 0.61, A: 0.67, '-': 0.39, '/': 0.33, '+': 0.58,
    '=': 0.58, '*': 0.44, '&': 0.67, '%': 0.83, '#': 0.58, '@': 0.86,
    m: 0.84, w: 0.78, M: 0.83, W: 0.94, O: 0.78, Q: 0.78,
};
function estimateAdvance(ch) {
    const latin = LATIN_ADVANCE[ch];
    if (latin !== undefined)
        return latin;
    if (isCJK(ch))
        return 1.0;
    return DEFAULT_GLYPH_ADVANCE;
}
function measureTextWidth(text, letterSpacing = 0, glyphLookup, fontName) {
    if (!text)
        return 0;
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
        }
        else {
            width += estimateAdvance(ch);
        }
    }
    width += letterSpacing * Math.max(0, text.length - 1);
    return width;
}
function getGlyphMetrics(char, glyphLookup, fontName) {
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
    const code = char.charCodeAt(0);
    if (code >= 0x4e00) {
        return { width: 1, height: 1, top: 0, left: 0, baseline: 0.8 };
    }
    const hasDescender = 'gjpqy'.includes(char);
    return {
        width: estimateAdvance(char),
        height: hasDescender ? 1.1 : 1,
        top: hasDescender ? 0 : 0,
        left: 0,
        baseline: hasDescender ? 0.9 : 0.8,
    };
}
function resolveTextField(field, properties) {
    if (!field)
        return '';
    return field.replace(/\{([^}]+)\}/g, (_match, key) => {
        const val = properties[key.trim()];
        return val !== undefined && val !== null ? String(val) : '';
    });
}
function applyTextTransform(text, transform) {
    switch (transform) {
        case 'uppercase': return text.toUpperCase();
        case 'lowercase': return text.toLowerCase();
        default: return text;
    }
}
const CJK_BREAK_CHARS = new Set([
    '\u3000',
    '\u3001',
    '\u3002',
    '\uFF0C',
    '\uFF0E',
    '\uFF1A',
    '\uFF1B',
    '\uFF1F',
    '\uFF01',
]);
function tokenizeForBreak(line) {
    const tokens = [];
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
            pendingSep = ' ';
        }
        else if (isCJK(ch) || CJK_BREAK_CHARS.has(ch)) {
            flushWord();
            tokens.push({ text: ch, canBreakAfter: true, leadingSep: pendingSep });
            pendingSep = '';
        }
        else {
            buf += ch;
        }
    }
    flushWord();
    return tokens;
}
function wrapText(text, maxWidth, letterSpacing = 0, glyphLookup, fontName) {
    if (!text)
        return [];
    const explicitLines = text.split('\n');
    const result = [];
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
                    const next = tokens[i + 1];
                    const probe = currentLine + next.leadingSep + next.text;
                    if (measureTextWidth(probe, letterSpacing, glyphLookup, fontName) > maxWidth) {
                        result.push(currentLine);
                        currentLine = '';
                    }
                }
            }
            else {
                if (currentLine) {
                    result.push(currentLine);
                    currentLine = '';
                }
                const tokWidth = measureTextWidth(tok.text, letterSpacing, glyphLookup, fontName);
                if (tokWidth <= maxWidth) {
                    currentLine = tok.text;
                }
                else {
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
function breakOverlongWord(word, maxWidth, letterSpacing, glyphLookup, fontName, out) {
    let line = '';
    for (const ch of Array.from(word)) {
        const candidate = line + ch;
        const w = measureTextWidth(candidate, letterSpacing, glyphLookup, fontName);
        if (w <= maxWidth) {
            line = candidate;
        }
        else {
            if (line)
                out.push(line);
            line = ch;
        }
    }
    return line;
}
function getJustifyOffset(lineWidth, availableWidth, justify, anchor) {
    const extra = availableWidth - lineWidth;
    let effective = justify;
    if (justify === 'auto') {
        switch (anchor) {
            case 'left':
            case 'top-left':
            case 'bottom-left':
                effective = 'right';
                break;
            case 'right':
            case 'top-right':
            case 'bottom-right':
                effective = 'left';
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
function getAnchorOffset(textWidth, textHeight, anchor) {
    var _a;
    const halfW = textWidth / 2;
    const halfH = textHeight / 2;
    const offsets = {
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
    return (_a = offsets[anchor]) !== null && _a !== void 0 ? _a : [0, 0];
}
function shapeText(text, options) {
    var _a, _b;
    const { fontSize, maxWidth, lineHeight, letterSpacing, justify, anchor, transform, glyphLookup, fontName, } = options;
    const writingMode = (_b = (_a = options.writingMode) === null || _a === void 0 ? void 0 : _a[0]) !== null && _b !== void 0 ? _b : 'horizontal';
    const transformed = applyTextTransform(text, transform);
    if (writingMode === 'vertical') {
        return shapeVerticalText(transformed, {
            fontSize, maxWidth, lineHeight, letterSpacing, justify,
        });
    }
    const rawLines = wrapText(transformed, maxWidth, letterSpacing, glyphLookup, fontName);
    const lines = [];
    let maxLineWidth = 0;
    const lineHeightEm = lineHeight;
    const totalHeight = rawLines.length * lineHeightEm;
    const startY = -totalHeight / 2 + lineHeightEm / 2;
    for (let i = 0; i < rawLines.length; i++) {
        const lineText = rawLines[i];
        const lineWidth = measureTextWidth(lineText, letterSpacing, glyphLookup, fontName);
        maxLineWidth = Math.max(maxLineWidth, lineWidth);
        const yOffset = startY + i * lineHeightEm;
        lines.push({
            text: lineText,
            width: lineWidth,
            position: [0, yOffset],
        });
    }
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
function generateTextQuads(shaped, fontSize, letterSpacing = 0) {
    const quads = [];
    const scale = fontSize;
    for (const line of shaped.lines) {
        let xCursor = line.position[0];
        for (const ch of line.text) {
            const charWidth = ch === ' ' ? SPACE_ADVANCE : DEFAULT_GLYPH_ADVANCE;
            const quadW = charWidth * scale;
            const quadH = scale;
            quads.push({
                x: xCursor * scale,
                y: line.position[1] * scale,
                width: quadW,
                height: quadH,
                uvMin: [0, 0],
                uvMax: [1, 1],
            });
            xCursor += charWidth + letterSpacing;
        }
    }
    return quads;
}
function isCJK(char) {
    const code = char.charCodeAt(0);
    return ((code >= 0x4e00 && code <= 0x9fff) ||
        (code >= 0x3040 && code <= 0x30ff) ||
        (code >= 0x3400 && code <= 0x4dbf));
}
function isArabic(char) {
    var _a;
    const code = (_a = char.codePointAt(0)) !== null && _a !== void 0 ? _a : 0;
    return (code >= 0x0600 && code <= 0x06FF) ||
        (code >= 0x0750 && code <= 0x077F) ||
        (code >= 0xFB50 && code <= 0xFDFF) ||
        (code >= 0xFE70 && code <= 0xFEFF);
}
function isHebrew(char) {
    const code = char.charCodeAt(0);
    return (code >= 0x0590 && code <= 0x05FF);
}
function hasRTL(text) {
    for (const ch of text) {
        if (isArabic(ch) || isHebrew(ch))
            return true;
    }
    return false;
}
function reorderRTL(text) {
    if (!hasRTL(text))
        return text;
    try {
        const { uax9Reorder } = require('./BidiAlgorithm');
        return uax9Reorder(text);
    }
    catch (_a) {
        return fallbackReorderRTL(text);
    }
}
function fallbackReorderRTL(text) {
    if (!hasRTL(text))
        return text;
    const runs = [];
    let buf = '';
    let bufRtl = false;
    for (const ch of Array.from(text)) {
        const rtl = isArabic(ch) || isHebrew(ch);
        if (buf && rtl === bufRtl) {
            buf += ch;
        }
        else {
            if (buf)
                runs.push({ text: buf, rtl: bufRtl });
            buf = ch;
            bufRtl = rtl;
        }
    }
    if (buf)
        runs.push({ text: buf, rtl: bufRtl });
    const processed = runs.map((r) => r.rtl ? Array.from(r.text).reverse().join('') : r.text);
    return processed.reverse().join('');
}
const ARABIC_PRESENTATION_FORMS = {
    0x0621: [0xFE80, 0xFE80, 0xFE80, 0xFE80],
    0x0622: [0xFE81, 0xFE82, 0xFE81, 0xFE82],
    0x0623: [0xFE83, 0xFE84, 0xFE83, 0xFE84],
    0x0624: [0xFE85, 0xFE86, 0xFE85, 0xFE86],
    0x0625: [0xFE87, 0xFE88, 0xFE87, 0xFE88],
    0x0626: [0xFE89, 0xFE8A, 0xFE8B, 0xFE8C],
    0x0627: [0xFE8D, 0xFE8E, 0xFE8D, 0xFE8E],
    0x0628: [0xFE8F, 0xFE90, 0xFE91, 0xFE92],
    0x0629: [0xFE93, 0xFE94, 0xFE93, 0xFE94],
    0x062A: [0xFE95, 0xFE96, 0xFE97, 0xFE98],
    0x062B: [0xFE99, 0xFE9A, 0xFE9B, 0xFE9C],
    0x062C: [0xFE9D, 0xFE9E, 0xFE9F, 0xFEA0],
    0x062D: [0xFEA1, 0xFEA2, 0xFEA3, 0xFEA4],
    0x062E: [0xFEA5, 0xFEA6, 0xFEA7, 0xFEA8],
    0x062F: [0xFEA9, 0xFEAA, 0xFEA9, 0xFEAA],
    0x0630: [0xFEAB, 0xFEAC, 0xFEAB, 0xFEAC],
    0x0631: [0xFEAD, 0xFEAE, 0xFEAD, 0xFEAE],
    0x0632: [0xFEAF, 0xFEB0, 0xFEAF, 0xFEB0],
    0x0633: [0xFEB1, 0xFEB2, 0xFEB3, 0xFEB4],
    0x0634: [0xFEB5, 0xFEB6, 0xFEB7, 0xFEB8],
    0x0635: [0xFEB9, 0xFEBA, 0xFEBB, 0xFEBC],
    0x0636: [0xFEBD, 0xFEBE, 0xFEBF, 0xFEC0],
    0x0637: [0xFEC1, 0xFEC2, 0xFEC3, 0xFEC4],
    0x0638: [0xFEC5, 0xFEC6, 0xFEC7, 0xFEC8],
    0x0639: [0xFEC9, 0xFECA, 0xFECB, 0xFECC],
    0x063A: [0xFECD, 0xFECE, 0xFECF, 0xFED0],
    0x0641: [0xFED1, 0xFED2, 0xFED3, 0xFED4],
    0x0642: [0xFED5, 0xFED6, 0xFED7, 0xFED8],
    0x0643: [0xFED9, 0xFEDA, 0xFEDB, 0xFEDC],
    0x0644: [0xFEDD, 0xFEDE, 0xFEDF, 0xFEE0],
    0x0645: [0xFEE1, 0xFEE2, 0xFEE3, 0xFEE4],
    0x0646: [0xFEE5, 0xFEE6, 0xFEE7, 0xFEE8],
    0x0647: [0xFEE9, 0xFEEA, 0xFEEB, 0xFEEC],
    0x0648: [0xFEED, 0xFEEE, 0xFEED, 0xFEEE],
    0x0649: [0xFEEF, 0xFEF0, 0xFBE8, 0xFBE9],
    0x064A: [0xFEF1, 0xFEF2, 0xFEF3, 0xFEF4],
};
const ARABIC_JOINERS = new Set([
    0x0626, 0x0628, 0x062A, 0x062B, 0x062C, 0x062D, 0x062E,
    0x0633, 0x0634, 0x0635, 0x0636, 0x0637, 0x0638, 0x0639, 0x063A,
    0x0641, 0x0642, 0x0643, 0x0644, 0x0645, 0x0646, 0x0647, 0x0649, 0x064A,
]);
function reshapeArabic(text) {
    if (!text)
        return text;
    const chars = Array.from(text);
    const out = new Array(chars.length);
    for (let i = 0; i < chars.length; i++) {
        const code = chars[i].codePointAt(0);
        if (code === 0x0644 && i + 1 < chars.length) {
            const next = chars[i + 1].codePointAt(0);
            let ligature;
            if (next === 0x0622)
                ligature = 0xFEF6;
            else if (next === 0x0623)
                ligature = 0xFEF8;
            else if (next === 0x0625)
                ligature = 0xFEFA;
            else if (next === 0x0627)
                ligature = 0xFEFC;
            if (ligature !== undefined) {
                out[i] = String.fromCodePoint(ligature);
                out[i + 1] = '';
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
        let idx;
        if (prevJoins && nextJoins)
            idx = 3;
        else if (prevJoins)
            idx = 1;
        else if (nextJoins)
            idx = 2;
        else
            idx = 0;
        out[i] = String.fromCodePoint(forms[idx]);
    }
    return out.join('');
}
function joinsBefore(prevChar) {
    const code = prevChar.codePointAt(0);
    return ARABIC_JOINERS.has(code) ||
        code === 0x0640 ||
        (code >= 0xFE8F && code <= 0xFEF4);
}
function joinsAfter(curCode, _nextChar) {
    return ARABIC_JOINERS.has(curCode) || curCode === 0x0640;
}
function shapeRTLText(text, transform) {
    let result = applyTextTransform(text, transform);
    if (hasRTL(result)) {
        result = reorderRTL(result);
        result = reshapeArabic(result);
    }
    return result;
}
function shapeVerticalText(text, options) {
    const { maxWidth, lineHeight, letterSpacing } = options;
    const chars = Array.from(text);
    const maxCharsPerCol = Math.max(1, Math.floor(maxWidth / lineHeight));
    const columns = [];
    for (let i = 0; i < chars.length; i += maxCharsPerCol) {
        columns.push(chars.slice(i, i + maxCharsPerCol));
    }
    const colWidth = lineHeight;
    const totalWidth = columns.length * colWidth;
    const maxColHeight = maxCharsPerCol * lineHeight;
    const lines = [];
    const startX = -totalWidth / 2 + colWidth / 2;
    const startY = -maxColHeight / 2 + lineHeight / 2;
    for (let col = 0; col < columns.length; col++) {
        const colChars = columns[col];
        const colText = colChars.join('');
        const colHeight = colChars.length * lineHeight;
        lines.push({
            text: colText,
            width: colWidth,
            position: [startX + col * colWidth, startY],
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
//# sourceMappingURL=TextShaping.js.map