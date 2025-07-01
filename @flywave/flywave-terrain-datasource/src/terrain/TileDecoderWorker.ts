import { TileDecoderService } from "@flywave/flywave-mapview-decoder/src/TileDecoderService";
import { WorkerServiceManager } from "@flywave/flywave-mapview-decoder/src/WorkerServiceManager";

import { QUANTIZED_MESH_TILE_DECODER_ID, QuantizedMeshTileDecoder } from "./TileDecoder";

WorkerServiceManager.getInstance().register({
    serviceType: QUANTIZED_MESH_TILE_DECODER_ID,
    factory: serviceId => {
        return TileDecoderService.start(serviceId, new QuantizedMeshTileDecoder());
    }
});
