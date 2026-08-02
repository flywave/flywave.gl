import { expect } from 'chai';
import { decodeIconSet } from '../src/IconSetPBFDecoder';

/**
 * Hand-encode protobuf wire format. Helper to keep the test compact.
 *
 * Wire types we need:
 *   0  VARINT
 *   2  LENGTH-DELIMITED
 *
 * Tag = (field_number << 3) | wire_type
 */
function tag(field: number, wireType: number): number {
    return (field << 3) | wireType;
}

function varint(n: number): number[] {
    const out: number[] = [];
    n = n >>> 0;
    while (n > 0x7f) {
        out.push((n & 0x7f) | 0x80);
        n >>>= 7;
    }
    out.push(n & 0x7f);
    return out;
}

function lenDelim(field: number, bytes: number[]): number[] {
    return [tag(field, 2), ...varint(bytes.length), ...bytes];
}

function strBytes(s: string): number[] {
    return Array.from(new TextEncoder().encode(s));
}

describe('IconSetPBFDecoder', () => {
    describe('decodeIconSet', () => {
        it('returns an empty array for empty input', () => {
            expect(decodeIconSet(new Uint8Array(0))).to.deep.equal([]);
            expect(decodeIconSet(new ArrayBuffer(0))).to.deep.equal([]);
        });

        it('decodes a single icon entry with a name', () => {
            // Top-level message: field 1 = IconEntry (length-delimited).
            // IconEntry: field 1 = name (length-delimited string).
            const iconEntry = lenDelim(1, strBytes('airport'));
            const top = lenDelim(1, iconEntry);
            const icons = decodeIconSet(new Uint8Array(top));
            expect(icons).to.have.length(1);
            expect(icons[0].name).to.equal('airport');
        });

        it('decodes multiple icon entries', () => {
            const icon1 = lenDelim(1, strBytes('arrow'));
            const icon2 = lenDelim(1, strBytes('circle'));
            const top = [...lenDelim(1, icon1), ...lenDelim(1, icon2)];
            const icons = decodeIconSet(new Uint8Array(top));
            expect(icons).to.have.length(2);
            expect(icons[0].name).to.equal('arrow');
            expect(icons[1].name).to.equal('circle');
        });

        it('skips unknown top-level fields gracefully', () => {
            // Unknown field 9 (length-delimited) before the real icon entry.
            const junk = lenDelim(9, [1, 2, 3]);
            const iconEntry = lenDelim(1, strBytes('x'));
            const real = lenDelim(1, iconEntry);
            const buf = new Uint8Array([...junk, ...real]);
            const icons = decodeIconSet(buf);
            expect(icons).to.have.length(1);
            expect(icons[0].name).to.equal('x');
        });

        it('preserves icon order across many entries', () => {
            const names = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
            const buf: number[] = [];
            for (const n of names) {
                buf.push(...lenDelim(1, lenDelim(1, strBytes(n))));
            }
            const icons = decodeIconSet(new Uint8Array(buf));
            expect(icons.map(i => i.name)).to.deep.equal(names);
        });
    });
});
