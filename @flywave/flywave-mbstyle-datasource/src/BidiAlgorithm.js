"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.uax9Reorder = uax9Reorder;
var BidiType;
(function (BidiType) {
    BidiType[BidiType["L"] = 0] = "L";
    BidiType[BidiType["R"] = 1] = "R";
    BidiType[BidiType["AL"] = 2] = "AL";
    BidiType[BidiType["EN"] = 3] = "EN";
    BidiType[BidiType["AN"] = 4] = "AN";
    BidiType[BidiType["ES"] = 5] = "ES";
    BidiType[BidiType["ET"] = 6] = "ET";
    BidiType[BidiType["CS"] = 7] = "CS";
    BidiType[BidiType["NSM"] = 8] = "NSM";
    BidiType[BidiType["BN"] = 9] = "BN";
    BidiType[BidiType["B"] = 10] = "B";
    BidiType[BidiType["S"] = 11] = "S";
    BidiType[BidiType["WS"] = 12] = "WS";
    BidiType[BidiType["ON"] = 13] = "ON";
    BidiType[BidiType["LRE"] = 14] = "LRE";
    BidiType[BidiType["LRO"] = 15] = "LRO";
    BidiType[BidiType["RLE"] = 16] = "RLE";
    BidiType[BidiType["RLO"] = 17] = "RLO";
    BidiType[BidiType["PDF"] = 18] = "PDF";
    BidiType[BidiType["LRI"] = 19] = "LRI";
    BidiType[BidiType["RLI"] = 20] = "RLI";
    BidiType[BidiType["FSI"] = 21] = "FSI";
    BidiType[BidiType["PDI"] = 22] = "PDI";
})(BidiType || (BidiType = {}));
function classifyChar(code) {
    if (code >= 0x0590 && code <= 0x05FF)
        return 1;
    if (code >= 0xFB1D && code <= 0xFB4F)
        return 1;
    if (code >= 0x0600 && code <= 0x06FF) {
        if (code >= 0x0660 && code <= 0x0669)
            return 4;
        if (code === 0x0640 || (code >= 0x064B && code <= 0x065F) ||
            code === 0x0670 || code === 0x06D6 || code === 0x06D7)
            return 9;
        if (code >= 0x0610 && code <= 0x061A)
            return 8;
        if (code >= 0x064B && code <= 0x065F)
            return 8;
        return 2;
    }
    if (code >= 0x0750 && code <= 0x077F)
        return 2;
    if (code >= 0x08A0 && code <= 0x08FF)
        return 2;
    if (code >= 0xFB50 && code <= 0xFDFF)
        return 2;
    if (code >= 0xFE70 && code <= 0xFEFE)
        return 2;
    if (code >= 0x0030 && code <= 0x0039)
        return 3;
    if (code >= 0x06F0 && code <= 0x06F9)
        return 3;
    if (code >= 0xFF10 && code <= 0xFF19)
        return 3;
    if (code === 0x002B || code === 0x002D)
        return 5;
    if (code === 0x0023 || code === 0x0024 || code === 0x0025 ||
        code === 0x00A2 || code === 0x00A3 || code === 0x00A4 || code === 0x00A5)
        return 6;
    if (code === 0x002C || code === 0x002E || code === 0x003A || code === 0x003B ||
        code === 0x002F || code === 0x00A0)
        return 7;
    if (code === 0x0020 || code === 0x0009 || code === 0x1680)
        return 12;
    if (code >= 0x2000 && code <= 0x200A)
        return 12;
    if (code === 0x202F || code === 0x205F || code === 0x3000)
        return 12;
    if (code === 0x0A || code === 0x0D || code === 0x85 || code === 0x2029)
        return 10;
    if (code === 0x09 || code === 0x0B || code === 0x0C || code === 0x1F || code === 0x2028)
        return 11;
    if ((code >= 0x1100 && code <= 0x11FF) ||
        (code >= 0x2E80 && code <= 0x9FFF) ||
        (code >= 0xA000 && code <= 0xA4CF) ||
        (code >= 0xAC00 && code <= 0xD7A3) ||
        (code >= 0xF900 && code <= 0xFAFF) ||
        (code >= 0xFF00 && code <= 0xFFEF && code !== 0xFF10)) {
        if (!(code >= 0xFF10 && code <= 0xFF19))
            return 0;
    }
    if ((code >= 0x0041 && code <= 0x005A) || (code >= 0x0061 && code <= 0x007A) ||
        (code >= 0x00C0 && code <= 0x024F) ||
        (code >= 0x0370 && code <= 0x03FF) ||
        (code >= 0x0400 && code <= 0x04FF) ||
        (code >= 0x1E00 && code <= 0x1EFF)) {
        return 0;
    }
    if ((code >= 0x0300 && code <= 0x036F) ||
        (code >= 0x1AB0 && code <= 0x1AFF) ||
        (code >= 0x1DC0 && code <= 0x1DFF) ||
        (code >= 0x20D0 && code <= 0x20FF) ||
        (code >= 0xFE20 && code <= 0xFE2F)) {
        return 8;
    }
    if (code < 0x0041)
        return 13;
    return 0;
}
function paragraphLevel(types) {
    for (const t of types) {
        if (t === 0)
            return 0;
        if (t === 1 || t === 2)
            return 1;
    }
    return 0;
}
function resolveWeakTypes(types, embedLevel) {
    const len = types.length;
    let prevStrong = embedLevel === 1 ? 1 : 0;
    let prev = embedLevel === 1 ? 1 : 0;
    for (let i = 0; i < len; i++) {
        const t = types[i];
        if (t === 8) {
            types[i] = prev;
        }
        else {
            prev = t;
        }
        if (t === 0 || t === 1 || t === 2) {
            prevStrong = t;
        }
    }
    let lastStrong = embedLevel === 1 ? 1 : 0;
    for (let i = 0; i < len; i++) {
        const t = types[i];
        if (t === 3 && lastStrong === 2) {
            types[i] = 4;
        }
        if (t === 0 || t === 1 || t === 2) {
            lastStrong = t;
        }
    }
    for (let i = 0; i < len; i++) {
        if (types[i] === 2)
            types[i] = 1;
    }
    for (let i = 1; i < len - 1; i++) {
        const prevT = types[i - 1];
        const t = types[i];
        const nextT = types[i + 1];
        if (t === 5 && prevT === 3 && nextT === 3) {
            types[i] = 3;
        }
        else if (t === 7 && prevT === 3 && nextT === 3) {
            types[i] = 3;
        }
        else if (t === 7 && prevT === 4 && nextT === 4) {
            types[i] = 4;
        }
    }
    for (let i = 0; i < len; i++) {
        if (types[i] === 6) {
            let j = i;
            while (j < len && types[j] === 6)
                j++;
            const adjEN = (i > 0 && types[i - 1] === 3) ||
                (j < len && types[j] === 3);
            if (adjEN) {
                for (let k = i; k < j; k++)
                    types[k] = 3;
            }
            i = j;
        }
    }
    for (let i = 0; i < len; i++) {
        if (types[i] === 5 || types[i] === 6 || types[i] === 7) {
            types[i] = 13;
        }
    }
    lastStrong = embedLevel === 1 ? 1 : 0;
    for (let i = 0; i < len; i++) {
        const t = types[i];
        if (t === 0 || t === 1) {
            lastStrong = t;
        }
        else if (t === 3 && lastStrong === 0) {
            types[i] = 0;
        }
    }
}
function resolveNeutrals(types, embedLevel) {
    const len = types.length;
    const embedStrong = embedLevel === 1 ? 1 : 0;
    let prevStrong = embedStrong;
    for (let i = 0; i < len; i++) {
        const t = types[i];
        if (t === 0 || t === 1 || t === 3 || t === 4) {
            prevStrong = t;
            continue;
        }
        let j = i;
        while (j < len) {
            const tj = types[j];
            if (tj === 0 || tj === 1 || tj === 3 || tj === 4)
                break;
            j++;
        }
        let nextStrong = embedStrong;
        if (j < len) {
            const tj = types[j];
            if (tj === 0 || tj === 1)
                nextStrong = tj;
            else if (tj === 3)
                nextStrong = 4;
            else if (tj === 4)
                nextStrong = 4;
        }
        const nextStrongNum = nextStrong;
        const prevStrongNum = prevStrong;
        const prevDir = prevStrongNum === 3 ? 0
            : prevStrongNum === 4 ? 1
                : prevStrong;
        const nextDir = nextStrongNum === 3 ? 0
            : nextStrongNum === 4 ? 1
                : nextStrong;
        const resolved = prevDir === nextDir ? prevDir
            : embedStrong;
        for (let k = i; k < j; k++) {
            const tk = types[k];
            if (tk === 10 || tk === 11) {
                types[k] = embedStrong;
            }
            else {
                types[k] = resolved;
            }
        }
        prevStrong = nextDir;
        i = j;
    }
}
function implicitLevels(types, embedLevel) {
    const len = types.length;
    const levels = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        const t = types[i];
        let level = embedLevel;
        if ((embedLevel & 1) === 0) {
            if (t === 1)
                level += 1;
            else if (t === 4 || t === 3)
                level += 2;
        }
        else {
            if (t === 0 || t === 3 || t === 4)
                level += 1;
        }
        levels[i] = level;
    }
    return levels;
}
function applyL1(types, levels, embedLevel) {
    const len = types.length;
    for (let i = 0; i < len; i++) {
        if (types[i] === 10 || types[i] === 11) {
            levels[i] = embedLevel;
            for (let k = i - 1; k >= 0; k--) {
                if (types[k] === 12 || types[k] === 10 ||
                    types[k] === 11 || types[k] === 13 && isWhitespaceLike(types, k)) {
                    levels[k] = embedLevel;
                }
                else {
                    break;
                }
            }
        }
    }
    for (let k = len - 1; k >= 0; k--) {
        if (types[k] === 12 || types[k] === 10) {
            levels[k] = embedLevel;
        }
        else {
            break;
        }
    }
}
function isWhitespaceLike(_types, _k) {
    return false;
}
function reorderByLevel(chars, levels) {
    const len = chars.length;
    if (len === 0)
        return '';
    let maxLevel = 0;
    for (let i = 0; i < len; i++) {
        if (levels[i] > maxLevel)
            maxLevel = levels[i];
    }
    const out = chars.slice();
    for (let level = maxLevel; level >= 1; level--) {
        let i = 0;
        while (i < len) {
            if (levels[i] >= level) {
                let j = i;
                while (j < len && levels[j] >= level)
                    j++;
                let a = i, b = j - 1;
                while (a < b) {
                    const tmp = out[a];
                    out[a] = out[b];
                    out[b] = tmp;
                    a++;
                    b--;
                }
                i = j;
            }
            else {
                i++;
            }
        }
    }
    return out.join('');
}
function uax9Reorder(text) {
    if (!text)
        return text;
    let needsReorder = false;
    for (const ch of text) {
        const code = ch.codePointAt(0);
        if (code >= 0x0590 && code <= 0x08FF) {
            needsReorder = true;
            break;
        }
        if (code >= 0xFB1D && code <= 0xFDFF) {
            needsReorder = true;
            break;
        }
        if (code >= 0xFE70 && code <= 0xFEFE) {
            needsReorder = true;
            break;
        }
    }
    if (!needsReorder)
        return text;
    const chars = Array.from(text);
    const types = chars.map(c => classifyChar(c.codePointAt(0)));
    const paraLevel = paragraphLevel(types);
    resolveWeakTypes(types, paraLevel);
    resolveNeutrals(types, paraLevel);
    const levels = implicitLevels(types, paraLevel);
    applyL1(types, levels, paraLevel);
    return reorderByLevel(chars, levels);
}
//# sourceMappingURL=BidiAlgorithm.js.map