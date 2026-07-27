import { expect } from 'chai';
import { CollisionIndex } from '../src/CollisionIndex';

describe('CollisionIndex', () => {
    it('allows placement on empty index', () => {
        const idx = new CollisionIndex();
        expect(idx.canPlace(100, 100, 50, 50, false, 0)).to.be.true;
    });

    it('detects overlapping boxes (higher priority can overlap)', () => {
        const idx = new CollisionIndex();
        idx.insert({ x: 100, y: 100, w: 50, h: 50, featureId: 'a', allowOverlap: false, priority: 0 });
        // Priority 1 > 0, so new symbol CAN overlap existing
        expect(idx.canPlace(120, 120, 50, 50, false, 1)).to.be.true;
    });

    it('lower priority cannot overlap higher priority', () => {
        const idx = new CollisionIndex();
        idx.insert({ x: 100, y: 100, w: 50, h: 50, featureId: 'a', allowOverlap: false, priority: 5 });
        expect(idx.canPlace(120, 120, 50, 50, false, 1)).to.be.false;
    });

    it('equal priority cannot overlap', () => {
        const idx = new CollisionIndex();
        idx.insert({ x: 100, y: 100, w: 50, h: 50, featureId: 'a', allowOverlap: false, priority: 3 });
        expect(idx.canPlace(120, 120, 50, 50, false, 3)).to.be.false;
    });

    it('allows non-overlapping boxes', () => {
        const idx = new CollisionIndex();
        idx.insert({ x: 100, y: 100, w: 50, h: 50, featureId: 'a', allowOverlap: false, priority: 0 });
        expect(idx.canPlace(300, 300, 50, 50, false, 1)).to.be.true;
    });

    it('allowOverlap bypasses collision check', () => {
        const idx = new CollisionIndex();
        idx.insert({ x: 100, y: 100, w: 50, h: 50, featureId: 'a', allowOverlap: false, priority: 0 });
        expect(idx.canPlace(120, 120, 50, 50, true, 1)).to.be.true;
    });

    it('higher priority replaces lower', () => {
        const idx = new CollisionIndex();
        idx.insert({ x: 100, y: 100, w: 50, h: 50, featureId: 'a', allowOverlap: false, priority: 1 });
        // Higher priority (2) can overlap lower priority (1)
        expect(idx.canPlace(100, 100, 50, 50, false, 2)).to.be.true;
    });

    it('lower priority cannot overlap higher', () => {
        const idx = new CollisionIndex();
        idx.insert({ x: 100, y: 100, w: 50, h: 50, featureId: 'a', allowOverlap: false, priority: 2 });
        expect(idx.canPlace(100, 100, 50, 50, false, 1)).to.be.false;
    });

    it('reset clears all boxes', () => {
        const idx = new CollisionIndex();
        idx.insert({ x: 100, y: 100, w: 50, h: 50, featureId: 'a', allowOverlap: false, priority: 0 });
        idx.reset();
        expect(idx.placedCount).to.equal(0);
        expect(idx.canPlace(100, 100, 50, 50, false, 0)).to.be.true;
    });

    it('handles many insertions', () => {
        const idx = new CollisionIndex();
        for (let i = 0; i < 100; i++) {
            idx.insert({
                x: i * 10, y: i * 10, w: 5, h: 5,
                featureId: i, allowOverlap: false, priority: i,
            });
        }
        expect(idx.placedCount).to.equal(100);
    });
});
