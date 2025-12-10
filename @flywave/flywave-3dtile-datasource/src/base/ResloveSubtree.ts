/* Copyright (C) 2025 flywave.gl contributors */

import {
    type Availability,
    type GLTFStyleBuffer,
    type GLTFStyleBufferView,
    type Subtree
} from "../loader/types";
import { type BoundingVolume, SubTreeTile } from "./Tile";

export class SubTreeMetaData {
    private readonly _contentAvailability: Availability[] = [];
    constructor(private readonly subtree: Subtree) {
        if (subtree.contentAvailability instanceof Array) {
            this._contentAvailability = subtree.contentAvailability;
        } else if (subtree.contentAvailability) {
            this._contentAvailability = [subtree.contentAvailability];
        }
    }

    get contentAvailability(): Availability[] {
        return this._contentAvailability;
    }

    get tileAvailability(): Availability {
        return this.subtree.tileAvailability;
    }

    get childSubtreeAvailability(): Availability {
        return this.subtree.childSubtreeAvailability;
    }

    get buffers(): GLTFStyleBuffer[] {
        return this.subtree.buffers || [];
    }

    get bufferViews(): GLTFStyleBufferView[] {
        return this.subtree.bufferViews || [];
    }
}

/**
 * Checks if the tile uses octree subdivision scheme
 * @param {SubTreeTile} tile - The tile to check
 * @returns {boolean} True if subdivision scheme is OCTREE
 */
function isOctreeSubdivision(tile: SubTreeTile): boolean {
    return tile.__implicitRoot.implicitTiling.subdivisionScheme === "OCTREE";
}

/**
 * Gets the bounds divider based on subdivision scheme
 * @param {SubTreeTile} tile - The tile to check
 * @returns {number} 8 for octree, 4 for quadtree
 */
function getBoundsDivider(tile: SubTreeTile): number {
    return isOctreeSubdivision(tile) ? 8 : 4;
}

/**
 * Calculates subtree coordinates based on parent tile and morton index
 * @param {SubTreeTile} tile - The current tile
 * @param {SubTreeTile | null} parentTile - The parent tile
 * @returns {[number, number, number]} The x, y, z coordinates
 */
function getSubtreeCoordinates(
    tile: SubTreeTile,
    parentTile: SubTreeTile | null
): [number, number, number] {
    if (!parentTile) {
        return [0, 0, 0];
    }
    const x = 2 * parentTile.__x + (tile.__subtreeIdx % 2);
    const y = 2 * parentTile.__y + (Math.floor(tile.__subtreeIdx / 2) % 2);
    const z = isOctreeSubdivision(tile)
        ? 2 * parentTile.__z + (Math.floor(tile.__subtreeIdx / 4) % 2)
        : 0;
    return [x, y, z];
}

/**
 * Gets a bit from the bitstream as boolean
 * @param {ParsedBitstream} object - The bitstream object
 * @param {number} index - The bit index to get
 * @returns {boolean} The bit value
 */
function getBit(object: Availability, index: number): boolean {
    // if (index < 0 || index >= object.lengthBits) {
    //     throw new Error("Bit index out of bounds.");
    // }

    if (object.constant !== undefined) {
        return !!object.constant as boolean;
    }

    const byteIndex = index >> 3;
    const bitIndex = index % 8;
    return ((new Uint8Array(object.bitstream!)[byteIndex] >> bitIndex) & 1) === 1;
}

/**
 * Expands the subtree by creating tile hierarchy
 * @param {ISubtreeNodeTile} subtreeRoot - The root of current subtree
 * @param {Subtree} subtree - The parsed subtree data
 * @param {ISubtreeNodeTile} rootTile - The root tile of the entire tileset
 */
export function expandSubtree(subtreeRoot: SubTreeTile, subtreeData: Subtree): void {
    const contentTile = new SubTreeTile();

    const subtree = new SubTreeMetaData(subtreeData);

    for (let i = 0; subtree && i < subtree.contentAvailability.length; i++) {
        if (getBit(subtree.contentAvailability[i], 0)) {
            contentTile.content = {
                uri: parseImplicitURI(subtreeRoot, subtreeRoot.__implicitRoot.content.uri)
            };
            break;
        }
    }

    subtreeRoot.children.push(contentTile);
    const bottomRow = transcodeSubtreeTiles(contentTile, subtree, subtreeRoot.__implicitRoot);
    const childSubtrees = listChildSubtrees(subtree, bottomRow, subtreeRoot.__implicitRoot);

    for (let i = 0; i < childSubtrees.length; i++) {
        const subtreeLocator = childSubtrees[i];
        const leafTile = subtreeLocator.tile;
        const subtreeTile = deriveChildTile(
            null,
            leafTile,
            null,
            subtreeLocator.childMortonIndex,
            subtreeRoot.__implicitRoot
        );

        subtreeTile.content = {
            uri: parseImplicitURI(
                subtreeTile,
                subtreeRoot.__implicitRoot.implicitTiling.subtrees.uri
            )
        };
        leafTile.children.push(subtreeTile);
    }
}

