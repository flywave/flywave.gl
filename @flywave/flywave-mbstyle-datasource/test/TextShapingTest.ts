import { expect } from 'chai';
import {
    resolveTextField,
    applyTextTransform,
    measureTextWidth,
    wrapText,
    getJustifyOffset,
    getAnchorOffset,
    shapeText,
    generateTextQuads,
    isCJK,
    getGlyphMetrics,
} from '../src/TextShaping';

describe('TextShaping', () => {
    describe('resolveTextField', () => {
        it('returns plain text unchanged', () => {
            expect(resolveTextField('Hello', {})).to.equal('Hello');
        });

        it('replaces tokens with properties', () => {
            expect(resolveTextField('{name}', { name: 'Berlin' })).to.equal('Berlin');
        });

        it('replaces multiple tokens', () => {
            expect(resolveTextField('{city}, {country}', { city: 'Berlin', country: 'DE' })).to.equal('Berlin, DE');
        });

        it('handles missing properties', () => {
            expect(resolveTextField('{missing}', {})).to.equal('');
        });

        it('handles whitespace in token', () => {
            expect(resolveTextField('{ name }', { name: 'Paris' })).to.equal('Paris');
        });
    });

    describe('applyTextTransform', () => {
        it('uppercases text', () => {
            expect(applyTextTransform('hello', 'uppercase')).to.equal('HELLO');
        });

        it('lowercases text', () => {
            expect(applyTextTransform('HELLO', 'lowercase')).to.equal('hello');
        });

        it('leaves text unchanged for none', () => {
            expect(applyTextTransform('Hello', 'none')).to.equal('Hello');
        });
    });

    describe('measureTextWidth', () => {
        it('measures simple text', () => {
            const w = measureTextWidth('abc', 0);
            expect(w).to.be.greaterThan(0);
        });

        it('space is narrower than characters', () => {
            const wSpace = measureTextWidth(' ', 0);
            const wChar = measureTextWidth('a', 0);
            expect(wSpace).to.be.lessThan(wChar);
        });

        it('adds letter spacing', () => {
            const w1 = measureTextWidth('ab', 0);
            const w2 = measureTextWidth('ab', 0.5);
            expect(w2).to.be.greaterThan(w1);
        });
    });

    describe('wrapText', () => {
        it('keeps short text on one line', () => {
            const lines = wrapText('Hello', 100);
            expect(lines).to.have.length(1);
            expect(lines[0]).to.equal('Hello');
        });

        it('wraps long text', () => {
            const lines = wrapText('Hello World Foo Bar', 5);
            expect(lines.length).to.be.greaterThan(1);
        });

        it('respects explicit newlines', () => {
            const lines = wrapText('Line1\nLine2', 100);
            expect(lines).to.deep.equal(['Line1', 'Line2']);
        });

        it('handles empty string', () => {
            const lines = wrapText('', 100);
            expect(lines).to.have.length(0);
        });
    });

    describe('getJustifyOffset', () => {
        it('left justify returns 0', () => {
            expect(getJustifyOffset(5, 10, 'left')).to.equal(0);
        });

        it('right justify returns extra space', () => {
            expect(getJustifyOffset(5, 10, 'right')).to.equal(5);
        });

        it('center justify splits extra space', () => {
            expect(getJustifyOffset(5, 10, 'center')).to.equal(2.5);
        });
    });

    describe('getAnchorOffset', () => {
        it('center anchor returns [0,0]', () => {
            const [x, y] = getAnchorOffset(10, 10, 'center');
            expect(x).to.equal(0);
            expect(y).to.equal(0);
        });

        it('left anchor offsets x negatively', () => {
            const [x, y] = getAnchorOffset(10, 10, 'left');
            expect(x).to.equal(-5);
            expect(y).to.equal(0);
        });

        it('top-right anchor', () => {
            const [x, y] = getAnchorOffset(10, 10, 'top-right');
            expect(x).to.equal(5);
            expect(y).to.equal(-5);
        });
    });

    describe('shapeText', () => {
        it('shapes single-line text', () => {
            const shaped = shapeText('Hello', {
                fontSize: 16,
                maxWidth: 100,
                lineHeight: 1.2,
                letterSpacing: 0,
                justify: 'center',
                anchor: 'center',
                transform: 'none',
            });
            expect(shaped.lines).to.have.length(1);
            expect(shaped.lines[0].text).to.equal('Hello');
        });

        it('shapes multi-line text', () => {
            const shaped = shapeText('Hello World Foo Bar', {
                fontSize: 16,
                maxWidth: 5,
                lineHeight: 1.2,
                letterSpacing: 0,
                justify: 'center',
                anchor: 'center',
                transform: 'none',
            });
            expect(shaped.lines.length).to.be.greaterThan(1);
        });

        it('applies text transform during shaping', () => {
            const shaped = shapeText('hello', {
                fontSize: 16,
                maxWidth: 100,
                lineHeight: 1.2,
                letterSpacing: 0,
                justify: 'center',
                anchor: 'center',
                transform: 'uppercase',
            });
            expect(shaped.lines[0].text).to.equal('HELLO');
        });

        it('computes bounding box', () => {
            const shaped = shapeText('Test', {
                fontSize: 16,
                maxWidth: 100,
                lineHeight: 1.2,
                letterSpacing: 0,
                justify: 'center',
                anchor: 'center',
                transform: 'none',
            });
            expect(shaped.top).to.be.lessThan(0);
            expect(shaped.bottom).to.be.greaterThan(0);
            expect(shaped.left).to.be.lessThan(0);
            expect(shaped.right).to.be.greaterThan(0);
        });

        it('applies justify offsets to lines', () => {
            const shaped = shapeText('Hi World', {
                fontSize: 16,
                maxWidth: 100,
                lineHeight: 1.2,
                letterSpacing: 0,
                justify: 'right',
                anchor: 'center',
                transform: 'none',
            });
            // Right-justified: first line should have positive x offset
            expect(shaped.lines[0].position[0]).to.be.greaterThanOrEqual(0);
        });
    });

    describe('generateTextQuads', () => {
        it('generates one quad per character', () => {
            const shaped = shapeText('ABC', {
                fontSize: 16,
                maxWidth: 100,
                lineHeight: 1.2,
                letterSpacing: 0,
                justify: 'center',
                anchor: 'center',
                transform: 'none',
            });
            const quads = generateTextQuads(shaped, 16, 0);
            expect(quads.length).to.equal(3);
        });

        it('scales quads by font size', () => {
            const shaped = shapeText('A', {
                fontSize: 32,
                maxWidth: 100,
                lineHeight: 1.2,
                letterSpacing: 0,
                justify: 'center',
                anchor: 'center',
                transform: 'none',
            });
            const quads = generateTextQuads(shaped, 32, 0);
            expect(quads[0].width).to.be.greaterThan(0);
            expect(quads[0].height).to.equal(32);
        });
    });

    describe('isCJK', () => {
        it('detects CJK characters', () => {
            expect(isCJK('中')).to.be.true;
            expect(isCJK('あ')).to.be.true; // Hiragana
            expect(isCJK('a')).to.be.false;
            expect(isCJK('1')).to.be.false;
        });
    });

    describe('shapeText vertical mode', () => {
        it('shapes vertical CJK text', () => {
            const shaped = shapeText('東京特許許可局', {
                fontSize: 16,
                maxWidth: 10,
                lineHeight: 1.2,
                letterSpacing: 0,
                justify: 'center',
                anchor: 'center',
                transform: 'none',
                writingMode: ['vertical'],
            });
            expect(shaped.writingMode).to.equal('vertical');
            expect(shaped.lines.length).to.be.greaterThan(0);
        });

        it('shapes horizontal text by default', () => {
            const shaped = shapeText('Hello', {
                fontSize: 16,
                maxWidth: 100,
                lineHeight: 1.2,
                letterSpacing: 0,
                justify: 'center',
                anchor: 'center',
                transform: 'none',
            });
            expect(shaped.writingMode).to.equal('horizontal');
        });
    });

    describe('getGlyphMetrics', () => {
        it('returns default metrics for Latin letter', () => {
            const m = getGlyphMetrics('a');
            expect(m.width).to.be.greaterThan(0);
            expect(m.height).to.be.greaterThan(0);
        });

        it('returns wider metrics for CJK', () => {
            const m = getGlyphMetrics('中');
            expect(m.width).to.equal(1);
        });

        it('uses provided glyph lookup', () => {
            const lookup = {
                getMetrics: (_font: string, _char: string) => ({
                    glyphId: 65, width: 10, height: 20, left: 0, top: 2, advance: 12,
                }),
            };
            const m = getGlyphMetrics('A', lookup, 'test');
            expect(m.width).to.equal(10);
            expect(m.baseline).to.be.greaterThan(0);
        });
    });

    describe('measureTextWidth with glyph lookup', () => {
        it('uses glyph lookup when available', () => {
            const lookup = {
                getMetrics: (_font: string, _char: string) => ({
                    glyphId: 65, width: 10, height: 20, left: 0, top: 2, advance: 8,
                }),
            };
            const w = measureTextWidth('AB', 0, lookup, 'test');
            expect(w).to.equal(16); // 8 + 8 from advance
        });

        it('falls back to default when no glyph data', () => {
            const lookup = {
                getMetrics: () => undefined,
            };
            const w = measureTextWidth('A', 0, lookup, 'test');
            expect(w).to.be.greaterThan(0);
        });
    });
});
