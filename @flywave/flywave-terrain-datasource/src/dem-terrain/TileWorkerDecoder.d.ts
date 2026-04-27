import { type GeoBoxArray } from "@flywave/flywave-geoutils";
import { type SerializedGroundModificationPolygon } from "../ground-modification-manager";
import { type DEMEncoding, DEMData } from "./dem/DemData";
/**
 * Parameters for decoding a DEM tile
 */
export interface DecodeTileParams {
    /** Unique identifier for the tile */
    uid: string;
    /** The encoding format of the DEM data */
    encoding: DEMEncoding;
    /** The raw image data containing elevation information */
    rawImageData: ImageData;
    /** The geographic bounding box of the tile as an array */
    geoBox: GeoBoxArray;
    /** Padding to add around the image data */
    padding: number;
    /** Whether to build a quadtree for the tile */
    buildQuadTree: boolean;
    /** Optional ground modification polygons to apply */
    groundModificationPolygons?: SerializedGroundModificationPolygon[];
    /** Whether to flip the Y axis */
    flipY: boolean;
    /** Optional kriging interpolation options */
    krigingOptions?: {
        /** The kriging model to use */
        model?: "gaussian" | "exponential" | "spherical";
        /** The sigma squared parameter */
        sigma2?: number;
        /** The alpha parameter */
        alpha?: number;
    };
}
/**
 * Result of decoding a DEM tile
 */
export interface DecodeTileResult {
    /** The decoded DEM data */
    dem: DEMData;
    /** Array of geometries (empty for DEM tiles) */
    geometries: unknown[];
    /** Array of techniques (empty for DEM tiles) */
    techniques: unknown[];
}
/**
 * Processes DEM data from image source
 *
 * This function takes raw image data containing elevation information and
 * processes it into a DEMData object. It handles ground modifications and
 * padding as needed.
 *
 * @param params - The parameters for decoding the tile
 * @returns A promise that resolves to the decoded tile result
 */
export declare const processDEMTile: (params: DecodeTileParams) => Promise<DecodeTileResult>;
/**
 * Handles ImageData with padding
 *
 * This function adds padding around ImageData by creating a new ImageData
 * object with the specified padding and centering the original image data
 * within it.
 *
 * @param imgData - The original image data
 * @param padding - The padding to add around the image
 * @returns The padded image data
 */
export declare const handleImageData: (imgData: ImageData, padding: number) => ImageData;
/**
 * Creates an offscreen canvas context for image processing
 *
 * This function creates an OffscreenCanvas and its 2D rendering context
 * with appropriate settings for DEM data processing.
 *
 * @param width - The width of the canvas
 * @param height - The height of the canvas
 * @returns An object containing the canvas and its context
 */
export declare const createCanvasContext: (width: number, height: number) => {
    canvas: OffscreenCanvas;
    context: OffscreenCanvasRenderingContext2D;
};
/**
 * Handles ImageBitmap with padding using OffscreenCanvas
 *
 * This function processes an ImageBitmap by drawing it to an OffscreenCanvas
 * and extracting image data with the specified padding.
 *
 * @param imgBitmap - The ImageBitmap to process
 * @param padding - The padding to add around the image
 * @param canvasContext - Optional existing canvas context to reuse
 * @returns The processed image data with padding
 */
export declare const handleImageBitmap: (imgBitmap: ImageBitmap, padding: number, canvasContext?: {
    canvas: OffscreenCanvas;
    context: OffscreenCanvasRenderingContext2D;
}) => ImageData;
