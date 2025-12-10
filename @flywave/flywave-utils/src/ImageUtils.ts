/* Copyright (C) 2025 flywave.gl contributors */

/**
 * data images
 */
export interface ImageDataType {
    data: Uint8Array;
    width: number;
    height: number;
    compressed?: boolean;
}

/**
 * Supported Image Types
 */
export type ImageType = ImageBitmap | ImageDataType | HTMLImageElement;

/**
 * Image type string used to control or determine the type of images returned from ImageLoader
 */
export type ImageTypeEnum = "imagebitmap" | "image" | "data";

export function isImage(image: ImageType): boolean {
    return Boolean(getImageTypeOrNull(image));
}

export function deleteImage(image: ImageType): void {
    switch (getImageType(image)) {
        case "imagebitmap":
            (image as ImageBitmap).close();
            break;
        default:
        // Nothing to do for images and image data objects
    }
}

export function getImageType(image: ImageType): ImageTypeEnum {
    const format = getImageTypeOrNull(image);
    if (!format) {
        throw new Error("Not an image");
    }
    return format;
}

export function getImageSize(image: ImageType): { width: number; height: number } {
    return getImageData(image);
}

export function getImageData(image: ImageType): ImageDataType | ImageData {
    switch (getImageType(image)) {
        case "data":
            return image as unknown as ImageData;

        case "image":
        case "imagebitmap":
            // Extract the image data from the image via a canvas
            const canvas = document.createElement("canvas");
            // TODO - reuse the canvas?
            const context = canvas.getContext("2d");
            if (!context) {
                throw new Error("getImageData");
            }
            canvas.width = image.width;
            canvas.height = image.height;
            context.drawImage(image as CanvasImageSource, 0, 0);
            return context.getImageData(0, 0, image.width, image.height);

        default:
            throw new Error("getImageData");
    }
}

export /**
 * Draws ImageData to a canvas with optional scaling
 * @param {ImageData} imageData - The ImageData object to render
 * @param {Object} [options] - Optional configuration
 * @param {number} [options.scale=1] - Scaling factor (1 = original size)
 * @param {string} [options.canvasId='outputCanvas'] - ID of target canvas element
 * @param {number} [options.x=0] - X position to draw at
 * @param {number} [options.y=0] - Y position to draw at
 * @returns {boolean} True if drawing succeeded, false if failed
 */
function createCanvasFromImageData(
    imageData: ImageData,
    options?: { width?: number; height?: number }
): HTMLCanvasElement {
    // Create canvas with original or specified dimensions
    const canvas = document.createElement("canvas");
    canvas.width = options?.width || imageData.width;
    canvas.height = options?.height || imageData.height;

    // Draw image data (with scaling if needed)
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Could not get canvas context");

    if (options?.width || options?.height) {
        // Scale to fit while maintaining aspect ratio
        const scale = Math.min(canvas.width / imageData.width, canvas.height / imageData.height);
        const x = (canvas.width - imageData.width * scale) / 2;
        const y = (canvas.height - imageData.height * scale) / 2;

        // Create temp canvas for original image
        const tempCanvas = document.createElement("canvas");
        tempCanvas.width = imageData.width;
        tempCanvas.height = imageData.height;
        tempCanvas.getContext("2d")?.putImageData(imageData, 0, 0);

        // Draw scaled
        ctx.drawImage(tempCanvas, x, y, imageData.width * scale, imageData.height * scale);
    } else {
        // Draw at original size
        ctx.putImageData(imageData, 0, 0);
    }

    return canvas;
}

// PRIVATE

// eslint-disable-next-line complexity
function getImageTypeOrNull(image) {
    if (typeof ImageBitmap !== "undefined" && image instanceof ImageBitmap) {
        return "imagebitmap";
    }
    if (typeof Image !== "undefined" && image instanceof Image) {
        return "image";
    }
    if (image && typeof image === "object" && image.data && image.width && image.height) {
        return "data";
    }
    return null;
}

/** MIME type, width and height extracted from binary compressed image data */
export interface BinaryImageMetadata {
    mimeType: string;
    width: number;
    height: number;
}

const BIG_ENDIAN = false;
const LITTLE_ENDIAN = true;

/**
 * Extracts `{mimeType, width and height}` from a memory buffer containing a known image format
 * Currently supports `image/png`, `image/jpeg`, `image/bmp` and `image/gif`.
 * @param binaryData: DataView | ArrayBuffer image file memory to parse
 * @returns metadata or null if memory is not a valid image file format layout.
 */
export function getBinaryImageMetadata(
    binaryData: DataView | ArrayBuffer
): BinaryImageMetadata | null {
    const dataView = toDataView(binaryData);
    return (
        getPngMetadata(dataView) ||
        getJpegMetadata(dataView) ||
        getGifMetadata(dataView) ||
        getBmpMetadata(dataView)
    );
}

// PNG

