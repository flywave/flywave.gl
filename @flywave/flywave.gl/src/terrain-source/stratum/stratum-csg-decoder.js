import { WorkerBasedDecoder, ConcurrentDecoderFacade } from "@flywave/flywave-mapview";

export class StratumCSGDecoder extends WorkerBasedDecoder {
    constructor(decoderServiceType, scriptUrl) {
        const workerSet = ConcurrentDecoderFacade.getWorkerSet(scriptUrl);
        super(workerSet, decoderServiceType);
    }
}
