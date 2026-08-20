"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseGlyphPBF = parseGlyphPBF;
function readVarint(data, offset) {
    let result = 0;
    let shift = 0;
    let pos = offset;
    while (pos < data.length) {
        const byte = data[pos++];
        result |= (byte & 0x7f) << shift;
        if ((byte & 0x80) === 0)
            break;
        shift += 7;
    }
    return [result >>> 0, pos];
}
function readSVarint(data, offset) {
    const [n, pos] = readVarint(data, offset);
    const s = (n >>> 1) ^ -(n & 1);
    return [s, pos];
}
function readBytes(data, offset) {
    const [len, pos] = readVarint(data, offset);
    return [data.subarray(pos, pos + len), pos + len];
}
function readString(data, offset) {
    const [bytes, pos] = readBytes(data, offset);
    return [new TextDecoder().decode(bytes), pos];
}
function skipField(data, offset, wireType) {
    switch (wireType) {
        case 0: {
            const [, pos] = readVarint(data, offset);
            return pos;
        }
        case 1: return offset + 8;
        case 2: {
            const [, pos] = readBytes(data, offset);
            return pos;
        }
        case 5: return offset + 4;
        default: return data.length;
    }
}
function parseGlyphPBF(data) {
    const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
    if (bytes.length === 0)
        return null;
    const fontstack = {
        name: '',
        range: '',
        glyphs: new Map(),
    };
    let offset = 0;
    while (offset < bytes.length) {
        const [tag, pos] = readVarint(bytes, offset);
        offset = pos;
        const fieldNumber = tag >> 3;
        const wireType = tag & 0x7;
        if (fieldNumber === 1 && wireType === 2) {
            const [fsBytes, newPos] = readBytes(bytes, offset);
            offset = newPos;
            parseFontstack(fsBytes, fontstack);
        }
        else {
            offset = skipField(bytes, offset, wireType);
        }
    }
    return fontstack.glyphs.size > 0 ? fontstack : null;
}
function parseFontstack(data, fontstack) {
    let offset = 0;
    while (offset < data.length) {
        const [tag, pos] = readVarint(data, offset);
        offset = pos;
        const fieldNumber = tag >> 3;
        const wireType = tag & 0x7;
        switch (fieldNumber) {
            case 1: {
                if (wireType === 2) {
                    const [str, newPos] = readString(data, offset);
                    fontstack.name = str;
                    offset = newPos;
                }
                else {
                    offset = skipField(data, offset, wireType);
                }
                break;
            }
            case 2: {
                if (wireType === 2) {
                    const [str, newPos] = readString(data, offset);
                    fontstack.range = str;
                    offset = newPos;
                }
                else {
                    offset = skipField(data, offset, wireType);
                }
                break;
            }
            case 3: {
                if (wireType === 2) {
                    const [glyphBytes, newPos] = readBytes(data, offset);
                    offset = newPos;
                    const glyph = parseGlyph(glyphBytes);
                    if (glyph)
                        fontstack.glyphs.set(glyph.id, glyph);
                }
                else {
                    offset = skipField(data, offset, wireType);
                }
                break;
            }
            default:
                offset = skipField(data, offset, wireType);
        }
    }
}
function parseGlyph(data) {
    const glyph = {
        id: 0, width: 0, height: 0, left: 0, top: 0, advance: 0, bitmap: new Uint8Array(0),
    };
    let offset = 0;
    while (offset < data.length) {
        const [tag, pos] = readVarint(data, offset);
        offset = pos;
        const fieldNumber = tag >> 3;
        const wireType = tag & 0x7;
        switch (fieldNumber) {
            case 1: {
                const [v, np] = readVarint(data, offset);
                glyph.id = v;
                offset = np;
                break;
            }
            case 2: {
                const [v, np] = readBytes(data, offset);
                glyph.bitmap = v;
                offset = np;
                break;
            }
            case 3: {
                const [v, np] = readVarint(data, offset);
                glyph.width = v;
                offset = np;
                break;
            }
            case 4: {
                const [v, np] = readVarint(data, offset);
                glyph.height = v;
                offset = np;
                break;
            }
            case 5: {
                const [v, np] = readSVarint(data, offset);
                glyph.left = v;
                offset = np;
                break;
            }
            case 6: {
                const [v, np] = readSVarint(data, offset);
                glyph.top = v;
                offset = np;
                break;
            }
            case 7: {
                const [v, np] = readVarint(data, offset);
                glyph.advance = v;
                offset = np;
                break;
            }
            default:
                offset = skipField(data, offset, wireType);
        }
    }
    return glyph.id > 0 ? glyph : null;
}
//# sourceMappingURL=GlyphPBFParser.js.map