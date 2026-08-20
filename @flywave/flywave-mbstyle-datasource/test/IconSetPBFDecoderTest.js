"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const chai_1 = require("chai");
const IconSetPBFDecoder_1 = require("../src/IconSetPBFDecoder");
function tag(field, wireType) {
    return (field << 3) | wireType;
}
function varint(n) {
    const out = [];
    n = n >>> 0;
    while (n > 0x7f) {
        out.push((n & 0x7f) | 0x80);
        n >>>= 7;
    }
    out.push(n & 0x7f);
    return out;
}
function lenDelim(field, bytes) {
    return [tag(field, 2), ...varint(bytes.length), ...bytes];
}
function strBytes(s) {
    return Array.from(new TextEncoder().encode(s));
}
describe('IconSetPBFDecoder', () => {
    describe('decodeIconSet', () => {
        it('returns an empty array for empty input', () => {
            (0, chai_1.expect)((0, IconSetPBFDecoder_1.decodeIconSet)(new Uint8Array(0))).to.deep.equal([]);
            (0, chai_1.expect)((0, IconSetPBFDecoder_1.decodeIconSet)(new ArrayBuffer(0))).to.deep.equal([]);
        });
        it('decodes a single icon entry with a name', () => {
            const iconEntry = lenDelim(1, strBytes('airport'));
            const top = lenDelim(1, iconEntry);
            const icons = (0, IconSetPBFDecoder_1.decodeIconSet)(new Uint8Array(top));
            (0, chai_1.expect)(icons).to.have.length(1);
            (0, chai_1.expect)(icons[0].name).to.equal('airport');
        });
        it('decodes multiple icon entries', () => {
            const icon1 = lenDelim(1, strBytes('arrow'));
            const icon2 = lenDelim(1, strBytes('circle'));
            const top = [...lenDelim(1, icon1), ...lenDelim(1, icon2)];
            const icons = (0, IconSetPBFDecoder_1.decodeIconSet)(new Uint8Array(top));
            (0, chai_1.expect)(icons).to.have.length(2);
            (0, chai_1.expect)(icons[0].name).to.equal('arrow');
            (0, chai_1.expect)(icons[1].name).to.equal('circle');
        });
        it('skips unknown top-level fields gracefully', () => {
            const junk = lenDelim(9, [1, 2, 3]);
            const iconEntry = lenDelim(1, strBytes('x'));
            const real = lenDelim(1, iconEntry);
            const buf = new Uint8Array([...junk, ...real]);
            const icons = (0, IconSetPBFDecoder_1.decodeIconSet)(buf);
            (0, chai_1.expect)(icons).to.have.length(1);
            (0, chai_1.expect)(icons[0].name).to.equal('x');
        });
        it('preserves icon order across many entries', () => {
            const names = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
            const buf = [];
            for (const n of names) {
                buf.push(...lenDelim(1, lenDelim(1, strBytes(n))));
            }
            const icons = (0, IconSetPBFDecoder_1.decodeIconSet)(new Uint8Array(buf));
            (0, chai_1.expect)(icons.map(i => i.name)).to.deep.equal(names);
        });
    });
});
//# sourceMappingURL=IconSetPBFDecoderTest.js.map