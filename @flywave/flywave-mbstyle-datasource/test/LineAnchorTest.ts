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

    it('respects max-angle filtering at sharp corners', () => {
        // L-shape: horizontal then vertical. With a tight max-angle, anchors
        // near the right-angle corner should be suppressed.
        const pts = [
            new THREE.Vector2(0, 0),
            new THREE.Vector2(100, 0),
            new THREE.Vector2(100, 100),
            new THREE.Vector2(200, 100),
        ];
        // With a permissive max-angle (180°), many anchors survive.
        const permissive = getLineAnchors(pts, 30, Math.PI);
        // With a tight max-angle (e.g. 30°), fewer anchors survive corner filtering.
        const tight = getLineAnchors(pts, 30, 30 * Math.PI / 180);
        expect(permissive.length).to.be.greaterThanOrEqual(tight.length);
    });

    it('produces anchors along the line at roughly regular spacing', () => {
        const pts = [
            new THREE.Vector2(0, 0),
            new THREE.Vector2(1000, 0),
        ];
        const anchors = getLineAnchors(pts, 200);
        expect(anchors.length).to.be.greaterThan(1);
        // Successive anchors should be roughly `spacing` apart in screen space.
        for (let i = 1; i < anchors.length; i++) {
            const dx = anchors[i].x - anchors[i - 1].x;
            const dy = anchors[i].y - anchors[i - 1].y;
            const dist = Math.hypot(dx, dy);
            // Allow tolerance for the half-spacing start and end clipping.
            expect(dist).to.be.greaterThan(50);
        }
    });

    it('assigns segment index along the polyline', () => {
        const pts = [
            new THREE.Vector2(0, 0),
            new THREE.Vector2(100, 0),
            new THREE.Vector2(200, 0),
        ];
        const anchors = getLineAnchors(pts, 50);
        for (const a of anchors) {
            expect(a.segmentIndex).to.be.at.least(0);
            expect(a.segmentIndex).to.be.lessThan(pts.length - 1);
        }
    });
});
