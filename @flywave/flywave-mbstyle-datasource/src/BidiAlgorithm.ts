/**
 * Simplified Unicode Bidirectional Algorithm (UAX#9).
 *
 * Implements the core rules of the Unicode Bidi Algorithm without explicit
 * embedding / isolation controls (X1-X10, which are rare in map labels).
 * The result correctly orders mixed LTR/RTL text including numbers and
 * neutrals, which the previous "whole-string reverse" / "run-based" stubs
 * got wrong for inputs like "abc 123 دينار" or " Café → شارع 5 ".
 *
 * Pipeline (per UAX#9 §3.3-3.4):
 *   P1-P3  paragraph level (LTR or RTL based on first strong char)
 *   X9     removed (no explicit embeddings to clear)
 *   W1-W7  weak-type resolution (EN, AN, ES, ET, CS, NSM, BN)
 *   N0-N2  neutral-type resolution (B, S, WS, ON)
 *   I1-I2  implicit-level assignment
 *   L1-L4  (partial) line / whitespace reset
 *   Reorder by level
 *
 * Reference: https://www.unicode.org/reports/tr9/
 */

const enum BidiType {
    L = 0,    // Left-to-right (Latin letters, CJK)
    R = 1,    // Right-to-left (Hebrew, Arabic bases)
    AL = 2,   // Right-to-left Arabic
    EN = 3,   // European Number (0-9)
    AN = 4,   // Arabic Number (Arabic-Indic digits)
    ES = 5,   // European Separator (+, -)
    ET = 6,   // European Terminator (#, $, %, etc.)
    CS = 7,   // Common Separator (,, ., /, :)
    NSM = 8,  // Nonspacing Mark
    BN = 9,   // Boundary Neutral
    B = 10,   // Paragraph Separator
    S = 11,   // Segment Separator (tab, newline)
    WS = 12,  // Whitespace
    ON = 13,  // Other Neutral (most punctuation)
    LRE = 14, // Left-to-Right Embedding
    LRO = 15, // Left-to-Right Override
    RLE = 16, // Right-to-Left Embedding
    RLO = 17, // Right-to-Left Override
    PDF = 18, // Pop Directional Format
    LRI = 19, // Left-to-Right Isolate
    RLI = 20, // Right-to-Left Isolate
    FSI = 21, // First Strong Isolate
    PDI = 22, // Pop Directional Isolate
}

/**
 * Classify a code point into its UAX#9 bidi type. This is a coarse
 * approximation that covers the scripts most likely to appear in map labels
 * (Latin, CJK, Arabic, Hebrew, common punctuation). Characters outside the
 * covered ranges default to L (which matches typical Latin text contexts).
 */
