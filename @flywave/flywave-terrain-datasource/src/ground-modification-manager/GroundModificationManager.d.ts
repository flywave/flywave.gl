import { GeoBox, GeoCoordinates, GeoLineString, GeoPolygon } from "@flywave/flywave-geoutils";
import { EventDispatcher } from "three";
import { type ITerrainSource } from "../TerrainSource";
import { type GroundModificationPolygon, type GroundModificationType } from "./GroundModificationPolygon";
export { GroundModificationType };
/**
 * Kriging interpolation parameter configuration
 *
 * This interface defines the parameters used for kriging interpolation
 * in ground modification operations. Kriging is a geostatistical method
 * for spatial interpolation that provides optimal predictions.
 */
export interface GroundModificationOptions {
    /**
     * Interpolation model type
     *
     * Different models have different characteristics:
     * - "gaussian": Smooth interpolation with rapid decay
     * - "exponential": Moderate smoothness with exponential decay
     * - "spherical": Limited range with compact support
     */
    model?: "gaussian" | "exponential" | "spherical";
    /**
     * Variance parameter (sigma squared)
     *
     * Controls the overall variance of the interpolation model.
     * Higher values result in more variation in the interpolated surface.
     */
    sigma2?: number;
    /**
     * Smoothing parameter (alpha)
     *
     * Controls the smoothness of the interpolation. Lower values
     * produce smoother surfaces, while higher values allow for
     * more local variation.
     */
    alpha?: number;
    /**
     * Number of interpolation points
     *
     * Specifies how many points to use in the interpolation process.
     * More points generally produce more accurate results but require
     * more computational resources.
     */
    numPoints?: number;
}
/**
 * Parameters for ground modification events
 *
 * This interface defines the structure of events that are dispatched
 * when ground modifications are added, removed, updated, or cleared.
 * These events provide detailed information about what changed and
 * where, allowing other parts of the system to react appropriately.
 */
export interface GroundModificationEventParams {
    /**
     * Type of change that occurred
     *
     * Indicates what kind of operation was performed:
     * - "add": A new modification was added
     * - "remove": A modification was removed
     * - "update": An existing modification was updated
     * - "clear": All modifications were cleared
     * - "bounds": Global bounds were updated
     */
    changeType: "add" | "remove" | "update" | "clear" | "bounds";
    /**
     * IDs of the affected modifications
     *
     * Array of unique identifiers for the modifications that were
     * directly affected by the change operation.
     */
    affectedIds: string[];
    /**
     * Global bounding box containing all modifications after the change
     *
     * Represents the overall spatial extent of all ground modifications
     * after the change operation was completed. This is useful for
     * determining what areas of the terrain might need updating.
     */
    globalBounds: GeoBox | null;
    /**
     * Bounding box of the affected area
     *
     * Represents the spatial extent of the area that was directly
     * affected by the change operation. This is more specific than
     * globalBounds and represents only the changed region.
     */
    affectedBounds: GeoBox | null;
    /**
     * Previous bounding box before the change (only for updates)
     *
     * For update operations, this field contains the bounding box
     * of the affected area before the change was made. This allows
     * for comparison between old and new states.
     */
    previousBounds?: GeoBox | null;
    /**
     * Array of affected modifications (for add/update operations)
     *
     * For add and update operations, this field contains the actual
     * modification objects that were affected. This provides detailed
     * information about what changed without requiring additional lookups.
     */
    modifications?: GroundModificationPolygon[];
}
/**
 * Event definitions for the GroundModificationManager
 *
 * This interface maps event names to their parameter types, enabling
 * type-safe event handling in TypeScript.
 */
interface GroundModificationEvents {
    /** Change event for ground modifications */
    change: GroundModificationEventParams;
}
/**
 * Represents a ground modification with spatial properties and terrain data
 *
 * This class encapsulates a ground modification polygon along with its
 * associated properties and methods for interacting with the terrain system.
 * It provides a high-level interface for managing ground modifications.
 */
