import { type GeoBoxJSON, type TileEncoding, GeoBox, TileKey } from "@flywave/flywave-geoutils";
import * as THREE from "three";
import { TileValidResource } from "../../TileResourceManager";
import DemMinMaxQuadTree from "./DemTree";
/** Supported DEM encoding formats */
export type DEMEncoding = "mapbox" | "terrarium";
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
    rawImageData: ImageData;
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
    rawImageData: ImageData;
    readonly uid: string | number;
    readonly stride: number;
    dim: number;
    readonly encoding: DEMEncoding;
    borderReady: boolean;
    readonly height: number;
    readonly width: number;
    readonly pixels: Uint8Array;
    readonly rawPixels: Uint8Array;
    sourceImage?: HTMLImageElement | ImageBitmap | ImageData;
    texture?: THREE.DataTexture;
    private _tree?;
    private _neighboringTiles;
    /** Getter for the quad tree */
    get tree(): DemMinMaxQuadTree;
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
    constructor(uid: string | number, rawImageData: ImageData, data: ImageData, geoBox: GeoBox, encoding?: DEMEncoding, borderReady?: boolean, buildQuadTree?: boolean);
    /**
     * Creates a DEMData instance from serialized data
     * @param serialized - Serialized DEM data
     * @returns New DEMData instance
     */
    static fromSerialized(serialized: SerializedDEMData): DEMData;
    /**
     * Serializes the DEM data for transfer to worker
     * @returns Serialized DEM data that can be transferred
     */
    serialize(): SerializedDEMData;
    /** Calculate total memory usage in bytes */
    getBytesUsed(): number;
    /** Fill border pixels by duplicating edge values */
    private _fillBorders;
    /** Build RGBA texture from DEM data */
    private _buildTexture;
    /** Build quad tree for efficient elevation queries */
    private buildQuadTree;
    /**
     * Get elevation value at specific coordinates
     * @param x - X coordinate
     * @param y - Y coordinate
     * @param clampToEdge - Whether to clamp coordinates to edges
     * @returns Elevation value
     */
    get(x: number, y: number, clampToEdge?: boolean, ignoreGroundModification?: boolean): number;
    /**
     * Get min/max elevation for a child tile
     * @param childrenTileKey - Child tile key
     * @param thisTileKey - Parent tile key
     * @returns Object with min and max elevation values
     */
    getTileMaxElevation(childrenTileKey: TileKey, thisTileKey: TileKey): {
        min: number;
        max: number;
    };
    /** Get unpack vector for specified encoding */
    static getUnpackVector(encoding: DEMEncoding): THREE.Vector4;
    /** Get unpack vector for current encoding */
    get unpackVector(): THREE.Vector4;
    get neighboringTiles(): Record<number, {
        backfilled: boolean;
    }>;
    /** Convert coordinates to array index */
    private _idx;
    /** Unpack elevation from Mapbox-encoded RGB values */
    private _unpackMapbox;
    /** Unpack elevation from Terrarium-encoded RGB values */
    private _unpackTerrarium;
    /** Select unpack function based on current encoding */
    private _unpackFn;
    /**
     * Pack elevation value into RGB array based on encoding
     * @param altitude - Elevation value to pack
     * @param encoding - Encoding format to use
     * @returns Array of [R, G, B, A] values
     */
    static pack(altitude: number, encoding?: DEMEncoding): [number, number, number, number];
    /** Get pixel data as texture */
    getPixels(): THREE.DataTexture | undefined;
    /**
     * Fill borders with data from neighboring tile
     * @param borderTile - Neighboring tile to copy from
     * @param dx - X direction (-1 for left, 1 for right)
     * @param dy - Y direction (-1 for bottom, 1 for top)
     */
    backfillBorder(borderTile: DEMData, dx: number, dy: number): void;
    static fillBorder(sourceDem: DEMData, sourceTileKey: TileKey, borderDem: DEMData, borderTileKey: TileKey, encoding: TileEncoding): void;
    markNeighboringTilesAsBackfilled(tileID: TileKey, encoding: TileEncoding, demResource: {
        getPreciseResource: (tileID: TileKey) => DEMData | undefined;
    }): void;
    private _getNeighboringTiles;
    /** Dispose of resources */
    protected disposeResources(): void;
    /**
     * Gets a height value at normalized coordinates with bilinear interpolation
     * @param x - Normalized X coordinate (0-1 range)
     * @param y - Normalized Y coordinate (0-1 range)
     * @returns The interpolated height value at the specified coordinates
     */
    getByScale(x: number, y: number, ignoreGroundModification?: boolean): number;
    /** Get displacement map texture */
    getDisplacementMap(): THREE.DataTexture;
    /** Get displacement map pixel buffer */
    getDisplacementMapBuffer(): Uint8ClampedArray;
}
export { DEMData, DemMinMaxQuadTree };
