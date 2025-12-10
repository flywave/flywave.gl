/* Copyright (C) 2025 flywave.gl contributors */

import { binarySearch, defined } from "@flywave/flywave-utils";

import { GeoBox } from "../coordinates/GeoBox";
import { GeoCoordinates } from "../coordinates/GeoCoordinates";
import { TileKey } from "../tiling/TileKey";
import { type TilingScheme } from "../tiling/TilingScheme";

/**
 * Interface defining a geographic rectangle with associated level information
 * Used for tracking tile availability ranges and coverage areas
 */
interface RectangleWithLevel {
    /** Zoom level associated with this rectangle */
    level: number;

    /** Western longitude boundary in radians */
    west: number;

    /** Southern latitude boundary in radians */
    south: number;

    /** Eastern longitude boundary in radians */
    east: number;

    /** Northern latitude boundary in radians */
    north: number;
}

/**
 * Quadtree node for efficient spatial indexing of tile availability information
 *
 * This class implements a quadtree structure where each node represents a tile
 * and contains information about available sub-tiles. The quadtree enables
 * efficient spatial queries for tile availability and coverage analysis.
 */
class QuadtreeNode {
    /** Tiling scheme used for coordinate calculations */
    public readonly tilingScheme: TilingScheme;

    /** Parent node in the quadtree hierarchy */
    public readonly parent: QuadtreeNode | undefined;

    /** Zoom level of this node */
    public readonly level: number;

    /** X coordinate of this tile */
    public readonly x: number;

    /** Y coordinate of this tile */
    public readonly y: number;

    /** Geographic extent of this tile */
    public readonly extent: GeoBox;

    /** Available rectangles within this node's extent */
    public readonly rectangles: RectangleWithLevel[] = [];

    /** Southwest child node */
    _sw: QuadtreeNode | undefined;

    /** Southeast child node */
    _se: QuadtreeNode | undefined;

    /** Northwest child node */
    _nw: QuadtreeNode | undefined;

    /** Northeast child node */
    _ne: QuadtreeNode | undefined;

    /**
     * Creates a new QuadtreeNode instance
     *
     * @param tilingScheme - The tiling scheme for coordinate calculations
     * @param parent - The parent node in the quadtree hierarchy
     * @param level - The zoom level of this node
     * @param x - The X coordinate of this tile
     * @param y - The Y coordinate of this tile
     */
    constructor(
        tilingScheme: TilingScheme,
        parent: QuadtreeNode | undefined,
        level: number,
        x: number,
        y: number
    ) {
        this.tilingScheme = tilingScheme;
        this.parent = parent;
        this.level = level;
        this.x = x;
        this.y = y;

        // Calculate geographic extent using tiling scheme
        this.extent = tilingScheme.getGeoBox(new TileKey(y, x, level));
    }

    /**
     * Gets the northwest child node, creating it if necessary
     *
     * @returns The northwest child node
     */
    public get nw(): QuadtreeNode {
        if (!this._nw) {
            this._nw = new QuadtreeNode(
                this.tilingScheme,
                this,
                this.level + 1,
                this.x * 2,
                this.y * 2
            );
        }
        return this._nw;
    }

    /**
     * Gets the northeast child node, creating it if necessary
     *
     * @returns The northeast child node
     */
    public get ne(): QuadtreeNode {
        if (!this._ne) {
            this._ne = new QuadtreeNode(
                this.tilingScheme,
                this,
                this.level + 1,
                this.x * 2 + 1,
                this.y * 2
            );
        }
        return this._ne;
    }

    /**
     * Gets the southwest child node, creating it if necessary
     *
     * @returns The southwest child node
     */
    public get sw(): QuadtreeNode {
        if (!this._sw) {
            this._sw = new QuadtreeNode(
                this.tilingScheme,
                this,
                this.level + 1,
                this.x * 2,
                this.y * 2 + 1
            );
        }
        return this._sw;
    }

    /**
     * Gets the southeast child node, creating it if necessary
     *
     * @returns The southeast child node
     */
    public get se(): QuadtreeNode {
        if (!this._se) {
            this._se = new QuadtreeNode(
                this.tilingScheme,
                this,
                this.level + 1,
                this.x * 2 + 1,
                this.y * 2 + 1
            );
        }
        return this._se;
    }
}

