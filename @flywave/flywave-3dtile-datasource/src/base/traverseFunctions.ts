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

function resetFrameState(tile: TileInternal, renderer: TilesRendererBase): void {
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

        renderer.calculateTileViewError(tile, viewErrorTarget);
        tile.__inFrustum = viewErrorTarget.inView;
        tile.__error = viewErrorTarget.error;
        tile.__distanceFromCamera = viewErrorTarget.distanceFromCamera;
    }
}

function recursivelyMarkUsed(tile: TileInternal, renderer: TilesRendererBase): void {
    renderer.ensureChildrenArePreprocessed(tile);
    resetFrameState(tile, renderer);
    markUsed(tile, renderer);

    if (!tile.__hasRenderableContent && areChildrenProcessed(tile)) {
        const children = tile.children;
        for (let i = 0, l = children.length; i < l; i++) {
            recursivelyMarkUsed(children[i] as TileInternal, renderer);
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
    if (tile.__error !== undefined && tile.__error <= renderer.errorTarget) {
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
    const isUsed = isUsedThisFrame(tile, renderer.frameCount);
    if (isUsed || tile.__usedLastFrame) {
        let setActive = false;
        let setVisible = false;
        if (isUsed) {
            setActive = !!tile.__active;
            setVisible = renderer.displayActiveTiles
                ? !!tile.__active || !!tile.__visible
                : !!tile.__visible;
        } else {
            resetFrameState(tile, renderer);
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
