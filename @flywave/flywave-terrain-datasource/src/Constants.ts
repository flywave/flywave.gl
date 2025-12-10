/* Copyright (C) 2025 flywave.gl contributors */

export const TERRAIN_TILE_DECODER_ID = "terrain-tile-decoder";

export const GroundModificationFlagValue = 0.0;
/**
 * Enumeration of supported task types for quantized mesh processing
 *
 * This enum defines the different types of processing tasks that can be
 * handled by the quantized mesh tile decoder, each representing a specific
 * processing pipeline for terrain data.
 */
export enum TaskType {
    /**
     * Direct quantized mesh parsing task
     *
     * This task type handles the direct parsing of raw quantized mesh buffer data
     * into terrain geometry and associated metadata. It's used for loading
     * terrain tiles that are available at the requested resolution.
     */
    QuantizedMesh = "quantized-mesh",

    /**
     * Quantized mesh upsample/clipping task
     *
     * This task type handles the up-sampling and clipping of parent terrain tiles
     * to match the resolution and boundaries of child tiles. It's used when
     * higher resolution data needs to be generated from lower resolution parents.
     */
    QuantizedUpsample = "quantized-upsample",

    /**
     * Quantized stratum initialization task
     *
     * This task type handles the initialization of stratum-based terrain data,
     * which provides enhanced elevation accuracy for specific regions. It's used
     * for loading specialized terrain data that requires stratum processing.
     */
    QuantizedStratumInit = "quantized-stratum-init",

    /**
     * Raster DEM tile processing task
     *
     * This task type handles the processing of raster DEM (Digital Elevation Model)
     * data, which provides elevation information for terrain rendering. It's used
     * for loading and processing DEM data that is available as raster images.
     */
    RasterDEM = "raster-dem",

    /**
     * Ground overlay processing task
     *
     * This task type handles the processing of ground overlay data, which
     * includes images or textures that are draped over the terrain surface.
     * It's used for loading and processing ground overlay data that is available
     * as image bitmaps.
     */
    GroundOverlay = "ground-overlay",


      /**
     * Tile geometry reprojection task
     *
     * This task type handles the reprojection of terrain geometry between different
     * coordinate reference systems. It transforms vertex coordinates from source
     * projection to target projection while maintaining mesh structure and attributes.
     * It's used when terrain data needs to be displayed in a different coordinate system.
     */
    GeometryReprojection = "geometry-reprojection"
}