/**
 * Reports the availability of tiles in a {@link TilingScheme}
 *
 * This class provides efficient querying of tile availability information
 * using a quadtree-based spatial index. It supports operations such as:
 * - Checking individual tile availability
 * - Finding maximum available levels at positions
 * - Computing coverage over geographic areas
 * - Managing hierarchical tile availability information
 *
 * The implementation uses a quadtree structure for efficient spatial queries
 * and maintains sorted lists of available rectangles for fast level lookups.
 */
export class TileAvailability {
    /** Tiling scheme used for coordinate calculations */
    private readonly _tilingScheme: TilingScheme;

    /** Maximum tile level that is potentially available */
    private readonly _maximumLevel: number;

    /** Minimum tile level that is potentially available */
    private readonly _minimumLevel: number;

    /** Root nodes of the quadtree spatial index */
    private readonly _rootNodes: QuadtreeNode[] = [];

    /**
     * Gets the maximum tile level that is potentially available
     */
    public get maximumLevel(): number {
        return this._maximumLevel;
    }

    /**
     * Gets the minimum tile level that is potentially available
     */
    public get minimumLevel(): number {
        return this._minimumLevel;
    }

    /**
     * Creates a new TileAvailability instance
     *
     * @param tilingScheme - The tiling scheme in which to report availability
     * @param minimumLevel - The minimum tile level that is potentially available
     * @param maximumLevel - The maximum tile level that is potentially available
     */
    constructor(tilingScheme: TilingScheme, minimumLevel: number, maximumLevel: number) {
        this._tilingScheme = tilingScheme;
        this._maximumLevel = maximumLevel;
        this._minimumLevel = minimumLevel;
    }

    /**
     * Creates root nodes from tile ranges data
     *
     * @param level - The level for the root nodes
     * @param ranges - Array of tile ranges in the format {startX, startY, endX, endY}
     * @returns Array of created root nodes
     * @private
     */
    private _createRootNodesFromRanges(
        level: number,
        ranges: Array<{ startX: number; startY: number; endX: number; endY: number }>
    ): QuadtreeNode[] {
        const rootNodes: QuadtreeNode[] = [];
        const uniqueKeys = new Set<string>();

        for (const range of ranges) {
            for (let y = range.startY; y <= range.endY; ++y) {
                for (let x = range.startX; x <= range.endX; ++x) {
                    // Use a key to ensure uniqueness
                    const key = `${level}:${x}:${y}`;
                    if (!uniqueKeys.has(key)) {
                        uniqueKeys.add(key);
                        rootNodes.push(
                            new QuadtreeNode(this._tilingScheme, undefined, level, x, y)
                        );
                    }
                }
            }
        }

        return rootNodes;
    }

    /**
     * Creates a TileAvailability instance from initial tile range data
     *
     * @param tilingScheme - The tiling scheme in which to report availability
     * @param minimumLevel - The minimum tile level that is potentially available
     * @param maximumLevel - The maximum tile level that is potentially available
     * @param initialRanges - Array of initial tile ranges in the format {startX, startY, endX, endY}
     * @returns New TileAvailability instance initialized with the given ranges
     */
    public static createInitialRanges(
        tilingScheme: TilingScheme,
        minimumLevel: number,
        maximumLevel: number,
        initialRanges: Array<{ startX: number; startY: number; endX: number; endY: number }>
    ): TileAvailability {
        const instance = new TileAvailability(tilingScheme, minimumLevel, maximumLevel);

        // Create and set root nodes
        instance._rootNodes.push(
            ...instance._createRootNodesFromRanges(minimumLevel, initialRanges)
        );

        return instance;
    }

    /**
     * Finds a node with specific coordinates in a list of nodes
     *
     * @param level - The level to search for
     * @param x - The X coordinate to search for
     * @param y - The Y coordinate to search for
     * @param nodes - The list of nodes to search
     * @returns True if node is found, false otherwise
     * @private
     */
    private static findNode(level: number, x: number, y: number, nodes: QuadtreeNode[]): boolean {
        const count = nodes.length;
        for (let i = 0; i < count; ++i) {
            const node = nodes[i];
            if (node.x === x && node.y === y && node.level === level) {
                return true;
            }
        }
        return false;
    }

