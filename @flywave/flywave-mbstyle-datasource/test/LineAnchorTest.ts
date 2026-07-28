import { expect } from 'chai';
import * as THREE from 'three';
import { getLineAnchors, getLineCenterAnchor } from '../src/LineAnchor';

describe('LineAnchor', () => {
    it('returns empty for < 2 points', () => {
        expect(getLineAnchors([], 100)).to.have.length(0);
        expect(getLineAnchors([new THREE.Vector2(0, 0)], 100)).to.have.length(0);
    });

    it('places single anchor for short line', () => {
        const pts = [new THREE.Vector2(0, 0), new THREE.Vector2(10, 0)];
        const anchors = getLineAnchors(pts, 100);
        expect(anchors).to.have.length(1);
    });

    it('places multiple anchors for long line', () => {
        const pts = [
            new THREE.Vector2(0, 0),
            new THREE.Vector2(100, 0),
            new THREE.Vector2(200, 0),
        ];
        const anchors = getLineAnchors(pts, 50);
        expect(anchors.length).to.be.greaterThan(1);
    });

    it('computes angle at each anchor', () => {
        const pts = [new THREE.Vector2(0, 0), new THREE.Vector2(100, 0)];
        const anchors = getLineAnchors(pts, 50);
        for (const a of anchors) {
            expect(a.angle).to.be.a('number');
        }
    });

    it('getLineCenterAnchor returns center', () => {
        const pts = [new THREE.Vector2(0, 0), new THREE.Vector2(100, 0)];
        const anchor = getLineCenterAnchor(pts);
        expect(anchor).to.not.be.undefined;
        if (anchor) {
            expect(anchor.x).to.be.closeTo(50, 10);
        }
    });
});
