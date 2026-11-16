/* Copyright (C) 2025 flywave.gl contributors */

import { expect } from "chai";

import { TilesRendererBase } from "../../src/base/TilesRendererBase";
import { type ViewErrorTarget } from "../../src/base/traverseFunctions";
import { TileSet } from "../../src/base/Tile";
import { type ITile } from "../../src/base/Tile";

const BASE_URL = process.env.TILES_TEST_DATA_URL || "http://127.0.0.1:3010";

interface RequestLog {
    kind: "json" | "subtree" | "content";
    url: string;
}

/**
 * Minimal renderer used to exercise the tile traversal, queueing, and subtree expansion against
 * real 3D Tiles datasets. Content parsing is stubbed out so the test is independent of GPU and
 * glTF parsing, but all network requests and tile state transitions are real.
 */
class TestTilesRenderer extends TilesRendererBase {
    public readonly requests: RequestLog[] = [];
    public readonly rootUrl: string;
    public viewAll = true;
    /** When true, content requests are checked with a real HEAD request so failures surface. */
    public checkContent = false;
    /** When true, content bytes are parsed by the real 3D Tiles loaders. */
    public parseContent = false;
    public readonly parsedContentTypes: string[] = [];
    public readonly parsedContents: any[] = [];

    constructor(url: string) {
        super(url);
        this.rootUrl = url;
        this.errorTarget = 16;
    }

    protected get dracoPath(): string | undefined {
        return undefined;
    }

    calculateTileViewError(tile: ITile, target: ViewErrorTarget): void {
        target.inView = this.viewAll;
        target.error = tile.geometricError;
        target.distanceFromCamera = 100;
    }

    fetchTileJson(url: string, fetchOptions: RequestInit): Promise<TileSet> {
        this.requests.push({ kind: "json", url });
        return super.fetchTileJson(url, fetchOptions);
    }

    fetchSubtreeTile(url: string, fetchOptions: RequestInit): Promise<any> {
        this.requests.push({ kind: "subtree", url });
        return super.fetchSubtreeTile(url, fetchOptions);
    }

