import { type TileAvailability, type TileKey } from "@flywave/flywave-geoutils";
/**
 * Terrain rendering exclusion zone manager
 *
 * This class manages exclusion zones for terrain rendering, allowing certain geographic
 * areas to be excluded from terrain visualization. It uses UUIDs to uniquely identify
 * exclusion regions and provides ID-based add/remove operations.
 *
 * Exclusion zones are defined using TileAvailability objects which specify which
 * tiles should be excluded from rendering based on their tile keys.
 */
export declare class ExclusionManager {
    /** Map storing all registered exclusion zones with their IDs as keys */
    private readonly exclusionZones;
    /**
     * Adds a new exclusion zone to the manager
     *
     * This method creates a new exclusion zone with a unique UUID identifier
     * and registers it in the internal map of exclusion zones.
     *
     * @param tileAvailability - Tile availability information defining the excluded area
     * @returns A unique UUID identifier for the newly created exclusion zone
     */
    addExclusionZone(tileAvailability: TileAvailability): string;
    /**
     * Removes an exclusion zone by its ID
     *
     * This method removes an exclusion zone from the manager using its UUID identifier.
     *
     * @param id - The UUID of the exclusion zone to remove
     * @returns True if the exclusion zone was successfully removed, false if not found
     */
    removeExclusionZone(id: string): boolean;
    /**
     * Checks if an exclusion zone with the specified ID exists
     *
     * This method checks whether an exclusion zone with the given UUID identifier
     * is currently registered in the manager.
     *
     * @param id - The UUID of the exclusion zone to check
     * @returns True if an exclusion zone with the specified ID exists, false otherwise
     */
    hasExclusionZone(id: string): boolean;
    /**
     * Clears all registered exclusion zones
     *
     * This method removes all exclusion zones from the manager, effectively
     * disabling all terrain rendering exclusions.
     */
    clearAllExclusionZones(): void;
    /**
     * Determines if a tile should be excluded from rendering
     *
     * This method checks if the specified tile key falls within any of the
     * registered exclusion zones. If any exclusion zone contains the tile,
     * it should be excluded from rendering.
     *
     * @param tileKey - The tile key to check for exclusion
     * @returns True if the tile should be excluded from rendering, false otherwise
     */
    shouldExclude(tileKey: TileKey): boolean;
}
