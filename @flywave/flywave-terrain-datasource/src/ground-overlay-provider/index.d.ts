import { type TileKey, GeoBox, GeoLineString, GeoPolygon } from "@flywave/flywave-geoutils";
import * as THREE from "three";
import { ResourceProvider } from "../ResourceProvider";
import { type ITerrainSource } from "../TerrainSource";
import { TileValidResource } from "../TileResourceManager";
import { type GroundOverlayTexture } from "./GroundOverlayTexture";
/**
 * Configuration options for the GroundOverlayProvider
 *
 * This interface defines the optional configuration parameters that can
 * be used to customize the behavior of the GroundOverlayProvider.
 */
export interface GroundOverlayProviderOptions {
    /**
     * Number of stages to split the loading process
     * @default 1
     */
    loadingStages?: number;
    /**
     * Minimum tile level to load
     * @default 0
     */
    minLevel?: number;
    /**
     * Maximum tile level to load
     * @default 22
     */
    maxLevel?: number;
    /**
     * Initial overlay textures to load when the provider is created
     */
    initialOverlays?: GroundOverlayTexture[];
}
/**
 * Represents a ground overlay texture resource for a specific tile
 *
 * This class extends TileValidResource to provide a specialized resource
 * type for ground overlay textures. It manages the texture data and
 * provides methods for resource cleanup and memory usage calculation.
 */
export declare class GroundOverlayTextureResource extends TileValidResource {
    private readonly overlaysTexture;
    /**
     * Creates a new ground overlay texture resource
     *
     * @param overlaysTexture - The THREE.Texture containing overlay data, or null if no overlay
     * @param geoBox - Geographic bounding box of the tile this resource belongs to
     */
    constructor(overlaysTexture: THREE.Texture | null, geoBox: GeoBox);
    /**
     * Gets the overlay texture
     *
     * @returns The overlay texture or null if no overlay exists for this tile
     */
    get texture(): THREE.Texture;
    /**
     * Disposes of the overlay texture resources
     *
     * This method is called when the resource is being cleaned up to ensure
     * that all allocated resources (textures, buffers, etc.) are properly released.
     *
     * @inheritdoc
     */
    disposeResources(): void;
    /**
     * Gets the memory usage of this resource in bytes
     *
     * This method calculates the approximate memory footprint of the overlay
     * texture by examining its image data dimensions.
     *
     * @returns The number of bytes used by this resource
     * @inheritdoc
     */
    getBytesUsed(): number;
}
/**
 * Manages ground overlay textures and their distribution across map tiles
 *
 * This class extends ResourceProvider to handle the specific requirements
 * of ground overlay textures. It manages a collection of overlay textures
 * and determines which overlays intersect with specific map tiles, then
 * generates the appropriate texture data for each tile.
 *
 * The provider supports various geographic area types including bounding
 * boxes, polygons, and line strings, and provides methods for adding,
 * removing, and updating overlays.
 */
