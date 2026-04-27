import { type TileKey, type TilingScheme } from "@flywave/flywave-geoutils";
import { type ITerrainSource } from "../../TerrainSource";
import { type ILayerStrategy } from "../layer-strategy/LayerStrategy";
import { QuantizedStratumResource } from "./QuantizedStratumResource";
export declare function getQuantizedStratumMesh(layerStrategy: ILayerStrategy, dataSource: ITerrainSource, tilingScheme: TilingScheme, tileKey: TileKey, elevationMapEnabled: boolean, elevationMapFlipY: boolean): Promise<QuantizedStratumResource>;
