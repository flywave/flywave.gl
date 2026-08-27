import * as THREE from 'three';

/**
 * Anchor points along a line for symbol-placement:line / line-center.
 *
 * Faithful port of mapbox-gl-js src/symbol/get_anchors.ts (getAnchors,
 * getCenterAnchor, resample) and src/symbol/check_max_angle.ts:
 *
 * - Labels repeat every `spacing`; the FIRST-anchor offset is
 *   `(shapedLabelLength/2 + glyphSize*2) % spacing` for non-continued lines
 *   (half-spacing for lines continued across a tile boundary) — NOT a plain
 *   half-spacing start.
 * - If the label is long relative to the spacing, the spacing grows so there
 *   is always ≥ spacing/4 between label edges.
 * - An anchor survives only if the WHOLE label fits on the line
 *   (`distance ± labelLength/2` inside `[0, lineLength]`) and the anchor is
 *   inside the tile/viewport bounds.
 * - Sharp-curve rejection runs a sliding window (`3/5 · glyphSize`) over the
 *   LABEL length summing absolute turn angles (checkMaxAngle), instead of
 *   comparing each anchor to its neighbor.
 * - When no anchor fits and the line is not continued, one anchor is retried
 *   at the middle of the line.
 */

export interface LineAnchor {
    /** Distance along the line (0-1 normalized) */
    t: number;
    /** Position in the same coordinate space as the input points */
    x: number;
    y: number;
    /** Angle of the segment at this point (radians) */
    angle: number;
    /** Segment index */
    segmentIndex: number;
}

export interface GetLineAnchorsOptions {
    /**
     * Max combined turn angle allowed within an angular window along the
     * label (radians; mgl `text-max-angle` degrees × π/180).
     */
    maxAngle?: number;
    /** Shaped label length = max(text extent, icon extent), in point units. */
    labelLength?: number;
    /** Glyph size (mgl glyphSize = shaped text size); sets the angular window. */
    glyphSize?: number;
    /** mgl boxScale — multiplier applied to lengths (1 in screen space). */
    boxScale?: number;
    /** Storage-level overscale of the rendered tile (mgl overscaling). */
    overscaling?: number;
    /** Bounds (in point units) anchors must fall inside (mgl tile-extent test). */
    bounds?: { minX: number; minY: number; maxX: number; maxY: number };
}

interface Pt {
    x: number;
    y: number;
}

function ptDist(a: Pt, b: Pt): number {
    return Math.hypot(b.x - a.x, b.y - a.y);
}

function angleTo(a: Pt, b: Pt): number {
    return Math.atan2(b.y - a.y, b.x - a.x);
}

function getLineLength(line: ReadonlyArray<Pt>): number {
    let len = 0;
    for (let k = 0; k < line.length - 1; k++) {
        len += ptDist(line[k], line[k + 1]);
    }
    return len;
}

/**
 * mgl check_max_angle.ts verbatim semantics: walk backwards to where the
 * label starts, then forwards along the label keeping a sliding list of
 * recent corners; fail when the summed absolute turn angle within the last
 * `windowSize` distance exceeds `maxAngle`, or when the label runs past
 * either end of the line.
 */
function checkMaxAngle(
    line: ReadonlyArray<Pt>,
    anchorSegment: number,
    labelLength: number,
    windowSize: number,
    maxAngle: number,
): boolean {
    if (anchorSegment === undefined || anchorSegment < 0) return true;

    let index = anchorSegment + 1;
    let anchorDistance = 0;

    // Move backwards along the line to the first segment the label appears on.
    while (anchorDistance > -labelLength / 2) {
        index--;
        if (index < 0) return false; // not enough room after the line start
        anchorDistance -= ptDist(line[index], line[index + 1]);
    }

    anchorDistance += ptDist(line[index], line[index + 1]);
    index++;

    const recentCorners: Array<{ distance: number; angleDelta: number }> = [];
    let recentAngleDelta = 0;

    // Move forwards by the label length checking angles along the way.
    while (anchorDistance < labelLength / 2) {
        const prev = line[index - 1];
        const current = line[index];
        const next = line[index + 1];
        if (!next) return false; // not enough room before the line end

        let angleDelta = angleTo(prev, current) - angleTo(current, next);
        angleDelta = Math.abs(((angleDelta + 3 * Math.PI) % (Math.PI * 2)) - Math.PI);

        recentCorners.push({ distance: anchorDistance, angleDelta });
        recentAngleDelta += angleDelta;

        while (anchorDistance - recentCorners[0].distance > windowSize) {
            recentAngleDelta -= recentCorners.shift()!.angleDelta;
        }
        if (recentAngleDelta > maxAngle) return false;

        index++;
        anchorDistance += ptDist(current, next);
    }
    return true;
}/**
 * Generate label anchors along a polyline — port of mgl getAnchors+resample.
 *
 * `points` are in ONE shared unit space (screen px or world units); all
 * option lengths use the same units.
 */
