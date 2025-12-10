/* Copyright (C) 2025 flywave.gl contributors */

import { type GeoBoxArray, GeoBox } from "@flywave/flywave-geoutils";
import { Texture } from "three";

import {
    type SerializedGroundModificationPolygon,
    deserializeGroundModificationPolygon
} from "../ground-modification-manager";
import { renderGroundModificationHeightMap } from "../terrain-processor";
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
 * Validates input parameters for DEM tile decoding
 *
 * @param params - The parameters to validate
 * @throws Error if the padding value is invalid
 */
const validateDecodeParams = (params: DecodeTileParams): void => {
    if (params.padding < 0 || params.padding > 10) {
        throw new Error(`Invalid padding value: ${params.padding}`);
    }
};

/**
 * Gets image data from an image source with optional padding
 *
 * @param imgSource - The image source (ImageBitmap or ImageData)
 * @param padding - The padding to add around the image
 * @returns A promise that resolves to the image data
 */
async function getImageData(
    imgSource: ImageBitmap | ImageData,
    padding: number
): Promise<ImageData> {
    if (imgSource instanceof ImageData) {
        return handleImageData(imgSource, padding);
    }
    return handleImageBitmap(imgSource, padding);
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
export const processDEMTile = async (params: DecodeTileParams): Promise<DecodeTileResult> => {
    validateDecodeParams(params);
    const { uid, encoding, groundModificationPolygons, geoBox, flipY, krigingOptions } = params;

    const rawimagePixels = await getImageData(params.rawImageData, params.padding);
    let imagePixels = rawimagePixels;

    const baseDem = new Texture(await getImageData(params.rawImageData, 0));
    //handler for ground modification
    if (groundModificationPolygons && groundModificationPolygons.length) {
        const { image: processed } = await renderGroundModificationHeightMap(
            groundModificationPolygons?.map(deserializeGroundModificationPolygon),
            GeoBox.fromArray(geoBox),
            baseDem,
            256,
            256,
            flipY,
            krigingOptions
        );
        imagePixels = await getImageData(processed, params.padding);
    }

    const dem = new DEMData(
        uid,
        rawimagePixels,
        imagePixels,
        GeoBox.fromArray(geoBox),
        encoding,
        params.padding < 1,
        true
    );

    return {
        dem,
        geometries: [],
        techniques: []
    };
};

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
export const handleImageData = (imgData: ImageData, padding: number): ImageData => {
    if (padding === 0) {
        return imgData;
    }

    // Create a new ImageData with padding
    const paddedWidth = imgData.width + 2 * padding;
    const paddedHeight = imgData.height + 2 * padding;
    const paddedData = new Uint8ClampedArray(paddedWidth * paddedHeight * 4);

    // Center the original image in the padded result
    const rowBytes = imgData.width * 4;
    for (let y = 0; y < imgData.height; y++) {
        const srcOffset = y * rowBytes;
        const dstOffset = ((y + padding) * paddedWidth + padding) * 4;
        paddedData.set(imgData.data.subarray(srcOffset, srcOffset + rowBytes), dstOffset);
    }

    return new ImageData(paddedData, paddedWidth, paddedHeight, {
        colorSpace: imgData.colorSpace
    });
};

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
export const createCanvasContext = (
    width: number,
    height: number
): {
    canvas: OffscreenCanvas;
    context: OffscreenCanvasRenderingContext2D;
} => {
    const canvas = new OffscreenCanvas(width, height);
    const context = canvas.getContext("2d", {
        willReadFrequently: true,
        alpha: false // DEM tiles typically don't need alpha
    }) as OffscreenCanvasRenderingContext2D;

    if (!context) {
        throw new Error("Could not create 2D context for OffscreenCanvas");
    }

    context.imageSmoothingEnabled = false; // Better for DEM data
    return { canvas, context };
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
export const handleImageBitmap = (
    imgBitmap: ImageBitmap,
    padding: number,
    canvasContext?: {
        canvas: OffscreenCanvas;
        context: OffscreenCanvasRenderingContext2D;
    }
): ImageData => {
    let contextToUse = canvasContext?.context;
    let createdTempContext = false;

    if (
        !canvasContext ||
        canvasContext.canvas.width !== imgBitmap.width ||
        canvasContext.canvas.height !== imgBitmap.height
    ) {
        const newContext = createCanvasContext(imgBitmap.width, imgBitmap.height);
        contextToUse = newContext.context;
        createdTempContext = true;
    }

    try {
        // Draw the image
        contextToUse!.drawImage(imgBitmap, 0, 0);

        // Get image data with padding
        const imgData = contextToUse!.getImageData(
            -padding,
            -padding,
            imgBitmap.width + 2 * padding,
            imgBitmap.height + 2 * padding
        );

        // Clear the canvas if we're keeping it for reuse
        if (!createdTempContext) {
            contextToUse!.clearRect(0, 0, imgBitmap.width, imgBitmap.height);
        }

        return imgData;
    } catch (error) {
        throw error;
    }
};
