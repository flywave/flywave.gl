/* Copyright (C) 2025 flywave.gl contributors */

import { TileKey } from "@flywave/flywave-geoutils";
import {
    type BaseQuantizedTerrainSourceOptions,
    BaseQuantizedTerrainSource
} from "./BaseQuantizedTerrainSource";
import { type QuantizedTerrainMesh } from "./quantized-mesh/QuantizedTerrainMesh";
import { QuantizedTerrainProvider } from "./QuantizedTerrainProvider";
import { QuantizedTerrainTileFactory } from "./TileFactory";

/**
 * Configuration options for QuantizedTerrainSource
 *
 * Extends the base terrain source options with additional quantized terrain-specific parameters.
 * These options control the level of detail and additional data that can be requested
 * for terrain tiles, affecting both visual quality and data loading requirements.
 */
export interface QuantizedTerrainSourceOptions extends BaseQuantizedTerrainSourceOptions {
    /**
     * Whether to request water mask data for terrain tiles
     *
     * Water masks provide information about water bodies on the terrain surface,
     * which can be used for specialized rendering effects like water reflections
     * or terrain masking.
     *
     * @default false
     */
    requestWaterMask?: boolean;

    /**
     * Whether to request vertex normals for terrain tiles
     *
     * Vertex normals enable enhanced lighting and shading effects on terrain
     * surfaces, providing more realistic rendering but requiring additional
     * data loading and processing.
     *
     * @default false
     */
    requestVertexNormals?: boolean;

    /**
     * Whether to request additional metadata for terrain tiles
     *
     * Metadata can include information about the source data, creation dates,
     * quality metrics, and other descriptive information that may be useful
     * for analysis or debugging purposes.
     *
     * @default false
     */
    requestMetadata?: boolean;
}

/**
 * Implementation of a terrain source for quantized mesh terrain data
 *
 * This class handles the creation and configuration of quantized terrain sources,
 * including water masks, vertex normals, and metadata as requested.
 *
 * Quantized mesh terrain provides efficient storage and transmission of terrain
 * data by using a variable level of detail (LOD) approach that adapts to the
 * viewer's distance from the terrain surface.
 */
export class QuantizedTerrainSource extends BaseQuantizedTerrainSource<QuantizedTerrainMesh> {
    /**
     * Creates a new QuantizedTerrainProvider instance with the specified options
     *
     * @param options - Configuration options for the terrain provider
     * @returns Configured QuantizedTerrainProvider instance
     */
    protected createProvider(options: QuantizedTerrainSourceOptions): QuantizedTerrainProvider {
        return new QuantizedTerrainProvider({
            heightMapLevelSkipSize: options.defaultHeightMapSize,
            url: options.url,
            headers: options.headers,
            requestWaterMask: options.requestWaterMask ?? false,
            requestVertexNormals: options.requestVertexNormals ?? false,
            requestMetadata: options.requestMetadata ?? false
        });
    }

    /**
     * Constructs a new QuantizedTerrainSource
     *
     * @param options - Configuration options for the terrain source
     */
    constructor(options: QuantizedTerrainSourceOptions) {
        super(new QuantizedTerrainTileFactory(), options);
    }

    shouldSubdivide(zoomLevel: number, tileKey: TileKey): boolean { 
        let tileIsAvailable = this.dataProvider().layerStrategy.getTileDataAvailable(tileKey) || this.dataProvider().hasResource(tileKey);

        let childrens = this.getTilingScheme().getSubTileKeys(tileKey);

        if (tileIsAvailable)
            for (let child of childrens) {
                if (!this.canGetSubdivideChildren(child)) {
                    tileIsAvailable = false;
                    break;
                }
            }

        return (
            tileIsAvailable && super.shouldSubdivide(zoomLevel, tileKey)
        )
    }

    canGetSubdivideChildren(tileKey: TileKey): boolean {
        return this.dataProvider().layerStrategy.getTileDataAvailable(tileKey) || this.dataProvider().hasResource(tileKey.parent());
    }
}
