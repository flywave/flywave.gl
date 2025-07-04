import { GeoBox, GeoCoordinates, TileKey, TilingScheme } from "@flywave/flywave-geoutils";
import { binarySearch, defined } from "@flywave/flywave-utils";

interface RectangleWithLevel {
    level: number;
    west: number;
    south: number;
    east: number;
    north: number;
}

class QuadtreeNode {
    tilingScheme: TilingScheme;
    parent: QuadtreeNode | undefined;
    level: number;
    x: number;
    y: number;
    extent: GeoBox;
    rectangles: RectangleWithLevel[] = [];
    _sw: QuadtreeNode | undefined;
    _se: QuadtreeNode | undefined;
    _nw: QuadtreeNode | undefined;
    _ne: QuadtreeNode | undefined;

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
        this.extent = tilingScheme.getGeoBox(new TileKey((1 << level) - 1 - y, x, level));
    }

    get nw(): QuadtreeNode {
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

    get ne(): QuadtreeNode {
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

    get sw(): QuadtreeNode {
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

    get se(): QuadtreeNode {
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
 * Reports the availability of tiles in a {@link TilingScheme}.
 */
class TileAvailability {
    private readonly _tilingScheme: TilingScheme;
    private readonly _maximumLevel: number;
    private readonly _minimumLevel: number;
    private readonly _rootNodes: QuadtreeNode[] = [];

    // 添加公共访问器
    get maximumLevel(): number {
        return this._maximumLevel;
    }

    get minimumLevel(): number {
        return this._minimumLevel;
    }

    /**
     * @param tilingScheme The tiling scheme in which to report availability.
     * @param minimumLevel The minimum tile level that is potentially available.
     * @param maximumLevel The maximum tile level that is potentially available.
     */
    constructor(tilingScheme: TilingScheme, minimumLevel: number, maximumLevel: number) {
        this._tilingScheme = tilingScheme;
        this._maximumLevel = maximumLevel;
        this._minimumLevel = minimumLevel;
    }

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
     * Marks a rectangular range of tiles in a particular level as being available.
     * For best performance, add your ranges in order of increasing level.
     *
     * @param level The level.
     * @param startX The X coordinate of the first available tiles at the level.
     * @param startY The Y coordinate of the first available tiles at the level.
     * @param endX The X coordinate of the last available tiles at the level.
     * @param endY The Y coordinate of the last available tiles at the level.
     */
    addAvailableTileRange(
        level: number,
        startX: number,
        startY: number,
        endX: number,
        endY: number
    ): void {
        const tilingScheme = this._tilingScheme;
        const rootNodes = this._rootNodes;

        if (level === 0) {
            for (let y = startY; y <= endY; ++y) {
                for (let x = startX; x <= endX; ++x) {
                    if (!TileAvailability.findNode(level, x, y, rootNodes)) {
                        rootNodes.push(new QuadtreeNode(tilingScheme, undefined, 0, x, y));
                    }
                }
            }
        }

        let rectangleScratch = tilingScheme.getGeoBox(
            new TileKey((1 << level) - 1 - startY, startX, level)
        );
        const west = rectangleScratch.west;
        const north = rectangleScratch.north;

        rectangleScratch = tilingScheme.getGeoBox(
            new TileKey((1 << level) - 1 - endY, endX, level)
        );
        const east = rectangleScratch.east;
        const south = rectangleScratch.south;

        const rectangleWithLevel: RectangleWithLevel = {
            level,
            west,
            south,
            east,
            north
        };

        for (let i = 0; i < rootNodes.length; ++i) {
            const rootNode = rootNodes[i];
            if (this.rectanglesOverlap(rootNode.extent, rectangleWithLevel)) {
                this.putRectangleInQuadtree(this._maximumLevel, rootNode, rectangleWithLevel);
            }
        }
    }

    /**
     * Determines the level of the most detailed tile covering the position.
     * This function usually completes in time logarithmic to the number of rectangles added.
     *
     * @param position The position for which to determine the maximum available level.
     * @return The level of the most detailed tile covering the position, or -1 if position is outside any tile.
     */
    computeMaximumLevelAtPosition(position: GeoCoordinates): number {
        // Find the root node that contains this position.
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
     * Finds the most detailed level that is available _everywhere_ within a given rectangle.
     * More detailed tiles may be available in parts of the rectangle, but not the whole thing.
     *
     * @param rectangle The rectangle.
     * @return The best available level for the entire rectangle.
     */
    computeBestAvailableLevelOverRectangle(rectangle: RectangleWithLevel): number {
        const rectangles: RectangleWithLevel[] = [];

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

        const remainingToCoverByLevel: RectangleWithLevel[][] = [];

        for (let i = 0; i < this._rootNodes.length; ++i) {
            this.updateCoverageWithNode(remainingToCoverByLevel, this._rootNodes[i], rectangles);
        }

        for (let i = remainingToCoverByLevel.length - 1; i >= 0; --i) {
            if (defined(remainingToCoverByLevel[i]) && remainingToCoverByLevel[i].length === 0) {
                return i;
            }
        }

        return 0;
    }

    /**
     * Determines if a particular tile is available.
     * @param level The tile level to check.
     * @param x The X coordinate of the tile to check.
     * @param y The Y coordinate of the tile to check.
     * @return True if the tile is available; otherwise, false.
     */
    isTileAvailable(level: number, x: number, y: number): boolean {
        // Get the center of the tile and find the maximum level at that position.
        const rectangle = this._tilingScheme.getGeoBox(new TileKey(y, x, level));
        const position = rectangle.center;
        return this.computeMaximumLevelAtPosition(position) >= level;
    }

    /**
     * Computes a bit mask indicating which of a tile's four children exist.
     * @param level The level of the parent tile.
     * @param x The X coordinate of the parent tile.
     * @param y The Y coordinate of the parent tile.
     * @return The bit mask indicating child availability.
     */
    computeChildMaskForTile(level: number, x: number, y: number): number {
        const childLevel = level + 1;
        if (childLevel >= this._maximumLevel) {
            return 0;
        }

        let mask = 0;

        mask |= this.isTileAvailable(childLevel, 2 * x, 2 * y + 1) ? 1 : 0;
        mask |= this.isTileAvailable(childLevel, 2 * x + 1, 2 * y + 1) ? 2 : 0;
        mask |= this.isTileAvailable(childLevel, 2 * x, 2 * y) ? 4 : 0;
        mask |= this.isTileAvailable(childLevel, 2 * x + 1, 2 * y) ? 8 : 0;

        return mask;
    }

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

    private putRectangleInQuadtree(
        maxDepth: number,
        node: QuadtreeNode,
        rectangle: RectangleWithLevel
    ): void {
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

        if (
            node.rectangles.length === 0 ||
            node.rectangles[node.rectangles.length - 1].level <= rectangle.level
        ) {
            node.rectangles.push(rectangle);
        } else {
            // Maintain ordering by level when inserting.
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

    private rectangleLevelComparator(a: RectangleWithLevel, b: number): number {
        return a.level - b;
    }

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

    private findMaxLevelFromNode(
        stopNode: QuadtreeNode | undefined,
        node: QuadtreeNode,
        position: GeoCoordinates
    ): number {
        let maxLevel = 0;

        // Find the deepest quadtree node containing this point.
        let found = false;
        while (!found) {
            const nw = node._nw && this.rectangleContainsPosition(node._nw.extent, position);
            const ne = node._ne && this.rectangleContainsPosition(node._ne.extent, position);
            const sw = node._sw && this.rectangleContainsPosition(node._sw.extent, position);
            const se = node._se && this.rectangleContainsPosition(node._se.extent, position);

            // The common scenario is that the point is in only one quadrant and we can simply
            // iterate down the tree. But if the point is on a boundary between tiles, it is
            // in multiple tiles and we need to check all of them, so use recursion.
            if ((nw ? 1 : 0) + (ne ? 1 : 0) + (sw ? 1 : 0) + (se ? 1 : 0) > 1) {
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

        // Work up the tree until we find a rectangle that contains this point.
        while (node !== stopNode) {
            const rectangles = node.rectangles;

            // Rectangles are sorted by level, lowest first.
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

    private updateCoverageWithNode(
        remainingToCoverByLevel: RectangleWithLevel[][],
        node: QuadtreeNode | undefined,
        rectanglesToCover: RectangleWithLevel[]
    ): void {
        if (!node) {
            return;
        }

        let anyOverlap = false;
        for (let i = 0; i < rectanglesToCover.length; ++i) {
            anyOverlap = anyOverlap || this.rectanglesOverlap(node.extent, rectanglesToCover[i]);
        }

        if (!anyOverlap) {
            // This node is not applicable to the rectangle(s).
            return;
        }

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

        // Update with child nodes.
        this.updateCoverageWithNode(remainingToCoverByLevel, node._nw, rectanglesToCover);
        this.updateCoverageWithNode(remainingToCoverByLevel, node._ne, rectanglesToCover);
        this.updateCoverageWithNode(remainingToCoverByLevel, node._sw, rectanglesToCover);
        this.updateCoverageWithNode(remainingToCoverByLevel, node._se, rectanglesToCover);
    }

    private subtractRectangle(
        rectangleList: RectangleWithLevel[],
        rectangleToSubtract: RectangleWithLevel
    ): RectangleWithLevel[] {
        const result: RectangleWithLevel[] = [];
        // 将RectangleWithLevel转换为GeoBox
        const subtractGeoBox = new GeoBox(
            new GeoCoordinates(rectangleToSubtract.south, rectangleToSubtract.west),
            new GeoCoordinates(rectangleToSubtract.north, rectangleToSubtract.east)
        );

        for (let i = 0; i < rectangleList.length; ++i) {
            const rectangle = rectangleList[i];
            // 转换为GeoBox进行比较
            const currentGeoBox = new GeoBox(
                new GeoCoordinates(rectangle.south, rectangle.west),
                new GeoCoordinates(rectangle.north, rectangle.east)
            );

            if (!this.rectanglesOverlap(currentGeoBox, subtractGeoBox)) {
                result.push(rectangle);
            } else {
                // 使用原始RectangleWithLevel的坐标值创建新的GeoBox
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
