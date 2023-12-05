import { WorkerBasedDecoder, ConcurrentDecoderFacade } from "@flywave/flywave-mapview";
import { WorkerDecoderProtocol, getProjectionName } from "@flywave/flywave-datasource-protocol";
import { getOffScreenCanvas } from "./quantized-mesh/render-heightmap";

export class TinWorkerBasedDecoder extends WorkerBasedDecoder {
    constructor(decoderServiceType, scriptUrl) {
        const workerSet = ConcurrentDecoderFacade.getWorkerSet(scriptUrl);
        super(workerSet, decoderServiceType);
        workerSet.m_workers.forEach(w => {
            w.offScreenCanvas = getOffScreenCanvas();
        });
    }

    decodeTile(data, tileKey, projection, requestController) {
        const tileKeyCode = tileKey.mortonCode();
        const message = {
            type: WorkerDecoderProtocol.Requests.DecodeTileRequest,
            tileKey: tileKeyCode,
            data,
            projection: getProjectionName(projection)
        };
        const currentWork =
            this.workerSet.m_availableWorkers[this.workerSet.m_availableWorkers.length - 1];

        let transferList;
        if (currentWork&&currentWork.offScreenCanvas) {
            transferList = [currentWork.offScreenCanvas];
            data.offScreenCanvas = currentWork.offScreenCanvas;
            delete currentWork.offScreenCanvas;
        }

        return this.workerSet.invokeRequest(
            this.serviceId,
            message,
            transferList,
            requestController
        );
    }
}
