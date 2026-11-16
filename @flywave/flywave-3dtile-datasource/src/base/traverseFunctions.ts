/* Copyright (C) 2025 flywave.gl contributors */

import { TILE_REFINEMENT } from "../loader/types";
import { type LoadState, FAILED, LOADED, UNLOADED } from "./constants";
import { type ITile, type TileInternal } from "./Tile";
import { type TilesRendererBase } from "./TilesRendererBase";

export interface ViewErrorTarget {
    inView: boolean;
    error: number;
    distanceFromCamera: number;
}

const viewErrorTarget: ViewErrorTarget = {
    inView: false,
    error: Infinity,
    distanceFromCamera: Infinity
};

function isDownloadFinished(value: LoadState): boolean {
    return value === LOADED || value === FAILED;
}

function isUsedThisFrame(tile: ITile, frameCount: number): boolean {
    return tile.__lastFrameVisited === frameCount && !!tile.__used;
}

function areChildrenProcessed(tile: TileInternal): boolean {
    return tile.__childrenProcessed === tile.children.length;
}

/**
 * Resets the per-frame traversal state of a tile.
 *
 * `computeViewError` can be disabled for passes that only update the frame state (for example
 * {@link toggleTiles}), avoiding redundant screen space error calculations.
 */
function resetFrameState(
    tile: TileInternal,
    renderer: TilesRendererBase,
    computeViewError: boolean = true
): void {
    if (tile.__lastFrameVisited !== renderer.frameCount) {
        tile.__lastFrameVisited = renderer.frameCount;
        tile.__used = false;
        tile.__inFrustum = false;
        tile.__isLeaf = false;
        tile.__visible = false;
        tile.__active = false;
        tile.__error = Infinity;
        tile.__distanceFromCamera = Infinity;
        tile.__childrenWereVisible = false;
        tile.__allChildrenLoaded = false;

        // A tile whose content is an external tileset or an implicit subtree cannot render
        // anything itself, so it has to keep refining even after the error target is met.
        // The same applies to a tile whose geometric error is not lower than the nearest such
        // ancestor (matches CesiumJS and 3DTilesRendererJS 0.5.4).
        let unconditionallyRefine = !!tile.__hasUnrenderableContent;
        if (!unconditionallyRefine) {
            let ancestor = tile.parent as TileInternal | undefined;
            while (ancestor && ancestor.__unconditionallyRefine) {
                ancestor = ancestor.parent as TileInternal | undefined;
            }
            if (ancestor && ancestor.geometricError <= tile.geometricError) {
                unconditionallyRefine = true;
            }
        }
        tile.__unconditionallyRefine = unconditionallyRefine;

        if (computeViewError) {
            renderer.calculateTileViewError(tile, viewErrorTarget);
            tile.__inFrustum = viewErrorTarget.inView;
            tile.__error = viewErrorTarget.error;
            tile.__distanceFromCamera = viewErrorTarget.distanceFromCamera;
        }
    }
}

/**
 * Recursively marks a tile as used down to the next layer, skipping external tilesets.
 *
 * When `cacheOnly` is true the tiles are only kept in the LRU cache (so they are not disposed
 * and re-downloaded when the camera moves back) without being counted as used for rendering.
 */
function recursivelyMarkUsed(
    tile: TileInternal,
    renderer: TilesRendererBase,
    cacheOnly: boolean = false
): void {
    renderer.ensureChildrenArePreprocessed(tile);
    resetFrameState(tile, renderer);

    if (cacheOnly) {
        renderer.markTileUsed(tile);
    } else {
        markUsed(tile, renderer);
    }

    const shouldTraverse = cacheOnly
        ? !!tile.__unconditionallyRefine
        : !tile.__hasRenderableContent;
    if (shouldTraverse && areChildrenProcessed(tile)) {
        const children = tile.children;
        for (let i = 0, l = children.length; i < l; i++) {
            recursivelyMarkUsed(children[i] as TileInternal, renderer, cacheOnly);
        }
    }
}

function recursivelyLoadNextRenderableTiles(tile: TileInternal, renderer: TilesRendererBase): void {
    renderer.ensureChildrenArePreprocessed(tile);

    if (isUsedThisFrame(tile, renderer.frameCount)) {
        if (tile.__hasContent && tile.__loadingState === UNLOADED && !renderer.lruCache.isFull()) {
            renderer.queueTileForDownload(tile);
        }

        if (areChildrenProcessed(tile)) {
            const children = tile.children;
            for (let i = 0, l = children.length; i < l; i++) {
                recursivelyLoadNextRenderableTiles(children[i] as TileInternal, renderer);
            }
        }
    }
}

function markUsed(tile: ITile, renderer: TilesRendererBase): void {
    if (tile.__used) {
        return;
    }

    tile.__used = true;
    renderer.markTileUsed(tile);
    renderer.stats.used++;

    if (tile.__inFrustum === true) {
        renderer.stats.inFrustum++;
    }
}