function classifyChar(code: number): BidiType {
    // Hebrew
    if (code >= 0x0590 && code <= 0x05FF) return BidiType.R;
    if (code >= 0xFB1D && code <= 0xFB4F) return BidiType.R;
    // Arabic / Arabic presentation forms
    if (code >= 0x0600 && code <= 0x06FF) {
        // Arabic-Indic digits → AN
        if (code >= 0x0660 && code <= 0x0669) return BidiType.AN;
        // Tatweel and marks → BN
        if (code === 0x0640 || (code >= 0x064B && code <= 0x065F) ||
            code === 0x0670 || code === 0x06D6 || code === 0x06D7) return BidiType.BN;
        // Diacritical marks (non-spacing) → NSM
        if (code >= 0x0610 && code <= 0x061A) return BidiType.NSM;
        if (code >= 0x064B && code <= 0x065F) return BidiType.NSM;
        // Everything else in the Arabic block → AL
        return BidiType.AL;
    }
    if (code >= 0x0750 && code <= 0x077F) return BidiType.AL;
    if (code >= 0x08A0 && code <= 0x08FF) return BidiType.AL;
    if (code >= 0xFB50 && code <= 0xFDFF) return BidiType.AL;
    if (code >= 0xFE70 && code <= 0xFEFE) return BidiType.AL;

    // European digits → EN
    if (code >= 0x0030 && code <= 0x0039) return BidiType.EN;
    if (code >= 0x06F0 && code <= 0x06F9) return BidiType.EN; // Extended Arabic-Indic
    if (code >= 0xFF10 && code <= 0xFF19) return BidiType.EN; // Fullwidth digits

    // European separators / terminators
    if (code === 0x002B || code === 0x002D) return BidiType.ES; // + -
    if (code === 0x0023 || code === 0x0024 || code === 0x0025 ||
        code === 0x00A2 || code === 0x00A3 || code === 0x00A4 || code === 0x00A5) return BidiType.ET;

    // Common separators
    if (code === 0x002C || code === 0x002E || code === 0x003A || code === 0x003B ||
        code === 0x002F || code === 0x00A0) return BidiType.CS;

    // Whitespace
    if (code === 0x0020 || code === 0x0009 || code === 0x1680) return BidiType.WS;
    if (code >= 0x2000 && code <= 0x200A) return BidiType.WS;
    if (code === 0x202F || code === 0x205F || code === 0x3000) return BidiType.WS;

    // Paragraph / segment separators
    if (code === 0x0A || code === 0x0D || code === 0x85 || code === 0x2029) return BidiType.B;
    if (code === 0x09 || code === 0x0B || code === 0x0C || code === 0x1F || code === 0x2028) return BidiType.S;

    // CJK / Hangul / Bopomofo → L
    if ((code >= 0x1100 && code <= 0x11FF) ||
        (code >= 0x2E80 && code <= 0x9FFF) ||
        (code >= 0xA000 && code <= 0xA4CF) ||
        (code >= 0xAC00 && code <= 0xD7A3) ||
        (code >= 0xF900 && code <= 0xFAFF) ||
        (code >= 0xFF00 && code <= 0xFFEF && code !== 0xFF10)) {
        // CJK doesn't include the fullwidth digit range (handled above)
        if (!(code >= 0xFF10 && code <= 0xFF19)) return BidiType.L;
    }

    // Latin letters and everything strongly LTR
    // Latin alphabet ranges
    if ((code >= 0x0041 && code <= 0x005A) || (code >= 0x0061 && code <= 0x007A) ||
        (code >= 0x00C0 && code <= 0x024F) || // Latin-1 supplement + Extended
        (code >= 0x0370 && code <= 0x03FF) || // Greek
        (code >= 0x0400 && code <= 0x04FF) || // Cyrillic
        (code >= 0x1E00 && code <= 0x1EFF)) { // Latin Extended Additional
        return BidiType.L;
    }

    // Combining marks → NSM
    if ((code >= 0x0300 && code <= 0x036F) ||
        (code >= 0x1AB0 && code <= 0x1AFF) ||
        (code >= 0x1DC0 && code <= 0x1DFF) ||
        (code >= 0x20D0 && code <= 0x20FF) ||
        (code >= 0xFE20 && code <= 0xFE2F)) {
        return BidiType.NSM;
    }

    // Default: treat other punctuation/symbols as Other Neutral
    if (code < 0x0041) return BidiType.ON;

    return BidiType.L;
}

/**
 * Determine the paragraph embedding level: 0 for LTR, 1 for RTL.
 * Per UAX#9 P2-P3, scan for the first strong directional character.
 */
function paragraphLevel(types: BidiType[]): number {
    for (const t of types) {
        if (t === BidiType.L) return 0;
        if (t === BidiType.R || t === BidiType.AL) return 1;
    }
    return 0;
}

/**
 * Resolve weak types per UAX#9 W1-W7. Mutates `types` in place.
 */
