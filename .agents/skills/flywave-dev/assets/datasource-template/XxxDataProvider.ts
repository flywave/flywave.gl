/* Copyright (C) 2026 flywave.gl contributors */
// 模板：数据提供者——只负责按 TileKey 拉原始数据，不管解码与显示。
// 权威参照：@flywave/flywave-vectortile-datasource/src/OmvRestClient.ts

import { type TileKey } from "@flywave/flywave-geoutils";
import { DataProvider } from "@flywave/flywave-mapview-decoder";

export class XxxDataProvider extends DataProvider<ArrayBufferLike> {
    private readonly m_baseUrl: string;

    constructor(baseUrl: string) {
        super();
        this.m_baseUrl = baseUrl;
    }

    /** @override */
    ready(): boolean {
        return true; // TODO: 有异步连接/鉴权时返回真实状态
    }

    /** @override */
    async getTile(tileKey: TileKey, abortSignal?: AbortSignal): Promise<ArrayBufferLike | {}> {
        // TODO: 按 tileKey (morton 码, 见 TileKeyUtils) 拼 URL 拉数据，返回 ArrayBuffer。
        // 记得尊重 abortSignal 取消请求。
        throw new Error("XxxDataProvider.getTile not implemented");
    }

    /** @override */
    protected async connect(): Promise<void> {
        // TODO: 建立连接（首个 client register 时触发一次）。
    }

    /** @override */
    protected dispose(): void {
        // TODO: 释放资源（最后一个 client 注销时触发）。
    }
}