function canTraverse(tile: TileInternal, renderer: TilesRendererBase): boolean {
    // Tiles that only contain an external tileset or implicit subtree (and their descendants
    // sharing the same geometric error) must keep refining even once the error target is met,
    // otherwise the whole subtree would stop rendering.
    // Tiles without any content are structural containers (e.g. a Cesium ion root that only
    // points at an external tileset); they can never render anything themselves, so they must
    // keep refining as well. Stopping there leaves the whole tileset blank.
    if (
        tile.__error !== undefined &&
        tile.__error <= renderer.errorTarget &&
        !tile.__unconditionallyRefine &&
        !!tile.__hasContent
    ) {
        return false;
    }

    if (
        renderer.maxDepth > 0 &&
        tile.__depth !== undefined &&
        tile.__depth + 1 >= renderer.maxDepth
    ) {
        return false;
    }

    if (!areChildrenProcessed(tile)) {
        return false;
    }

    return true;
}

export function traverseSet(
    tile: TileInternal,
    beforeCb?: (tile: TileInternal, parent?: TileInternal, depth?: number) => boolean | void,
    afterCb?: (tile: TileInternal, parent?: TileInternal, depth?: number) => void
): void {
    const stack: Array<ITile | null | number> = [];

    stack.push(tile);
    stack.push(null);
    stack.push(0);

    while (stack.length > 0) {
        const depth = stack.pop() as number;
        const parent = stack.pop() as TileInternal | null;
        const tile = stack.pop() as TileInternal;

        if (beforeCb && beforeCb(tile, parent, depth)) {
            if (afterCb) {
                afterCb(tile, parent, depth);
            }
            return;
        }

        const children = tile.children;

        if (children) {
            for (let i = children.length - 1; i >= 0; i--) {
                stack.push(children[i]);
                stack.push(tile);
                stack.push(depth + 1);
            }
        }

        if (afterCb) {
            afterCb(tile, parent, depth);
        }
    }
}

export function markUsedTiles(tile: TileInternal, renderer: TilesRendererBase): void {
    renderer.ensureChildrenArePreprocessed(tile);
    resetFrameState(tile, renderer);

    if (!tile.__inFrustum) {
        return;
    }

    // Skip a child of an additive tile if the parent already meets the error target in the
    // child's region. This optimization is only valid when the parent actually renders
    // something: a parent holding an external tileset or implicit subtree shares its geometric
    // error with its child, so the ratio would be 1 and the whole subtree would be skipped.
    const parent = tile.parent as TileInternal | undefined;
    if (
        parent &&
        parent.refine === TILE_REFINEMENT.ADD &&
        !parent.__hasUnrenderableContent &&
        tile.geometricError > 0 &&
        (tile.__error as number) * (parent.geometricError / tile.geometricError) <=
            renderer.errorTarget
    ) {
        return;
    }

    if (!canTraverse(tile, renderer)) {
        markUsed(tile, renderer);
        return;
    }

    let anyChildrenUsed = false;
    let anyChildrenInFrustum = false;
    const children = tile.children;
    for (let i = 0, l = children.length; i < l; i++) {
        const c = children[i] as TileInternal;
        markUsedTiles(c, renderer);
        anyChildrenUsed = anyChildrenUsed || isUsedThisFrame(c, renderer.frameCount);
        anyChildrenInFrustum = anyChildrenInFrustum || !!c.__inFrustum;
    }

    // If none of the children are in the frustum then there is no reason to display this tile.
    // Keep this tile and its children in the cache (but not used) so they are not disposed,
    // which would cause repeated load/unload flicker while the camera moves.
    if (tile.refine === TILE_REFINEMENT.REPLACE && !anyChildrenInFrustum && children.length !== 0) {
        tile.__inFrustum = false;
        renderer.markTileUsed(tile);
        for (let i = 0, l = children.length; i < l; i++) {
            recursivelyMarkUsed(children[i] as TileInternal, renderer, true);
        }
        return;
    }

    markUsed(tile, renderer);

    if (anyChildrenUsed && tile.refine === TILE_REFINEMENT.REPLACE) {
        for (let i = 0, l = children.length; i < l; i++) {
            const c = children[i] as TileInternal;
            recursivelyMarkUsed(c, renderer);
        }
    }
}

