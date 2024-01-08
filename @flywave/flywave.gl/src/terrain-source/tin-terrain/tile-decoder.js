/*
 * Copyright © 2017-2020 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { createVerticesFromQuantizedTerrainMesh } from "./quantized-mesh/create-vertices-from-quantized-terrain-mesh";
import { upsampleQuantizedTerrainMesh } from "./quantized-mesh/upsample-quantized-terrain-mesh";

export const QUANTIZED_MESH_TILE_DECODER_ID = "quantized-mesh-tile-decoder";
import { offScreenCanvasManagerRender } from "./quantized-mesh/render-heightmap";

export class QuantizedMeshTileDecoder {
    constructor() {
        this.configurePromise = new Promise((reslove, reject) => {
            this._reslove = reslove;
            this._reject = reject;
        });
    }

    connect() {
        return Promise.resolve();
    }

    configure({ options }) {
        offScreenCanvasManagerRender.addOffScreenCanvas(
            options.offScreenCanvasId,
            options.offScreenCanvas
        );

        this.offScreenCanvasId = options.offScreenCanvasId;
        this._reslove();
    }

    decodeTile(data, tileKey, projection) {
        return this.configurePromise.then(() => {
            data.offScreenCanvasId = this.offScreenCanvasId;
            var transferableObjects = [];
            var tileTerrain = data.upsample
                ? upsampleQuantizedTerrainMesh(
                      data,
                      transferableObjects,
                      projection,
                      tileKey,
                      data.offScreenCanvas
                  )
                : createVerticesFromQuantizedTerrainMesh(
                      data,
                      transferableObjects,
                      projection,
                      tileKey,
                      data.offScreenCanvas
                  );
            const verityTile = {
                techniques: [],
                geometries: [],
                tileTerrain
            };

            return Promise.resolve(verityTile);
        });
    }
}
