/* Copyright (C) 2025 flywave.gl contributors */

import { type GeoBoxJSON, type TileEncoding, GeoBox, TileKey } from "@flywave/flywave-geoutils";
import { clamp, number as interpolate, warnOnce } from "@flywave/flywave-utils";
import * as THREE from "three";

import { TileValidResource } from "../../TileResourceManager";
import DemMinMaxQuadTree from "./DemTree";

/** Supported DEM encoding formats */
export type DEMEncoding = "mapbox" | "terrarium";

const isWorker = typeof document === "undefined";

/** Unpack vectors for different DEM encoding formats */
const unpackVectors: Record<DEMEncoding, THREE.Vector4> = {
    mapbox: new THREE.Vector4(6553.6, 25.6, 0.1, 10000.0),
    terrarium: new THREE.Vector4(256.0, 1.0, 1.0 / 256.0, 32768.0)
};

/**
 * Interface for serialized DEM data that can be transferred to worker
 */
export interface SerializedDEMData {
    uid: string | number;
    stride: number;
    dim: number;
    encoding: DEMEncoding;
    borderReady: boolean;
    height: number;
    width: number;
    pixels: Uint8Array;
    rawImageData: ImageData; // 直接使用 ImageData
    geoBox: GeoBoxJSON;
    tree?: {
        minimums: Float32Array;
        maximums: Float32Array;
        childOffsets: Int32Array;
        leaves: Uint8Array;
    };
}

/**
 * Class representing Digital Elevation Model (DEM) data
 * Handles storage, processing, and access to elevation data
 */
export default class DEMData extends TileValidResource {
    public readonly uid: string | number;
    public readonly stride: number;
    public dim: number;
    public readonly encoding: DEMEncoding;
    public borderReady: boolean;
    public readonly height: number;
    public readonly width: number;
    public readonly pixels: Uint8Array;
    public readonly rawPixels: Uint8Array;

    public sourceImage?: HTMLImageElement | ImageBitmap | ImageData;
    public texture?: THREE.DataTexture;
    private _tree?: DemMinMaxQuadTree;

    private _neighboringTiles: Record<number, { backfilled: boolean }> | undefined;

    /** Getter for the quad tree */
    get tree(): DemMinMaxQuadTree {
        return this._tree!;
    }

    /**
     * Creates a new DEMData instance
     * @param uid - Unique identifier for this DEM data
     * @param rawImageData - Original image data
     * @param data - Processed image data
     * @param geoBox - Geographic bounding box
     * @param encoding - DEM encoding format
     * @param borderReady - Whether borders are already filled
     * @param buildQuadTree - Whether to build quad tree immediately
     */
    constructor(
        uid: string | number,
        public rawImageData: ImageData,
        data: ImageData,
        geoBox: GeoBox,
        encoding: DEMEncoding = "mapbox",
        borderReady: boolean = false,
        buildQuadTree: boolean = false
    ) {
        super(geoBox);
        this.uid = uid;
        this.height = data.height;
        this.width = data.width;

        if (data.height !== data.width) {
            throw new RangeError("DEM tiles must be square");
        }

        if (encoding && !(encoding in unpackVectors)) {
            warnOnce(
                `"${encoding}" is not a valid encoding type. Valid types include "mapbox" and "terrarium".`
            );
            encoding = "mapbox";
        }

        this.stride = data.height;
        this.dim = data.height - 2;
        this.pixels = new Uint8Array(data.data.buffer);
        this.rawPixels = new Uint8Array(this.rawImageData.data.buffer);
        this.encoding = encoding;
        this.borderReady = borderReady;

        if (!borderReady) {
            this._fillBorders();
        }

        if (buildQuadTree) {
            this.buildQuadTree();
        }
    }

    /**
     * Creates a DEMData instance from serialized data
     * @param serialized - Serialized DEM data
     * @returns New DEMData instance
     */
    static fromSerialized(serialized: SerializedDEMData): DEMData {
        // 直接使用传输过来的 ImageData，避免不必要的拷贝
        const rawImageData = serialized.rawImageData;

        // 从 pixels 创建处理后的 ImageData
        const processedImageData = new ImageData(
            new Uint8ClampedArray(serialized.pixels.buffer),
            serialized.width,
            serialized.height
        );

        // 重建 GeoBox
        const geoBox = GeoBox.fromJSON(serialized.geoBox);
        // 创建 DEMData 实例
        const demData = new DEMData(
            serialized.uid,
            rawImageData,
            processedImageData,
            geoBox,
            serialized.encoding,
            serialized.borderReady,
            false // 不立即构建四叉树
        );

        demData.borderReady = serialized.borderReady;
        // 如果序列化数据中包含四叉树，重建它
        if (serialized.tree) {
            demData._tree = new DemMinMaxQuadTree(demData, serialized.tree);
        }

        return demData;
    }

