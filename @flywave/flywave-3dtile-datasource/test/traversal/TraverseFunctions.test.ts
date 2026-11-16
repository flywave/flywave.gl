/* Copyright (C) 2025 flywave.gl contributors */

import { expect } from "chai";

import { LOADED, UNLOADED } from "../../src/base/constants";
import { markUsedSetLeaves, markUsedTiles, toggleTiles } from "../../src/base/traverseFunctions";
import { TILE_REFINEMENT } from "../../src/loader/types";

interface MockTileOptions {
    children?: any[];
    geometricError?: number;
    refine?: TILE_REFINEMENT;
    hasContent?: boolean;
    hasRenderableContent?: boolean;
    hasUnrenderableContent?: boolean;
    loadingState?: number;
    error?: number;
    inView?: boolean;
    depth?: number;
}

function makeTile(options: MockTileOptions = {}): any {
    const children = options.children || [];
    const tile: any = {
        children,
        parent: undefined,
        geometricError: options.geometricError ?? 100,
        refine: options.refine ?? TILE_REFINEMENT.REPLACE,
        __childrenProcessed: children.length,
        __lastFrameVisited: 0,
        __used: false,
        __inFrustum: false,
        __isLeaf: false,
        __visible: false,
        __active: false,
        __error: Infinity,
        __distanceFromCamera: Infinity,
        __childrenWereVisible: false,
        __allChildrenLoaded: false,
        __unconditionallyRefine: false,
        __usedLastFrame: false,
        __hasContent: options.hasContent ?? true,
        __hasRenderableContent: options.hasRenderableContent ?? true,
        __hasUnrenderableContent: options.hasUnrenderableContent ?? false,
        __loadingState: options.loadingState ?? LOADED,
        __wasSetActive: false,
        __wasSetVisible: false,
        __depth: options.depth ?? 0,
        mockError: options.error ?? 0,
        mockInView: options.inView ?? true
    };

    children.forEach((child: any) => {
        child.parent = tile;
    });

    return tile;
}

function makeRenderer(overrides: any = {}): any {
    return {
        frameCount: 1,
        errorTarget: 16,
        errorThreshold: Infinity,
        maxDepth: Infinity,
        displayActiveTiles: false,
        stats: { inFrustum: 0, used: 0, active: 0, visible: 0 },
        lruCache: {
            isFull: () => false,
            isUsed: () => true,
            markUsed: () => {}
        },
        usedTiles: new Set<any>(),
        queued: [] as any[],
        calculateTileViewError(tile: any, target: any) {
            target.inView = tile.mockInView;
            target.error = tile.mockError;
            target.distanceFromCamera = 100;
        },
        ensureChildrenArePreprocessed() {},
        markTileUsed(tile: any) {
            this.usedTiles.add(tile);
        },
        queueTileForDownload(tile: any) {
            this.queued.push(tile);
        },
        setTileActive() {},
        setTileVisible() {},
        ...overrides
    };
}

describe("traverseFunctions（外部 tileset 细化）", function () {
    it("外部 tileset 根达到误差目标后仍然继续细化", function () {
        const contentTile = makeTile({ error: 0 });
        const root = makeTile({
            children: [contentTile],
            error: 0,
            hasRenderableContent: false,
            hasUnrenderableContent: true
        });
        const renderer = makeRenderer();

        markUsedTiles(root, renderer);

        expect(root.__unconditionallyRefine).to.equal(true);
        expect(contentTile.__used).to.equal(true);
    });

    it("可渲染瓦片达到误差目标后停止细化（对照组）", function () {
        const contentTile = makeTile({ error: 0 });
        const root = makeTile({ children: [contentTile], error: 0 });
        const renderer = makeRenderer();

        markUsedTiles(root, renderer);

        expect(root.__unconditionallyRefine).to.equal(false);
        expect(contentTile.__used).to.equal(false);
    });

    it("几何误差高于最近可条件细化祖先的子瓦片也继续细化", function () {
        const contentTile = makeTile({ error: 0, geometricError: 100 });
        const inheritedTile = makeTile({
            children: [contentTile],
            error: 0,
            geometricError: 100
        });
        const externalRoot = makeTile({
            children: [inheritedTile],
            error: 0,
            geometricError: 100,
            hasRenderableContent: false,
            hasUnrenderableContent: true
        });
        const root = makeTile({
            children: [externalRoot],
            error: 100,
            geometricError: 50
        });
        const renderer = makeRenderer();

        markUsedTiles(root, renderer);

        expect(externalRoot.__unconditionallyRefine).to.equal(true);
        expect(inheritedTile.__unconditionallyRefine).to.equal(true);
        expect(contentTile.__used).to.equal(true);
    });
});