    fetchTileContent(url: string, fetchOptions: RequestInit): Promise<any> {
        this.requests.push({ kind: "content", url });
        if (this.parseContent) {
            return super.fetchTileContent(url, fetchOptions).then(content => {
                this.parsedContentTypes.push((content as any)?.type ?? "unknown");
                this.parsedContents.push(content);
                return content;
            });
        }
        if (this.checkContent) {
            return fetch(url, { method: "HEAD" }).then(response => {
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status} for ${url}`);
                }
                return { type: "empty" };
            });
        }
        return Promise.resolve({ type: "empty" });
    }

    parseTile(): Promise<void> {
        return Promise.resolve();
    }

    disposeTile(): void {}
}

function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function runToIdle(renderer: TestTilesRenderer, timeoutMs = 20000): Promise<void> {
    const start = Date.now();
    let stableFrames = 0;

    while (Date.now() - start < timeoutMs) {
        renderer.update();
        await sleep(2);

        const loadingTiles = (renderer as any).loadingTiles as Set<ITile>;
        const running =
            renderer.downloadQueue.running ||
            renderer.parseQueue.running ||
            renderer.processNodeQueue.running;

        if (renderer.root && loadingTiles.size === 0 && !running) {
            stableFrames++;
            if (stableFrames >= 5) {
                return;
            }
        } else {
            stableFrames = 0;
        }
    }

    throw new Error(
        `TilesRenderer did not become idle: ${JSON.stringify({
            requests: renderer.requests.length,
            stats: renderer.stats,
            loading: (renderer as any).loadingTiles.size,
            running: [
                renderer.downloadQueue.running,
                renderer.parseQueue.running,
                renderer.processNodeQueue.running
            ]
        })}`
    );
}

function contentUrls(renderer: TestTilesRenderer): string[] {
    return renderer.requests.filter(r => r.kind === "content").map(r => r.url);
}

function countRequests(renderer: TestTilesRenderer, kind: RequestLog["kind"]): number {
    return renderer.requests.filter(r => r.kind === kind).length;
}

/** External tileset JSON files (the root tileset itself is excluded). */
function externalJsonCount(renderer: TestTilesRenderer): number {
    return renderer.requests.filter(r => r.kind === "json" && r.url !== renderer.rootUrl).length;
}

function assertHealthy(renderer: TestTilesRenderer): void {
    const stats = renderer.stats;
    for (const key of [
        "queued",
        "downloading",
        "parsing",
        "failed",
        "inFrustum",
        "used",
        "active",
        "visible"
    ] as const) {
        expect(stats[key], `stats.${key}`).to.be.a("number");
        expect(stats[key], `stats.${key}`).to.be.at.least(0);
    }

    expect(stats.queued, "stats.queued after idle").to.equal(0);
    expect(stats.downloading, "stats.downloading after idle").to.equal(0);
    expect(stats.parsing, "stats.parsing after idle").to.equal(0);
    expect(Number.isInteger(renderer.lruCache.cachedBytes), "cachedBytes integer").to.equal(true);
    expect((renderer as any).loadingTiles.size, "loadingTiles after idle").to.equal(0);
}

async function loadTileset(path: string, errorTarget = 16): Promise<TestTilesRenderer> {
    const renderer = new TestTilesRenderer(`${BASE_URL}/${path}`);
    renderer.errorTarget = errorTarget;
    await runToIdle(renderer);
    return renderer;
}

describe("TilesRendererBase 集成测试（Cesium 官方 3D Tiles 测试集）", function () {
    this.timeout(60000);

    before(function () {
        (globalThis as any).window = { location: { href: `${BASE_URL}/` } };
        (globalThis as any).requestAnimationFrame = (callback: () => void) =>
            setTimeout(callback, 0);
        (globalThis as any).cancelAnimationFrame = (handle: any) => clearTimeout(handle);
    });

    before(async function () {
        this.timeout(5000);
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 2000);
        try {
            const response = await fetch(`${BASE_URL}/Tilesets/TilesetOfTilesets/tileset.json`, {
                signal: controller.signal
            });
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
        } catch {
            console.warn(
                `[3dtiles integration] test data server not reachable at ${BASE_URL}; ` +
                    "skipping. Run `pnpm test:data:download` and `pnpm test:data:serve` first."
            );
            this.skip();
        } finally {
            clearTimeout(timer);
        }
    });

    it("b3dm 单瓦片：只请求自身内容", async function () {
        const renderer = await loadTileset("Batched/BatchedWithBatchTable/tileset.json");

        expect(renderer.root).to.not.equal(null);
        expect(countRequests(renderer, "content")).to.equal(1);
        expect(contentUrls(renderer)[0]).to.match(/batchedWithBatchTable\.b3dm$/);
        expect(renderer.stats.failed).to.equal(0);
        assertHealthy(renderer);
    });

    it("外部 tileset：加载外部 JSON 及其内容", async function () {
        const renderer = await loadTileset("Tilesets/TilesetOfTilesets/tileset.json");

        expect(countRequests(renderer, "json")).to.be.at.least(2);
        expect(externalJsonCount(renderer)).to.be.at.least(1);
        expect(countRequests(renderer, "content")).to.be.at.least(4);
        expect(contentUrls(renderer).some(url => /parent\.b3dm$/.test(url))).to.equal(true);
        expect(renderer.stats.failed).to.equal(0);
        assertHealthy(renderer);
    });

    it("外部 tileset：根满足误差目标后仍继续细化（回归）", async function () {
        // errorTarget 远大于根瓦片的 geometricError：可渲染瓦片应当在此停止，
        // 但外部 tileset 根不能显示任何内容，必须继续加载其子树。
        const renderer = await loadTileset("Tilesets/TilesetOfTilesets/tileset.json", 1000);

        expect(externalJsonCount(renderer)).to.be.at.least(1);
        expect(countRequests(renderer, "content")).to.be.at.least(1);
        assertHealthy(renderer);
    });

    it("可渲染父瓦片满足误差目标时停止细化（对照组）", async function () {
        const renderer = await loadTileset("Tilesets/TilesetUniform/tileset.json", 1000);

        // 根瓦片有 b3dm 内容且误差达标：只加载根内容，不应继续请求外部 tileset。
        expect(countRequests(renderer, "content")).to.equal(1);
        expect(externalJsonCount(renderer)).to.equal(0);
        assertHealthy(renderer);
    });

    it("ADD 精细化：父瓦片与子瓦片都加载", async function () {
        const renderer = await loadTileset("Tilesets/TilesetWithTransforms/tileset.json");

        expect(countRequests(renderer, "content")).to.equal(2);
        expect(contentUrls(renderer).some(url => /buildings\.b3dm$/.test(url))).to.equal(true);
        expect(contentUrls(renderer).some(url => /instances\.i3dm$/.test(url))).to.equal(true);
        assertHealthy(renderer);
    });

    it("混合精细化（REFINE mix）：加载全部 7 个内容瓦片", async function () {
        const renderer = await loadTileset("Tilesets/TilesetRefinementMix/tileset.json");

        expect(countRequests(renderer, "content")).to.equal(7);

        const counts: Record<string, number> = {};
        for (const url of contentUrls(renderer)) {
            const name = url.split("/").pop() as string;
            counts[name] = (counts[name] || 0) + 1;
        }
        expect(counts).to.deep.equal({
            "parent.b3dm": 3,
            "ll.b3dm": 1,
            "ur.b3dm": 1,
            "ul.b3dm": 1,
            "lr.b3dm": 1
        });
        assertHealthy(renderer);
    });

    it("空根瓦片：不阻塞子瓦片加载", async function () {
        const renderer = await loadTileset("Tilesets/TilesetEmptyRoot/tileset.json");

        expect(countRequests(renderer, "content")).to.equal(4);
        assertHealthy(renderer);
    });

    it("空外部 tileset：不阻塞、不重复请求", async function () {
        const renderer = await loadTileset("Tilesets/TilesetEmptyExternal/tileset.json");

        expect(countRequests(renderer, "json")).to.be.at.least(1);
        expect(countRequests(renderer, "content")).to.be.at.least(2);
        assertHealthy(renderer);
    });

    it("隐式切片（二进制 subtree）：展开子树并请求内容", async function () {
        const renderer = await loadTileset("Implicit/ImplicitTileset/tileset_1.1.json");

        // Subtree files are fetched and expanded by the tileset loader, so the renderer sees
        // the already normalized hierarchy: 1 root content + 4 level-1 contents.
        expect(countRequests(renderer, "content")).to.equal(5);
        expect(
            contentUrls(renderer).map(url => url.replace(/^.*\/content\//, "content/"))
        ).to.have.members([
            "content/0/0/0.b3dm",
            "content/1/0/0.b3dm",
            "content/1/0/1.b3dm",
            "content/1/1/0.b3dm",
            "content/1/1/1.b3dm"
        ]);
        expect(renderer.root?.children.length).to.equal(4);
        assertHealthy(renderer);
    });

    it("隐式切片（JSON subtree）与二进制结果一致（回归）", async function () {
        const binary = await loadTileset("Implicit/ImplicitTileset/tileset_1.1.json");
        const json = await loadTileset("Implicit/ImplicitTilesetWithJsonSubtree/tileset_1.1.json");

        const normalize = (url: string) => url.replace(/^.*\/content\//, "content/");
        expect(contentUrls(json).map(normalize)).to.deep.equal(contentUrls(binary).map(normalize));
        assertHealthy(json);
    });

    it("多内容扩展：至少加载第一个内容（已知限制：仅首个）", async function () {
        const renderer = await loadTileset("MultipleContents/MultipleContents/tileset_1.0.json");

        expect(countRequests(renderer, "content")).to.be.at.least(1);
        expect(contentUrls(renderer)[0]).to.match(/batched\.b3dm$/);
        assertHealthy(renderer);
    });

    it("真实内容解析：b3dm / i3dm / pnts / cmpt 不抛异常", async function () {
        const cases = [
            "Batched/BatchedWithoutBatchTable/tileset.json",
            "Instanced/InstancedQuantizedOct32POrientation/tileset.json",
            "PointCloud/PointCloudNormalsOctEncoded/tileset.json",
            "Composite/Composite/tileset.json",
            "GaussianSplats/sh_unit_cube/tileset.json",
            "GaussianSplats/tower/tileset.json"
        ];
        const types = new Set<string>();

        for (const path of cases) {
            const renderer = new TestTilesRenderer(`${BASE_URL}/${path}`);
            renderer.parseContent = true;
            await runToIdle(renderer);

            expect(renderer.stats.failed, path).to.equal(0);
            expect(renderer.parsedContentTypes.length, path).to.be.at.least(1);
            renderer.parsedContentTypes.forEach(type => types.add(type));
            assertHealthy(renderer);
        }

        // The content loaders must have recognized the different tile formats.
        expect(types.size).to.be.at.least(3);
    });

    it("高斯泼溅 SPZ：保留原始压缩字节交给 lite 解码", async function () {
        const renderer = new TestTilesRenderer(`${BASE_URL}/GaussianSplats/tower/tileset.json`);
        renderer.parseContent = true;
        await runToIdle(renderer);

        expect(renderer.stats.failed).to.equal(0);

        const primitives = renderer.parsedContents.flatMap(
            content => content.gltf?.meshes?.flatMap((mesh: any) => mesh.primitives) ?? []
        );
        const source = primitives
            .map((primitive: any) => primitive.extras?.gaussianSplatSource)
            .find((candidate: any) => candidate?.kind === "spz");

        expect(source, "SPZ source").to.not.equal(undefined);
        expect(source.bytes.length, "SPZ payload").to.be.greaterThan(0);
        assertHealthy(renderer);
    });

    it("复合/点云/实例化/层级瓦片：加载不崩溃", async function () {
        const cases = [
            "Composite/Composite/tileset.json",
            "PointCloud/PointCloudNormalsOctEncoded/tileset.json",
            "Instanced/InstancedQuantizedOct32POrientation/tileset.json",
            "Hierarchy/BatchTableHierarchy/tileset.json"
        ];

        for (const path of cases) {
            const renderer = await loadTileset(path);
            expect(countRequests(renderer, "content"), path).to.be.at.least(1);
            expect(renderer.stats.failed, path).to.equal(0);
            assertHealthy(renderer);
        }
    });

    it("内容 404：只失败一次并保持可用", async function () {
        const renderer = new TestTilesRenderer(`${BASE_URL}/fail/tileset.json`);
        renderer.checkContent = true;
        await runToIdle(renderer);

        expect(renderer.stats.failed).to.equal(1);
        assertHealthy(renderer);

        const requestCountAfterFailure = renderer.requests.length;
        for (let i = 0; i < 20; i++) {
            renderer.update();
            await sleep(1);
        }

        expect(renderer.requests.length, "no retry storm").to.equal(requestCountAfterFailure);
    });

    it("静止相机下多帧稳定：不重复请求、不抖动", async function () {
        const renderer = await loadTileset("Tilesets/TilesetRefinementMix/tileset.json");
        const requestsAfterIdle = renderer.requests.length;
        const visibleAfterIdle = new Set(renderer.visibleTiles);

        for (let i = 0; i < 30; i++) {
            renderer.update();
            await sleep(1);
        }

        expect(renderer.requests.length, "stability requests").to.equal(requestsAfterIdle);
        expect(new Set(renderer.visibleTiles), "stability visible set").to.deep.equal(
            visibleAfterIdle
        );
        assertHealthy(renderer);
    });

    it("相机移开后丢弃排队中的瓦片（removeUnusedPendingTiles）", async function () {
        const renderer = new TestTilesRenderer(
            `${BASE_URL}/Tilesets/TilesetRefinementMix/tileset.json`
        );
        renderer.update();
        await sleep(20);
        renderer.update();

        renderer.viewAll = false;
        renderer.update();
        await sleep(20);
        renderer.update();

        expect((renderer as any).loadingTiles.size).to.equal(0);
        expect(renderer.stats.queued).to.equal(0);
        expect(renderer.stats.downloading).to.equal(0);
        expect(renderer.stats.parsing).to.equal(0);

        renderer.viewAll = true;
        await runToIdle(renderer);
        expect(countRequests(renderer, "content")).to.equal(7);
        assertHealthy(renderer);
    });
});