    /**
     * Marks a rectangular range of tiles in a particular level as being available
     *
     * For best performance, add your ranges in order of increasing level.
     * This method updates the quadtree spatial index with the new availability information.
     *
     * @param level - The level of the available tiles
     * @param startX - The X coordinate of the first available tiles at the level
     * @param startY - The Y coordinate of the first available tiles at the level
     * @param endX - The X coordinate of the last available tiles at the level
     * @param endY - The Y coordinate of the last available tiles at the level
     */
    public addAvailableTileRange(
        level: number,
        startX: number,
        startY: number,
        endX: number,
        endY: number
    ): void {
        const tilingScheme = this._tilingScheme;
        const rootNodes = this._rootNodes;

        // Handle level 0 tiles specially
        // if (level === 0) {
        //     for (let y = startY; y <= endY; ++y) {
        //         for (let x = startX; x <= endX; ++x) {
        //             if (!TileAvailability.findNode(level, x, y, rootNodes)) {
        //                 rootNodes.push(new QuadtreeNode(tilingScheme, undefined, 0, x, y));
        //             }
        //         }
        //     }
        //     return;
        // }

        // Calculate geographic bounds for the tile range

        const rectangleScratch = tilingScheme.getGeoBox(new TileKey(startY, startX, level));
        const rectangleScratch1 = tilingScheme.getGeoBox(new TileKey(endY, endX, level));

        rectangleScratch.growToContain(rectangleScratch1.southWest);
        rectangleScratch.growToContain(rectangleScratch1.northEast);

        const west = rectangleScratch.west;
        const north = rectangleScratch.north;

        // Create rectangle with level information
        const rectangleWithLevel: RectangleWithLevel = {
            level,
            west,
            south: rectangleScratch.south,
            east: rectangleScratch.east,
            north
        };

        // Add rectangle to appropriate root nodes
        for (let i = 0; i < rootNodes.length; ++i) {
            const rootNode = rootNodes[i];
            if (this.rectanglesOverlap(rootNode.extent, rectangleWithLevel)) {
                this.putRectangleInQuadtree(this._maximumLevel, rootNode, rectangleWithLevel);
            }
        }
    }

    /**
     * Determines the level of the most detailed tile covering the position
     *
     * This function usually completes in time logarithmic to the number of rectangles added.
     * It traverses the quadtree to find the deepest available tile covering the position.
     *
     * @param position - The position for which to determine the maximum available level
     * @returns The level of the most detailed tile covering the position, or -1 if position is outside any tile
     */
    public computeMaximumLevelAtPosition(position: GeoCoordinates): number {
        // Find the root node that contains this position
        let node: QuadtreeNode | undefined;
        for (let nodeIndex = 0; nodeIndex < this._rootNodes.length; ++nodeIndex) {
            const rootNode = this._rootNodes[nodeIndex];
            if (this.rectangleContainsPosition(rootNode.extent, position)) {
                node = rootNode;
                break;
            }
        }

        if (!defined(node)) {
            return -1;
        }

        return this.findMaxLevelFromNode(undefined, node, position);
    }

    /**
     * Finds the most detailed level that is available everywhere within a given rectangle
     *
     * More detailed tiles may be available in parts of the rectangle, but not the whole thing.
     * This method computes coverage by subtracting available areas from the target rectangle.
     *
     * @param rectangle - The rectangle to check coverage for
     * @returns The best available level for the entire rectangle
     */
    public computeBestAvailableLevelOverRectangle(rectangle: RectangleWithLevel): number {
        const rectangles: RectangleWithLevel[] = [];

        // Handle rectangles that cross the antimeridian
        if (rectangle.east < rectangle.west) {
            rectangles.push({
                level: rectangle.level,
                west: -Math.PI,
                east: rectangle.east,
                south: rectangle.south,
                north: rectangle.north
            });
            rectangles.push({
                level: rectangle.level,
                west: rectangle.west,
                east: Math.PI,
                south: rectangle.south,
                north: rectangle.north
            });
        } else {
            rectangles.push(rectangle);
        }

        // Track remaining areas to cover by level
        const remainingToCoverByLevel: RectangleWithLevel[][] = [];

        // Update coverage information with all root nodes
        for (let i = 0; i < this._rootNodes.length; ++i) {
            this.updateCoverageWithNode(remainingToCoverByLevel, this._rootNodes[i], rectangles);
        }

        // Find the highest level with complete coverage
        for (let i = remainingToCoverByLevel.length - 1; i >= 0; --i) {
            if (defined(remainingToCoverByLevel[i]) && remainingToCoverByLevel[i].length === 0) {
                return i;
            }
        }

        return 0;
    }

