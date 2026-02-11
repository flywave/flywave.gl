/* Copyright (C) 2025 flywave.gl contributors */

import { type TileKey, type TilingScheme, GeoBox, GeoCoordinates } from "@flywave/flywave-geoutils";

import { TaskType } from "../../Constants";
import { type DecodedTerrainTile } from "../../TerrainDecoderWorker";
import { type ITerrainSource } from "../../TerrainSource";
import { type ILayerStrategy } from "../layer-strategy/LayerStrategy";
import { QuantizedStratumResource } from "./QuantizedStratumResource";
import { DecodedStratumTileData, StratumTileData } from "./stratum-tile/StratumTileData";

export async function getQuantizedStratumMesh(
    layerStrategy: ILayerStrategy,
    dataSource: ITerrainSource,
    tilingScheme: TilingScheme,
    tileKey: TileKey,

    elevationMapEnabled: boolean,
    elevationMapFlipY: boolean
): Promise<QuantizedStratumResource> {
    const geoBox = tilingScheme.getGeoBox(tileKey);

    // Check for height map modifiers in this tile's area (for elevation map decision only)
    const foundModifiers = dataSource
        .getGroundModificationManager()
        .findModifiersInBoundingBox(geoBox);

    return await layerStrategy
        .requestTileBuffer(tileKey)
        .then(function (buffer: ArrayBuffer) {
            return dataSource.decoder.decodeTile(
                {
                    buffer,
                    type: TaskType.QuantizedStratumInit,
                    terrainSourceId: dataSource.name,
                    geoBox: geoBox.toArray(),
                    elevationMapEnabled: elevationMapEnabled || !!foundModifiers?.length,
                    elevationMapFlipY
                },
                tileKey,
                dataSource.projection
            );
        })
        .then((data: DecodedTerrainTile) => {
            return new QuantizedStratumResource(
                StratumTileData.createStratumTileFromData(
                    dataSource.projection,
                    tilingScheme.getGeoBox(tileKey),
                    new DecodedStratumTileData(data.tileTerrain as DecodedStratumTileData)
                )
            );
        });
}
