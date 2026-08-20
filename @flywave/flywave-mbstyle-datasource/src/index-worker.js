"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MBStyleDecoder = void 0;
exports.startMBStyleDecoderService = startMBStyleDecoderService;
const index_worker_1 = require("@flywave/flywave-mapview-decoder/index-worker");
const MBStyleDecoder_1 = require("./MBStyleDecoder");
const MBSTYLE_DECODER_SERVICE_TYPE = 'mbstyle-vector-tile-decoder';
function startMBStyleDecoderService() {
    index_worker_1.WorkerServiceManager.getInstance().register({
        serviceType: MBSTYLE_DECODER_SERVICE_TYPE,
        factory: (serviceId) => index_worker_1.TileDecoderService.start(serviceId, new MBStyleDecoder_1.MBStyleDecoder()),
    });
}
var MBStyleDecoder_2 = require("./MBStyleDecoder");
Object.defineProperty(exports, "MBStyleDecoder", { enumerable: true, get: function () { return MBStyleDecoder_2.MBStyleDecoder; } });
//# sourceMappingURL=index-worker.js.map