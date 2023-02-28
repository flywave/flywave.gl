/*
 * Copyright © 2017-2020 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { WorkerServiceManager, TileDecoderService } from '@flywave/flywave-mapview-decoder/index-worker'
import { RasterDEMTileWorkerSource } from './tile-decoder'
import { RESTER_DEM_TILE_DECODER_ID } from "../constants";

export default class DemTileDecoderService {
  static start() {
    WorkerServiceManager.getInstance().register({
      serviceType: RESTER_DEM_TILE_DECODER_ID,
      factory: (serviceId) => {
        return TileDecoderService.start(serviceId, new RasterDEMTileWorkerSource())
      }
    })
  }
}