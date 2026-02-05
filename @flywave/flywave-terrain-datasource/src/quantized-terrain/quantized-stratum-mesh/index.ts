/* Copyright (C) 2025 flywave.gl contributors */

import { type TileKey, type TilingScheme, GeoBox, GeoCoordinates } from "@flywave/flywave-geoutils";

import { TaskType } from "../../Constants";
import { type DecodedTerrainTile } from "../../TerrainDecoderWorker";
import { type ITerrainSource } from "../../TerrainSource";
import { type ILayerStrategy } from "../layer-strategy/LayerStrategy";
import { QuantizedStratumResource } from "./QuantizedStratumResource";
import { DecodedStratumTileData, StratumTileData } from "./stratum-tile/StratumTileData";
import { serializeHeightMapModifier } from "../../ground-modification-manager";
export async function getQuantizedStratumMesh(
    layerStrategy: ILayerStrategy,
    dataSource: ITerrainSource,
    tilingScheme: TilingScheme,
    tileKey: TileKey,

    elevationMapEnabled: boolean,
    elevationMapFlipY: boolean
): Promise<QuantizedStratumResource> {
    const geoBox = tilingScheme.getGeoBox(tileKey);
    const foundModifiers = dataSource
        .getGroundModificationManager()
        .findModifiersInBoundingBox(geoBox);
    const heightMapModifiers = foundModifiers.map(m => serializeHeightMapModifier(m));

    return await layerStrategy
        .requestTileBuffer(tileKey)
        .then(function (buffer: ArrayBuffer) {
            return dataSource.decoder.decodeTile(
                {
                    buffer,
                    type: TaskType.QuantizedStratumInit,
                    heightMapModifiers,
                    geoBox: geoBox.toArray(),
                    elevationMapEnabled,
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
