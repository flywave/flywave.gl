/* Copyright (C) 2025 flywave.gl contributors */

import {
    type Env,
    type PoiTechnique,
    getPropertyValue
} from "@flywave/flywave-datasource-protocol";
import { type Projection, OrientedBox3, ProjectionType } from "@flywave/flywave-geoutils";
import {
    type MeasurementParameters,
    type TextCanvas,
    type TextPlacement,
    hAlignFromPlacement,
    HorizontalPlacement,
    hPlacementFromAlignment,
    vAlignFromPlacement,
    VerticalPlacement,
    vPlacementFromAlignment
} from "@flywave/flywave-text-canvas";
import { assert, Math2D, MathUtils } from "@flywave/flywave-utils";
import * as THREE from "three/webgpu";

import { type PoiManager } from "../poi/PoiManager";
import { PoiRenderer } from "../poi/PoiRenderer";
import {
    type IBox,
    type ScreenCollisions,
    CollisionBox,
    DetailedCollisionBox
} from "../ScreenCollisions";
import { type ScreenProjector } from "../ScreenProjector";
import { type RenderState } from "./RenderState";
import { type PoiInfo, type TextElement, poiIsRenderable } from "./TextElement";
import { type TextElementState } from "./TextElementState";
import { TextElementType } from "./TextElementType";
import { type ViewState } from "./ViewState";

/**
 * Minimum number of pixels per character. Used during estimation if there is enough screen space
 * available to render a text.
 */
const MIN_AVERAGE_CHAR_WIDTH = 5;

/**
 * Functions related to text element placement.
 */

const tmpPosition = new THREE.Vector3(0, 0, 0);
const tmpCameraDir = new THREE.Vector3(0, 0, 0);
const tmpPointDir = new THREE.Vector3(0, 0, 0);
const COS_TEXT_ELEMENT_FALLOFF_ANGLE = 0.1736; // Math.cos(0.3 * Math.PI)

/**
 * Checks whether the distance of the text element to the camera plane meets threshold criteria.
 *
 * @param textElement - The textElement of which the view distance will be checked, with coordinates
 * in world space.
 * @param poiIndex - If TextElement is a line marker, the index into the line marker positions.
 * @param eyePos - The eye (or camera) position that will be used as reference to calculate
 * the distance.
 * @param eyeLookAt - The eye looking direction - normalized.
 * @param maxViewDistance - The maximum distance value.
 * @returns The text element view distance if it's lower than the maximum value, otherwise
 * `undefined`.
 */
function checkViewDistance(
    textElement: TextElement,
    poiIndex: number | undefined,
    eyePos: THREE.Vector3,
    eyeLookAt: THREE.Vector3,
    projectionType: ProjectionType,
    maxViewDistance: number
): number | undefined {
    const textDistance = computeViewDistance(textElement, poiIndex, eyePos, eyeLookAt);

    if (projectionType !== ProjectionType.Spherical) {
        return textDistance <= maxViewDistance ? textDistance : undefined;
    }

    // For sphere projection: Filter labels that are close to the horizon
    tmpPosition.copy(textElement.position).normalize();
    tmpCameraDir.copy(eyePos).normalize();
    const cosAlpha = tmpPosition.dot(tmpCameraDir);
    const viewDistance =
        cosAlpha > COS_TEXT_ELEMENT_FALLOFF_ANGLE && textDistance <= maxViewDistance
            ? textDistance
            : undefined;

    return viewDistance;
}

/**
 * Computes distance of the specified text element to camera plane given with position and normal.
 *
 * The distance is measured as projection of the vector between `eyePosition` and text
 * onto the `eyeLookAt` vector, so it actually computes the distance to plane that
 * contains `eyePosition` and is described with `eyeLookAt` as normal.
 *
 * @note Used for measuring the distances to camera, results in the metric that describes
 * distance to camera near plane (assuming near = 0). Such metric is better as input for labels
 * scaling or fading factors then simple euclidean distance because it does not fluctuate during
 * simple camera panning.
 *
 * @param textElement - The textElement of which the view distance will be checked. It must have
 *                      coordinates in world space.
 * @param poiIndex - If TextElement is a line marker, the index into the line marker positions.
 * @param eyePosition - The world eye coordinates used a reference position to calculate
 *                      the distance.
 * @param eyeLookAt - The eye looking direction or simply said projection plane normal.
 * @returns The text element view distance.
 */