describe("traverseFunctions（ADD 精细化）", function () {
    it("父级已满足误差目标时跳过 ADD 子瓦片", function () {
        const child = makeTile({
            error: 10,
            geometricError: 100,
            refine: TILE_REFINEMENT.ADD
        });
        const parent = makeTile({
            children: [child],
            error: 20,
            geometricError: 100,
            refine: TILE_REFINEMENT.ADD
        });
        const renderer = makeRenderer();

        markUsedTiles(parent, renderer);

        expect(child.__used).to.equal(false);
    });

    it("子瓦片误差超过父级误差折算后继续加载", function () {
        const child = makeTile({
            error: 18,
            geometricError: 100,
            refine: TILE_REFINEMENT.ADD
        });
        const parent = makeTile({
            children: [child],
            error: 20,
            geometricError: 100,
            refine: TILE_REFINEMENT.ADD
        });
        const renderer = makeRenderer();

        markUsedTiles(parent, renderer);

        expect(child.__used).to.equal(true);
    });
});

describe("traverseFunctions（REPLACE 缓存保留）", function () {
    it("子瓦片都不在视锥内时父级只保留缓存、不计入 used", function () {
        const child = makeTile({ error: 0, inView: false });
        const root = makeTile({ children: [child], error: 100, geometricError: 200 });
        const renderer = makeRenderer();

        markUsedTiles(root, renderer);

        expect(root.__inFrustum).to.equal(false);
        expect(root.__used).to.equal(false);
        expect(child.__used).to.equal(false);
        expect(renderer.usedTiles.has(root)).to.equal(true);
        expect(renderer.usedTiles.has(child)).to.equal(true);
    });
});

describe("traverseFunctions（帧状态更新）", function () {
    it("toggleTiles 不为仅更新帧状态的瓦片重算误差", function () {
        let calculateCount = 0;
        const renderer = makeRenderer({
            calculateTileViewError() {
                calculateCount++;
            }
        });
        const tile = makeTile({ loadingState: UNLOADED });
        tile.__usedLastFrame = true;

        toggleTiles(tile, renderer);

        expect(calculateCount).to.equal(0);
        expect(tile.__wasSetActive).to.equal(false);
        expect(tile.__wasSetVisible).to.equal(false);
    });

    it("外部 tileset 子节点在内容就绪前不算 allChildrenLoaded", function () {
        const contentTile = makeTile({ error: 0, geometricError: 50 });
        const externalRoot = makeTile({
            children: [contentTile],
            error: 0,
            geometricError: 100,
            hasRenderableContent: false,
            hasUnrenderableContent: true
        });
        const parent = makeTile({ children: [externalRoot], error: 100, geometricError: 200 });
        const renderer = makeRenderer();

        markUsedTiles(parent, renderer);
        markUsedSetLeaves(parent, renderer);

        expect(parent.__allChildrenLoaded).to.equal(true);

        const unloadedContent = makeTile({ error: 0, geometricError: 50, loadingState: UNLOADED });
        const pendingExternalRoot = makeTile({
            children: [unloadedContent],
            error: 0,
            geometricError: 100,
            hasRenderableContent: false,
            hasUnrenderableContent: true
        });
        const pendingParent = makeTile({
            children: [pendingExternalRoot],
            error: 100,
            geometricError: 200
        });
        const nextRenderer = makeRenderer({ frameCount: 2 });

        markUsedTiles(pendingParent, nextRenderer);
        markUsedSetLeaves(pendingParent, nextRenderer);

        expect(pendingParent.__allChildrenLoaded).to.equal(false);
    });
});

describe("traverseFunctions（空容器瓦片）", function () {
    it("无内容容器瓦片不因误差达标停止细化", function () {
        const contentTile = makeTile({ error: 0 });
        const root = makeTile({
            children: [contentTile],
            error: 0,
            hasContent: false,
            hasRenderableContent: false
        });
        const renderer = makeRenderer();

        markUsedTiles(root, renderer);

        expect(root.__unconditionallyRefine).to.equal(false);
        expect(contentTile.__used).to.equal(true);
    });
});
