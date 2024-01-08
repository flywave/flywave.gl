import { WorkerBasedDecoder, ConcurrentDecoderFacade } from "@flywave/flywave-mapview";
import { getOffScreenCanvas } from "../tin-terrain/quantized-mesh/render-heightmap";

export class StratumCSGDecoder extends WorkerBasedDecoder {
    constructor(decoderServiceType, scriptUrl) {
        const workerSet = ConcurrentDecoderFacade.getWorkerSet(scriptUrl);
        super(workerSet, decoderServiceType);
    }
}