export function computeViewDistance(
    textElement: TextElement,
    poiIndex: number | undefined,
    eyePosition: THREE.Vector3,
    eyeLookAt: THREE.Vector3
): number {
    let viewDistance: number;

    // Compute the distances as the distance along plane normal.
    const path = textElement.path;
    if (path && path.length > 1) {
        if (poiIndex !== undefined && path && path.length > poiIndex) {
            viewDistance = pointToPlaneDistance(path[poiIndex], eyePosition, eyeLookAt);
        } else {
            const viewDistance0 = pointToPlaneDistance(path[0], eyePosition, eyeLookAt);
            const viewDistance1 = pointToPlaneDistance(
                path[path.length - 1],
                eyePosition,
                eyeLookAt
            );

            viewDistance = Math.min(viewDistance0, viewDistance1);

            // Long ground paths (rail tracks, roads, rivers) frequently extend beyond the
            // camera plane: at oblique view angles one endpoint lies behind the camera while
            // a long middle section crosses the view. The endpoint minimum alone is then
            // negative, which dismisses the label even though its visible part is well in
            // front of the camera. When the path crosses the camera plane, measure the
            // distance of the in-front section instead: the smallest non-negative distance
            // among all path points (0 when none exists besides the crossing endpoints).
            if (viewDistance < 0 && Math.max(viewDistance0, viewDistance1) >= 0) {
                let minInFront = Infinity;
                for (const point of path) {
                    const d = pointToPlaneDistance(point, eyePosition, eyeLookAt);
                    if (d >= 0 && d < minInFront) {
                        minInFront = d;
                    }
                }
                viewDistance = minInFront === Infinity ? 0 : minInFront;
            }
        }
    } else {
        viewDistance = pointToPlaneDistance(textElement.position, eyePosition, eyeLookAt);
    }

    return viewDistance;
}

/**
 * Computes distance between the given point and a plane.
 *
 * May be used to measure distance of point labels to the camera projection (near) plane.
 *
 * @param pointPos - The position to measure distance to.
 * @param planePos - The position of any point on the plane.
 * @param planeNorm - The plane normal vector (have to be normalized already).
 */
export function pointToPlaneDistance(
    pointPos: THREE.Vector3,
    planePos: THREE.Vector3,
    planeNorm: THREE.Vector3
) {
    const labelCamVec = tmpPointDir.copy(pointPos).sub(planePos);
    return labelCamVec.dot(planeNorm);
}

/**
 * Computes the maximum view distance for text elements as a ratio of the given view's maximum far
 * plane distance.
 * @param viewState - The view for which the maximum view distance will be calculated.
 * @param farDistanceLimitRatio - The ratio to apply to the maximum far plane distance.
 * @returns Maximum view distance.
 */
export function getMaxViewDistance(viewState: ViewState, farDistanceLimitRatio: number): number {
    return viewState.maxVisibilityDist * farDistanceLimitRatio;
}

/**
 * State of fading.
 */
export enum PrePlacementResult {
    Ok = 0,
    NotReady,
    Invisible,
    TooFar,
    Duplicate,
    Count
}

const tmpPlacementPosition = new THREE.Vector3();

/**
 * Applies early rejection tests for a given text element meant to avoid trying to place labels
 * that are not visible, not ready, duplicates etc...
 * @param textElement - The Text element to check.
 * @param poiIndex - If TextElement is a line marker, the index into the line marker positions
 * @param viewState - The view for which the text element will be placed.
 * @param m_poiManager - To prepare pois for rendering.
 * @param maxViewDistance - If specified, text elements farther than this max distance will be
 *                          rejected.
 * @returns An object with the result code and the text element view distance
 * ( or `undefined` of the checks failed) as second.
 */
export function checkReadyForPlacement(
    textElement: TextElement,
    poiIndex: number | undefined,
    viewState: ViewState,
    poiManager: PoiManager,
    maxViewDistance?: number
): { result: PrePlacementResult; viewDistance: number | undefined } {
    // eslint-disable-next-line prefer-const
    let viewDistance: number | undefined;

    if (!textElement.visible) {
        return { result: PrePlacementResult.Invisible, viewDistance };
    }

    // If a PoiTable is specified in the technique, the table is required to be
    // loaded before the POI can be rendered.
    if (!poiManager.updatePoiFromPoiTable(textElement)) {
        // PoiTable has not been loaded, but is required to determine
        // visibility.
        return { result: PrePlacementResult.NotReady, viewDistance };
    }

    // Text element visibility and zoom level ranges must be checked after calling
    // updatePoiFromPoiTable, since that function may change those values.
    if (
        !textElement.visible ||
        viewState.zoomLevel === textElement.maxZoomLevel ||
        !MathUtils.isClamped(
            viewState.zoomLevel,
            textElement.minZoomLevel,
            textElement.maxZoomLevel
        )
    ) {
        return { result: PrePlacementResult.Invisible, viewDistance };
    }

    viewDistance =
        maxViewDistance === undefined
            ? computeViewDistance(
                  textElement,
                  poiIndex,
                  viewState.worldCenter,
                  viewState.lookAtVector
              )
            : checkViewDistance(
                  textElement,
                  poiIndex,
                  viewState.worldCenter,
                  viewState.lookAtVector,
                  viewState.projection.type,
                  maxViewDistance
              );

    if (viewDistance === undefined) {
        return { result: PrePlacementResult.TooFar, viewDistance };
    }

    return { result: PrePlacementResult.Ok, viewDistance };
}

/**
 * Computes the offset for a point text accordingly to text alignment (and icon, if any).
 * @param textElement - The text element of which the offset will computed. It must be a point
 * label with [[layoutStyle]] and [[bounds]] already computed.
 * @param textBounds - The text screen bounds.
 * @param placement - The relative anchor placement (may be different then original alignment).
 * @param scale - The scaling factor (due to distance, etc.).
 * @param env - The {@link @flywave/flywave-datasource-protocol#Env} used
 *                  to evaluate technique attributes.
 * @param offset - The offset result.
 */