    /**
     * Determines if a particular tile is available
     *
     * This method checks availability by computing the maximum available level
     * at the tile's center position and comparing it to the requested level.
     *
     * @param level - The tile level to check
     * @param x - The X coordinate of the tile to check
     * @param y - The Y coordinate of the tile to check
     * @returns True if the tile is available; otherwise, false
     */
    public isTileAvailable(level: number, x: number, y: number): boolean {
        // Get the center of the tile and find the maximum level at that position
        const rectangle = this._tilingScheme.getGeoBox(new TileKey(y, x, level));
        const position = rectangle.center;
        return this.computeMaximumLevelAtPosition(position) >= level;
    }

    public isExistTile(level: number, x: number, y: number): boolean {
        if (level > this.maximumLevel || level < this.minimumLevel) return false;
        return this.isTileAvailable(level, x, y);
    }

    /**
     * Computes a bit mask indicating which of a tile's four children exist
     *
     * The bit mask uses the following convention:
     * - Bit 0 (1): Southwest child (2x, 2y+1)
     * - Bit 1 (2): Southeast child (2x+1, 2y+1)
     * - Bit 2 (4): Northwest child (2x, 2y)
     * - Bit 3 (8): Northeast child (2x+1, 2y)
     *
     * @param level - The level of the parent tile
     * @param x - The X coordinate of the parent tile
     * @param y - The Y coordinate of the parent tile
     * @returns The bit mask indicating child availability
     */
    public computeChildMaskForTile(level: number, x: number, y: number): number {
        const childLevel = level + 1;
        if (childLevel >= this._maximumLevel) {
            return 0;
        }

        let mask = 0;

        // Check each child tile for availability
        mask |= this.isTileAvailable(childLevel, 2 * x, 2 * y + 1) ? 1 : 0; // Southwest
        mask |= this.isTileAvailable(childLevel, 2 * x + 1, 2 * y + 1) ? 2 : 0; // Southeast
        mask |= this.isTileAvailable(childLevel, 2 * x, 2 * y) ? 4 : 0; // Northwest
        mask |= this.isTileAvailable(childLevel, 2 * x + 1, 2 * y) ? 8 : 0; // Northeast

        return mask;
    }

    /**
     * Checks if two rectangles overlap
     *
     * @param rectangle1 - First rectangle to check
     * @param rectangle2 - Second rectangle to check
     * @returns True if rectangles overlap, false otherwise
     * @private
     */
    private rectanglesOverlap(
        rectangle1: RectangleWithLevel | GeoBox,
        rectangle2: RectangleWithLevel | GeoBox
    ): boolean {
        const west = Math.max(rectangle1.west, rectangle2.west);
        const south = Math.max(rectangle1.south, rectangle2.south);
        const east = Math.min(rectangle1.east, rectangle2.east);
        const north = Math.min(rectangle1.north, rectangle2.north);
        return south < north && west < east;
    }

    /**
     * Inserts a rectangle into the quadtree at the appropriate depth
     *
     * This method traverses the quadtree to find the deepest node that fully
     * contains the rectangle, then inserts the rectangle while maintaining
     * level-based sorting within the node.
     *
     * @param maxDepth - Maximum depth to traverse
     * @param node - Starting node for insertion
     * @param rectangle - Rectangle to insert
     * @private
     */
    private putRectangleInQuadtree(
        maxDepth: number,
        node: QuadtreeNode,
        rectangle: RectangleWithLevel
    ): void {
        // Traverse down the quadtree to find the best insertion point
        while (node.level < maxDepth) {
            if (this.rectangleFullyContainsRectangle(node.nw.extent, rectangle)) {
                node = node.nw;
            } else if (this.rectangleFullyContainsRectangle(node.ne.extent, rectangle)) {
                node = node.ne;
            } else if (this.rectangleFullyContainsRectangle(node.sw.extent, rectangle)) {
                node = node.sw;
            } else if (this.rectangleFullyContainsRectangle(node.se.extent, rectangle)) {
                node = node.se;
            } else {
                break;
            }
        }

        // Insert rectangle while maintaining level-based sorting
        if (
            node.rectangles.length === 0 ||
            node.rectangles[node.rectangles.length - 1].level <= rectangle.level
        ) {
            node.rectangles.push(rectangle);
        } else {
            // Maintain ordering by level when inserting
            const index = binarySearch(
                node.rectangles,
                rectangle.level,
                this.rectangleLevelComparator
            );
            if (index < 0) {
                node.rectangles.splice(~index, 0, rectangle);
            } else {
                node.rectangles.splice(index, 0, rectangle);
            }
        }
    }