function resolveWeakTypes(types: BidiType[], embedLevel: number): void {
    const len = types.length;

    // W1: NSM takes the type of its predecessor; at the start, takes embed dir.
    let prevStrong: BidiType = embedLevel === 1 ? BidiType.R : BidiType.L;
    let prev = embedLevel === 1 ? BidiType.R : BidiType.L;
    for (let i = 0; i < len; i++) {
        const t = types[i];
        if (t === BidiType.NSM) {
            types[i] = prev;
        } else {
            prev = t;
        }
        if (t === BidiType.L || t === BidiType.R || t === BidiType.AL) {
            prevStrong = t;
        }
    }
    // Re-track previous for W2: W2 needs the last strong type, not last type.
    // (Already captured above in prevStrong.)

    // W2: EN follows AL/AN boundary → AN
    let lastStrong: BidiType = embedLevel === 1 ? BidiType.R : BidiType.L;
    for (let i = 0; i < len; i++) {
        const t = types[i];
        if (t === BidiType.EN && lastStrong === BidiType.AL) {
            types[i] = BidiType.AN;
        }
        if (t === BidiType.L || t === BidiType.R || t === BidiType.AL) {
            lastStrong = t;
        }
    }

    // W3: AL → R
    for (let i = 0; i < len; i++) {
        if (types[i] === BidiType.AL) types[i] = BidiType.R;
    }

    // W4: A single ES or CS between two EN becomes EN; between two AN becomes AN.
    for (let i = 1; i < len - 1; i++) {
        const prevT = types[i - 1];
        const t = types[i];
        const nextT = types[i + 1];
        if (t === BidiType.ES && prevT === BidiType.EN && nextT === BidiType.EN) {
            types[i] = BidiType.EN;
        } else if (t === BidiType.CS && prevT === BidiType.EN && nextT === BidiType.EN) {
            types[i] = BidiType.EN;
        } else if (t === BidiType.CS && prevT === BidiType.AN && nextT === BidiType.AN) {
            types[i] = BidiType.AN;
        }
    }

    // W5: A sequence of ETs adjacent to EN becomes EN.
    for (let i = 0; i < len; i++) {
        if (types[i] === BidiType.ET) {
            // Find the bounds of the ET sequence
            let j = i;
            while (j < len && types[j] === BidiType.ET) j++;
            // Check if adjacent to EN on either side
            const adjEN = (i > 0 && types[i - 1] === BidiType.EN) ||
                          (j < len && types[j] === BidiType.EN);
            if (adjEN) {
                for (let k = i; k < j; k++) types[k] = BidiType.EN;
            }
            i = j;
        }
    }

    // W6: Remaining ES, ET, CS → ON
    for (let i = 0; i < len; i++) {
        if (types[i] === BidiType.ES || types[i] === BidiType.ET || types[i] === BidiType.CS) {
            types[i] = BidiType.ON;
        }
    }

    // W7: EN whose last strong (L/R) was L → L
    lastStrong = embedLevel === 1 ? BidiType.R : BidiType.L;
    for (let i = 0; i < len; i++) {
        const t = types[i];
        if (t === BidiType.L || t === BidiType.R) {
            lastStrong = t;
        } else if (t === BidiType.EN && lastStrong === BidiType.L) {
            types[i] = BidiType.L;
        }
    }
}

/**
 * Resolve neutral types per UAX#9 N0-N2. Implements only N1-N2 (no brackets).
 * Mutates `types` in place.
 */
function resolveNeutrals(types: BidiType[], embedLevel: number): void {
    const len = types.length;
    const embedStrong: BidiType = embedLevel === 1 ? BidiType.R : BidiType.L;

    let prevStrong: BidiType = embedStrong;
    for (let i = 0; i < len; i++) {
        const t = types[i];
        if (t === BidiType.L || t === BidiType.R || t === BidiType.EN || t === BidiType.AN) {
            prevStrong = t;
            continue;
        }
        // It's a neutral (B, S, WS, ON) — find the end of the neutral sequence
        let j = i;
        while (j < len) {
            const tj = types[j];
            if (tj === BidiType.L || tj === BidiType.R || tj === BidiType.EN || tj === BidiType.AN) break;
            j++;
        }
        // Look at the next strong char after the neutral sequence.
        let nextStrong: BidiType = embedStrong;
        if (j < len) {
            const tj = types[j];
            if (tj === BidiType.L || tj === BidiType.R) nextStrong = tj;
            else if (tj === BidiType.EN) nextStrong = BidiType.AN; // EN treated as L below; placeholder
            else if (tj === BidiType.AN) nextStrong = BidiType.AN;
        }
        // Cast through number for the equality tests below — TS narrows the
        // BidiType union based on the assignments above, but the runtime
        // value can be any BidiType.
        const nextStrongNum = nextStrong as number;
        const prevStrongNum = prevStrong as number;

        // N1: neutrals between same-direction strong types take that direction.
        // Treat EN as L and AN as AN here for "same direction" comparison.
        const prevDir: BidiType = prevStrongNum === BidiType.EN ? BidiType.L
            : prevStrongNum === BidiType.AN ? BidiType.R
            : prevStrong;
        const nextDir: BidiType = nextStrongNum === BidiType.EN ? BidiType.L
            : nextStrongNum === BidiType.AN ? BidiType.R
            : nextStrong;
        const resolved: BidiType = prevDir === nextDir ? prevDir
            : embedStrong;

        for (let k = i; k < j; k++) {
            // N2: any remaining neutrals take the embed direction.
            // (Combining N1+N2: N1 picks same-direction; otherwise N2 picks embed.)
            const tk = types[k];
            if (tk === BidiType.B || tk === BidiType.S) {
                types[k] = embedStrong; // WS-like → treat as embed dir
            } else {
                types[k] = resolved;
            }
        }
        prevStrong = nextDir;
        i = j;
    }
}