function computePointTextOffset(
    textElement: TextElement,
    textBounds: THREE.Box2,
    placement: TextPlacement,
    scale: number,
    env: Env,
    offset: THREE.Vector2 = new THREE.Vector2()
): THREE.Vector2 {
    assert(
        textElement.type === TextElementType.PoiLabel ||
            textElement.type === TextElementType.LineMarker
    );
    assert(textElement.layoutStyle !== undefined);

    offset.x = textElement.xOffset;
    offset.y = textElement.yOffset;

    switch (placement.h) {
        case HorizontalPlacement.Left:
            // Already accounts for any margin that is already applied to the text element bounds.
            offset.x -= textBounds.max.x;
            break;
        case HorizontalPlacement.Right:
            // Account for any margin applied as above.
            offset.x -= textBounds.min.x;
            break;
    }
    switch (placement.v) {
        case VerticalPlacement.Top:
            offset.y -= textBounds.min.y;
            break;
        case VerticalPlacement.Center:
            offset.y -= 0.5 * (textBounds.max.y + textBounds.min.y);
            break;
        case VerticalPlacement.Bottom:
            // Accounts for vertical margin that may be applied to the text bounds.
            offset.y -= textBounds.max.y;
            break;
    }

    if (textElement.poiInfo !== undefined && poiIsRenderable(textElement.poiInfo)) {
        assert(textElement.poiInfo.computedWidth !== undefined);
        assert(textElement.poiInfo.computedHeight !== undefined);

        // Apply offset moving text out of the icon
        offset.x += textElement.poiInfo.computedWidth! * (0.5 + placement.h);
        offset.y += textElement.poiInfo.computedHeight! * (0.5 + placement.v);

        // Reverse, mirror or project offsets on different axis depending on the placement
        // required only for alternative placements.
        const hAlign = hPlacementFromAlignment(textElement.layoutStyle!.horizontalAlignment);
        const vAlign = vPlacementFromAlignment(textElement.layoutStyle!.verticalAlignment);
        if (hAlign !== placement.h || vAlign !== placement.v) {
            // Read icon offset used.
            const technique = textElement.poiInfo.technique;
            let iconXOffset = getPropertyValue(technique.iconXOffset, env);
            let iconYOffset = getPropertyValue(technique.iconYOffset, env);
            iconXOffset = typeof iconXOffset === "number" ? iconXOffset : 0;
            iconYOffset = typeof iconYOffset === "number" ? iconYOffset : 0;

            // Now mirror the text offset relative to icon so manhattan distance is preserved, when
            // alternative position is taken, this ensures that text-icon relative position is
            // the same as in base alignment.
            const hAlignDiff = hAlign - placement.h;
            const vAlignDiff = vAlign - placement.v;
            const relOffsetX = iconXOffset - textElement.xOffset;
            const relOffsetY = iconYOffset - textElement.yOffset;
            const centerBased =
                hAlign === HorizontalPlacement.Center || vAlign === VerticalPlacement.Center;
            if (centerBased) {
                // Center based alternative placements.
                offset.x += 2 * Math.abs(hAlignDiff) * relOffsetX;
                offset.y -= 2 * vAlignDiff * Math.abs(relOffsetX);

                offset.y += 2 * Math.abs(vAlignDiff) * relOffsetY;
                offset.x -= 2 * hAlignDiff * Math.abs(relOffsetY);
            } else {
                // Corner alternative placements
                offset.x += 2 * Math.min(Math.abs(hAlignDiff), 0.5) * relOffsetX;
                offset.y -=
                    2 *
                    Math.sign(vAlignDiff) *
                    Math.min(Math.abs(vAlignDiff), 0.5) *
                    Math.abs(relOffsetX);

                offset.y += 2 * Math.min(Math.abs(vAlignDiff), 0.5) * relOffsetY;
                offset.x -=
                    2 *
                    Math.sign(hAlignDiff) *
                    Math.min(Math.abs(hAlignDiff), 0.5) *
                    Math.abs(relOffsetY);
            }
        }
    }

    offset.multiplyScalar(scale);
    return offset;
}

const tmpBox = new THREE.Box2();
const tmpBounds = new THREE.Box2();
const tmpBoxes: THREE.Box2[] = [];
const tmpMeasurementParams: MeasurementParameters = {};
const tmpCollisionBoxes: CollisionBox[] = [];
const tmpCollisionBox = new CollisionBox();
const tmpScreenPosition = new THREE.Vector2();
const tmpTextOffset = new THREE.Vector2();
const tmp2DBox = new Math2D.Box();
const tmpCenter = new THREE.Vector2();
const tmpSize = new THREE.Vector2();

/**
 * The margin applied to the text bounds of every point label.
 */
export const persistentPointLabelTextMargin = new THREE.Vector2(2, 2);
/**
 * Additional bounds scaling (described as percentage of full size) applied to the new labels.
 *
 * This additional scaling (margin) allows to account for slight camera position and
 * orientation changes, so new labels are placed only if there is enough space around them.
 * Such margin limits collisions with neighboring labels while doing small camera movements and
 * thus reduces labels flickering.
 */