/**
 * Transcodes implicitly defined tiles within subtree to explicit tile objects
 * @param {ISubtreeNodeTile} subtreeRoot - Root of current subtree
 * @param {Subtree} subtree - The parsed subtree data
 * @param {ISubtreeNodeTile} rootTile - Root tile of entire tileset
 * @returns {(ISubtreeNodeTile | undefined)[]} Bottom row of transcoded tiles
 */
function transcodeSubtreeTiles(
    subtreeRoot: SubTreeTile,
    subtree: SubTreeMetaData,
    rootTile: SubTreeTile
): Array<SubTreeTile | undefined> {
    let parentRow: Array<SubTreeTile | undefined> = [subtreeRoot];
    let currentRow: Array<SubTreeTile | undefined> = [];

    for (let level = 1; level < rootTile.implicitTiling.subtreeLevels; level++) {
        const branchingFactor = getBoundsDivider(rootTile);
        const levelOffset = (Math.pow(branchingFactor, level) - 1) / (branchingFactor - 1);
        const numberOfChildren = branchingFactor * parentRow.length;

        for (let childMortonIndex = 0; childMortonIndex < numberOfChildren; childMortonIndex++) {
            const childBitIndex = levelOffset + childMortonIndex;
            const parentMortonIndex = childMortonIndex >> Math.log2(branchingFactor);
            const parentTile = parentRow[parentMortonIndex];

            if (!parentTile || !getBit(subtree.tileAvailability, childBitIndex)) {
                currentRow.push(undefined);
                continue;
            }

            const childTile = deriveChildTile(
                subtree,
                parentTile,
                childBitIndex,
                childMortonIndex,
                rootTile
            );

            parentTile.children.push(childTile);
            currentRow.push(childTile);
        }

        parentRow = currentRow;
        currentRow = [];
    }

    return parentRow;
}

/**
 * Derives child tile properties implicitly from parent
 * @param {Subtree | null} subtree - The subtree data
 * @param {ISubtreeNodeTile} parentTile - The parent tile
 * @param {number | null} childBitIndex - Index in availability bitstream
 * @param {number} childMortonIndex - Morton index relative to parent
 * @param {ISubtreeNodeTile} rootTile - Root tile of entire tileset
 * @returns {ISubtreeNodeTile} The new child tile
 */
function deriveChildTile(
    subtree: SubTreeMetaData | null,
    parentTile: SubTreeTile,
    childBitIndex: number | null,
    childMortonIndex: number,
    rootTile: SubTreeTile
): SubTreeTile {
    const subtreeTile: SubTreeTile = new SubTreeTile({
        ...parentTile,
        __level: parentTile.__level + 1,
        __subtreeIdx: childMortonIndex,
        __x: 0,
        __y: 0,
        __z: 0,
        parent: parentTile
    });

    [subtreeTile.__x, subtreeTile.__y, subtreeTile.__z] = getSubtreeCoordinates(
        subtreeTile,
        parentTile
    );
    subtreeTile.boundingVolume = getTileBoundingVolume(subtreeTile, rootTile);
    subtreeTile.geometricError = getGeometricError(subtreeTile, rootTile);

    if (subtree && childBitIndex !== null) {
        for (let i = 0; i < subtree.contentAvailability.length; i++) {
            if (getBit(subtree.contentAvailability[i], childBitIndex)) {
                subtreeTile.content = { uri: parseImplicitURI(subtreeTile, rootTile.content.uri) };
                break;
            }
        }
    }

    return subtreeTile;
}

/**
 * Gets the bounding volume for a tile
 * @param {ISubtreeNodeTile} tile - The tile to get volume for
 * @param {ISubtreeNodeTile} rootTile - Root tile of entire tileset
 * @returns {BoundingVolume} The bounding volume
 */
