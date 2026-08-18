/* Copyright (C) 2026 flywave.gl contributors */
// 模板：Worker 侧解码器——把原始数据 + StyleSet 求值结果转成 DecodedTile。
// 权威参照：@flywave/flywave-vectortile-datasource/src/VectorTileDecoder.ts
// （import 路径以参照文件为准）

import {
    type DecodedTile,
    type DecoderOptions,
    type OptionsMap,
    type StyleSetEvaluator
} from "@flywave/flywave-datasource-protocol";
import { type Projection, type TileKey } from "@flywave/flywave-geoutils";
import { ThemedTileDecoder } from "@flywave/flywave-mapview-decoder";

/** Worker 服务类型标识，主线程与 DecoderBundleMain 用同一个字符串。 */
export const XXX_DECODER_SERVICE_TYPE = "xxx-decoder";

export class XxxDecoder extends ThemedTileDecoder {
    /** @override */
    connect(): Promise<void> {
        return Promise.resolve();
    }

    /** @override */
    decodeThemedTile(
        data: ArrayBufferLike | {},
        tileKey: TileKey,
        styleSetEvaluator: StyleSetEvaluator,
        projection: Projection
    ): Promise<DecodedTile> {
        // TODO: 解析 data → 逐要素用 styleSetEvaluator 匹配 technique →
        // 产出 DecodedTile（techniques + 纯 ArrayBuffer 几何 + textGeometries/
        // poiGeometries + boundingBox）。几何必须是可 transfer 的
        // ArrayBuffer（TileDecoderService 会零拷贝回传主线程）。
        throw new Error("XxxDecoder.decodeThemedTile not implemented");
    }

    /** @override */
    configure(options?: DecoderOptions, customOptions?: OptionsMap): void {
        super.configure(options, customOptions);
        // TODO: 保存/响应解码选项（languages、storageLevelOffset 等会经此下发）。
    }
}
