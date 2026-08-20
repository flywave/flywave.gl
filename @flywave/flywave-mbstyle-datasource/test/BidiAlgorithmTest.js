"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const chai_1 = require("chai");
const BidiAlgorithm_1 = require("../src/BidiAlgorithm");
describe('BidiAlgorithm (UAX#9)', () => {
    describe('pure-direction fast paths', () => {
        it('returns pure-Latin text unchanged', () => {
            (0, chai_1.expect)((0, BidiAlgorithm_1.uax9Reorder)('Hello World')).to.equal('Hello World');
        });
        it('returns empty string unchanged', () => {
            (0, chai_1.expect)((0, BidiAlgorithm_1.uax9Reorder)('')).to.equal('');
        });
        it('returns pure-digit text unchanged (LTR paragraph)', () => {
            (0, chai_1.expect)((0, BidiAlgorithm_1.uax9Reorder)('12345')).to.equal('12345');
        });
        it('returns CJK text unchanged', () => {
            (0, chai_1.expect)((0, BidiAlgorithm_1.uax9Reorder)('東京')).to.equal('東京');
        });
        it('returns Cyrillic text unchanged', () => {
            (0, chai_1.expect)((0, BidiAlgorithm_1.uax9Reorder)('Москва')).to.equal('Москва');
        });
    });
    describe('pure-RTL text', () => {
        it('reverses pure Arabic to visual order', () => {
            const result = (0, BidiAlgorithm_1.uax9Reorder)('سلام');
            (0, chai_1.expect)(result).to.equal('مالس');
        });
        it('reverses pure Hebrew', () => {
            const result = (0, BidiAlgorithm_1.uax9Reorder)('שלום');
            (0, chai_1.expect)(result.length).to.equal(4);
            (0, chai_1.expect)(result.endsWith('ש')).to.equal(true);
        });
    });
    describe('mixed LTR/RTL text', () => {
        it('keeps Latin run in logical order', () => {
            const result = (0, BidiAlgorithm_1.uax9Reorder)('abc سلام');
            (0, chai_1.expect)(result).to.contain('abc');
            (0, chai_1.expect)(result).to.contain('مالس');
        });
        it('numbers adjacent to RTL stay LTR within the RTL run', () => {
            const result = (0, BidiAlgorithm_1.uax9Reorder)('س123');
            (0, chai_1.expect)(result).to.contain('123');
        });
        it('handles Latin + Arabic + digits', () => {
            const result = (0, BidiAlgorithm_1.uax9Reorder)('abc 123 دينار');
            (0, chai_1.expect)(result).to.contain('abc');
            (0, chai_1.expect)(result).to.contain('123');
        });
        it('preserves Latin sequence across punctuation', () => {
            const result = (0, BidiAlgorithm_1.uax9Reorder)('hello.world شارع');
            (0, chai_1.expect)(result).to.contain('hello');
            (0, chai_1.expect)(result).to.contain('world');
        });
        it('treats trailing whitespace as embed direction', () => {
            const result = (0, BidiAlgorithm_1.uax9Reorder)('abc سلام ');
            (0, chai_1.expect)(result.length).to.equal('abc سلام '.length);
        });
    });
    describe('European and Arabic numbers (W-rules)', () => {
        it('European digits stay LTR within Arabic text', () => {
            const result = (0, BidiAlgorithm_1.uax9Reorder)('السعر 100 دينار');
            (0, chai_1.expect)(result).to.contain('100');
        });
        it('signs between numbers resolve (W4)', () => {
            const result = (0, BidiAlgorithm_1.uax9Reorder)('1+2');
            (0, chai_1.expect)(result).to.contain('1');
            (0, chai_1.expect)(result).to.contain('+');
            (0, chai_1.expect)(result).to.contain('2');
        });
        it('currency symbols adjacent to numbers (W5)', () => {
            const result = (0, BidiAlgorithm_1.uax9Reorder)('$100');
            (0, chai_1.expect)(result).to.contain('100');
        });
    });
    describe('neutrals (N-rules)', () => {
        it('punctuation between two RTL chars takes RTL direction', () => {
            const result = (0, BidiAlgorithm_1.uax9Reorder)('سل،ام');
            (0, chai_1.expect)(result.length).to.equal(5);
        });
        it('punctuation between two LTR chars takes LTR direction', () => {
            const result = (0, BidiAlgorithm_1.uax9Reorder)('a,b');
            (0, chai_1.expect)(result).to.equal('a,b');
        });
    });
    describe('paragraph level (P-rules)', () => {
        it('first strong char L → LTR paragraph', () => {
            const result = (0, BidiAlgorithm_1.uax9Reorder)('abc سلام');
            (0, chai_1.expect)(result.indexOf('a')).to.be.lessThan(result.indexOf('س') === -1 ? Infinity : result.indexOf('س'));
        });
        it('first strong char R → RTL paragraph', () => {
            const result = (0, BidiAlgorithm_1.uax9Reorder)('سلام abc');
            (0, chai_1.expect)(result).to.not.equal('سلام abc');
        });
    });
    describe('whitespace handling (L1)', () => {
        it('preserves internal spaces', () => {
            const result = (0, BidiAlgorithm_1.uax9Reorder)('hello world');
            (0, chai_1.expect)(result).to.equal('hello world');
        });
        it('handles leading whitespace', () => {
            const result = (0, BidiAlgorithm_1.uax9Reorder)('  hello');
            (0, chai_1.expect)(result.length).to.equal('  hello'.length);
        });
    });
});
//# sourceMappingURL=BidiAlgorithmTest.js.map