    /**
     * Serializes the DEM data for transfer to worker
     * @returns Serialized DEM data that can be transferred
     */
    serialize(): SerializedDEMData {
        const serialized: SerializedDEMData = {
            uid: this.uid,
            stride: this.stride,
            dim: this.dim,
            encoding: this.encoding,
            borderReady: this.borderReady,
            height: this.height,
            width: this.width,
            pixels: this.pixels, // 直接引用
            rawImageData: this.rawImageData, // 直接使用 ImageData 对象
            geoBox: this.geoBox.toJSON()
        };

        // 如果存在四叉树，包含四叉树数据
        if (this._tree) {
            serialized.tree = {
                minimums: this._tree._minimums,
                maximums: this._tree._maximums,
                childOffsets: this._tree._childOffsets,
                leaves: this._tree._leaves
            };
        }

        return serialized;
    }

    /** Calculate total memory usage in bytes */
    getBytesUsed(): number {
        return this.rawImageData.data.byteLength + this.pixels.byteLength;
    }

    /** Fill border pixels by duplicating edge values */
    private _fillBorders(): void {
        const { dim, pixels } = this;

        const data = new Int32Array(pixels.buffer);

        // Fill vertical borders
        for (let x = 0; x < dim; x++) {
            // left vertical border
            data[this._idx(-1, x)] = data[this._idx(0, x)];
            // right vertical border
            data[this._idx(dim, x)] = data[this._idx(dim - 1, x)];
            // left horizontal border
            data[this._idx(x, -1)] = data[this._idx(x, 0)];
            // right horizontal border
            data[this._idx(x, dim)] = data[this._idx(x, dim - 1)];
        }

        // Fill corners
        data[this._idx(-1, -1)] = data[this._idx(0, 0)];
        data[this._idx(dim, -1)] = data[this._idx(dim - 1, 0)];
        data[this._idx(-1, dim)] = data[this._idx(0, dim - 1)];
        data[this._idx(dim, dim)] = data[this._idx(dim - 1, dim - 1)];
    }

    /** Build RGBA texture from DEM data */
    private _buildTexture(size: number): void {
        const _size = size + 2;
        this.texture = new THREE.DataTexture(
            new Uint8Array(this.pixels.buffer),
            _size,
            _size,
            THREE.RGBAFormat
        );
        this.texture.minFilter = THREE.LinearFilter;
        this.texture.magFilter = THREE.LinearFilter;
        this.texture.flipY = true;
        this.texture.wrapS = THREE.ClampToEdgeWrapping;
        this.texture.wrapT = THREE.ClampToEdgeWrapping;
        this.texture.needsUpdate = true;
    }

    /** Build quad tree for efficient elevation queries */
    private buildQuadTree(): void {
        if (!this._tree) {
            this._tree = new DemMinMaxQuadTree(this);
        }
    }

    /**
     * Get elevation value at specific coordinates
     * @param x - X coordinate
     * @param y - Y coordinate
     * @param clampToEdge - Whether to clamp coordinates to edges
     * @returns Elevation value
     */
    get(
        x: number,
        y: number,
        clampToEdge: boolean = true,
        ignoreGroundModification?: boolean
    ): number {
        if (clampToEdge) {
            x = clamp(x, -1, this.dim);
            y = clamp(y, -1, this.dim);
        }
        const index = this._idx(x, y) * 4;
        const [r, g, b] = ignoreGroundModification
            ? this.rawPixels.slice(index, index + 3)
            : this.pixels.slice(index, index + 3);
        return this._unpackFn(r, g, b);
    }

    /**
     * Get min/max elevation for a child tile
     * @param childrenTileKey - Child tile key
     * @param thisTileKey - Parent tile key
     * @returns Object with min and max elevation values
     */
    getTileMaxElevation(
        childrenTileKey: TileKey,
        thisTileKey: TileKey
    ): { min: number; max: number } {
        const tree = this.tree;
        const demTileID = thisTileKey;
        const scale = 1 << (childrenTileKey.level - demTileID.level);
        let xOffset = childrenTileKey.column / scale - demTileID.column;
        let yOffset = childrenTileKey.row / scale - demTileID.row;
        let index = 0; // Start from DEM tree root

        for (let i = 0; i < childrenTileKey.level - demTileID.level; i++) {
            if (tree._leaves[index]) break;
            xOffset *= 2;
            yOffset *= 2;
            const childOffset = 2 * Math.floor(yOffset) + Math.floor(xOffset);
            index = tree._childOffsets[index] + childOffset;
            xOffset = xOffset % 1;
            yOffset = yOffset % 1;
        }

        return {
            min: tree._minimums[index],
            max: tree._maximums[index]
        };
    }