export const newPointLabelTextMarginPercent = 0.1;

export enum PlacementResult {
    Ok,
    Rejected,
    Invisible
}

/**
 * Places an icon on screen.
 * @param iconRenderState - The icon state.
 * @param poiInfo - Icon information necessary to compute its dimensions.
 * @param screenPosition - Screen position of the icon.
 * @param scaleFactor - Scaling factor to apply to the icon dimensions.
 * @param screenCollisions - Used to check the icon visibility and collisions.
 * @param env - Current map env.
 * @returns `PlacementResult.Ok` if icon can be placed, `PlacementResult.Rejected` if there's
 * a collision, `PlacementResult.Invisible` if it's not visible.
 */
export function placeIcon(
    iconRenderState: RenderState,
    poiInfo: PoiInfo,
    screenPosition: THREE.Vector2,
    scaleFactor: number,
    env: Env,
    screenCollisions: ScreenCollisions
): PlacementResult {
    PoiRenderer.computeIconScreenBox(poiInfo, screenPosition, scaleFactor, env, tmp2DBox);
    if (!screenCollisions.isVisible(tmp2DBox)) {
        return PlacementResult.Invisible;
    }

    const iconSpaceAvailable =
        poiInfo.mayOverlap === true || !screenCollisions.isAllocated(tmp2DBox);

    return !iconSpaceAvailable ? PlacementResult.Rejected : PlacementResult.Ok;
}

/**
 * Place a point label text using single or multiple alternative placement anchors.
 *
 * @param labelState - State of the point label to place.
 * @param screenPosition - Position of the label in screen coordinates.
 * @param scale - Scale factor to be applied to label dimensions.
 * @param textCanvas - The text canvas where the label will be placed.
 * @param env - The {@link @flywave/flywave-datasource-protocol#Env} used
 *              to evaluate technique attributes.
 * @param screenCollisions - Used to check collisions with other labels.
 * @param outScreenPosition - The final label screen position after applying any offsets.
 * @param multiAnchor - The parameter decides if multi-anchor placement algorithm should be
 * used, be default [[false]] meaning try to place label using current alignment settings only.
 * @returns `PlacementResult.Ok` if point __label can be placed__ at the base or any optional
 * anchor point. `PlacementResult.Rejected` if there's a collision for all placements. Finally
 * `PlacementResult.Invisible` if it's text is not visible at any placement position.
 */
export function placePointLabel(
    labelState: TextElementState,
    screenPosition: THREE.Vector2,
    scale: number,
    textCanvas: TextCanvas,
    env: Env,
    screenCollisions: ScreenCollisions,
    outScreenPosition: THREE.Vector3,
    multiAnchor: boolean = false
): PlacementResult {
    assert(labelState.element.layoutStyle !== undefined);

    const layoutStyle = labelState.element.layoutStyle!;

    // Check if alternative placements have been provided.
    multiAnchor =
        multiAnchor && layoutStyle.placements !== undefined && layoutStyle.placements.length > 1;
    // For single placement labels or labels with icon rejected, do only current anchor testing.
    if (!multiAnchor) {
        return placePointLabelAtCurrentAnchor(
            labelState,
            screenPosition,
            scale,
            textCanvas,
            env,
            screenCollisions,
            outScreenPosition
        );
    }
    // Otherwise test also alternative text placements.
    else {
        return placePointLabelChoosingAnchor(
            labelState,
            screenPosition,
            scale,
            textCanvas,
            env,
            screenCollisions,
            outScreenPosition
        );
    }
}

/**
 * Try to place a point label text using multiple optional placements.
 *
 * @note Function should be called only for labels with icons not rejected and for text alignments
 * different then [[HorizontalAlignment.Center]] and [[VerticalAlignment.Center]].
 *
 * @param labelState - State of the point label to place.
 * @param screenPosition - Position of the label in screen coordinates.
 * @param scale - Scale factor to be applied to label dimensions.
 * @param textCanvas - The text canvas where the label will be placed.
 * @param env - The {@link @flywave/flywave-datasource-protocol#Env}
 *              used to evaluate technique attributes.
 * @param screenCollisions - Used to check collisions with other labels.
 * @param outScreenPosition - The final label screen position after applying any offsets.
 * @returns `PlacementResult.Ok` if label can be placed at the base or optional anchor point,
 * `PlacementResult.Rejected` if there's a collision for all placements, `PlacementResult.Invisible`
 * if it's not visible at any placement position.
 *
 * @internal
 * @hidden
 */
