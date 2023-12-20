/*
 * Copyright © 2017-2020 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    WorkerServiceManager,
    TileDecoderService
} from "@flywave/flywave-mapview-decoder/index-worker";
import { CSG_STRATUM_DECODER, CSGStratumTileDecoder } from "./csg-decorder";

export default class CsgStratumDecoderService {
    static start() {
        WorkerServiceManager.getInstance().register({
            serviceType: CSG_STRATUM_DECODER,
            factory: serviceId => {
                return TileDecoderService.start(serviceId, new CSGStratumTileDecoder());
            }
        });
    }
}
