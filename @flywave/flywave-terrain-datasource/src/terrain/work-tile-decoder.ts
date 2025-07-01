import { WorkerDecoderProtocol } from "@flywave/flywave-datasource-protocol";
import { ConcurrentDecoderFacade, WorkerBasedDecoder } from "@flywave/flywave-mapview";

import { getOffScreenCanvas } from "./render-heightmap";

interface DecoderOptions {
    [key: string]: any;
    offScreenCanvas?: OffscreenCanvas;
    offScreenCanvasId?: string;
}

export class TinWorkerBasedDecoder extends WorkerBasedDecoder {
    constructor(decoderServiceType: string, scriptUrl: string) {
        const workerSet = ConcurrentDecoderFacade.getWorkerSet(scriptUrl);
        super(workerSet, decoderServiceType);
    }

    async configure(
        options: Record<string, any>,
        customOptions: Record<string, any>
    ): Promise<void> {
        const message = {
            service: this.serviceId,
            type: WorkerDecoderProtocol.DecoderMessageName.Configuration,
            ...options,
            options: {
                ...customOptions
            }
        };
        return this.broadcastMessage(message);
    }

    broadcastMessage(message: {
        service: string;
        type: string;
        options?: DecoderOptions;
        [key: string]: any;
    }): void {
        const offScreenCanvas = getOffScreenCanvas();
        const updatedMessage = {
            ...message,
            options: {
                ...message.options,
                offScreenCanvas,
                offScreenCanvasId: (offScreenCanvas as any).id
            }
        };
        this.workerSet.broadcastMessage(updatedMessage, [offScreenCanvas]);
    }
}
