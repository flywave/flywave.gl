"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const chai_1 = require("chai");
const THREE = __importStar(require("three"));
const LineAnchor_1 = require("../src/LineAnchor");
describe('LineAnchor', () => {
    it('returns empty for < 2 points', () => {
        (0, chai_1.expect)((0, LineAnchor_1.getLineAnchors)([], 100)).to.have.length(0);
        (0, chai_1.expect)((0, LineAnchor_1.getLineAnchors)([new THREE.Vector2(0, 0)], 100)).to.have.length(0);
    });
    it('places single anchor for short line', () => {
        const pts = [new THREE.Vector2(0, 0), new THREE.Vector2(10, 0)];
        const anchors = (0, LineAnchor_1.getLineAnchors)(pts, 100);
        (0, chai_1.expect)(anchors).to.have.length(1);
    });
    it('places multiple anchors for long line', () => {
        const pts = [
            new THREE.Vector2(0, 0),
            new THREE.Vector2(100, 0),
            new THREE.Vector2(200, 0),
        ];
        const anchors = (0, LineAnchor_1.getLineAnchors)(pts, 50);
        (0, chai_1.expect)(anchors.length).to.be.greaterThan(1);
    });
    it('computes angle at each anchor', () => {
        const pts = [new THREE.Vector2(0, 0), new THREE.Vector2(100, 0)];
        const anchors = (0, LineAnchor_1.getLineAnchors)(pts, 50);
        for (const a of anchors) {
            (0, chai_1.expect)(a.angle).to.be.a('number');
        }
    });
    it('getLineCenterAnchor returns center', () => {
        const pts = [new THREE.Vector2(0, 0), new THREE.Vector2(100, 0)];
        const anchor = (0, LineAnchor_1.getLineCenterAnchor)(pts);
        (0, chai_1.expect)(anchor).to.not.be.undefined;
        if (anchor) {
            (0, chai_1.expect)(anchor.x).to.be.closeTo(50, 10);
        }
    });
    it('respects max-angle filtering at sharp corners', () => {
        const pts = [
            new THREE.Vector2(0, 0),
            new THREE.Vector2(100, 0),
            new THREE.Vector2(100, 100),
            new THREE.Vector2(200, 100),
        ];
        const permissive = (0, LineAnchor_1.getLineAnchors)(pts, 30, Math.PI);
        const tight = (0, LineAnchor_1.getLineAnchors)(pts, 30, 30 * Math.PI / 180);
        (0, chai_1.expect)(permissive.length).to.be.greaterThanOrEqual(tight.length);
    });
    it('produces anchors along the line at roughly regular spacing', () => {
        const pts = [
            new THREE.Vector2(0, 0),
            new THREE.Vector2(1000, 0),
        ];
        const anchors = (0, LineAnchor_1.getLineAnchors)(pts, 200);
        (0, chai_1.expect)(anchors.length).to.be.greaterThan(1);
        for (let i = 1; i < anchors.length; i++) {
            const dx = anchors[i].x - anchors[i - 1].x;
            const dy = anchors[i].y - anchors[i - 1].y;
            const dist = Math.hypot(dx, dy);
            (0, chai_1.expect)(dist).to.be.greaterThan(50);
        }
    });
    it('assigns segment index along the polyline', () => {
        const pts = [
            new THREE.Vector2(0, 0),
            new THREE.Vector2(100, 0),
            new THREE.Vector2(200, 0),
        ];
        const anchors = (0, LineAnchor_1.getLineAnchors)(pts, 50);
        for (const a of anchors) {
            (0, chai_1.expect)(a.segmentIndex).to.be.at.least(0);
            (0, chai_1.expect)(a.segmentIndex).to.be.lessThan(pts.length - 1);
        }
    });
});
//# sourceMappingURL=LineAnchorTest.js.map