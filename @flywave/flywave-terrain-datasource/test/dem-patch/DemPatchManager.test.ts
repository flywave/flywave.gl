/* Copyright (C) 2025 flywave.gl contributors */

import { expect } from "chai";

import { GeoBox as GeoBoxClass, GeoCoordinates, TileKey } from "@flywave/flywave-geoutils";

import { type DemPatchChangeEventParams } from "../../src/dem-terrain/dem-patch/DemPatchTypes";
import { DemPatchLayer } from "../../src/dem-terrain/dem-patch/DemPatchLayer";
import { DemPatchManager } from "../../src/dem-terrain/dem-patch/DemPatchManager";
import { composeDemTilePixels } from "../../src/dem-terrain/dem-patch/DemPatchComposite";
import { type DemSourceDescription } from "../../src/dem-terrain/dem/DemSourceDescription";
import {
    decodePixelAltitude,
    makeBaseTileImage,
    makeUniformPatchImage
} from "./DemPatchTestHelpers";

const DIM = 4;
/** GeoBox of the test base tile — comfortably inside the global fixture bounds */
const TILE_GEOBOX = new GeoBoxClass(new GeoCoordinates(-1, -1), new GeoCoordinates(1, 1));

const INLINE_DESCRIPTION: DemSourceDescription = {
    tiles: ["http://patch.test/tiles/{z}/{x}/{y}.png"],
    scheme: "xyz",
    bounds: [-180, -85, 180, 85],
    minzoom: 0,
    maxzoom: 22,
    tileSize: 4,
    type: "raster-dem"
};

/**
 * Test layer with the network seam replaced by in-memory fixtures keyed by
 * patch tile level. The description is applied inline (no URL fetch).
 */
class StubPatchLayer extends DemPatchLayer {
    public fetchCount = 0;
    public loadedTileKeys: TileKey[] = [];

    constructor(
        id: string,
        priority: number,
        private readonly m_fixtures: Map<number, ImageData>,
        options: { enabled?: boolean; encoding?: DemPatchLayer["encoding"] } = {}
    ) {
        super({ id, source: INLINE_DESCRIPTION, priority, ...options });
    }

    protected async fetchTileImage(tileKey: TileKey): Promise<ImageData | undefined> {
        this.fetchCount++;
        const fixture = this.m_fixtures.get(tileKey.level);
        if (fixture) {
            this.loadedTileKeys.push(tileKey);
        }
        return fixture;
    }
}

function baseTileKey(): TileKey {
    return TileKey.fromRowColumnLevel(2, 3, 2);
}

async function collectEvents(manager: DemPatchManager): Promise<DemPatchChangeEventParams[]> {
    const events: DemPatchChangeEventParams[] = [];
    manager.addEventListener("change", event => events.push(event));
    return events;
}