function getPngMetadata(binaryData: DataView | ArrayBuffer): BinaryImageMetadata | null {
    const dataView = toDataView(binaryData);
    // Check file contains the first 4 bytes of the PNG signature.
    const isPng = dataView.byteLength >= 24 && dataView.getUint32(0, BIG_ENDIAN) === 0x89504e47;
    if (!isPng) {
        return null;
    }

    // Extract size from a binary PNG file
    return {
        mimeType: "image/png",
        width: dataView.getUint32(16, BIG_ENDIAN),
        height: dataView.getUint32(20, BIG_ENDIAN)
    };
}

// GIF

// Extract size from a binary GIF file
// TODO: GIF is not this simple
function getGifMetadata(binaryData: DataView | ArrayBuffer): BinaryImageMetadata | null {
    const dataView = toDataView(binaryData);
    // Check first 4 bytes of the GIF signature ("GIF8").
    const isGif = dataView.byteLength >= 10 && dataView.getUint32(0, BIG_ENDIAN) === 0x47494638;
    if (!isGif) {
        return null;
    }

    // GIF is little endian.
    return {
        mimeType: "image/gif",
        width: dataView.getUint16(6, LITTLE_ENDIAN),
        height: dataView.getUint16(8, LITTLE_ENDIAN)
    };
}

// BMP

// TODO: BMP is not this simple
export function getBmpMetadata(binaryData: DataView | ArrayBuffer): BinaryImageMetadata | null {
    const dataView = toDataView(binaryData);
    // Check magic number is valid (first 2 characters should be "BM").
    // The mandatory bitmap file header is 14 bytes long.
    const isBmp =
        dataView.byteLength >= 14 &&
        dataView.getUint16(0, BIG_ENDIAN) === 0x424d &&
        dataView.getUint32(2, LITTLE_ENDIAN) === dataView.byteLength;

    if (!isBmp) {
        return null;
    }

    // BMP is little endian.
    return {
        mimeType: "image/bmp",
        width: dataView.getUint32(18, LITTLE_ENDIAN),
        height: dataView.getUint32(22, LITTLE_ENDIAN)
    };
}

// JPEG

// Extract width and height from a binary JPEG file
function getJpegMetadata(binaryData: DataView | ArrayBuffer): BinaryImageMetadata | null {
    const dataView = toDataView(binaryData);
    // Check file contains the JPEG "start of image" (SOI) marker
    // followed by another marker.
    const isJpeg =
        dataView.byteLength >= 3 &&
        dataView.getUint16(0, BIG_ENDIAN) === 0xffd8 &&
        dataView.getUint8(2) === 0xff;

    if (!isJpeg) {
        return null;
    }

    const { tableMarkers, sofMarkers } = getJpegMarkers();

    // Exclude the two byte SOI marker.
    let i = 2;
    while (i + 9 < dataView.byteLength) {
        const marker = dataView.getUint16(i, BIG_ENDIAN);

        // The frame that contains the width and height of the JPEG image.
        if (sofMarkers.has(marker)) {
            return {
                mimeType: "image/jpeg",
                height: dataView.getUint16(i + 5, BIG_ENDIAN), // Number of lines
                width: dataView.getUint16(i + 7, BIG_ENDIAN) // Number of pixels per line
            };
        }

        // Miscellaneous tables/data preceding the frame header.
        if (!tableMarkers.has(marker)) {
            return null;
        }

        // Length includes size of length parameter but not the two byte header.
        i += 2;
        i += dataView.getUint16(i, BIG_ENDIAN);
    }

    return null;
}

function getJpegMarkers() {
    // Tables/misc header markers.
    // DQT, DHT, DAC, DRI, COM, APP_n
    const tableMarkers = new Set([0xffdb, 0xffc4, 0xffcc, 0xffdd, 0xfffe]);
    for (let i = 0xffe0; i < 0xfff0; ++i) {
        tableMarkers.add(i);
    }

    // SOF markers and DHP marker.
    // These markers are after tables/misc data.
    const sofMarkers = new Set([
        0xffc0, 0xffc1, 0xffc2, 0xffc3, 0xffc5, 0xffc6, 0xffc7, 0xffc9, 0xffca, 0xffcb, 0xffcd,
        0xffce, 0xffcf, 0xffde
    ]);

    return { tableMarkers, sofMarkers };
}

// TODO - move into image module?
function toDataView(data) {
    if (data instanceof DataView) {
        return data;
    }
    if (ArrayBuffer.isView(data)) {
        return new DataView(data.buffer);
    }

    // TODO: make these functions work for Node.js buffers?
    // if (bufferToArrayBuffer) {
    //   data = bufferToArrayBuffer(data);
    // }

    // Careful - Node Buffers will look like ArrayBuffers (keep after isBuffer)
    if (data instanceof ArrayBuffer) {
        return new DataView(data);
    }
    throw new Error("toDataView");
}
