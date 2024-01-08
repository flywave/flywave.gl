import { WorkerBasedDecoder, ConcurrentDecoderFacade } from "@flywave/flywave-mapview";
import { WorkerDecoderProtocol, getProjectionName } from "@flywave/flywave-datasource-protocol";
import { getOffScreenCanvas } from "./quantized-mesh/render-heightmap";

export class TinWorkerBasedDecoder extends WorkerBasedDecoder {
    constructor(decoderServiceType, scriptUrl) {
        const workerSet = ConcurrentDecoderFacade.getWorkerSet(scriptUrl);
        super(workerSet, decoderServiceType);
    }

    async configure(options, customOptions) {
        const message = Object.assign(
            Object.assign(
                {
                    service: this.serviceId,
                    type: WorkerDecoderProtocol.DecoderMessageName.Configuration
                },
                options
            ),
            {
                options: {
                    ...customOptions
                }
            }
        );
        return this.broadcastMessage(message);
    }

    broadcastMessage(message) {
        const { m_workers } = this.workerSet;
        this.workerSet.ensureStarted();
        m_workers.forEach(worker => {
            var offScreenCanvas = getOffScreenCanvas();
            message.options = {
                ...message.options,
                offScreenCanvas,
                offScreenCanvasId: offScreenCanvas.id
            };
            worker.postMessage(message, [offScreenCanvas]);
        });
    }
}
