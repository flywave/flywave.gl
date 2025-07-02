import { TileDecoderService } from "@flywave/flywave-mapview-decoder/src/TileDecoderService";
import { WorkerServiceManager } from "@flywave/flywave-mapview-decoder/src/WorkerServiceManager";

import { RESTER_DEM_TILE_DECODER_ID } from "../Constants";
import { RasterDEMTileWorkerSource } from "./TileDecoder";

class DemTileDecoderService {
    static start(): void {
        WorkerServiceManager.getInstance().register({
            serviceType: RESTER_DEM_TILE_DECODER_ID,
            factory: (serviceId: string) => {
                return TileDecoderService.start(serviceId, new RasterDEMTileWorkerSource());
            }
        });
    }
}

export { DemTileDecoderService };