export function getLineAnchors(
    points: THREE.Vector2[],
    spacing: number,
    maxAngle: number = 45 * Math.PI / 180,
    options?: GetLineAnchorsOptions,
): LineAnchor[] {
    if (points.length < 2) return [];
    const maxAngleRad = maxAngle;
    if (!options) options = {};

    const labelLengthOpt = (options.labelLength ?? 0) * (options.boxScale ?? 1);
    const glyphSize = options.glyphSize ?? 16;
    const boxScale = options.boxScale ?? 1;
    const overscaling = options.overscaling ?? 1;
    const bounds = options.bounds;
    const shapedLabelLength = labelLengthOpt;
    const angleWindowSize = labelLengthOpt > 0 ? 3 / 5 * glyphSize * boxScale : 0;
    const labelLength = shapedLabelLength * boxScale;

    // Is the line continued from outside the tile boundary? (mgl: geometry
    // touching the tile-extent edge; in view space the analogue is a line
    // starting exactly on the bounds edge.)
    const isLineContinued = bounds !== undefined &&
        (points[0].x === bounds.minX || points[0].x === bounds.maxX ||
            points[0].y === bounds.minY || points[0].y === bounds.maxY);

    // If the label nearly fills the gap between repeats, grow the spacing so
    // there is always ≥ spacing/4 of free space between label edges.
    if (spacing - labelLength < spacing / 4) {
        spacing = labelLength + spacing / 4;
    }

    // First-anchor offset: label-half + fixed extra (avoids collisions at T
    // intersections) modulo spacing; half-spacing for continued lines.
    const fixedExtraOffset = glyphSize * 2;
    const offset = !isLineContinued ?
        ((shapedLabelLength / 2 + fixedExtraOffset) * boxScale * overscaling) % spacing :
        (spacing / 2 * overscaling) % spacing;

    return resample(
        points, offset, spacing, angleWindowSize, maxAngleRad,
        labelLength, shapedLabelLength, isLineContinued, false, bounds);
}

function resample(
    line: ReadonlyArray<Pt>,
    offset: number,
    spacing: number,
    angleWindowSize: number,
    maxAngle: number,
    labelLength: number,
    shapedLabelLength: number,
    isLineContinued: boolean,
    placeAtMiddle: boolean,
    bounds?: { minX: number; minY: number; maxX: number; maxY: number },
): LineAnchor[] {
    const halfLabelLength = labelLength / 2;
    const lineLength = getLineLength(line);

    let distance = 0;
    let markedDistance = offset - spacing;

    const anchors: LineAnchor[] = [];

    for (let i = 0; i < line.length - 1; i++) {
        const a = line[i];
        const b = line[i + 1];

        const segmentDist = ptDist(a, b);
        const angle = angleTo(a, b);

        while (markedDistance + spacing < distance + segmentDist) {
            markedDistance += spacing;

            const t = (markedDistance - distance) / segmentDist;
            const x = a.x + (b.x - a.x) * t;
            const y = a.y + (b.y - a.y) * t;

            // Inside the tile/viewport bounds and the label fits entirely on
            // the remaining line on both sides?
            const inBounds = !bounds ||
                (x >= bounds.minX && x < bounds.maxX && y >= bounds.minY && y < bounds.maxY);
            if (inBounds &&
                markedDistance - halfLabelLength >= 0 &&
                markedDistance + halfLabelLength <= lineLength) {
                const segIdx = i;
                if (!angleWindowSize ||
                    checkMaxAngle(line, segIdx, labelLength, angleWindowSize, maxAngle)) {
                    anchors.push({
                        t: lineLength > 0 ? markedDistance / lineLength : 0,
                        x, y, angle, segmentIndex: segIdx,
                    });
                }
            }
        }

        distance += segmentDist;
    }

    if (!placeAtMiddle && !anchors.length && !isLineContinued) {
        // Nothing fit — retry once with a single anchor at the middle of the
        // line (most relevant for short lines in overscaled tiles).
        return resample(
            line, distance / 2, spacing, angleWindowSize, maxAngle,
            labelLength, shapedLabelLength, isLineContinued, true, bounds);
    }

    return anchors;
}

/**
 * line-center: a single anchor at the visual center of the line — port of
 * mgl getCenterAnchor (label-fit and max-angle checks apply).
 */
export function getLineCenterAnchor(
    points: ReadonlyArray<Pt>,
    options?: GetLineAnchorsOptions,
): LineAnchor | undefined {
    if (!options) options = {};
    if (points.length < 2) return undefined;

    const labelLengthOpt = (options.labelLength ?? 0) * (options.boxScale ?? 1);
    const glyphSize = options.glyphSize ?? 16;
    const boxScale = options.boxScale ?? 1;
    const maxAngle = options.maxAngle ?? 45 * Math.PI / 180;
    const angleWindowSize = labelLengthOpt > 0 ? 3 / 5 * glyphSize * boxScale : 0;
    const labelLength = labelLengthOpt * boxScale;

    const lineLength = getLineLength(points);
    const centerDistance = lineLength / 2;

    let prevDistance = 0;
    for (let i = 0; i < points.length - 1; i++) {
        const a = points[i];
        const b = points[i + 1];
        const segmentDistance = ptDist(a, b);
        if (prevDistance + segmentDistance > centerDistance) {
            const t = (centerDistance - prevDistance) / segmentDistance;
            const x = a.x + (b.x - a.x) * t;
            const y = a.y + (b.y - a.y) * t;
            const fits =
                (!angleWindowSize ||
                    checkMaxAngle(points, i, labelLength, angleWindowSize, maxAngle));
            if (!fits) return undefined;
            return { t: 0.5, x, y, angle: angleTo(a, b), segmentIndex: i };
        }
        prevDistance += segmentDistance;
    }
    return undefined;
}