function placePointLabelChoosingAnchor(
    labelState: TextElementState,
    screenPosition: THREE.Vector2,
    scale: number,
    textCanvas: TextCanvas,
    env: Env,
    screenCollisions: ScreenCollisions,
    outScreenPosition: THREE.Vector3
): PlacementResult {
    assert(labelState.element.layoutStyle !== undefined);
    const label = labelState.element;

    // Store label state - persistent or new label.
    const persistent = labelState.visible;

    // Start with last alignment settings if layout state was stored or
    // simply begin from layout defined in theme.
    const lastPlacement = labelState.textPlacement;
    const placements = label.layoutStyle!.placements;
    const placementsNum = placements.length;
    // Find current anchor placement on the optional placements list.
    // Index of exact match.
    const matchIdx = placements.findIndex(p => p.h === lastPlacement.h && p.v === lastPlacement.v);
    assert(matchIdx >= 0);
    // Will be true if all text placements are invisible.
    let allInvisible: boolean = true;

    // Iterate all placements starting from current one.
    for (let i = matchIdx; i < placementsNum + matchIdx; ++i) {
        const anchorPlacement = placements[i % placementsNum];

        // Bounds may be already calculated for persistent label, force re-calculation only
        // for alternative (new) placements.
        const isLastPlacement = i === matchIdx && persistent;
        // Compute label bounds, visibility or collision according to new layout settings.
        const placementResult = placePointLabelAtAnchor(
            labelState,
            screenPosition,
            anchorPlacement,
            scale,
            textCanvas,
            env,
            screenCollisions,
            !isLastPlacement,
            tmpPlacementPosition
        );

        if (placementResult === PlacementResult.Ok) {
            outScreenPosition.copy(tmpPlacementPosition);
            return PlacementResult.Ok;
        }
        // Store last successful (previous frame) position even if it's now rejected (to fade out).
        if (isLastPlacement) {
            outScreenPosition.copy(tmpPlacementPosition);
        }

        // Invisible = Persistent label out of screen or the new label that is colliding.
        allInvisible = allInvisible && placementResult === PlacementResult.Invisible;
    }

    return allInvisible
        ? // All text's placements out of the screen.
          PlacementResult.Invisible
        : // All placements are either colliding or out of screen .
          PlacementResult.Rejected;
}

/**
 * Places a point label on a specified text canvas using the alignment (anchor) currently set.
 *
 * @param labelState - State of the point label to place.
 * @param screenPosition - Position of the label in screen coordinates.
 * @param scale - Scale factor to be applied to label dimensions.
 * @param textCanvas - The text canvas where the label will be placed.
 * @param env - The {@link @flywave/flywave-datasource-protocol#Env}
 *              used to evaluate technique attributes.
 * @param screenCollisions - Used to check collisions with other labels.
 * @param outScreenPosition - The final label screen position after applying any offsets.
 * @returns `PlacementResult.Ok` if point label can be placed, `PlacementResult.Rejected` if there's
 * a collision, `PlacementResult.Invisible` if it's not visible.
 *
 * @internal
 * @hidden
 */
function placePointLabelAtCurrentAnchor(
    labelState: TextElementState,
    screenPosition: THREE.Vector2,
    scale: number,
    textCanvas: TextCanvas,
    env: Env,
    screenCollisions: ScreenCollisions,
    outScreenPosition: THREE.Vector3
): PlacementResult {
    assert(labelState.element.layoutStyle !== undefined);

    // Use recently rendered (state stored) layout if available, otherwise theme based style.
    const lastPlacement = labelState.textPlacement;
    const result = placePointLabelAtAnchor(
        labelState,
        screenPosition,
        lastPlacement,
        scale,
        textCanvas,
        env,
        screenCollisions,
        !labelState.visible,
        outScreenPosition
    );

    return result;
}

/**
 * Auxiliary function that tries to place a point label on a text canvas using specified alignment.
 *
 * @param labelState - State of the point label to place.
 * @param screenPosition - Position of the label in screen coordinates
 * @param placement - Text placement relative to the label position.
 * @param scale - Scale factor to be applied to label dimensions.
 * @param textCanvas - The text canvas where the label will be placed.
 * @param env - The {@link @flywave/flywave-datasource-protocol#Env}
 *              used to evaluate technique attributes.
 * @param screenCollisions - Used to check collisions with other labels.
 * @param forceInvalidation - Set to true if text layout or other params has changed such as text
 * re-measurement is required and text buffer need to be invalidated.
 * @param outScreenPosition - The final label screen position after applying any offsets.
 * @returns `PlacementResult.Ok` if point label can be placed, `PlacementResult.Rejected` if there's
 * a collision, `PlacementResult.Invisible` if it's not visible.
 *
 * @internal
 * @hidden
 */
