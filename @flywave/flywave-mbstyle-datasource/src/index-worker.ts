import { TileDecoderService, WorkerServiceManager } from '@flywave/flywave-mapview-decoder/index-worker';

import { MBStyleDecoder } from './MBStyleDecoder';

const MBSTYLE_DECODER_SERVICE_TYPE = 'mbstyle-vector-tile-decoder';

export function startMBStyleDecoderService(): void {
    WorkerServiceManager.getInstance().register({
        serviceType: MBSTYLE_DECODER_SERVICE_TYPE,
        factory: (serviceId: string) =>
            TileDecoderService.start(serviceId, new MBStyleDecoder()),
    });
}

export { MBStyleDecoder } from './MBStyleDecoder';
