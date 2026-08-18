/* Copyright (C) 2026 flywave.gl contributors */
// 模板：主线程数据源——组装 TileFactory + DataProvider + Worker 解码器。
// 权威参照：@flywave/flywave-geojson-datasource/src/GeoJsonDataSource.ts
// 与 VectorTileDataSource 的构造

import { webMercatorTilingScheme } from "@flywave/flywave-geoutils";
import { Tile, TileDataSource, TileFactory } from "@flywave/flywave-mapview-decoder";
import { XxxDataProvider } from "./XxxDataProvider";
import { XXX_DECODER_SERVICE_TYPE } from "./XxxDecoder";

export interface XxxDataSourceOptions {
    /** TODO: 你的数据源配置（URL、token、层级范围…） */
    baseUrl: string;
}

export class XxxDataSource extends TileDataSource {
    constructor(params: XxxDataSourceOptions) {
        super(
            new TileFactory(Tile),
            {
                name: "xxx", // TODO: 全局唯一（铁律 4，addDataSource 重名抛错）
                styleSetName: "xxx", // TODO: 必须与 theme 的 styles["xxx"] 键一致
                tilingScheme: webMercatorTilingScheme, // TODO: 按数据实际切片方案选
                dataProvider: new XxxDataProvider(params.baseUrl),
                concurrentDecoderServiceName: XXX_DECODER_SERVICE_TYPE
                // 常用补充：maxDataLevel / storageLevelOffset / enablePicking /
                // maxGeometryHeight（如实上报，铁律 4）
            }
        );
    }
}