export declare class GroundOverlayProvider extends ResourceProvider<GroundOverlayTextureResource, ITerrainSource> {
    /** Array of all managed overlay textures */
    private overlays;
    /**
     * Creates a new GroundOverlayProvider instance
     *
     * @param options - Configuration options for the provider
     * @param terrainSource - Associated terrain data source for coordinate transformations
     */
    constructor(options: GroundOverlayProviderOptions, terrainSource: ITerrainSource);
    /**
     * Extracts coordinates from different geometry types for bounding box calculation
     *
     * This method converts various geographic area types into arrays of coordinates
     * that can be used for bounding box calculations and spatial queries.
     *
     * @param geoArea - The geographic area to extract coordinates from
     * @returns Array of geographic coordinates
     */
    private extractCoordinates;
    /**
     * Checks if two geographic areas are equal
     *
     * This method compares two geographic areas of potentially different types
     * to determine if they represent the same spatial region. For complex
     * geometries, it uses bounding box comparison as an approximation.
     *
     * @param a - First geographic area to compare
     * @param b - Second geographic area to compare
     * @returns True if the areas are equal, false otherwise
     */
    private areGeoAreasEqual;
    /**
     * Adds one or more overlay textures to the provider
     *
     * This method adds new overlay textures to the provider's collection.
     * Each overlay is assigned a unique ID, and the affected tiles are
     * marked as dirty to trigger updates.
     *
     * @param overlays - Overlay textures to add (without IDs, which will be generated)
     * @returns Array of generated overlay IDs
     */
    addOverlays(overlays: Array<Omit<GroundOverlayTexture, "id">>): string[];
    /**
     * Gets an overlay by its ID
     *
     * This method retrieves a specific overlay texture by its unique identifier.
     *
     * @param id - The overlay ID to find
     * @returns The overlay if found, undefined otherwise
     */
    getOverlayById(id: string): GroundOverlayTexture | undefined;
    /**
     * Checks if two coordinate arrays are equal
     *
     * This method compares two arrays of geographic coordinates to determine
     * if they contain the same coordinates in the same order.
     *
     * @param a - First coordinate array
     * @param b - Second coordinate array
     * @returns True if arrays contain equal coordinates in same order
     */
    private areCoordinatesEqual;
    /**
     * Creates a GeoBox that encloses the given coordinates
     *
     * This method calculates the minimum bounding box that contains all
     * the specified geographic coordinates.
     *
     * @param coords - Array of geographic coordinates
     * @returns Bounding box containing all coordinates
     * @throws Error if coordinates array is empty
     */
    private createBoundingBoxForCoordinates;
    /**
     * Removes overlays matching the specified identifier
     *
     * This method removes overlay textures from the provider based on
     * various identifier types. It can remove overlays by ID, name,
     * or geographic area, and marks affected tiles as dirty.
     *
     * @param identifier - Can be overlay ID/name, GeoBox, GeoPolygon, GeoLineString, or coordinate array
     */
    removeOverlays(identifier: string | GeoBox | GeoPolygon | GeoLineString): void;
    /**
     * Checks if a geographic area intersects with a tile's bounding box
     *
     * This method determines whether a geographic area intersects with
     * a specific map tile's bounding box. For complex geometries, it
     * uses cached bounding boxes for efficient comparison.
     *
     * @param geoArea - Geographic area (GeoBox, GeoPolygon, or GeoLineString)
     * @param tileGeoBox - Tile's bounding box
     * @returns True if areas intersect
     */
    private intersectsTile;
    /**
     * 获取或创建GeoArea的边界框，使用缓存避免重复计算
     *
     * This method retrieves a cached bounding box for a geographic area
     * if one exists, or calculates and caches a new bounding box if not.
     * This optimization avoids repeated calculations for the same area.
     *
     * @param geoArea - Geographic area (GeoPolygon or GeoLineString)
     * @returns Bounding box for the geo area
     */
    private getOrCreateBoundingBox;
    /**
     * Updates an existing overlay
     *
     * This method updates the properties of an existing overlay texture.
     * It can update any property except the ID, and marks affected tiles
     * as dirty to trigger updates.
     *
     * @param identifier - Overlay ID/name, GeoBox, GeoPolygon, GeoLineString, or coordinate array
     * @param updates - Partial overlay properties to update
     * @returns True if overlay was found and updated
     */
    updateOverlay(identifier: string | GeoBox | GeoPolygon | GeoLineString, updates: Partial<Omit<GroundOverlayTexture, "id">>): boolean;
    /**
     * Gets all overlay textures
     *
     * This method returns a copy of all overlay textures currently
     * managed by this provider.
     *
     * @returns Array of all overlay textures
     */
    getAllOverlays(): GroundOverlayTexture[];
    /**
     * Marks affected tiles as needing update
     *
     * This method informs the map view that certain tiles need to be
     * updated because their overlay content has changed. It calculates
     * which tiles are affected by the change and marks them accordingly.
     *
     * @param overlay - Specific overlay that changed (optional)
     * @param oldGeoArea - Previous geographic area (optional)
     */
    private markTilesDirty;
    /**
     * Adds tile keys intersecting with the specified geographic area
     *
     * This method calculates which map tiles intersect with a given
     * geographic area and adds their keys to the provided set.
     *
     * @param geoArea - Geographic area to test
     * @param tileKeys - Set to collect intersecting tile keys
     */
    private addTileKeysForGeoArea;
    /**
     * Checks if the provider is ready to load tiles
     *
     * @returns Always returns true for ground overlay provider
     * @inheritdoc
     */
    ready(): boolean;
    /**
     * Checks if the elevation map should be flipped on the Y axis
     *
     * This method determines whether the Y axis should be flipped when
     * processing elevation data based on the tiling scheme being used.
     *
     * @returns True if the Y axis should be flipped
     */
    protected isElevationMapFlipY(): boolean;
    /**
     * Gets a tile resource for the specified tile key
     *
     * This method fetches or generates the appropriate overlay texture
     * data for a specific map tile. It identifies which overlays intersect
     * with the tile and combines them into a single texture.
     *
     * @warning 此方法可能有性能问题，主要集中在执行serializeGroundOverlayTexture中，
     * 该操作会序列化所有相交的覆盖纹理，对于大量或复杂的覆盖纹理可能会阻塞主线程。
     * 建议最大使用层级不超过18级，以避免性能问题。
     *
     * @param tileKey - The tile key to load
     * @param abortSignal - Optional abort signal for cancellation
     * @returns A promise that resolves to the ground overlay texture resource
     * @inheritdoc
     */
    getTile(tileKey: TileKey, abortSignal?: AbortSignal): Promise<GroundOverlayTextureResource>;
    /**
     * Establishes connection to the data source
     *
     * This method is called to establish any necessary connections for
     * loading overlay data. For ground overlays, no connection is needed.
     *
     * @returns A promise that resolves immediately
     * @inheritdoc
     */
    protected connect(): Promise<void>;
    /**
     * Removes all overlay textures
     *
     * This method clears all overlay textures from the provider and
     * marks all affected tiles as dirty to trigger updates.
     */
    clearAllOverlays(): void;
    /**
     * Disposes of the provider and cleans up resources
     *
     * This method cleans up all resources used by the provider, including
     * clearing all overlays and calling the parent dispose method.
     *
     * @inheritdoc
     */
    dispose(): void;
}
