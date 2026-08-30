import { expect } from 'chai';
import { CollisionIndex } from '../src/CollisionIndex';

describe('CollisionIndex', () => {
    it('allows placement on empty index', () => {
        const idx = new CollisionIndex();
        expect(idx.canPlace(100, 100, 50, 50, false, 0)).to.be.true;
    });

    it('any intersection rejects regardless of priority (mgl placeCollisionBox)', () => {
        const idx = new CollisionIndex();
        idx.insert({ x: 100, y: 100, w: 50, h: 50, featureId: 'a', allowOverlap: false, priority: 0 });
        // mgl semantics (72fbc74a): placement ORDER decides the winner —
        // priority is not consulted inside canPlace.
        expect(idx.canPlace(120, 120, 50, 50, false, 1)).to.be.false;
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

    it('same box placement after insert rejects regardless of priority', () => {
        const idx = new CollisionIndex();
        idx.insert({ x: 100, y: 100, w: 50, h: 50, featureId: 'a', allowOverlap: false, priority: 1 });
        // Higher priority (2) overlapping an existing box still rejects:
        // mgl placeCollisionBox has no priority override.
        expect(idx.canPlace(100, 100, 50, 50, false, 2)).to.be.false;
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
    it('crossSourceCollisions=false: same group collides, other group does not (mgl CollisionGroups)', () => {
        const idx = new CollisionIndex();
        const box = { x: 100, y: 100, w: 50, h: 50, featureId: 'a', allowOverlap: false, priority: 0 };
        idx.insert({ ...box, groupId: 'source1' });
        // Same group: rejected.
        expect(idx.canPlace(120, 120, 50, 50, false, 0, 'source1')).to.be.false;
        // Other group: mgl CollisionGroups predicate isolates sources.
        expect(idx.canPlace(120, 120, 50, 50, false, 0, 'source2')).to.be.true;
        // Default single-group (crossSourceCollisions true) still rejects.
        expect(idx.canPlace(120, 120, 50, 50, false, 0)).to.be.false;
    });
});