function getTileBoundingVolume(tile: SubTreeTile, rootTile: SubTreeTile): BoundingVolume {
    const boundingVolume: BoundingVolume = {};

    if (rootTile.boundingVolume.region) {
        const region = [...rootTile.boundingVolume.region] as [
            number,
            number,
            number,
            number,
            number,
            number
        ];
        const minX = region[0];
        const maxX = region[2];
        const minY = region[1];
        const maxY = region[3];
        const sizeX = (maxX - minX) / Math.pow(2, tile.__level);
        const sizeY = (maxY - minY) / Math.pow(2, tile.__level);

        region[0] = minX + sizeX * tile.__x;
        region[2] = minX + sizeX * (tile.__x + 1);
        region[1] = minY + sizeY * tile.__y;
        region[3] = minY + sizeY * (tile.__y + 1);

        for (let k = 0; k < 4; k++) {
            const coord = region[k];
            if (coord < -Math.PI) {
                region[k] += 2 * Math.PI;
            } else if (coord > Math.PI) {
                region[k] -= 2 * Math.PI;
            }
        }

        if (isOctreeSubdivision(tile)) {
            const minZ = region[4];
            const maxZ = region[5];
            const sizeZ = (maxZ - minZ) / Math.pow(2, tile.__level);
            region[4] = minZ + sizeZ * tile.__z;
            region[5] = minZ + sizeZ * (tile.__z + 1);
        }

        boundingVolume.region = region;
    }

    if (rootTile.boundingVolume.box) {
        const box = [...rootTile.boundingVolume.box] as [
            number,
            number,
            number,
            number,
            number,
            number,
            number,
            number,
            number,
            number,
            number,
            number
        ];
        const cellSteps = 2 ** tile.__level - 1;
        const scale = Math.pow(2, -tile.__level);
        const axisNumber = isOctreeSubdivision(tile) ? 3 : 2;

        for (let i = 0; i < axisNumber; i++) {
            box[3 + i * 3 + 0] *= scale;
            box[3 + i * 3 + 1] *= scale;
            box[3 + i * 3 + 2] *= scale;

            const x = box[3 + i * 3 + 0];
            const y = box[3 + i * 3 + 1];
            const z = box[3 + i * 3 + 2];

            const axisOffset = i === 0 ? tile.__x : i === 1 ? tile.__y : tile.__z;
            box[0] += 2 * x * (-0.5 * cellSteps + axisOffset);
            box[1] += 2 * y * (-0.5 * cellSteps + axisOffset);
            box[2] += 2 * z * (-0.5 * cellSteps + axisOffset);
        }

        boundingVolume.box = box;
    }

    return boundingVolume;
}

/**
 * Gets geometric error for a tile (half of parent's error)
 * @param {ISubtreeNodeTile} tile - The tile
 * @param {ISubtreeNodeTile} rootTile - Root tile of entire tileset
 * @returns {number} The geometric error
 */
function getGeometricError(tile: SubTreeTile, rootTile: SubTreeTile): number {
    return rootTile.geometricError / Math.pow(2, tile.__level);
}

/**
 * Lists available child subtrees
 * @param {Subtree} subtree - The subtree data
 * @param {(ISubtreeNodeTile | undefined)[]} bottomRow - Bottom row of tiles
 * @param {ISubtreeNodeTile} rootTile - Root tile of entire tileset
 * @returns {Array<{tile: ISubtreeNodeTile, childMortonIndex: number}>} List of child subtrees
 */
function listChildSubtrees(
    subtree: SubTreeMetaData,
    bottomRow: Array<SubTreeTile | undefined>,
    rootTile: SubTreeTile
): Array<{ tile: SubTreeTile; childMortonIndex: number }> {
    const results: Array<{ tile: SubTreeTile; childMortonIndex: number }> = [];
    const branchingFactor = getBoundsDivider(rootTile);

    for (let i = 0; i < bottomRow.length; i++) {
        const leafTile = bottomRow[i];
        if (!leafTile) {
            continue;
        }

        for (let j = 0; j < branchingFactor; j++) {
            const index = i * branchingFactor + j;
            if (getBit(subtree.childSubtreeAvailability, index)) {
                results.push({
                    tile: leafTile,
                    childMortonIndex: index
                });
            }
        }
    }

    return results;
}

/**
 * Replaces placeholder tokens in URI template with tile properties
 * @param {ISubtreeNodeTile} tile - The tile with properties
 * @param {string} uri - URI template with placeholders
 * @returns {string} URI with replaced placeholders
 */
function parseImplicitURI(tile: SubTreeTile, uri: string): string {
    return uri
        .replace("{level}", tile.__level.toString())
        .replace("{x}", tile.__x.toString())
        .replace("{y}", tile.__y.toString())
        .replace("{z}", tile.__z.toString());
}