export declare class GroundModification {
    groundModificationPolygon: GroundModificationPolygon;
    private readonly terrainSource;
    /**
     * Unique identifier for this ground modification
     *
     * Generated using Three.js MathUtils to ensure uniqueness across
     * the application. This ID is used for lookups and event tracking.
     */
    id: string;
    /**
     * Creates a new ground modification
     *
     * @param groundModificationPolygon - The polygon defining the modification area
     * @param terrainSource - The terrain source to use for elevation data
     */
    constructor(groundModificationPolygon: GroundModificationPolygon, terrainSource: ITerrainSource);
    /**
     * Gets the bounding box of this modification
     *
     * @returns The GeoBox representing the spatial extent of this modification
     */
    get boundingBox(): GeoBox;
    /**
     * Gets the geographic area of this modification
     *
     * @returns The geographic area as a GeoBox, GeoPolygon, or GeoLineString
     */
    get geoArea(): GeoBox | GeoPolygon | GeoLineString;
    /**
     * Sets the geographic area of this modification and regenerates the wall geometry
     *
     * @param geoArea - The new geographic area for this modification
     */
    set geoArea(geoArea: GeoBox | GeoPolygon | GeoLineString);
    /**
     * Gets the type of this modification (excavation or elevation)
     *
     * @returns The GroundModificationType defining how terrain is modified
     */
    get type(): GroundModificationType;
    /**
     * Sets the type of this modification and regenerates the wall geometry
     *
     * @param type - The new modification type
     */
    set type(type: GroundModificationType);
    /**
     * Gets the depth or height of this modification in meters
     *
     * @returns The depth or height value, or undefined if not set
     */
    get depthOrHeight(): number | undefined;
    /**
     * Sets the depth or height of this modification and regenerates the wall geometry
     *
     * @param depthOrHeight - The new depth or height value
     */
    set depthOrHeight(depthOrHeight: number | undefined);
    /**
     * Gets the width of the slope for this modification
     *
     * @returns The slope width value, or undefined if not set
     */
    get slopeWidth(): number | undefined;
    /**
     * Sets the width of the slope for this modification and regenerates the wall geometry
     *
     * @param slopeWidth - The new slope width value
     */
    set slopeWidth(slopeWidth: number | undefined);
}
/**
 * Options for configuring the GroundModificationManager
 *
 * This interface defines optional configuration parameters that can
 * be used to customize the behavior of the GroundModificationManager.
 */
export interface GroundModificationManagerOptions {
    /**
     * Maximum zoom level for ground modification imagery
     *
     * Controls the maximum zoom level at which ground modification
     * imagery will be displayed. Beyond this level, modifications
     * may not be rendered to improve performance.
     */
    maxGroundModificationImageryZoomLevel?: number;
    /**
     * Zoom level to skip for ground modification processing
     *
     * Specifies a zoom level at which ground modification processing
     * should be skipped entirely. This can be used to optimize
     * performance at certain zoom levels.
     */
    skipZoomLevelZoom?: number;
}
/**
 * Manages ground modification polygons with spatial indexing and event system
 *
 * This class handles the creation, modification, and querying of ground modifications
 * such as excavations and elevations. It maintains spatial indexing for efficient
 * querying and provides events for change notifications.
 *
 * The manager supports various types of geographic areas including bounding boxes,
 * polygons, and line strings, and provides methods for spatial queries like finding
 * modifications that intersect with a given area or contain a specific point.
 */