function placePointLabelAtAnchor(
    labelState: TextElementState,
    screenPosition: THREE.Vector2,
    placement: TextPlacement,
    scale: number,
    textCanvas: TextCanvas,
    env: Env,
    screenCollisions: ScreenCollisions,
    forceInvalidation: boolean,
    outScreenPosition: THREE.Vector3
): PlacementResult {
    const label = labelState.element;
    assert(label.glyphs !== undefined);
    assert(label.layoutStyle !== undefined);

    const measureText = !label.bounds || forceInvalidation;

    const labelBounds = measureText ? tmpBounds : label.bounds!;
    if (measureText) {
        // Override text canvas layout style for measurement.
        applyTextPlacement(textCanvas, placement);

        tmpMeasurementParams.outputCharacterBounds = undefined;
        tmpMeasurementParams.path = undefined;
        tmpMeasurementParams.pathOverflow = true;
        tmpMeasurementParams.letterCaseArray = label.glyphCaseArray!;
        // Compute label bounds according to layout settings.
        textCanvas.measureText(label.glyphs!, labelBounds, tmpMeasurementParams);
    }

    // Compute text offset from the anchor point
    const textOffset = computePointTextOffset(
        label,
        labelBounds,
        placement,
        scale,
        env,
        tmpTextOffset
    ).add(screenPosition);

    // Update output screen position.
    outScreenPosition.set(textOffset.x, textOffset.y, labelState.renderDistance);

    // Apply additional persistent margin, keep in mind that text bounds just calculated
    // are not (0, 0, w, h) based, so their coords usually are also non-zero.
    // TODO: Make the margin configurable
    tmpBox.copy(labelBounds).expandByVector(persistentPointLabelTextMargin).translate(textOffset);
    tmpBox.getCenter(tmpCenter);
    tmpBox.getSize(tmpSize);

    tmpSize.multiplyScalar(scale);
    tmp2DBox.set(tmpCenter.x - tmpSize.x / 2, tmpCenter.y - tmpSize.y / 2, tmpSize.x, tmpSize.y);

    // Check the text visibility if invisible finish immediately
    // regardless of the persistence state - no fading required.
    if (!screenCollisions.isVisible(tmp2DBox)) {
        return PlacementResult.Invisible;
    }

    if (measureText) {
        // Up-scaled label bounds are used only for new labels and only for collision check, this
        // is intentional to avoid processing labels out of the screen due to increased bounds,
        // such labels would be again invisible in the next frame.
        tmpBox.getSize(tmpSize);
        tmpSize.multiplyScalar(scale * (1 + newPointLabelTextMarginPercent));
        tmp2DBox.set(
            tmpCenter.x - tmpSize.x / 2,
            tmpCenter.y - tmpSize.y / 2,
            tmpSize.x,
            tmpSize.y
        );
    }

    // Check label's text collision. Collision is more important than visibility (now), because for
    // icon/text combinations the icon should be rendered if the text is out of bounds, but it may
    // _not_ be rendered if the text is colliding with another label.
    if (!label.textMayOverlap && screenCollisions.isAllocated(tmp2DBox)) {
        return PlacementResult.Rejected;
    }

    // Don't allocate space for rejected text. When zooming, this allows placement of a
    // lower priority text element that was displaced by a higher priority one (not
    // present in the new zoom level) before an even lower priority one takes the space.
    // Otherwise the lowest priority text will fade in and back out.
    // TODO: Add a unit test for this scenario.
    if (label.textReservesSpace) {
        screenCollisions.allocate(tmp2DBox);
    }

    // Glyphs arrangement have been changed remove text buffer object which needs to be
    // re-created.
    if (measureText) {
        label.textBufferObject = undefined;
        label.bounds = label.bounds ? label.bounds.copy(labelBounds) : labelBounds.clone();
    } else {
        // Override text canvas layout style for placement.
        applyTextPlacement(textCanvas, placement);
    }

    // Save current placement in label state.
    // TextElementState creates layout snapshot solely for alternative placements which saves
    // memory that could be wasted on unnecessary objects construction.
    labelState.textPlacement = placement;

    return PlacementResult.Ok;
}

/**
 * Applied modified text layout style to TextCanvas for further use.
 * @param textCanvas - TextCanvas reference.
 * @param placement - The text placement to be used.
 */
function applyTextPlacement(textCanvas: TextCanvas, placement: TextPlacement) {
    // Setup TextCanvas layout settings of the new placement as it is required for further
    // TextBufferObject creation and measurements in addText().
    textCanvas.textLayoutStyle.horizontalAlignment = hAlignFromPlacement(placement.h);
    textCanvas.textLayoutStyle.verticalAlignment = vAlignFromPlacement(placement.v);
}

/**
 * Places a path label along a given path on a specified text canvas.
 * @param labelState - The state of the path label to place.
 * @param textPath - The text path along which the label will be placed.
 * @param screenPosition - Position of the label in screen coordinates.
 * @param textCanvas - The text canvas where the label will be placed.
 * @param screenCollisions - Used to check collisions with other labels.
 * @returns `PlacementResult.Ok` if path label can be placed, `PlacementResult.Rejected` if there's
 * a collision or text doesn't fit into path, `PlacementResult.Invisible` if it's not visible.
 */
