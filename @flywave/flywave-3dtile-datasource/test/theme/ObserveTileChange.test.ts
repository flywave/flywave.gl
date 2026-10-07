/* Copyright (C) 2025 flywave.gl contributors */

import { expect } from "chai";

import { Observe3DTileChange } from "../../src/ObserveTileChange";

function mockTile(uri: string): any {
    return { __basePath: "mock://tiles", content: { uri } };
}

describe("Observe3DTileChange（瓦片激活通知语义）", function () {
    it("首次激活触发一次 load，重复事件被永久去重吞掉（渲染路径零操作语义的根基）", function () {
        const events: Array<[string, boolean]> = [];
        const observer = new Observe3DTileChange((tile, active) =>
            events.push([tile.content.uri, active])
        );
        const tile = mockTile("a.b3dm");

        observer.watchTileChange(tile, new Set([tile]), true);
        observer.watchTileChange(tile, new Set([tile]), true);
        observer.watchTileChange(tile, new Set([tile]), true);

        expect(events).to.deep.equal([["a.b3dm", true]]);
    });

    it("未逐出瓦片的失活事件同样被吞掉（onTileUnloaded 不可达，材质不翻动）", function () {
        const events: Array<[string, boolean]> = [];
        const observer = new Observe3DTileChange((tile, active) =>
            events.push([tile.content.uri, active])
        );
        const tile = mockTile("a.b3dm");

        observer.watchTileChange(tile, new Set([tile]), true);
        observer.watchTileChange(tile, new Set(), false);
        observer.watchTileChange(tile, new Set([tile]), true);

        expect(events).to.deep.equal([["a.b3dm", true]]);
    });

    it("onTileDisposed 遗忘 uri：重新解析后的首次激活能再次触发 load（逐出即遗忘）", function () {
        const events: Array<[string, boolean]> = [];
        const observer = new Observe3DTileChange((tile, active) =>
            events.push([tile.content.uri, active])
        );
        const tile = mockTile("a.b3dm");

        observer.watchTileChange(tile, new Set([tile]), true);
        observer.onTileDisposed(tile);
        observer.watchTileChange(tile, new Set([tile]), true);

        expect(events).to.deep.equal([
            ["a.b3dm", true],
            ["a.b3dm", true]
        ]);
    });

    it("未通知过的瓦片逐出通知是幂等空操作", function () {
        const events: Array<[string, boolean]> = [];
        const observer = new Observe3DTileChange((tile, active) =>
            events.push([tile.content.uri, active])
        );
        observer.onTileDisposed(mockTile("never-seen.b3dm"));
        expect(events).to.deep.equal([]);
    });

    it("nodifyActiveTiles 强制重放：清空去重后对所有激活瓦片重发 load", function () {
        const events: Array<[string, boolean]> = [];
        const observer = new Observe3DTileChange((tile, active) =>
            events.push([tile.content.uri, active])
        );
        const tileA = mockTile("a.b3dm");
        const tileB = mockTile("b.b3dm");

        observer.watchTileChange(tileA, new Set([tileA]), true);
        events.length = 0;
        (observer as any).nodifyActiveTiles();

        expect(events).to.deep.equal([["a.b3dm", true]]);
        void tileB;
    });

    it("dispose 清空去重集合并释放回调", function () {
        const observer = new Observe3DTileChange(() => {});
        const tile = mockTile("a.b3dm");
        observer.watchTileChange(tile, new Set([tile]), true);
        observer.dispose();
        expect((observer as any)._watchIds.size).to.equal(0);
    });
});