    /** Get unpack vector for specified encoding */
    static getUnpackVector(encoding: DEMEncoding): THREE.Vector4 {
        return unpackVectors[encoding];
    }

    /** Get unpack vector for current encoding */
    get unpackVector(): THREE.Vector4 {
        return unpackVectors[this.encoding];
    }

    get neighboringTiles(): Record<number, { backfilled: boolean }> {
        return this._neighboringTiles;
    }

    /** Convert coordinates to array index */
    private _idx(x: number, y: number): number {
        if (x < -1 || x >= this.dim + 1 || y < -1 || y >= this.dim + 1) {
            throw new RangeError("out of range source coordinates for DEM data");
        }
        return (y + 1) * this.stride + (x + 1);
    }

    /** Unpack elevation from Mapbox-encoded RGB values */
    private _unpackMapbox(r: number, g: number, b: number): number {
        return (r * 256 * 256 + g * 256.0 + b) / 10.0 - 10000.0;
    }

    /** Unpack elevation from Terrarium-encoded RGB values */
    private _unpackTerrarium(r: number, g: number, b: number): number {
        return r * 256 + g + b / 256 - 32768.0;
    }

    /** Select unpack function based on current encoding */
    private _unpackFn(r: number, g: number, b: number): number {
        return this.encoding === "terrarium"
            ? this._unpackTerrarium(r, g, b)
            : this._unpackMapbox(r, g, b);
    }

    /**
     * Pack elevation value into RGB array based on encoding
     * @param altitude - Elevation value to pack
     * @param encoding - Encoding format to use
     * @returns Array of [R, G, B, A] values
     */
    static pack(
        altitude: number,
        encoding: DEMEncoding = "mapbox"
    ): [number, number, number, number] {
        const color: [number, number, number, number] = [0, 0, 0, 0];
        const vector = DEMData.getUnpackVector(encoding);
        let v = Math.floor((altitude + vector[3]) / vector[2]);
        color[2] = v % 256;
        v = Math.floor(v / 256);
        color[1] = v % 256;
        v = Math.floor(v / 256);
        color[0] = v;
        return color;
    }

    /** Get pixel data as texture */
    getPixels(): THREE.DataTexture | undefined {
        if (!(this.texture instanceof THREE.DataTexture) && !isWorker) {
            this._buildTexture(this.dim);
        }
        return this.texture;
    }

    /**
     * Fill borders with data from neighboring tile
     * @param borderTile - Neighboring tile to copy from
     * @param dx - X direction (-1 for left, 1 for right)
     * @param dy - Y direction (-1 for bottom, 1 for top)
     */
    backfillBorder(borderTile: DEMData, dx: number, dy: number): void {
        if (this.dim !== borderTile.dim) {
            throw new Error("dem dimension mismatch");
        }

        let xMin = dx * this.dim;
        let xMax = dx * this.dim + this.dim;
        let yMin = dy * this.dim;
        let yMax = dy * this.dim + this.dim;

        // Adjust ranges based on direction
        if (dx === -1) xMin = xMax - 1;
        else if (dx === 1) xMax = xMin + 1;

        if (dy === -1) yMin = yMax - 1;
        else if (dy === 1) yMax = yMin + 1;

        const ox = -dx * this.dim;
        const oy = -dy * this.dim;
        const srcPixels = borderTile.pixels;
        const dstPixels = this.pixels;

        for (let y = yMin; y < yMax; y++) {
            for (let x = xMin; x < xMax; x++) {
                const srcIdx = 4 * this._idx(x + ox, y + oy);
                const dstIdx = 4 * this._idx(x, y);

                dstPixels[dstIdx] = srcPixels[srcIdx];
                dstPixels[dstIdx + 1] = srcPixels[srcIdx + 1];
                dstPixels[dstIdx + 2] = srcPixels[srcIdx + 2];
                dstPixels[dstIdx + 3] = srcPixels[srcIdx + 3];
            }
        }
    }

    static fillBorder(
        sourceDem: DEMData,
        sourceTileKey: TileKey,
        borderDem: DEMData,
        borderTileKey: TileKey,
        encoding: TileEncoding
    ) {
        if (sourceDem.borderReady) {
            return;
        }

        let dx = borderTileKey.column - sourceTileKey.column;
        const dy = borderTileKey.row - sourceTileKey.row;
        const dim = Math.pow(2, sourceTileKey.level);
        const borderId = borderTileKey.mortonCode(encoding);
        if (dx === 0 && dy === 0) return;

        if (Math.abs(dy) > 1) {
            return;
        }
        if (Math.abs(dx) > 1) {
            // Adjust the delta coordinate for world wraparound.
            if (Math.abs(dx + dim) === 1) {
                dx += dim;
            } else if (Math.abs(dx - dim) === 1) {
                dx -= dim;
            }
        }
        sourceDem.backfillBorder(borderDem, dx, dy);

        if (sourceDem.neighboringTiles && sourceDem.neighboringTiles[borderId])
            sourceDem.neighboringTiles[borderId].backfilled = true;

        sourceDem.borderReady =
            sourceDem.neighboringTiles &&
            Object.values(sourceDem.neighboringTiles).every(tile => tile.backfilled);
    }