export declare class GroundModificationManager extends EventDispatcher<GroundModificationEvents> {
    private readonly terrainSource;
    /**
     * Map of all modifications by ID for efficient lookup
     * @private
     */
    private readonly modifications;
    /**
     * Global kriging interpolation configuration parameters
     *
     * These parameters control the kriging interpolation used in ground
     * modification operations. They can be updated to change the
     * interpolation behavior across all modifications.
     */
    private _krigingOptions;
    /**
     * Counter for generating unique IDs for modifications
     * @private
     */
    private nextId;
    /**
     * Global bounding box containing all modifications for spatial queries
     * @private
     */
    private globalBoundingBox;
    /**
     * Debounced dispatch function to batch change events
     * @private
     */
    private readonly debouncedDispatch;
    /**
     * Creates a new GroundModificationManager
     *
     * @param terrainSource - The terrain source to use for elevation data
     */
    constructor(terrainSource: ITerrainSource);
    /**
     * Gets the global kriging interpolation configuration parameters
     *
     * @returns A copy of the current kriging options
     */
    get krigingOptions(): GroundModificationOptions;
    /**
     * Sets the global kriging interpolation configuration parameters
     *
     * When configuration changes, an update event is triggered to notify
     * all modifications of the change so they can update their behavior.
     *
     * @param options - The new kriging options to set
     */
    set krigingOptions(options: GroundModificationOptions);
    /**
     * Adds a new ground modification polygon
     *
     * This method creates a new ground modification with the specified
     * parameters and adds it to the manager. It performs validation
     * on the input parameters and updates the spatial index.
     *
     * @param type - Type of modification ("excavation" or "elevation")
     * @param boundary - GeoBox, GeoPolygon, or GeoLineString defining the boundary
     * @param slopeWidth - Optional width of the slope for the modification
     * @param depthOrHeight - Positive number representing depth/height in meters
     * @returns The created ground modification
     * @throws Error if input is invalid
     */
    addModification(type: GroundModificationType, boundary: GeoBox | GeoPolygon | GeoLineString, slopeWidth?: number, depthOrHeight?: number): GroundModification;
    /**
     * Removes a modification by ID
     *
     * This method removes a ground modification from the manager by its ID.
     * It updates the spatial index and dispatches a change event.
     *
     * @param id - ID of the modification to remove
     * @returns true if found and removed, false otherwise
     */
    removeModification(id: string): boolean;
    /**
     * Updates an existing modification
     *
     * This method updates the properties of an existing ground modification.
     * It performs validation on the new values and updates the spatial index
     * if necessary. A change event is dispatched with information about
     * what was updated.
     *
     * @param id - ID of the modification to update
     * @param changes - Partial object with properties to update
     * @returns true if found and updated, false otherwise
     * @throws Error if input is invalid
     */
    updateModification(id: string, changes: Partial<Omit<GroundModificationPolygon, "id" | "boundingBox">>): boolean;
    /**
     * Clears all modifications
     *
     * This method removes all ground modifications from the manager,
     * resets the spatial index, and dispatches a clear event.
     */
    clear(): void;
    /**
     * Gets a modification by ID
     *
     * This method retrieves a ground modification by its unique identifier.
     *
     * @param id - ID of the modification to retrieve
     * @returns The modification or undefined if not found
     */
    getModification(id: string): GroundModificationPolygon | undefined;
    /**
     * Gets all modifications
     *
     * This method returns an array containing all ground modifications
     * currently managed by this manager.
     *
     * @returns Array of all modifications
     */
    getAllModifications(): GroundModificationPolygon[];
    /**
     * Gets the global bounding box containing all modifications
     *
     * This method returns the overall spatial extent of all ground
     * modifications managed by this manager.
     *
     * @returns Clone of the global bounding box or null if empty
     */
    getGlobalBoundingBox(): GeoBox | null;
    /**
     * Finds modifications that intersect with the given bounding box
     *
     * This method performs a spatial query to find all ground modifications
     * whose bounding boxes intersect with the specified bounding box.
     *
     * @param bbox - The bounding box to test against
     * @returns Array of intersecting modifications
     */
    findModificationsInBoundingBox(bbox: GeoBox): GroundModificationPolygon[];
    /**
     * Finds modifications that contain the given point
     *
     * This method performs a spatial query to find all ground modifications
     * that contain the specified geographic point. It first filters by
     * bounding box for quick rejection, then performs exact polygon
     * containment tests for the remaining candidates.
     *
     * @param point - The point to test
     * @returns Array of modifications containing the point
     */
    findModificationsContainingPoint(point: GeoCoordinates): GroundModificationPolygon[];
    /**
     * Dispatches a unified change event immediately
     *
     * This method dispatches a change event with detailed information
     * about what changed and where. It calculates the affected bounds
     * and includes all relevant modification data.
     *
     * @param changeType - Type of change that occurred
     * @param affectedModifications - Array of modifications affected by the change
     * @param previousBounds - Previous bounding box before the change (for updates)
     * @private
     */
    private dispatchChangeEventImmediate;
    /**
     * Dispatches a unified change event with debouncing to batch multiple changes
     *
     * This method uses debouncing to batch multiple change events together,
     * reducing the number of events dispatched when many modifications are
     * changed in quick succession.
     *
     * @param changeType - Type of change that occurred
     * @param affectedModifications - Array of modifications affected by the change
     * @param previousBounds - Previous bounding box before the change (for updates)
     * @private
     */
    private dispatchChangeEvent;
    /**
     * Calculates the bounding box for a geo area
     *
     * This method computes the minimum bounding box that contains the
     * specified geographic area, whether it's a GeoBox, GeoPolygon,
     * or GeoLineString.
     *
     * @param geoArea - The geographic area to calculate bounds for
     * @returns The bounding box enclosing the geo area
     * @private
     */
    private calculateBoundingBox;
    /**
     * Updates the global bounding box to include a new modification
     *
     * This method expands the global bounding box to ensure it contains
     * the specified new bounding box. If no global bounding box exists
     * yet, it creates one.
     *
     * @param newBox - The new bounding box to include
     * @private
     */
    private updateGlobalBoundingBox;
    /**
     * Recalculates the global bounding box from all modifications
     *
     * This method recomputes the global bounding box by iterating
     * through all modifications and expanding the box to include
     * each one's bounding box.
     *
     * @private
     */
    private recalculateGlobalBoundingBox;
    /**
     * Tests if a point is inside a geo area
     *
     * This method determines whether a geographic point is contained
     * within the specified geographic area. The implementation varies
     * based on the type of geo area.
     *
     * @param point - The point to test
     * @param geoArea - The geographic area to test against
     * @returns true if the point is inside the geo area, false otherwise
     * @private
     */
    private pointInGeoArea;
}
