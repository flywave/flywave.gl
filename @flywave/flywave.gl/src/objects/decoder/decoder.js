/*
 * Copyright © 2017-2020 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { WorkerServiceManager, WorkerService } from '@flywave/flywave-mapview-decoder/index-worker'
import { OBJECT_TRANSFROM_DECODER_ID, Decoder } from "./transfrom-epsg4326-to-projection";

class ObjectWorkerService extends WorkerService {
    handleRequest(request: any, decoder) {
        return decoder.decode(request.data, request.projection);
    }
}

export default class ObjectDecoderService {
    static start() {
        WorkerServiceManager.getInstance().register({
            serviceType: OBJECT_TRANSFROM_DECODER_ID,
            factory: (serviceId) => {
                return ObjectWorkerService.start(serviceId, new Decoder())
            }
        })
    }
}