export function placePathLabel(
    labelState: TextElementState,
    textPath: THREE.Path,
    screenPosition: THREE.Vector2,
    textCanvas: TextCanvas,
    screenCollisions: ScreenCollisions
): PlacementResult {
    // Recalculate the text bounds for this path label. If measurement fails, the whole
    // label doesn't fit the path and should be discarded.
    tmpMeasurementParams.path = textPath;
    tmpMeasurementParams.outputCharacterBounds = tmpBoxes;
    tmpMeasurementParams.letterCaseArray = labelState.element.glyphCaseArray!;

    // TODO: FLYWAVE-7648. TextCanvas.measureText does the placement as in TextCanvas.addText but
    // without storing the result. If the measurement succeeds, the placement work is done
    // twice.
    // This could be done in one step (e.g measureAndAddText). Collision test could be injected
    // in the middle as a function.
    if (!textCanvas.measureText(labelState.element.glyphs!, tmpBox, tmpMeasurementParams)) {
        return PlacementResult.Rejected;
    }

    // Coarse collision check.
    tmpCollisionBox.copy(tmpBox.translate(screenPosition));
    if (!screenCollisions.isVisible(tmpCollisionBox)) {
        return PlacementResult.Invisible;
    }

    let checkGlyphCollision = false;
    let candidateBoxes: IBox[] | undefined;
    if (!labelState.element.textMayOverlap) {
        candidateBoxes = screenCollisions.search(tmpCollisionBox);
        checkGlyphCollision = candidateBoxes.length > 0;
    }

    // Perform per-character collision checks.
    tmpCollisionBoxes.length = tmpBoxes.length;
    for (let i = 0; i < tmpBoxes.length; ++i) {
        const glyphBox = tmpBoxes[i].translate(screenPosition);
        let collisionBox = tmpCollisionBoxes[i];
        if (collisionBox === undefined) {
            collisionBox = new CollisionBox(glyphBox);
            tmpCollisionBoxes[i] = collisionBox;
        } else {
            collisionBox.copy(glyphBox);
        }

        if (
            checkGlyphCollision &&
            screenCollisions.intersectsDetails(collisionBox, candidateBoxes!)
        ) {
            return PlacementResult.Rejected;
        }
    }
    // Allocate collision info if needed.
    if (labelState.element.textReservesSpace) {
        const collisionBox = new DetailedCollisionBox(tmpCollisionBox, tmpCollisionBoxes.slice());
        tmpCollisionBoxes.length = 0;
        screenCollisions.allocate(collisionBox);
    }
    return PlacementResult.Ok;
}

/**
 * Clips a polyline to the screen bounds and returns the longest visible sub-polyline.
 *
 * Implements the fix for FLYWAVE-3515: long path labels (rail tracks, rivers, roads) keep
 * their text outside the visible viewport because the text is laid out along the whole
 * parameterized path, including parts that project far outside the screen. Clipping the
 * projected polyline to the screen rect confines the label to the visible part of the path.
 *
 * Points behind the camera (invalid projections) split the polyline into independent
 * sub-polylines; each is clipped separately and the longest result wins.
 *
 * @param points - Projected screen-space polyline points (screen coordinates, origin at
 * screen center). Points whose projection is invalid must already be excluded by the caller.
 * @param halfWidth - Half of the screen width in pixels.
 * @param halfHeight - Half of the screen height in pixels.
 * @returns The longest clipped sub-polyline (at least 2 points), or `undefined` when no
 * part of the polyline intersects the screen.
 */
function clipPolylineToScreen(
    points: THREE.Vector2[],
    halfWidth: number,
    halfHeight: number
): THREE.Vector2[] | undefined {
    if (points.length < 2) {
        return undefined;
    }
    const minX = -halfWidth;
    const minY = -halfHeight;
    const maxX = halfWidth;
    const maxY = halfHeight;
    const inside = (v: THREE.Vector2): boolean =>
        v.x >= minX && v.x <= maxX && v.y >= minY && v.y <= maxY;
    // Intersection of segment (a -> b) with the screen rect; undefined when the segment
    // is fully outside.
    const clipSegment = (a: THREE.Vector2, b: THREE.Vector2): THREE.Vector2[] | undefined => {
        let t0 = 0;
        let t1 = 1;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        // Liang-Barsky against the four rect edges.
        const edges: Array<[number, number]> = [
            [-dx, a.x - minX], // left:  p = -dx, q = a.x - minX
            [dx, maxX - a.x], // right
            [-dy, a.y - minY], // bottom
            [dy, maxY - a.y] // top
        ];
        for (const [p, q] of edges) {
            if (p === 0) {
                if (q < 0) {
                    return undefined;
                }
                continue;
            }
            const t = q / p;
            if (p < 0) {
                if (t > t1) {
                    return undefined;
                }
                if (t > t0) {
                    t0 = t;
                }
            } else {
                if (t < t0) {
                    return undefined;
                }
                if (t < t1) {
                    t1 = t;
                }
            }
        }
        return [
            new THREE.Vector2(a.x + t0 * dx, a.y + t0 * dy),
            new THREE.Vector2(a.x + t1 * dx, a.y + t1 * dy)
        ];
    };
    const measure = (poly: THREE.Vector2[]): number => {
        let length = 0;
        for (let i = 1; i < poly.length; ++i) {
            length += poly[i].distanceTo(poly[i - 1]);
        }
        return length;
    };
    let best: THREE.Vector2[] | undefined;
    let bestLength = -1;
    let current: THREE.Vector2[] = [];
    const flush = (): void => {
        if (current.length >= 2) {
            const length = measure(current);
            if (length > bestLength) {
                bestLength = length;
                best = current;
            }
        }
        current = [];
    };
    for (let i = 0; i < points.length; ++i) {
        const v = points[i];
        if (inside(v)) {
            current.push(v.clone());
            continue;
        }
        // Point outside: connect it to the previous inside point with the clipped
        // crossing segment, then start a new sub-polyline from the crossing segment.
        if (current.length > 0) {
            const clipped = clipSegment(current[current.length - 1], v);
            if (clipped !== undefined) {
                current.push(clipped[1]);
                flush();
            } else {
                flush();
            }
            // Re-enter the rect later: the crossing segment from v back into the rect.
            const next = points[i + 1];
            if (next !== undefined) {
                const reentry = clipSegment(v, next);
                if (reentry !== undefined && inside(reentry[0])) {
                    current = [reentry[0]];
                    continue;
                }
            }
            current = [];
        } else {
            // Current sub-polyline empty: v is outside, bridge to the next point.
            const next = points[i + 1];
            if (next === undefined) {
                break;
            }
            const clipped = clipSegment(v, next);
            if (clipped !== undefined && inside(clipped[0])) {
                current = [clipped[0]];
            }
        }
    }
    flush();
    return best;
}

