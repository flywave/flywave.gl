import * as THREE from 'three';
export interface LineAnchor {
    t: number;
    x: number;
    y: number;
    angle: number;
    segmentIndex: number;
}
export declare function getLineAnchors(points: THREE.Vector2[], spacing: number, maxAngle?: number): LineAnchor[];
export declare function getLineCenterAnchor(points: THREE.Vector2[]): LineAnchor | undefined;
//# sourceMappingURL=LineAnchor.d.ts.map