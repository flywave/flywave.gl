/** Format of an [[ImageBuffer]].
 * The format determines how many bytes are allocated for each pixel in the buffer and the semantics of each byte.
 * @see [[ImageBuffer.getNumBytesPerPixel]]
 * @public
 * @extensions
 */
export declare enum ImageBufferFormat {
    /** RGBA format - 4 bytes per pixel. */
    Rgba = 0,
    /** RGB format - 3 bytes per pixel. */
    Rgb = 2,
    /** 1 byte per pixel. */
    Alpha = 5
}
/** Uncompressed rectangular bitmap image data.
 * @public
 */
export declare class ImageBuffer {
    /** Image data in which each pixel occupies 1 or more bytes depending of the [[ImageBufferFormat]]. */
    readonly data: Uint8Array;
    /** Format of the bytes in the image. */
    readonly format: ImageBufferFormat;
    /** Width of image in pixels */
    readonly width: number;
    /** Return the number of bytes allocated for each pixel. */
    get numBytesPerPixel(): number;
    /** Determine the number of bytes allocated to a single pixel for the specified format. */
    static getNumBytesPerPixel(format: ImageBufferFormat): number;
    /** Get the height of this image in pixels. */
    get height(): number;
    /** Create a new ImageBuffer.
     * @note The ImageBuffer takes ownership of the input Uint8Array.
     * @param data The uncompressed image bytes. Must be a multiple of the width times the number of bytes per pixel specified by the format.
     * @param format The format of the image.
     * @param width The width of the image in pixels.
     * @returns A new ImageBuffer.
     * @throws Error if the length of the Uint8Array is not appropriate for the specified width and format.
     */
    static create(data: Uint8Array, format: ImageBufferFormat, width: number): ImageBuffer;
    /** @internal */
    protected static isValidData(data: Uint8Array, format: ImageBufferFormat, width: number): boolean;
    /** @internal */
    protected static computeHeight(data: Uint8Array, format: ImageBufferFormat, width: number): number;
    /** @internal */
    protected constructor(data: Uint8Array, format: ImageBufferFormat, width: number);
}
/** Returns whether the input is a power of two.
 * @note Floating point inputs are truncated.
 * @public
 */
export declare function isPowerOfTwo(num: number): boolean;
/** Returns the first power-of-two value greater than or equal to the input.
 * @note Floating point inputs are truncated.
 * @public
 */
export declare function nextHighestPowerOfTwo(num: number): number;
/** The format of an ImageSource.
 * @public
 * @extensions
 */
export declare enum ImageSourceFormat {
    /** Image data is stored with JPEG compression. */
    Jpeg = 0,
    /** Image data is stored with PNG compression. */
    Png = 2,
    /** Image is stored as an Svg stream.
     * @note SVG is only valid for ImageSources in JavaScript. It *may not* be used for persistent textures.
     */
    Svg = 3
}
/** @internal */
export declare function isValidImageSourceFormat(format: ImageSourceFormat): boolean;
/** Image data encoded and compressed in either Jpeg or Png format.
 * @public
 */
export declare class ImageSource {
    /** The content of the image, compressed */
    readonly data: Uint8Array | string;
    /** The compression type. */
    readonly format: ImageSourceFormat;
    /** Construct a new ImageSource, which takes ownership of the Uint8Array. */
    constructor(data: Uint8Array | string, format: ImageSourceFormat);
}