    public markNeighboringTilesAsBackfilled(
        tileID: TileKey,
        encoding: TileEncoding,
        demResource: {
            getPreciseResource: (tileID: TileKey) => DEMData | undefined;
        }
    ) {
        this._neighboringTiles = this._getNeighboringTiles(tileID, encoding);

        Object.keys(this._neighboringTiles).forEach(borderId => {
            const borderTileKey = TileKey.fromMortonCode(Number(borderId), encoding);
            const neighboringTileResource = demResource.getPreciseResource(borderTileKey);
            if (neighboringTileResource) {
                DEMData.fillBorder(this, tileID, neighboringTileResource, borderTileKey, encoding);
                DEMData.fillBorder(neighboringTileResource, borderTileKey, this, tileID, encoding);
            }
        });
    }

    private _getNeighboringTiles(tileID: TileKey, encoding: TileEncoding) {
        const dim = Math.pow(2, tileID.level);

        const px = (tileID.column - 1 + dim) % dim;
        const nx = (tileID.column + 1 + dim) % dim;

        const neighboringTiles: Record<number, { backfilled: boolean }> = {};
        // add adjacent tiles TileKey.fromRowColumnLevel(tileKey.row >> offet, tileKey.column >> offet, nearLevel)
        neighboringTiles[
            TileKey.fromRowColumnLevel(tileID.row, px, tileID.level).mortonCode(encoding)
        ] = {
            backfilled: false
        };
        neighboringTiles[
            TileKey.fromRowColumnLevel(tileID.row, nx, tileID.level).mortonCode(encoding)
        ] = {
            backfilled: false
        };

        // Add upper neighboringTiles
        if (tileID.row > 0) {
            neighboringTiles[
                TileKey.fromRowColumnLevel(tileID.row - 1, px, tileID.level).mortonCode(encoding)
            ] = { backfilled: false };
            neighboringTiles[
                TileKey.fromRowColumnLevel(tileID.row - 1, tileID.column, tileID.level).mortonCode(
                    encoding
                )
            ] = { backfilled: false };
            neighboringTiles[
                TileKey.fromRowColumnLevel(tileID.row - 1, nx, tileID.level).mortonCode(encoding)
            ] = { backfilled: false };
        }
        // Add lower neighboringTiles
        if (tileID.row + 1 < dim) {
            neighboringTiles[
                TileKey.fromRowColumnLevel(tileID.row + 1, px, tileID.level).mortonCode(encoding)
            ] = { backfilled: false };
            neighboringTiles[
                TileKey.fromRowColumnLevel(tileID.row + 1, tileID.column, tileID.level).mortonCode(
                    encoding
                )
            ] = { backfilled: false };
            neighboringTiles[
                TileKey.fromRowColumnLevel(tileID.row + 1, nx, tileID.level).mortonCode(encoding)
            ] = { backfilled: false };
        }

        return neighboringTiles;
    }

    /** Dispose of resources */
    protected disposeResources(): void {
        this.texture?.dispose();
    }

    /**
     * Gets a height value at normalized coordinates with bilinear interpolation
     * @param x - Normalized X coordinate (0-1 range)
     * @param y - Normalized Y coordinate (0-1 range)
     * @returns The interpolated height value at the specified coordinates
     */
    public getByScale(x: number, y: number, ignoreGroundModification?: boolean): number {
        // Scale normalized coordinates to pixel dimensions
        x = x * this.dim;
        y = y * this.dim;

        // Get integer pixel coordinates
        const i = Math.floor(x);
        const j = Math.floor(y);

        // Perform bilinear interpolation between four surrounding pixels
        return interpolate(
            interpolate(
                this.get(i, j, undefined, ignoreGroundModification),
                this.get(i, j + 1, undefined, ignoreGroundModification),
                y - j
            ),
            interpolate(
                this.get(i + 1, j, undefined, ignoreGroundModification),
                this.get(i + 1, j + 1, undefined, ignoreGroundModification),
                y - j
            ),
            x - i
        );
    }

    /** Get displacement map texture */
    getDisplacementMap() {
        return this.getPixels();
    }

    /** Get displacement map pixel buffer */
    getDisplacementMapBuffer() {
        return this.getPixels().image.data as Uint8ClampedArray;
    }
}

export { DEMData, DemMinMaxQuadTree };