export function markUsedSetLeaves(tile: TileInternal, renderer: TilesRendererBase): void {
    const frameCount = renderer.frameCount;
    if (!isUsedThisFrame(tile, frameCount)) {
        return;
    }

    const children = tile.children;
    let anyChildrenUsed = false;
    for (let i = 0, l = children.length; i < l; i++) {
        const c = children[i];
        anyChildrenUsed = anyChildrenUsed || isUsedThisFrame(c, frameCount);
    }

    if (!anyChildrenUsed) {
        tile.__isLeaf = true;
    } else {
        let childrenWereVisible = false;
        let allChildrenLoaded = true;
        for (let i = 0, l = children.length; i < l; i++) {
            const c = children[i] as TileInternal;
            markUsedSetLeaves(c, renderer);
            childrenWereVisible =
                childrenWereVisible || !!c.__wasSetVisible || !!c.__childrenWereVisible;

            if (isUsedThisFrame(c, frameCount)) {
                // Consider a child loaded when its own children are loaded, its content is
                // ready, it is completely empty, or an external tileset failed to load.
                const childLoaded =
                    !!c.__allChildrenLoaded ||
                    (!!c.__hasRenderableContent && isDownloadFinished(c.__loadingState!)) ||
                    (!c.__hasContent && c.children.length === 0) ||
                    (!!c.__hasUnrenderableContent && c.__loadingState === FAILED);
                allChildrenLoaded = allChildrenLoaded && childLoaded;
            }
        }

        tile.__childrenWereVisible = childrenWereVisible;
        tile.__allChildrenLoaded = allChildrenLoaded;
    }
}

export function markVisibleTiles(tile: TileInternal, renderer: TilesRendererBase): void {
    const stats = renderer.stats;
    if (!isUsedThisFrame(tile, renderer.frameCount)) {
        return;
    }

    const lruCache = renderer.lruCache;
    if (tile.__isLeaf) {
        if (tile.__loadingState === LOADED) {
            if (tile.__inFrustum) {
                tile.__visible = true;
                stats.visible++;
            }
            tile.__active = true;
            stats.active++;
        } else if (!lruCache.isFull() && tile.__hasContent) {
            renderer.queueTileForDownload(tile);
        }
        return;
    }

    const children = tile.children;
    const hasContent = !!tile.__hasContent;
    const loadedContent = isDownloadFinished(tile.__loadingState!) && hasContent;
    const errorRequirement = (renderer.errorTarget + 1) * renderer.errorThreshold;
    const meetsSSE = tile.__error !== undefined && tile.__error <= errorRequirement;
    const childrenWereVisible = !!tile.__childrenWereVisible;
    const allChildrenLoaded = !!tile.__allChildrenLoaded;
    const includeTile = meetsSSE || tile.refine === TILE_REFINEMENT.ADD;

    if (includeTile && !loadedContent && !lruCache.isFull() && hasContent) {
        renderer.queueTileForDownload(tile);
    }

    if (
        (meetsSSE && !allChildrenLoaded && !childrenWereVisible && loadedContent) ||
        (tile.refine === TILE_REFINEMENT.ADD && loadedContent)
    ) {
        if (tile.__inFrustum) {
            tile.__visible = true;
            stats.visible++;
        }
        tile.__active = true;
        stats.active++;
    }

    if (tile.refine === TILE_REFINEMENT.REPLACE && meetsSSE && !allChildrenLoaded) {
        for (let i = 0, l = children.length; i < l; i++) {
            const c = children[i] as TileInternal;
            if (isUsedThisFrame(c, renderer.frameCount)) {
                recursivelyLoadNextRenderableTiles(c, renderer);
            }
        }
    } else {
        for (let i = 0, l = children.length; i < l; i++) {
            markVisibleTiles(children[i] as TileInternal, renderer);
        }
    }
}

export function toggleTiles(tile: TileInternal, renderer: TilesRendererBase): void {
    // Only update the frame state here: the screen space error was already computed during the
    // traversal, and tiles that are not visited this frame only need their state reset.
    resetFrameState(tile, renderer, false);

    const isUsed = isUsedThisFrame(tile, renderer.frameCount);
    if (isUsed || tile.__usedLastFrame) {
        let setActive = false;
        let setVisible = false;
        if (isUsed) {
            setActive = !!tile.__active;
            setVisible = renderer.displayActiveTiles
                ? !!tile.__active || !!tile.__visible
                : !!tile.__visible;
        }

        if (tile.__hasRenderableContent && tile.__loadingState === LOADED) {
            if (tile.__wasSetActive !== setActive) {
                renderer.setTileActive(tile, setActive);
            }

            if (tile.__wasSetVisible !== setVisible) {
                renderer.setTileVisible(tile, setVisible);
            }
        }
        tile.__wasSetActive = setActive;
        tile.__wasSetVisible = setVisible;
        tile.__usedLastFrame = isUsed;

        const children = tile.children;
        for (let i = 0, l = children.length; i < l; i++) {
            const c = children[i] as TileInternal;
            toggleTiles(c, renderer);
        }
    }
}

export function traverseAncestors(
    tile: ITile,
    callback: ((tile: ITile, parent: ITile | null, depth: number) => void) | null = null
): void {
    let current: ITile | undefined = tile;

    while (current) {
        const depth = current.__depth || 0;
        const parent = current.parent || null;

        if (callback) {
            callback(current, parent, depth);
        }

        current = parent;
    }
}