describe("DemPatchManager（DEM 修正层集合与快照）", function () {
    it("重复 id 抛错", function () {
        const manager = new DemPatchManager();
        manager.addPatch({ id: "a", source: INLINE_DESCRIPTION, priority: 1 });
        expect(() =>
            manager.addPatch({ id: "a", source: INLINE_DESCRIPTION, priority: 2 })
        ).to.throw(/already exists/);
    });

    it("增/删/改/清各自递增版本并派发 change 事件", async function () {
        const manager = new DemPatchManager();
        const events = await collectEvents(manager);
        const version0 = manager.version;

        manager.addPatch({ id: "a", source: INLINE_DESCRIPTION, priority: 1 });
        expect(manager.version).to.equal(version0 + 1);
        manager.updatePatch("a", { priority: 5 });
        expect(manager.version).to.equal(version0 + 2);
        expect(manager.removePatch("a")).to.equal(true);
        expect(manager.version).to.equal(version0 + 3);
        expect(manager.removePatch("nope")).to.equal(false);

        manager.addPatch({ id: "b", source: INLINE_DESCRIPTION, priority: 1 });
        manager.addPatch({ id: "c", source: INLINE_DESCRIPTION, priority: 2 });
        manager.clear();
        expect(manager.getPatchCount()).to.equal(0);

        expect(events.map(event => event.changeType)).to.deep.equal([
            "add",
            "update",
            "remove",
            "add",
            "add",
            "clear"
        ]);
        expect(events[0].affectedIds).to.deep.equal(["a"]);
        // inline description → bounds known immediately, never global
        expect(events[0].affectedBounds).to.not.equal(null);
    });

    it("快照按优先级升序排列,合成时高优先级胜出", async function () {
        const manager = new DemPatchManager();
        const low = new StubPatchLayer("low", 3, new Map([[2, makeUniformPatchImage(DIM, 11.1)]]));
        const high = new StubPatchLayer(
            "high",
            7,
            new Map([[2, makeUniformPatchImage(DIM, 22.2)]])
        );
        manager.addLayer(low);
        manager.addLayer(high);
        // Replace the manager's arrival hook (which bumps the version on every
        // fresh fetch — legitimately, via the late-arrival channel) with a
        // passive spy so the version-stamp assertion below stays deterministic.
        low.onTileLoaded = tileKey => low.loadedTileKeys.push(tileKey);
        high.onTileLoaded = tileKey => high.loadedTileKeys.push(tileKey);

        const collection = await manager.preparePatchTiles(baseTileKey(), TILE_GEOBOX);
        expect(collection.version).to.equal(manager.version);
        expect(collection.tiles).to.have.lengthOf(2);

        const snapshot = manager.resamplePatchTiles(collection, baseTileKey(), DIM);
        expect(snapshot.patches).to.have.lengthOf(2);
        expect(snapshot.version).to.equal(collection.version);

        // end-to-end on one tile: ascending order composes to the high priority value
        const base = makeBaseTileImage(DIM);
        composeDemTilePixels(base, "mapbox", snapshot.patches, 1);
        expect(decodePixelAltitude(base, 1, 1)).to.be.closeTo(22.2, 0.001);
        expect(decodePixelAltitude(base, DIM, DIM)).to.be.closeTo(22.2, 0.001);
        // border untouched
        expect(decodePixelAltitude(base, 0, 0)).to.be.closeTo(-999, 0.001);
    });

    it("禁用层与覆盖区外的层不参与取数", async function () {
        const manager = new DemPatchManager();
        const disabled = new StubPatchLayer(
            "off",
            1,
            new Map([[2, makeUniformPatchImage(DIM, 11.1)]]),
            { enabled: false }
        );
        const farAway = new StubPatchLayer(
            "far",
            2,
            new Map([[2, makeUniformPatchImage(DIM, 12)]])
        );
        // shrink coverage to the opposite side of the globe
        await farAway.updateSource({ ...INLINE_DESCRIPTION, bounds: [170, 80, 180, 85] });
        manager.addLayer(disabled);
        manager.addLayer(farAway);

        const collection = await manager.preparePatchTiles(baseTileKey(), TILE_GEOBOX);
        const snapshot = manager.resamplePatchTiles(collection, baseTileKey(), DIM);
        expect(snapshot.patches).to.have.lengthOf(0);
        expect(disabled.fetchCount).to.equal(0);
        expect(farAway.fetchCount).to.equal(0);
    });

    it("本级缺瓦片时向上回溯祖先;负缓存避免重复请求", async function () {
        const manager = new DemPatchManager();
        // only level 0 has data for this layer
        const layer = new StubPatchLayer(
            "coarse",
            1,
            new Map([[0, makeUniformPatchImage(DIM, 33.3)]])
        );
        manager.addLayer(layer);

        const collection = await manager.preparePatchTiles(baseTileKey(), TILE_GEOBOX);
        expect(collection.tiles).to.have.lengthOf(1);
        expect(collection.tiles[0].hit?.tileKey.level).to.equal(0);
        // walked 2 → miss, 1 → miss, 0 → hit
        expect(layer.fetchCount).to.equal(3);

        // second bake of the same tile: negatives + LRU mean zero new fetches
        const second = await manager.preparePatchTiles(baseTileKey(), TILE_GEOBOX);
        expect(second.tiles[0].hit?.tileKey.level).to.equal(0);
        expect(layer.fetchCount).to.equal(3);
    });

    it("晚到钩子:首次取图触发 onTileLoaded,缓存命中不再触发", async function () {
        const layer = new StubPatchLayer(
            "late",
            1,
            new Map([[2, makeUniformPatchImage(DIM, 9.9)]])
        );
        layer.onTileLoaded = tileKey => layer.loadedTileKeys.push(tileKey);
        const manager = new DemPatchManager();
        manager.addLayer(layer);

        await layer.getBestPatchTile(baseTileKey(), TILE_GEOBOX);
        expect(layer.loadedTileKeys).to.have.lengthOf(1);
        expect(layer.loadedTileKeys[0].level).to.equal(2);

        await layer.getBestPatchTile(baseTileKey(), TILE_GEOBOX);
        expect(layer.loadedTileKeys).to.have.lengthOf(1);
    });

    it("层状态快照反映描述与运行时配置", function () {
        const manager = new DemPatchManager();
        manager.addPatch({
            id: "s",
            source: INLINE_DESCRIPTION,
            priority: 4,
            encoding: "terrarium"
        });
        const state = manager.getPatch("s");
        expect(state).to.deep.equal({
            id: "s",
            priority: 4,
            enabled: true,
            encoding: "terrarium",
            ready: true,
            bounds: [-180, -85, 180, 85],
            minzoom: 0,
            maxzoom: 22
        });
    });
});
