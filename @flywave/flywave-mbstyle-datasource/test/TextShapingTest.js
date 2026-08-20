"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const chai_1 = require("chai");
const TextShaping_1 = require("../src/TextShaping");
describe('TextShaping', () => {
    describe('resolveTextField', () => {
        it('returns plain text unchanged', () => {
            (0, chai_1.expect)((0, TextShaping_1.resolveTextField)('Hello', {})).to.equal('Hello');
        });
        it('replaces tokens with properties', () => {
            (0, chai_1.expect)((0, TextShaping_1.resolveTextField)('{name}', { name: 'Berlin' })).to.equal('Berlin');
        });
        it('replaces multiple tokens', () => {
            (0, chai_1.expect)((0, TextShaping_1.resolveTextField)('{city}, {country}', { city: 'Berlin', country: 'DE' })).to.equal('Berlin, DE');
        });
        it('handles missing properties', () => {
            (0, chai_1.expect)((0, TextShaping_1.resolveTextField)('{missing}', {})).to.equal('');
        });
        it('handles whitespace in token', () => {
            (0, chai_1.expect)((0, TextShaping_1.resolveTextField)('{ name }', { name: 'Paris' })).to.equal('Paris');
        });
    });
    describe('applyTextTransform', () => {
        it('uppercases text', () => {
            (0, chai_1.expect)((0, TextShaping_1.applyTextTransform)('hello', 'uppercase')).to.equal('HELLO');
        });
        it('lowercases text', () => {
            (0, chai_1.expect)((0, TextShaping_1.applyTextTransform)('HELLO', 'lowercase')).to.equal('hello');
        });
        it('leaves text unchanged for none', () => {
            (0, chai_1.expect)((0, TextShaping_1.applyTextTransform)('Hello', 'none')).to.equal('Hello');
        });
    });
    describe('measureTextWidth', () => {
        it('measures simple text', () => {
            const w = (0, TextShaping_1.measureTextWidth)('abc', 0);
            (0, chai_1.expect)(w).to.be.greaterThan(0);
        });
        it('space is narrower than characters', () => {
            const wSpace = (0, TextShaping_1.measureTextWidth)(' ', 0);
            const wChar = (0, TextShaping_1.measureTextWidth)('a', 0);
            (0, chai_1.expect)(wSpace).to.be.lessThan(wChar);
        });
        it('adds letter spacing', () => {
            const w1 = (0, TextShaping_1.measureTextWidth)('ab', 0);
            const w2 = (0, TextShaping_1.measureTextWidth)('ab', 0.5);
            (0, chai_1.expect)(w2).to.be.greaterThan(w1);
        });
        it('uses per-character advance estimates (narrow < wide)', () => {
            const wNarrow = (0, TextShaping_1.measureTextWidth)('iiiii', 0);
            const wWide = (0, TextShaping_1.measureTextWidth)('mmmmm', 0);
            (0, chai_1.expect)(wNarrow).to.be.lessThan(wWide);
        });
        it('uppercase W is wider than uppercase I', () => {
            (0, chai_1.expect)((0, TextShaping_1.measureTextWidth)('W', 0)).to.be.greaterThan((0, TextShaping_1.measureTextWidth)('I', 0));
        });
    });
    describe('wrapText', () => {
        it('keeps short text on one line', () => {
            const lines = (0, TextShaping_1.wrapText)('Hello', 100);
            (0, chai_1.expect)(lines).to.have.length(1);
            (0, chai_1.expect)(lines[0]).to.equal('Hello');
        });
        it('wraps long text', () => {
            const lines = (0, TextShaping_1.wrapText)('Hello World Foo Bar', 5);
            (0, chai_1.expect)(lines.length).to.be.greaterThan(1);
        });
        it('respects explicit newlines', () => {
            const lines = (0, TextShaping_1.wrapText)('Line1\nLine2', 100);
            (0, chai_1.expect)(lines).to.deep.equal(['Line1', 'Line2']);
        });
        it('handles empty string', () => {
            const lines = (0, TextShaping_1.wrapText)('', 100);
            (0, chai_1.expect)(lines).to.have.length(0);
        });
        it('breaks CJK text at every ideograph', () => {
            const lines = (0, TextShaping_1.wrapText)('东京特許許可局', 2);
            (0, chai_1.expect)(lines.length).to.be.greaterThan(1);
            for (const line of lines) {
                (0, chai_1.expect)(line.length).to.be.at.most(2);
            }
        });
        it('breaks CJK runs interleaved with Latin words', () => {
            const lines = (0, TextShaping_1.wrapText)('Hello 世界测试 Text', 6);
            (0, chai_1.expect)(lines.length).to.be.greaterThan(1);
            const cjkOnSeparateLines = lines.filter(l => /[\u4e00-\u9fff]/.test(l)).length;
            (0, chai_1.expect)(cjkOnSeparateLines).to.be.greaterThanOrEqual(2);
        });
        it('breaks overlong single words at character boundaries', () => {
            const long = 'A'.repeat(20);
            const lines = (0, TextShaping_1.wrapText)(long, 5);
            (0, chai_1.expect)(lines.length).to.be.greaterThan(1);
            for (const line of lines) {
                (0, chai_1.expect)(line.length).to.be.lessThanOrEqual(20);
            }
        });
        it('keeps CJK ideographic-space-separated phrases breakable', () => {
            const lines = (0, TextShaping_1.wrapText)('东京\u3000北京\u3000南京', 2);
            (0, chai_1.expect)(lines.length).to.be.greaterThan(2);
        });
    });
    describe('getJustifyOffset', () => {
        it('left justify returns 0', () => {
            (0, chai_1.expect)((0, TextShaping_1.getJustifyOffset)(5, 10, 'left')).to.equal(0);
        });
        it('right justify returns extra space', () => {
            (0, chai_1.expect)((0, TextShaping_1.getJustifyOffset)(5, 10, 'right')).to.equal(5);
        });
        it('center justify splits extra space', () => {
            (0, chai_1.expect)((0, TextShaping_1.getJustifyOffset)(5, 10, 'center')).to.equal(2.5);
        });
        it('auto justify centers for center anchor', () => {
            (0, chai_1.expect)((0, TextShaping_1.getJustifyOffset)(5, 10, 'auto', 'center')).to.equal(2.5);
        });
        it('auto justify right-justifies for left anchor', () => {
            (0, chai_1.expect)((0, TextShaping_1.getJustifyOffset)(5, 10, 'auto', 'left')).to.equal(5);
        });
        it('auto justify left-justifies for right anchor', () => {
            (0, chai_1.expect)((0, TextShaping_1.getJustifyOffset)(5, 10, 'auto', 'right')).to.equal(0);
        });
        it('auto justify centers for top-left anchor', () => {
            (0, chai_1.expect)((0, TextShaping_1.getJustifyOffset)(5, 10, 'auto', 'top-left')).to.equal(5);
        });
        it('auto without anchor defaults to center', () => {
            (0, chai_1.expect)((0, TextShaping_1.getJustifyOffset)(5, 10, 'auto')).to.equal(2.5);
        });
    });
    describe('getAnchorOffset', () => {
        it('center anchor returns [0,0]', () => {
            const [x, y] = (0, TextShaping_1.getAnchorOffset)(10, 10, 'center');
            (0, chai_1.expect)(x).to.equal(0);
            (0, chai_1.expect)(y).to.equal(0);
        });
        it('left anchor offsets x negatively', () => {
            const [x, y] = (0, TextShaping_1.getAnchorOffset)(10, 10, 'left');
            (0, chai_1.expect)(x).to.equal(-5);
            (0, chai_1.expect)(y).to.equal(0);
        });
        it('top-right anchor', () => {
            const [x, y] = (0, TextShaping_1.getAnchorOffset)(10, 10, 'top-right');
            (0, chai_1.expect)(x).to.equal(5);
            (0, chai_1.expect)(y).to.equal(-5);
        });
    });
    describe('shapeText', () => {
        it('shapes single-line text', () => {
            const shaped = (0, TextShaping_1.shapeText)('Hello', {
                fontSize: 16,
                maxWidth: 100,
                lineHeight: 1.2,
                letterSpacing: 0,
                justify: 'center',
                anchor: 'center',
                transform: 'none',
            });
            (0, chai_1.expect)(shaped.lines).to.have.length(1);
            (0, chai_1.expect)(shaped.lines[0].text).to.equal('Hello');
        });
        it('shapes multi-line text', () => {
            const shaped = (0, TextShaping_1.shapeText)('Hello World Foo Bar', {
                fontSize: 16,
                maxWidth: 5,
                lineHeight: 1.2,
                letterSpacing: 0,
                justify: 'center',
                anchor: 'center',
                transform: 'none',
            });
            (0, chai_1.expect)(shaped.lines.length).to.be.greaterThan(1);
        });
        it('applies text transform during shaping', () => {
            const shaped = (0, TextShaping_1.shapeText)('hello', {
                fontSize: 16,
                maxWidth: 100,
                lineHeight: 1.2,
                letterSpacing: 0,
                justify: 'center',
                anchor: 'center',
                transform: 'uppercase',
            });
            (0, chai_1.expect)(shaped.lines[0].text).to.equal('HELLO');
        });
        it('computes bounding box', () => {
            const shaped = (0, TextShaping_1.shapeText)('Test', {
                fontSize: 16,
                maxWidth: 100,
                lineHeight: 1.2,
                letterSpacing: 0,
                justify: 'center',
                anchor: 'center',
                transform: 'none',
            });
            (0, chai_1.expect)(shaped.top).to.be.lessThan(0);
            (0, chai_1.expect)(shaped.bottom).to.be.greaterThan(0);
            (0, chai_1.expect)(shaped.left).to.be.lessThan(0);
            (0, chai_1.expect)(shaped.right).to.be.greaterThan(0);
        });
        it('applies justify offsets to lines', () => {
            const shaped = (0, TextShaping_1.shapeText)('Hi World', {
                fontSize: 16,
                maxWidth: 100,
                lineHeight: 1.2,
                letterSpacing: 0,
                justify: 'right',
                anchor: 'center',
                transform: 'none',
            });
            (0, chai_1.expect)(shaped.lines[0].position[0]).to.be.greaterThanOrEqual(0);
        });
    });
    describe('generateTextQuads', () => {
        it('generates one quad per character', () => {
            const shaped = (0, TextShaping_1.shapeText)('ABC', {
                fontSize: 16,
                maxWidth: 100,
                lineHeight: 1.2,
                letterSpacing: 0,
                justify: 'center',
                anchor: 'center',
                transform: 'none',
            });
            const quads = (0, TextShaping_1.generateTextQuads)(shaped, 16, 0);
            (0, chai_1.expect)(quads.length).to.equal(3);
        });
        it('scales quads by font size', () => {
            const shaped = (0, TextShaping_1.shapeText)('A', {
                fontSize: 32,
                maxWidth: 100,
                lineHeight: 1.2,
                letterSpacing: 0,
                justify: 'center',
                anchor: 'center',
                transform: 'none',
            });
            const quads = (0, TextShaping_1.generateTextQuads)(shaped, 32, 0);
            (0, chai_1.expect)(quads[0].width).to.be.greaterThan(0);
            (0, chai_1.expect)(quads[0].height).to.equal(32);
        });
    });
    describe('isCJK', () => {
        it('detects CJK characters', () => {
            (0, chai_1.expect)((0, TextShaping_1.isCJK)('中')).to.be.true;
            (0, chai_1.expect)((0, TextShaping_1.isCJK)('あ')).to.be.true;
            (0, chai_1.expect)((0, TextShaping_1.isCJK)('a')).to.be.false;
            (0, chai_1.expect)((0, TextShaping_1.isCJK)('1')).to.be.false;
        });
    });
    describe('shapeText vertical mode', () => {
        it('shapes vertical CJK text', () => {
            const shaped = (0, TextShaping_1.shapeText)('東京特許許可局', {
                fontSize: 16,
                maxWidth: 10,
                lineHeight: 1.2,
                letterSpacing: 0,
                justify: 'center',
                anchor: 'center',
                transform: 'none',
                writingMode: ['vertical'],
            });
            (0, chai_1.expect)(shaped.writingMode).to.equal('vertical');
            (0, chai_1.expect)(shaped.lines.length).to.be.greaterThan(0);
        });
        it('shapes horizontal text by default', () => {
            const shaped = (0, TextShaping_1.shapeText)('Hello', {
                fontSize: 16,
                maxWidth: 100,
                lineHeight: 1.2,
                letterSpacing: 0,
                justify: 'center',
                anchor: 'center',
                transform: 'none',
            });
            (0, chai_1.expect)(shaped.writingMode).to.equal('horizontal');
        });
    });
    describe('getGlyphMetrics', () => {
        it('returns default metrics for Latin letter', () => {
            const m = (0, TextShaping_1.getGlyphMetrics)('a');
            (0, chai_1.expect)(m.width).to.be.greaterThan(0);
            (0, chai_1.expect)(m.height).to.be.greaterThan(0);
        });
        it('returns wider metrics for CJK', () => {
            const m = (0, TextShaping_1.getGlyphMetrics)('中');
            (0, chai_1.expect)(m.width).to.equal(1);
        });
        it('uses provided glyph lookup', () => {
            const lookup = {
                getMetrics: (_font, _char) => ({
                    glyphId: 65, width: 10, height: 20, left: 0, top: 2, advance: 12,
                }),
            };
            const m = (0, TextShaping_1.getGlyphMetrics)('A', lookup, 'test');
            (0, chai_1.expect)(m.width).to.equal(10);
            (0, chai_1.expect)(m.baseline).to.be.greaterThan(0);
        });
    });
    describe('measureTextWidth with glyph lookup', () => {
        it('uses glyph lookup when available', () => {
            const lookup = {
                getMetrics: (_font, _char) => ({
                    glyphId: 65, width: 10, height: 20, left: 0, top: 2, advance: 8,
                }),
            };
            const w = (0, TextShaping_1.measureTextWidth)('AB', 0, lookup, 'test');
            (0, chai_1.expect)(w).to.equal(16);
        });
        it('falls back to default when no glyph data', () => {
            const lookup = {
                getMetrics: () => undefined,
            };
            const w = (0, TextShaping_1.measureTextWidth)('A', 0, lookup, 'test');
            (0, chai_1.expect)(w).to.be.greaterThan(0);
        });
    });
    describe('RTL / Arabic', () => {
        it('detects Arabic characters', () => {
            (0, chai_1.expect)((0, TextShaping_1.isArabic)('ا')).to.be.true;
            (0, chai_1.expect)((0, TextShaping_1.isArabic)('a')).to.be.false;
        });
        it('detects RTL text', () => {
            (0, chai_1.expect)((0, TextShaping_1.hasRTL)('سلام')).to.be.true;
            (0, chai_1.expect)((0, TextShaping_1.hasRTL)('Hello')).to.be.false;
        });
        it('reverses RTL text', () => {
            (0, chai_1.expect)((0, TextShaping_1.reorderRTL)('سلام')).to.equal('مالس');
        });
        it('leaves LTR text unchanged', () => {
            (0, chai_1.expect)((0, TextShaping_1.reorderRTL)('Hello')).to.equal('Hello');
        });
        it('detects Hebrew characters', () => {
            (0, chai_1.expect)((0, TextShaping_1.isHebrew)('ש')).to.be.true;
        });
        it('shapeRTLText handles Arabic', () => {
            const result = (0, TextShaping_1.shapeRTLText)('السلام', 'none');
            (0, chai_1.expect)((0, TextShaping_1.hasRTL)(result)).to.be.true;
        });
        it('reorderRTL preserves LTR runs inside mixed text', () => {
            const result = (0, TextShaping_1.reorderRTL)('abc سلام def');
            (0, chai_1.expect)(result).to.contain('abc');
            (0, chai_1.expect)(result).to.contain('def');
            (0, chai_1.expect)(result).to.contain('مالس');
        });
        it('reshapeArabic converts base letters to Presentation Forms', () => {
            const isolated = (0, TextShaping_1.reshapeArabic)('ب');
            (0, chai_1.expect)(isolated.codePointAt(0)).to.equal(0xFE8F);
        });
        it('reshapeArabic selects final form at end of word', () => {
            const shaped = (0, TextShaping_1.reshapeArabic)('نب');
            (0, chai_1.expect)(shaped.codePointAt(shaped.length - 1)).to.be.at.least(0xFE70);
        });
        it('reshapeArabic handles the LAM-ALEF ligature', () => {
            const ligature = (0, TextShaping_1.reshapeArabic)('لا');
            (0, chai_1.expect)(ligature.length).to.be.lessThan('لا'.length);
            (0, chai_1.expect)(ligature.codePointAt(0)).to.be.at.least(0xFB50);
        });
        it('reshapeArabic passes through non-Arabic text unchanged', () => {
            (0, chai_1.expect)((0, TextShaping_1.reshapeArabic)('Hello 123')).to.equal('Hello 123');
        });
    });
});
//# sourceMappingURL=TextShapingTest.js.map