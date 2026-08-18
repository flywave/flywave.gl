/* Copyright (C) 2026 flywave.gl contributors */
// 模板：Worker 服务注册——漏掉这一步 = Worker 静默连不上（铁律 5）。
// 权威参照：VectorTileDecoder.ts 里的 VectorTileDecoderService（文件尾部）

import { TileDecoderService, WorkerServiceManager } from "@flywave/flywave-mapview-decoder";
import { XxxDecoder, XXX_DECODER_SERVICE_TYPE } from "./XxxDecoder";

export class XxxDecoderService {
    /**
     * 注册解码服务。必须在 decoder bundle 初始化时调用：
     * @flywave/flywave.gl/src/DecoderBundleMain.ts 里 import 并 start()。
     */
    static start() {
        WorkerServiceManager.getInstance().register({
            serviceType: XXX_DECODER_SERVICE_TYPE,
            factory: (serviceId: string) => TileDecoderService.start(serviceId, new XxxDecoder())
        });
    }
}
