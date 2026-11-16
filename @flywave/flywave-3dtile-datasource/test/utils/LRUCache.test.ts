/* Copyright (C) 2025 flywave.gl contributors */

import { LRUCache } from "@flywave/flywave-utils/LRUCache";
import { expect } from "chai";

describe("LRUCache（字节统计）", function () {
    it("小数内存占用按整数累计，避免统计漂移", function () {
        const cache = new LRUCache<object>();
        cache.computeMemoryUsageCallback = () => 1.6;

        const first = {};
        const second = {};
        cache.add(first, () => {});
        cache.add(second, () => {});

        expect(cache.cachedBytes).to.equal(4);

        cache.remove(first);
        expect(cache.cachedBytes).to.equal(2);
    });

    it("isUsed 跟随 markUsed / markUnused 状态", function () {
        const cache = new LRUCache<object>();
        const item = {};
        cache.add(item, () => {});

        expect(cache.isUsed(item)).to.equal(true);

        cache.markUnused(item);
        expect(cache.isUsed(item)).to.equal(false);
    });
});
