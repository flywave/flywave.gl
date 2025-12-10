/* Copyright (C) 2025 flywave.gl contributors */

import {
    type ElevationProvider as IElevationProvider,
    type ElevationRangeSource as IElevationRangeSource
} from "@flywave/flywave-mapview";

import { type TerrainSourceOptions, TerrainSource } from "../TerrainSource";
import { type DEMEncoding } from "./dem/DemData";
import { type DemSourceDescription, DemTileProvider } from "./DEMTileProvider";
import { ElevationProvider } from "./ElevationProvider";
import { ElevationRangeSource } from "./ElevationRangeSource";
import { HeightMapTileFactory } from "./TileFactory";

/**
 * Configuration options for DEM terrain source
 *
 * This type extends the base TerrainSourceOptions but omits the dataProvider property
 * since it will be automatically created by the DEMTerrainSource. It adds specific
 * properties for DEM data sources such as the source URL or description and encoding format.
 */
export type DemTerrainSourceOptions = Omit<
    TerrainSourceOptions<DemTileProvider>,
    "dataProvider"
> & {
    /**
     * The source of the DEM data, either a URL string or a detailed source description
     */
    source: string | DemSourceDescription;

    /**
     * The encoding format of the DEM data (e.g., "mapbox", "terrarium")
     * @default "mapbox"
     */
    encoding?: DEMEncoding;
};

/**
 * DEM (Digital Elevation Model) terrain data source
 *
 * This class implements a terrain data source that loads and renders DEM data
 * for 3D terrain visualization. It extends the base TerrainSource class and
 * provides specialized functionality for handling digital elevation models.
 *
 * The source supports various DEM formats and can load data from different providers
 * using the DemTileProvider. It also provides elevation and elevation range services
 * for querying height information at specific geographic coordinates.
 */
export class DEMTerrainSource extends TerrainSource<DemTileProvider> {
    /**
     * Creates a new DEM terrain source instance
     *
     * @param options - Configuration options for the DEM terrain source
     */
    constructor(options: DemTerrainSourceOptions) {
        super(new HeightMapTileFactory(), {
            ...options,
            dataProvider: new DemTileProvider(options),
            name: options.name || `dem_terrain_data_source`
        });
    }

    /**
     * Creates an elevation range source for this terrain source
     *
     * This method creates and returns an ElevationRangeSource instance that can
     * provide minimum and maximum elevation values for specific tiles. This is
     * used for frustum culling and other optimizations in the rendering pipeline.
     *
     * @returns A new ElevationRangeSource instance
     */
    protected createElevationRangeSource(): IElevationRangeSource {
        return new ElevationRangeSource(this);
    }

    /**
     * Creates an elevation provider for this terrain source
     *
     * This method creates and returns an ElevationProvider instance that can
     * provide elevation values at specific geographic coordinates. This is used
     * for features like ray casting and height queries.
     *
     * @returns A new ElevationProvider instance
     */
    protected createElevationProvider(): IElevationProvider {
        return new ElevationProvider(this);
    }

    /**
     * Gets the terrain level range supported by this data source
     *
     * This method returns the minimum and maximum zoom levels supported by
     * the underlying DEM data provider. This information is used to determine
     * when to subdivide tiles and when to stop loading higher resolution data.
     *
     * @returns A tuple containing [minZoom, maxZoom] levels
     */
    protected getTerrainLevelRange(): [number, number] {
        return [this.dataProvider()?.getMinZoom() ?? 0, this.dataProvider()?.getMaxZoom() ?? 0];
    }
}
