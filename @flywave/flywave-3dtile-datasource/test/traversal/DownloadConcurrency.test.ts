/* Copyright (C) 2025 flywave.gl contributors */

import { expect } from "chai";

import { TileRenderDataSource } from "../../src/TileRenderDataSource";
import { TilesRenderer } from "../../src/TilesRenderer";
import { TilesRendererBase } from "../../src/base/TilesRendererBase";

const TILESET_URL = "http://example.com/tileset.json";

// Cesium alignment reference: RequestScheduler.maximumRequestsPerServer
// defaults to 18 (since Cesium 1.113), applied per server to 3D Tiles content
// requests (throttle + throttleByServer are both true). The flywave download
// queue is per tileset, so 18 is the matching default; the historical value
// here was a hardcoded 10.
describe("3D Tiles download concurrency", () => {
    describe("default queue caps", () => {
        it("downloadQueue defaults to 18", () => {
            const renderer = new TilesRendererBase(TILESET_URL);
            expect(renderer.downloadQueue.maxJobs).to.equal(18);
        });

        it("keeps the other queues at their dedicated caps", () => {
            const renderer = new TilesRendererBase(TILESET_URL);
            expect(renderer.parseQueue.maxJobs).to.equal(1);
            expect(renderer.processNodeQueue.maxJobs).to.equal(25);
        });
    });

    describe("TilesRendererOptions.maxConcurrentRequests", () => {
        it("applies a valid override to the download queue", () => {
            const renderer = new TilesRenderer({
                url: TILESET_URL,
                maxConcurrentRequests: 24
            });
            expect(renderer.downloadQueue.maxJobs).to.equal(24);
        });

        it("falls back to the default 18 when the option is omitted", () => {
            const renderer = new TilesRenderer({ url: TILESET_URL });
            expect(renderer.downloadQueue.maxJobs).to.equal(18);
        });

        const invalidValues = [0, -5, NaN, Infinity];
        for (const value of invalidValues) {
            it(`ignores the invalid value ${value}`, () => {
                const renderer = new TilesRenderer({
                    url: TILESET_URL,
                    maxConcurrentRequests: value
                });
                expect(renderer.downloadQueue.maxJobs).to.equal(18);
            });
        }
    });

    describe("TileRenderDataSource.maxConcurrentRequests", () => {
        it("plumbs the option into the renderer's download queue", () => {
            const dataSource = new TileRenderDataSource({
                url: TILESET_URL,
                maxConcurrentRequests: 32
            });
            const renderer = (dataSource as any).m_tilesRenderer;
            expect(renderer.downloadQueue.maxJobs).to.equal(32);
        });

        it("falls back to the default 18", () => {
            const dataSource = new TileRenderDataSource({ url: TILESET_URL });
            const renderer = (dataSource as any).m_tilesRenderer;
            expect(renderer.downloadQueue.maxJobs).to.equal(18);
        });
    });
});