    /**
     * Compares rectangle levels for sorting
     *
     * @param a - First rectangle to compare
     * @param b - Level value to compare against
     * @returns Comparison result for sorting
     * @private
     */
    private rectangleLevelComparator(a: RectangleWithLevel, b: number): number {
        return a.level - b;
    }

    /**
     * Checks if one rectangle fully contains another
     *
     * @param potentialContainer - Rectangle that might contain the other
     * @param rectangleToTest - Rectangle to test for containment
     * @returns True if container fully contains the test rectangle
     * @private
     */
    private rectangleFullyContainsRectangle(
        potentialContainer: GeoBox,
        rectangleToTest: RectangleWithLevel
    ): boolean {
        return (
            rectangleToTest.west >= potentialContainer.west &&
            rectangleToTest.east <= potentialContainer.east &&
            rectangleToTest.south >= potentialContainer.south &&
            rectangleToTest.north <= potentialContainer.north
        );
    }

    /**
     * Checks if a rectangle contains a geographic position
     *
     * @param potentialContainer - Rectangle to check
     * @param positionToTest - Position to test for containment
     * @returns True if rectangle contains the position
     * @private
     */
    private rectangleContainsPosition(
        potentialContainer: RectangleWithLevel | GeoBox,
        positionToTest: GeoCoordinates
    ): boolean {
        return (
            positionToTest.longitude >= potentialContainer.west &&
            positionToTest.longitude <= potentialContainer.east &&
            positionToTest.latitude >= potentialContainer.south &&
            positionToTest.latitude <= potentialContainer.north
        );
    }

    /**
     * Finds the maximum available level from a quadtree node for a given position
     *
     * This method traverses the quadtree to find the deepest available tile
     * covering the specified position, handling boundary cases where a position
     * might be on the edge of multiple tiles.
     *
     * @param stopNode - Node at which to stop traversal
     * @param node - Starting node for search
     * @param position - Position to find maximum level for
     * @returns Maximum available level at the position
     * @private
     */
    private findMaxLevelFromNode(
        stopNode: QuadtreeNode | undefined,
        node: QuadtreeNode,
        position: GeoCoordinates
    ): number {
        let maxLevel = 0;

        // Find the deepest quadtree node containing this point
        let found = false;
        while (!found) {
            // Check which child nodes contain the position
            const nw = node._nw && this.rectangleContainsPosition(node._nw.extent, position);
            const ne = node._ne && this.rectangleContainsPosition(node._ne.extent, position);
            const sw = node._sw && this.rectangleContainsPosition(node._sw.extent, position);
            const se = node._se && this.rectangleContainsPosition(node._se.extent, position);

            // Handle boundary cases where position is in multiple tiles
            const childCount = (nw ? 1 : 0) + (ne ? 1 : 0) + (sw ? 1 : 0) + (se ? 1 : 0);
            if (childCount > 1) {
                // Position is on a boundary - check all applicable child nodes
                if (nw) {
                    maxLevel = Math.max(
                        maxLevel,
                        this.findMaxLevelFromNode(node, node._nw, position)
                    );
                }
                if (ne) {
                    maxLevel = Math.max(
                        maxLevel,
                        this.findMaxLevelFromNode(node, node._ne, position)
                    );
                }
                if (sw) {
                    maxLevel = Math.max(
                        maxLevel,
                        this.findMaxLevelFromNode(node, node._sw, position)
                    );
                }
                if (se) {
                    maxLevel = Math.max(
                        maxLevel,
                        this.findMaxLevelFromNode(node, node._se, position)
                    );
                }
                break;
            } else if (nw) {
                node = node._nw;
            } else if (ne) {
                node = node._ne;
            } else if (sw) {
                node = node._sw;
            } else if (se) {
                node = node._se;
            } else {
                found = true;
            }
        }

        // Work up the tree until we find a rectangle that contains this point
        while (node !== stopNode) {
            const rectangles = node.rectangles;

            // Rectangles are sorted by level, lowest first
            for (let i = rectangles.length - 1; i >= 0 && rectangles[i].level > maxLevel; --i) {
                const rectangle = rectangles[i];
                if (this.rectangleContainsPosition(rectangle, position)) {
                    maxLevel = rectangle.level;
                }
            }

            node = node.parent!;
        }

        return maxLevel;
    }

