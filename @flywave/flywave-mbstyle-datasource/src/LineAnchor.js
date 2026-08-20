"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getLineAnchors = getLineAnchors;
exports.getLineCenterAnchor = getLineCenterAnchor;
function getLineAnchors(points, spacing, maxAngle = 45 * Math.PI / 180) {
    if (points.length < 2)
        return [];
    const anchors = [];
    const distances = [0];
    for (let i = 1; i < points.length; i++) {
        const d = points[i].distanceTo(points[i - 1]);
        distances.push(distances[i - 1] + d);
    }
    const totalLength = distances[distances.length - 1];
    if (totalLength < spacing * 0.5) {
        const midT = 0.5;
        const anchor = interpolateAnchor(points, distances, midT);
        if (anchor)
            anchors.push(anchor);
        return anchors;
    }
    let dist = spacing / 2;
    while (dist < totalLength) {
        const t = dist / totalLength;
        const anchor = interpolateAnchor(points, distances, t);
        if (anchor) {
            if (anchors.length > 0) {
                const angleDiff = Math.abs(normalizeAngle(anchor.angle - anchors[anchors.length - 1].angle));
                if (angleDiff > maxAngle) {
                    dist += spacing;
                    continue;
                }
            }
            anchors.push(anchor);
        }
        dist += spacing;
    }
    return anchors;
}
function interpolateAnchor(points, distances, t) {
    const totalLength = distances[distances.length - 1];
    const targetDist = t * totalLength;
    let segIdx = 0;
    for (let i = 1; i < distances.length; i++) {
        if (distances[i] >= targetDist) {
            segIdx = i - 1;
            break;
        }
    }
    const segStart = points[segIdx];
    const segEnd = points[segIdx + 1];
    const segLen = distances[segIdx + 1] - distances[segIdx];
    const localT = segLen > 0 ? (targetDist - distances[segIdx]) / segLen : 0;
    const x = segStart.x + (segEnd.x - segStart.x) * localT;
    const y = segStart.y + (segEnd.y - segStart.y) * localT;
    const angle = Math.atan2(segEnd.y - segStart.y, segEnd.x - segStart.x);
    return { t, x, y, angle, segmentIndex: segIdx };
}
function normalizeAngle(a) {
    while (a > Math.PI)
        a -= 2 * Math.PI;
    while (a < -Math.PI)
        a += 2 * Math.PI;
    return a;
}
function getLineCenterAnchor(points) {
    if (points.length < 2)
        return undefined;
    return getLineAnchors(points, Infinity)[0];
}
//# sourceMappingURL=LineAnchor.js.map