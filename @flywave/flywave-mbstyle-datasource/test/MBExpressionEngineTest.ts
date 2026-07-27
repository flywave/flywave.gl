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
        expect(MBExpressionEngine.evaluate(['step', ['zoom'], 1, 10, 2, 20, 3], ctx2)).to.equal(3);
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

    it('evaluates color interpolation', () => {
        const ctx = createCtx();
        const result = MBExpressionEngine.evaluate(
            ['interpolate', ['linear'], ['zoom'], 0, '#000000', 10, '#ffffff'],
            { zoom: 5 }
        ) as string;
        expect(result).to.match(/^#[0-9a-f]{6}$/);
    });
});
