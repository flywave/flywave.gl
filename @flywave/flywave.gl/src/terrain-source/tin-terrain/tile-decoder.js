/*
 * Copyright © 2017-2020 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  GeoCoordinates,
} from "@flywave/flywave-geoutils";
import { createVerticesFromQuantizedTerrainMesh } from "./quantized-mesh/create-vertices-from-quantized-terrain-mesh";
import { upsampleQuantizedTerrainMesh } from "./quantized-mesh/upsample-quantized-terrain-mesh";

export const QUANTIZED_MESH_TILE_DECODER_ID = 'quantized-mesh-tile-decoder'


export class QuantizedMeshTileDecoder {
  connect() {
    return Promise.resolve()
  }

  configure() { }

  decodeTile(data, tileKey, projection) {

    var transferableObjects = [];
    var tileTerrain = data.upsample ? upsampleQuantizedTerrainMesh(data, transferableObjects, projection, tileKey) :
      createVerticesFromQuantizedTerrainMesh(data, transferableObjects, projection, tileKey);
    const verityTile = {
      techniques: [],
      geometries: [],
      tileTerrain
    }

    return Promise.resolve(verityTile)
  }
}