/**
 * Compute implicit levels per character (I1-I2). Returns a Uint8Array of
 * levels (0 for LTR base, 1+ for progressively more RTL).
 */
function implicitLevels(types: BidiType[], embedLevel: number): Uint8Array {
    const len = types.length;
    const levels = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        const t = types[i];
        let level = embedLevel;
        if ((embedLevel & 1) === 0) {
            // Even embed: L direction
            if (t === BidiType.R) level += 1;
            else if (t === BidiType.AN || t === BidiType.EN) level += 2;
        } else {
            // Odd embed: R direction
            if (t === BidiType.L || t === BidiType.EN || t === BidiType.AN) level += 1;
        }
        levels[i] = level;
    }
    return levels;
}

/**
 * Apply L1 (segment/paragraph separators + trailing whitespace take embed dir)
 * to the levels array.
 */
function applyL1(
    types: BidiType[],
    levels: Uint8Array,
    embedLevel: number,
): void {
    const len = types.length;
    for (let i = 0; i < len; i++) {
        if (types[i] === BidiType.B || types[i] === BidiType.S) {
            levels[i] = embedLevel;
            // Reset trailing whitespace before this separator
            for (let k = i - 1; k >= 0; k--) {
                if (types[k] === BidiType.WS || types[k] === BidiType.B ||
                    types[k] === BidiType.S || types[k] === BidiType.ON && isWhitespaceLike(types, k)) {
                    levels[k] = embedLevel;
                } else {
                    break;
                }
            }
        }
    }
    // Trailing whitespace at end of text takes embed dir
    for (let k = len - 1; k >= 0; k--) {
        if (types[k] === BidiType.WS || types[k] === BidiType.B) {
            levels[k] = embedLevel;
        } else {
            break;
        }
    }
}

function isWhitespaceLike(_types: BidiType[], _k: number): boolean {
    return false; // simplified — handled by WS classification above
}

/**
 * Reorder the source string by implicit levels (L2).
 * Returns the visually-ordered string.
 */
function reorderByLevel(
    chars: string[],
    levels: Uint8Array,
): string {
    const len = chars.length;
    if (len === 0) return '';

    // Find the maximum embedding level.
    let maxLevel = 0;
    for (let i = 0; i < len; i++) {
        if (levels[i] > maxLevel) maxLevel = levels[i];
    }

    // For each level from highest down to 1, reverse contiguous runs at that
    // level or higher.
    const out = chars.slice();
    for (let level = maxLevel; level >= 1; level--) {
        let i = 0;
        while (i < len) {
            if (levels[i] >= level) {
                let j = i;
                while (j < len && levels[j] >= level) j++;
                // Reverse chars[i..j-1]
                let a = i, b = j - 1;
                while (a < b) {
                    const tmp = out[a];
                    out[a] = out[b];
                    out[b] = tmp;
                    a++; b--;
                }
                i = j;
            } else {
                i++;
            }
        }
    }
    return out.join('');
}

/**
 * Reorder text according to UAX#9. Returns the visual order of the input.
 *
 * This is a simplified implementation: explicit embedding characters (LRE,
 * RLE, LRO, RLO, PDF) and isolations (LRI, RLI, FSI, PDI) are not honored
 * (they're rare in map labels), but the algorithm correctly handles
 * paragraph-level RTL/LTR, weak types (EN, AN, separators, terminators),
 * neutrals, and implicit level assignment.
 *
 * For pure-Latin input, returns the input unchanged (fast path).
 */
export function uax9Reorder(text: string): string {
    if (!text) return text;

    // Fast path: if no RTL characters and no European/Arabic numbers, return
    // unchanged (pure LTR Latin / CJK text).
    let needsReorder = false;
    for (const ch of text) {
        const code = ch.codePointAt(0)!;
        if (code >= 0x0590 && code <= 0x08FF) { needsReorder = true; break; }
        if (code >= 0xFB1D && code <= 0xFDFF) { needsReorder = true; break; }
        if (code >= 0xFE70 && code <= 0xFEFE) { needsReorder = true; break; }
    }
    if (!needsReorder) return text;

    const chars = Array.from(text);
    const types = chars.map(c => classifyChar(c.codePointAt(0)!));

    const paraLevel = paragraphLevel(types);
    resolveWeakTypes(types, paraLevel);
    resolveNeutrals(types, paraLevel);
    const levels = implicitLevels(types, paraLevel);
    applyL1(types, levels, paraLevel);
    return reorderByLevel(chars, levels);
}
