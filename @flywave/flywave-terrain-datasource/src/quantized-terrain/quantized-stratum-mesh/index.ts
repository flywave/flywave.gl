/* Copyright (C) 2025 flywave.gl contributors */

import { type TileKey, type TilingScheme, GeoBox, GeoCoordinates } from "@flywave/flywave-geoutils";

import { TaskType } from "../../Constants";
import { brushOperationsToSerializedModifications } from "../../ground-modification-manager";
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
    const foundOps = dataSource.getGroundModificationManager().findOperationsInBoundingBox(geoBox);
    const groundModificationPolygons = brushOperationsToSerializedModifications(
        foundOps.map(item => item.operation),
        foundOps.map(item => item.id),
        foundOps.map(item => {
            const bbox = dataSource.getGroundModificationManager().getOperationBoundingBox(item.id);
            return bbox || new GeoBox(new GeoCoordinates(0, 0), new GeoCoordinates(0, 0));
        })
    );
    return await layerStrategy
        .requestTileBuffer(tileKey)
        .then(function (buffer: ArrayBuffer) {
            return dataSource.decoder.decodeTile(
                {
                    buffer,
                    type: TaskType.QuantizedStratumInit,
                    groundModificationPolygons,
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
