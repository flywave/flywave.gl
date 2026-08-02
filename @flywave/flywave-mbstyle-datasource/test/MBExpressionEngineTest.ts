import { expect } from 'chai';
import { MBExpressionEngine, MBExpressionContext, MBStyleFeature } from '../src/MBExpressionEngine';

describe('MBExpressionEngine', () => {
    const basicFeature: MBStyleFeature = {
        type: 'Point',
        id: 1,
        properties: {
            name: 'Test',
            population: 1000,
            class: 'primary',
            visible: true,
        },
    };

    const createCtx = (overrides?: Partial<MBExpressionContext>): MBExpressionContext => ({
        zoom: 10,
        feature: basicFeature,
        ...overrides,
    });

    it('evaluates get expression', () => {
        const ctx = createCtx();
        expect(MBExpressionEngine.evaluate(['get', 'name'], ctx)).to.equal('Test');
        expect(MBExpressionEngine.evaluate(['get', 'nonexistent'], ctx)).to.be.null;
    });

    it('evaluates has expression', () => {
        const ctx = createCtx();
        expect(MBExpressionEngine.evaluate(['has', 'name'], ctx)).to.be.true;
        expect(MBExpressionEngine.evaluate(['has', 'missing'], ctx)).to.be.false;
    });

    it('evaluates zoom expression', () => {
        const ctx = createCtx({ zoom: 5 });
        expect(MBExpressionEngine.evaluate(['zoom'], ctx)).to.equal(5);
    });

    it('evaluates == expression', () => {
        const ctx = createCtx();
        expect(MBExpressionEngine.evaluate(['==', ['get', 'class'], 'primary'], ctx)).to.be.true;
        expect(MBExpressionEngine.evaluate(['==', ['get', 'class'], 'secondary'], ctx)).to.be.false;
    });

    it('evaluates match expression', () => {
        const ctx = createCtx();
        const result = MBExpressionEngine.evaluate(
            ['match', ['get', 'class'], 'primary', 1, 'secondary', 2, 0],
            ctx
        );
        expect(result).to.equal(1);
    });

    it('evaluates step expression', () => {
        const ctx = createCtx({ zoom: 5 });
        expect(MBExpressionEngine.evaluate(['step', ['zoom'], 1, 10, 2, 20, 3], ctx)).to.equal(1);
        const ctx2 = createCtx({ zoom: 15 });
        expect(MBExpressionEngine.evaluate(['step', ['zoom'], 1, 10, 2, 20, 3], ctx2)).to.equal(2);
        const ctx3 = createCtx({ zoom: 25 });
        expect(MBExpressionEngine.evaluate(['step', ['zoom'], 1, 10, 2, 20, 3], ctx3)).to.equal(3);
    });

    it('evaluates interpolate expression', () => {
        const ctx = createCtx({ zoom: 12 });
        const result = MBExpressionEngine.evaluate(
            ['interpolate', ['linear'], ['zoom'], 0, 0, 20, 20],
            ctx
        ) as number;
        expect(result).to.be.closeTo(12, 0.01);
    });

    it('evaluates all/any/none', () => {
        const ctx = createCtx();
        expect(MBExpressionEngine.evaluate(['all', true, true], ctx)).to.be.true;
        expect(MBExpressionEngine.evaluate(['all', true, false], ctx)).to.be.false;
        expect(MBExpressionEngine.evaluate(['any', false, true], ctx)).to.be.true;
        expect(MBExpressionEngine.evaluate(['any', false, false], ctx)).to.be.false;
        expect(MBExpressionEngine.evaluate(['none', false, false], ctx)).to.be.true;
        expect(MBExpressionEngine.evaluate(['none', true, false], ctx)).to.be.false;
    });

    it('evaluates coalesce', () => {
        const ctx = createCtx();
        expect(MBExpressionEngine.evaluate(['coalesce', null, 'default'], ctx)).to.equal('default');
        expect(MBExpressionEngine.evaluate(['coalesce', 'first', 'default'], ctx)).to.equal('first');
    });

    it('evaluates arithmetic', () => {
        const ctx = createCtx();
        expect(MBExpressionEngine.evaluate(['+', 1, 2, 3], ctx)).to.equal(6);
        expect(MBExpressionEngine.evaluate(['-', 10, 3], ctx)).to.equal(7);
        expect(MBExpressionEngine.evaluate(['*', 3, 4], ctx)).to.equal(12);
        expect(MBExpressionEngine.evaluate(['/', 10, 2], ctx)).to.equal(5);
        expect(MBExpressionEngine.evaluate(['%', 10, 3], ctx)).to.equal(1);
        expect(MBExpressionEngine.evaluate(['^', 2, 3], ctx)).to.equal(8);
    });

        it('evaluates string operations', () => {
            const ctx = createCtx();
            expect(MBExpressionEngine.evaluate(['concat', 'a', 'b', 'c'], ctx)).to.equal('abc');
            expect(MBExpressionEngine.evaluate(['upcase', 'hello'], ctx)).to.equal('HELLO');
            expect(MBExpressionEngine.evaluate(['downcase', 'HELLO'], ctx)).to.equal('hello');
            expect(MBExpressionEngine.evaluate(['slice', 'hello', 1, 4], ctx)).to.equal('ell');
            expect(MBExpressionEngine.evaluate(['length', 'hello'], ctx)).to.equal(5);
        });

        it('format concatenates text sections and skips images', () => {
            const ctx = createCtx();
            // ["format", "Hello ", ["image", "icon"], " World"]
            // → "Hello  World" (image skipped)
            const result = MBExpressionEngine.evaluate(
                ['format', 'Hello ', ['image', 'icon'], ' World'],
                ctx,
            ) as string;
            expect(result).to.equal('Hello  World');
        });

        it('format handles section option objects', () => {
            const ctx = createCtx();
            // ["format", "Big", { "text-scale": 2 }, " Small", { "text-scale": 0.5 }]
            // → "Big Small" (options skipped)
            const result = MBExpressionEngine.evaluate(
                ['format', 'Big', { 'text-scale': 2 }, ' Small', { 'text-scale': 0.5 }],
                ctx,
            ) as string;
            expect(result).to.equal('Big Small');
        });

    it('evaluates color interpolation', () => {
        const ctx = createCtx();
        const result = MBExpressionEngine.evaluate(
            ['interpolate', ['linear'], ['zoom'], 0, '#000000', 10, '#ffffff'],
            { zoom: 5 }
        ) as string;
        expect(result).to.match(/^#[0-9a-f]{6}$/);
    });

    describe('new operators', () => {
        it('accumulated returns context value or 0', () => {
            const ctx = createCtx({ accumulated: 42 } as any);
            expect(MBExpressionEngine.evaluate(['accumulated'], ctx)).to.equal(42);
            const ctx2 = createCtx();
            expect(MBExpressionEngine.evaluate(['accumulated'], ctx2)).to.equal(0);
        });

        it('number-format formats numbers', () => {
            const ctx = createCtx();
            const result = MBExpressionEngine.evaluate(
                ['number-format', 1234.5, { 'min-fraction-digits': 2, 'max-fraction-digits': 2 }],
                ctx,
            ) as string;
            // Locale-dependent; should contain "50" at the end and digits of 1234
            // (separated by either comma or period or nothing).
            expect(result).to.match(/1[,.]?234/);
            expect(result).to.match(/50$/);
        });

        it('number-format handles non-finite input', () => {
            const ctx = createCtx();
            const result = MBExpressionEngine.evaluate(['number-format', NaN], ctx);
        });

        it('keys returns object keys', () => {
            const ctx = createCtx();
            const result = MBExpressionEngine.evaluate(
                ['keys', ['literal', { a: 1, b: 2, c: 3 }]],
                ctx,
            ) as string[];
            expect(result).to.have.members(['a', 'b', 'c']);
        });

        it('keys returns empty array for non-object', () => {
            const ctx = createCtx();
            expect(MBExpressionEngine.evaluate(['keys', 'hello'], ctx)).to.deep.equal([]);
        });

        it('values returns object values', () => {
            const ctx = createCtx();
            const result = MBExpressionEngine.evaluate(
                ['values', ['literal', { a: 1, b: 2 }]],
                ctx,
            ) as any[];
            expect(result).to.have.members([1, 2]);
        });

        it('zip combines arrays element-wise', () => {
            const ctx = createCtx();
            const result = MBExpressionEngine.evaluate(
                ['zip', ['literal', [1, 2, 3]], ['literal', ['a', 'b', 'c']]],
                ctx,
            ) as any[][];
            expect(result).to.deep.equal([[1, 'a'], [2, 'b'], [3, 'c']]);
        });

        it('zip truncates to the shortest array', () => {
            const ctx = createCtx();
            const result = MBExpressionEngine.evaluate(
                ['zip', ['literal', [1, 2]], ['literal', ['a', 'b', 'c']]],
                ctx,
            ) as any[][];
            expect(result).to.deep.equal([[1, 'a'], [2, 'b']]);
        });

        it('at accesses array element', () => {
            const ctx = createCtx();
            expect(MBExpressionEngine.evaluate(['at', 1, ['literal', [10, 20, 30]]], ctx)).to.equal(20);
        });

        it('slice supports arrays and strings', () => {
            const ctx = createCtx();
            expect(MBExpressionEngine.evaluate(['slice', ['literal', [1, 2, 3, 4]], 1, 3], ctx)).to.deep.equal([2, 3]);
            expect(MBExpressionEngine.evaluate(['slice', 'hello', 1, 3], ctx)).to.equal('el');
        });

        it('type assertion operators coerce values', () => {
            const ctx = createCtx();
            expect(MBExpressionEngine.evaluate(['number', '42'], ctx)).to.equal(42);
            expect(MBExpressionEngine.evaluate(['string', 42], ctx)).to.equal('42');
            expect(MBExpressionEngine.evaluate(['boolean', 0], ctx)).to.equal(false);
            expect(MBExpressionEngine.evaluate(['boolean', 1], ctx)).to.equal(true);
        });

        describe('collator-aware comparison', () => {
            it('strict equality without collator', () => {
                const ctx = createCtx();
                expect(MBExpressionEngine.evaluate(['==', 'Hello', 'Hello'], ctx)).to.equal(true);
                expect(MBExpressionEngine.evaluate(['==', 'Hello', 'hello'], ctx)).to.equal(false);
                expect(MBExpressionEngine.evaluate(['==', 'café', 'cafe'], ctx)).to.equal(false);
            });

            it('case-insensitive equality with collator', () => {
                const ctx = createCtx();
                expect(MBExpressionEngine.evaluate(
                    ['==', 'Hello', 'hello', ['collator', { 'case-sensitive': false, 'diacritic-sensitive': false }]],
                    ctx,
                )).to.equal(true);
            });

            it('diacritic-insensitive equality with collator', () => {
                const ctx = createCtx();
                expect(MBExpressionEngine.evaluate(
                    ['==', 'café', 'cafe', ['collator', { 'case-sensitive': true, 'diacritic-sensitive': false }]],
                    ctx,
                )).to.equal(true);
            });

            it('case- and diacritic-insensitive together', () => {
                const ctx = createCtx();
                expect(MBExpressionEngine.evaluate(
                    ['==', 'Café', 'cafe', ['collator', { 'case-sensitive': false, 'diacritic-sensitive': false }]],
                    ctx,
                )).to.equal(true);
            });

            it('!= with collator flips the result', () => {
                const ctx = createCtx();
                expect(MBExpressionEngine.evaluate(
                    ['!=', 'Hello', 'hello', ['collator', { 'case-sensitive': false, 'diacritic-sensitive': false }]],
                    ctx,
                )).to.equal(false);
            });

            it('collator defaults to case- and diacritic-sensitive', () => {
                const ctx = createCtx();
                // With no flags set, collator opts default to sensitive.
                expect(MBExpressionEngine.evaluate(
                    ['==', 'Hello', 'hello', ['collator', {}]],
                    ctx,
                )).to.equal(false);
            });
        });

        describe('within', () => {
            // A square filter polygon from (0,0) to (10,10).
            const squarePoly = {
                type: 'Polygon',
                coordinates: [[[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]]],
            };
            // The same square with a square hole from (3,3) to (7,7).
            const squareWithHole = {
                type: 'Polygon',
                coordinates: [
                    [[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]],
                    [[3, 3], [7, 3], [7, 7], [3, 7], [3, 3]],
                ],
            };
            // Two disjoint squares as a MultiPolygon.
            const multiPoly = {
                type: 'MultiPolygon',
                coordinates: [
                    [[[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]]],
                    [[[20, 20], [30, 20], [30, 30], [20, 30], [20, 20]]],
                ],
            };

            const featAt = (lng: number, lat: number): MBStyleFeature => ({
                type: 'Point',
                properties: {},
                _geom: { type: 'Point', coordinates: [lng, lat] },
            });

            it('returns true when point is inside polygon', () => {
                const ctx = { zoom: 0, feature: featAt(5, 5) };
                expect(MBExpressionEngine.evaluate(['within', squarePoly], ctx)).to.equal(true);
            });

            it('returns false when point is outside polygon', () => {
                const ctx = { zoom: 0, feature: featAt(15, 15) };
                expect(MBExpressionEngine.evaluate(['within', squarePoly], ctx)).to.equal(false);
            });

            it('returns false when point is inside the polygon\'s hole', () => {
                const ctx = { zoom: 0, feature: featAt(5, 5) };
                expect(MBExpressionEngine.evaluate(['within', squareWithHole], ctx)).to.equal(false);
            });

            it('returns true when point is in polygon but outside the hole', () => {
                const ctx = { zoom: 0, feature: featAt(1, 1) };
                expect(MBExpressionEngine.evaluate(['within', squareWithHole], ctx)).to.equal(true);
            });

            it('returns true for MultiPolygon when point is in any constituent polygon', () => {
                expect(MBExpressionEngine.evaluate(
                    ['within', multiPoly],
                    { zoom: 0, feature: featAt(5, 5) },
                )).to.equal(true);
                expect(MBExpressionEngine.evaluate(
                    ['within', multiPoly],
                    { zoom: 0, feature: featAt(25, 25) },
                )).to.equal(true);
                expect(MBExpressionEngine.evaluate(
                    ['within', multiPoly],
                    { zoom: 0, feature: featAt(15, 15) },
                )).to.equal(false);
            });

            it('returns false for non-polygon filter geometries', () => {
                const ctx = { zoom: 0, feature: featAt(5, 5) };
                const lineFilter = { type: 'LineString', coordinates: [[0, 0], [10, 10]] };
                expect(MBExpressionEngine.evaluate(['within', lineFilter], ctx)).to.equal(false);
            });

            it('within in a filter expression combines with other operators', () => {
                // ["within", poly] used inside an `all` / `case` expression.
                const ctx = { zoom: 0, feature: featAt(5, 5) };
                expect(MBExpressionEngine.evaluate(
                    ['all', ['within', squarePoly], ['==', ['get', 'x'], 1]],
                    { ...ctx, feature: { ...ctx.feature, properties: { x: 1 } } },
                )).to.equal(true);
            });

            it('LineString feature entirely inside polygon → true', () => {
                const lineFeature = {
                    type: 'LineString',
                    properties: {},
                    _geom: { type: 'Point', coordinates: [5, 5] },
                    _lineGeom: [[1, 1], [5, 5], [9, 9]],
                } as any;
                expect(MBExpressionEngine.featureWithin(lineFeature, squarePoly)).to.equal(true);
            });

            it('LineString feature with a vertex outside polygon → false', () => {
                const lineFeature = {
                    type: 'LineString',
                    properties: {},
                    _geom: { type: 'Point', coordinates: [5, 5] },
                    _lineGeom: [[1, 1], [15, 15]], // second vertex outside
                } as any;
                expect(MBExpressionEngine.featureWithin(lineFeature, squarePoly)).to.equal(false);
            });

            it('Polygon feature entirely inside polygon → true', () => {
                const polyFeature = {
                    type: 'Polygon',
                    properties: {},
                    _geom: { type: 'Point', coordinates: [5, 5] },
                    _polyGeom: [[[1, 1], [9, 1], [9, 9], [1, 9], [1, 1]]], // inner square
                } as any;
                expect(MBExpressionEngine.featureWithin(polyFeature, squarePoly)).to.equal(true);
            });

            it('Polygon feature straddling polygon boundary → false', () => {
                const polyFeature = {
                    type: 'Polygon',
                    properties: {},
                    _geom: { type: 'Point', coordinates: [10, 10] },
                    _polyGeom: [[[5, 5], [15, 5], [15, 15], [5, 15], [5, 5]]],
                } as any;
                expect(MBExpressionEngine.featureWithin(polyFeature, squarePoly)).to.equal(false);
            });

            it('LineString feature entirely inside the MultiPolygon → true', () => {
                const lineFeature = {
                    type: 'LineString',
                    properties: {},
                    _geom: { type: 'Point', coordinates: [5, 5] },
                    _lineGeom: [[1, 1], [5, 5], [9, 9]],
                } as any;
                expect(MBExpressionEngine.featureWithin(lineFeature, multiPoly)).to.equal(true);
            });
        });
    });
});
