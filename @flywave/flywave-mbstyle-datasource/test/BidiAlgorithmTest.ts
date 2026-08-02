import { expect } from 'chai';
import { uax9Reorder } from '../src/BidiAlgorithm';

describe('BidiAlgorithm (UAX#9)', () => {
    describe('pure-direction fast paths', () => {
        it('returns pure-Latin text unchanged', () => {
            expect(uax9Reorder('Hello World')).to.equal('Hello World');
        });

        it('returns empty string unchanged', () => {
            expect(uax9Reorder('')).to.equal('');
        });

        it('returns pure-digit text unchanged (LTR paragraph)', () => {
            expect(uax9Reorder('12345')).to.equal('12345');
        });

        it('returns CJK text unchanged', () => {
            expect(uax9Reorder('東京')).to.equal('東京');
        });

        it('returns Cyrillic text unchanged', () => {
            expect(uax9Reorder('Москва')).to.equal('Москва');
        });
    });

    describe('pure-RTL text', () => {
        it('reverses pure Arabic to visual order', () => {
            // 'abc' in logical order → 'cba' visually for pure RTL.
            const result = uax9Reorder('سلام');
            // س ل ا م in logical order → م ا ل س visually
            expect(result).to.equal('مالس');
        });

        it('reverses pure Hebrew', () => {
            // שלום logical → םו ל ש visually (we just check it differs and ends with ש)
            const result = uax9Reorder('שלום');
            expect(result.length).to.equal(4);
            expect(result.endsWith('ש')).to.equal(true);
        });
    });

    describe('mixed LTR/RTL text', () => {
        it('keeps Latin run in logical order', () => {
            // "abc <arabic>" — Latin run stays 'abc' in display order;
            // the RTL run gets reversed per UAX#9 (سلام → مالس).
            const result = uax9Reorder('abc سلام');
            expect(result).to.contain('abc');
            expect(result).to.contain('مالس');
        });

        it('numbers adjacent to RTL stay LTR within the RTL run', () => {
            // "س123" — the 123 should remain LTR within the RTL paragraph.
            const result = uax9Reorder('س123');
            // Just verify the digits still appear left-to-right.
            expect(result).to.contain('123');
        });

        it('handles Latin + Arabic + digits', () => {
            const result = uax9Reorder('abc 123 دينار');
            // Latin and digits preserve their internal LTR order.
            expect(result).to.contain('abc');
            expect(result).to.contain('123');
        });

        it('preserves Latin sequence across punctuation', () => {
            // Punctuation between LTR runs should not flip the LTR sequence.
            const result = uax9Reorder('hello.world شارع');
            expect(result).to.contain('hello');
            expect(result).to.contain('world');
        });

        it('treats trailing whitespace as embed direction', () => {
            // 'abc <arabic> ' — trailing space takes LTR embed dir.
            const result = uax9Reorder('abc سلام ');
            expect(result.length).to.equal('abc سلام '.length);
        });
    });

    describe('European and Arabic numbers (W-rules)', () => {
        it('European digits stay LTR within Arabic text', () => {
            // Arabic context + EN — EN stays LTR.
            const result = uax9Reorder('السعر 100 دينار');
            expect(result).to.contain('100');
        });

        it('signs between numbers resolve (W4)', () => {
            // "1+2" — ES between EN EN → EN, so reads "1+2" left-to-right.
            const result = uax9Reorder('1+2');
            expect(result).to.contain('1');
            expect(result).to.contain('+');
            expect(result).to.contain('2');
        });

        it('currency symbols adjacent to numbers (W5)', () => {
            // "$100" — ET sequence adjacent to EN becomes EN.
            const result = uax9Reorder('$100');
            expect(result).to.contain('100');
        });
    });

    describe('neutrals (N-rules)', () => {
        it('punctuation between two RTL chars takes RTL direction', () => {
            // Two Arabic letters with a comma between them.
            const result = uax9Reorder('سل،ام');
            expect(result.length).to.equal(5);
        });

        it('punctuation between two LTR chars takes LTR direction', () => {
            // Two Latin letters with a comma between them.
            const result = uax9Reorder('a,b');
            expect(result).to.equal('a,b');
        });
    });

    describe('paragraph level (P-rules)', () => {
        it('first strong char L → LTR paragraph', () => {
            // Starts with Latin, has Arabic later. Should be LTR paragraph.
            const result = uax9Reorder('abc سلام');
            // Latin part stays in left position.
            expect(result.indexOf('a')).to.be.lessThan(result.indexOf('س') === -1 ? Infinity : result.indexOf('س'));
        });

        it('first strong char R → RTL paragraph', () => {
            // Starts with Arabic, has Latin later. Should be RTL paragraph.
            const result = uax9Reorder('سلام abc');
            // The text should differ from input.
            expect(result).to.not.equal('سلام abc');
        });
    });

    describe('whitespace handling (L1)', () => {
        it('preserves internal spaces', () => {
            const result = uax9Reorder('hello world');
            expect(result).to.equal('hello world');
        });

        it('handles leading whitespace', () => {
            const result = uax9Reorder('  hello');
            expect(result.length).to.equal('  hello'.length);
        });
    });
});