/**
 * Check if a given path label is too small to be rendered.
 * @param textElement - The text element to check.
 * @param screenProjector - Used to project coordinates from world to screen space.
 * @param outScreenPoints - Label path projected to screen space.
 * @returns `true` if label is too small, `false` otherwise.
 */
export function isPathLabelTooSmall(
    textElement: TextElement,
    screenProjector: ScreenProjector,
    outScreenPoints: THREE.Vector2[]
): boolean {
    assert(textElement.type === TextElementType.PathLabel);

    // Get the screen points that define the label's segments and create a path with
    // them.
    outScreenPoints.length = 0;
    let anyPointVisible = false;

    for (const pt of textElement.points as THREE.Vector3[]) {
        // projectToScreen returns undefined for points behind the camera or beyond the
        // far plane: such points are invalid and split the path into sub-polylines.
        const screenPoint = screenProjector.projectToScreen(pt, tmpScreenPosition);
        if (screenPoint === undefined) {
            continue;
        }
        anyPointVisible = true;

        outScreenPoints.push(tmpScreenPosition.clone());
    }

    // FLYWAVE-3515: long paths (rail tracks, rivers, roads) keep extending far outside
    // the visible viewport. The label text is laid out along the whole parameterized
    // path, so whenever part of the path projects outside the screen the text ends up
    // outside as well and disappears. Clip the polyline to the screen bounds and lay
    // the text out on the longest visible part of the path.
    if (outScreenPoints.length >= 2) {
        const halfWidth = screenProjector.width / 2;
        const halfHeight = screenProjector.height / 2;
        const clipped = clipPolylineToScreen(outScreenPoints, halfWidth, halfHeight);
        if (clipped !== undefined) {
            outScreenPoints.length = 0;
            for (const v of clipped) {
                outScreenPoints.push(v);
            }
        }
    }

    // If not a single point is visible, skip the path
    if (!anyPointVisible || outScreenPoints.length < 2) {
        return true;
    }

    // Check/guess if the screen box can hold a string of that length. It is important
    // to guess that value without measuring the font first to save time.
    const minScreenSpace = textElement.text.length * MIN_AVERAGE_CHAR_WIDTH;

    tmpBox.setFromPoints(outScreenPoints);
    const boxDiagonalSq = tmpBox.max.sub(tmpBox.min).lengthSq();

    if (boxDiagonalSq < minScreenSpace * minScreenSpace) {
        textElement.dbgPathTooSmall = true;
        return true;
    }

    return false;
}

const tmpOrientedBox = new OrientedBox3();

/**
 * Calculates the world position of the supplied label. The label will be shifted if there is a
 * specified offsetDirection and value to shift it in.
 * @param poiLabel - The label to shift
 * @param projection - The projection, required to compute the correct direction offset for
 *                     spherical projections.
 * @param env - The environment to extract the worldOffset needed to shift the icon in world space,
 *              if configured in the style.
 * @param outWorldPosition - Preallocated vector to store the result in
 * @returns the [[outWorldPosition]] vector.
 */
export function getWorldPosition(
    poiLabel: TextElement,
    projection: Projection,
    env: Env,
    outWorldPosition: THREE.Vector3
): THREE.Vector3 {
    const worldOffsetShiftValue = getPropertyValue(
        (poiLabel.poiInfo?.technique as PoiTechnique)?.worldOffset,
        env
    );
    outWorldPosition?.copy(poiLabel.position);
    if (
        worldOffsetShiftValue !== null &&
        worldOffsetShiftValue !== undefined &&
        poiLabel.offsetDirection !== undefined
    ) {
        projection.localTangentSpace(poiLabel.position, tmpOrientedBox);
        const offsetDirectionVector = tmpOrientedBox.yAxis;
        const offsetDirectionRad = THREE.MathUtils.degToRad(poiLabel.offsetDirection);
        // Negate to get the normal, i.e. the vector pointing to the sky.
        offsetDirectionVector.applyAxisAngle(tmpOrientedBox.zAxis.negate(), offsetDirectionRad);

        outWorldPosition.addScaledVector(tmpOrientedBox.yAxis, worldOffsetShiftValue);
    }
    return outWorldPosition;
}