    /**
     * Updates coverage information with a quadtree node
     *
     * This method recursively traverses the quadtree, subtracting available
     * rectangles from the remaining coverage areas to compute overall coverage.
     *
     * @param remainingToCoverByLevel - Coverage tracking array
     * @param node - Quadtree node to process
     * @param rectanglesToCover - Rectangles that need coverage
     * @private
     */
    private updateCoverageWithNode(
        remainingToCoverByLevel: RectangleWithLevel[][],
        node: QuadtreeNode | undefined,
        rectanglesToCover: RectangleWithLevel[]
    ): void {
        if (!node) {
            return;
        }

        // Check if node overlaps with any rectangles to cover
        let anyOverlap = false;
        for (let i = 0; i < rectanglesToCover.length; ++i) {
            anyOverlap = anyOverlap || this.rectanglesOverlap(node.extent, rectanglesToCover[i]);
        }

        if (!anyOverlap) {
            // This node is not applicable to the rectangle(s)
            return;
        }

        // Process rectangles in this node
        const rectangles = node.rectangles;
        for (let i = 0; i < rectangles.length; ++i) {
            const rectangle = rectangles[i];

            if (!remainingToCoverByLevel[rectangle.level]) {
                remainingToCoverByLevel[rectangle.level] = rectanglesToCover;
            }

            remainingToCoverByLevel[rectangle.level] = this.subtractRectangle(
                remainingToCoverByLevel[rectangle.level],
                rectangle
            );
        }

        // Update with child nodes
        this.updateCoverageWithNode(remainingToCoverByLevel, node._nw, rectanglesToCover);
        this.updateCoverageWithNode(remainingToCoverByLevel, node._ne, rectanglesToCover);
        this.updateCoverageWithNode(remainingToCoverByLevel, node._sw, rectanglesToCover);
        this.updateCoverageWithNode(remainingToCoverByLevel, node._se, rectanglesToCover);
    }

    /**
     * Subtracts one rectangle from a list of rectangles
     *
     * This method performs rectangle subtraction, handling cases where
     * the subtracted rectangle partially overlaps with rectangles in the list.
     *
     * @param rectangleList - List of rectangles to subtract from
     * @param rectangleToSubtract - Rectangle to subtract
     * @returns Updated list of rectangles after subtraction
     * @private
     */
    private subtractRectangle(
        rectangleList: RectangleWithLevel[],
        rectangleToSubtract: RectangleWithLevel
    ): RectangleWithLevel[] {
        const result: RectangleWithLevel[] = [];

        // Convert RectangleWithLevel to GeoBox for comparison
        const subtractGeoBox = new GeoBox(
            new GeoCoordinates(rectangleToSubtract.south, rectangleToSubtract.west),
            new GeoCoordinates(rectangleToSubtract.north, rectangleToSubtract.east)
        );

        for (let i = 0; i < rectangleList.length; ++i) {
            const rectangle = rectangleList[i];

            // Convert to GeoBox for overlap checking
            const currentGeoBox = new GeoBox(
                new GeoCoordinates(rectangle.south, rectangle.west),
                new GeoCoordinates(rectangle.north, rectangle.east)
            );

            if (!this.rectanglesOverlap(currentGeoBox, subtractGeoBox)) {
                // No overlap - keep original rectangle
                result.push(rectangle);
            } else {
                // Overlap exists - create new rectangles for uncovered areas
                if (rectangle.west < rectangleToSubtract.west) {
                    result.push({
                        ...rectangle,
                        east: rectangleToSubtract.west
                    });
                }
                if (rectangle.east > rectangleToSubtract.east) {
                    result.push({
                        ...rectangle,
                        west: rectangleToSubtract.east
                    });
                }
                if (rectangle.south < rectangleToSubtract.south) {
                    result.push({
                        ...rectangle,
                        north: rectangleToSubtract.south
                    });
                }
                if (rectangle.north > rectangleToSubtract.north) {
                    result.push({
                        ...rectangle,
                        south: rectangleToSubtract.north
                    });
                }
            }
        }
        return result;
    }
}

export default TileAvailability;
