/* Copyright (C) 2025 flywave.gl contributors */

import { assert } from "./assert";

interface Size {
    width: number;
    height: number;
}

interface Point {
    x: number;
    y: number;
}

export interface ImageLike {
    width: number;
    height: number;
    data: Uint8Array | Uint8ClampedArray;
}

function createImage(
    image: ImageLike,
    { width, height }: Size,
    channels: number,
    data?: Uint8Array | Uint8ClampedArray
): ImageLike {
    if (!data) {
        data = new Uint8Array(width * height * channels);
    } else if (data instanceof Uint8ClampedArray) {
        data = new Uint8Array(data.buffer);
    } else if (data.length !== width * height * channels) {
        throw new RangeError("mismatched image size");
    }
    image.width = width;
    image.height = height;
    image.data = data;
    return image;
}

function resizeImage(image: ImageLike, { width, height }: Size, channels: number): void {
    if (width === image.width && height === image.height) {
        return;
    }

    const newImage = createImage({} as ImageLike, { width, height }, channels);

    copyImage(
        image,
        newImage,
        { x: 0, y: 0 },
        { x: 0, y: 0 },
        {
            width: Math.min(image.width, width),
            height: Math.min(image.height, height)
        },
        channels
    );

    image.width = width;
    image.height = height;
    image.data = newImage.data;
}

function copyImage(
    srcImg: ImageLike,
    dstImg: ImageLike,
    srcPt: Point,
    dstPt: Point,
    size: Size,
    channels: number
): ImageLike {
    if (size.width === 0 || size.height === 0) {
        return dstImg;
    }

    if (
        size.width > srcImg.width ||
        size.height > srcImg.height ||
        srcPt.x > srcImg.width - size.width ||
        srcPt.y > srcImg.height - size.height
    ) {
        throw new RangeError("out of range source coordinates for image copy");
    }

    if (
        size.width > dstImg.width ||
        size.height > dstImg.height ||
        dstPt.x > dstImg.width - size.width ||
        dstPt.y > dstImg.height - size.height
    ) {
        throw new RangeError("out of range destination coordinates for image copy");
    }

    const srcData = srcImg.data;
    const dstData = dstImg.data;

    assert(srcData !== dstData);

    for (let y = 0; y < size.height; y++) {
        const srcOffset = ((srcPt.y + y) * srcImg.width + srcPt.x) * channels;
        const dstOffset = ((dstPt.y + y) * dstImg.width + dstPt.x) * channels;
        for (let i = 0; i < size.width * channels; i++) {
            dstData[dstOffset + i] = srcData[srcOffset + i];
        }
    }
    return dstImg;
}

export class AlphaImage {
    width: number;
    height: number;
    data: Uint8Array;
    colorSpace: PredefinedColorSpace; // Add colorSpace property

    constructor(size: Size, data?: Uint8Array | Uint8ClampedArray) {
        createImage(this, size, 1, data);
    }

    resize(size: Size): void {
        resizeImage(this, size, 1);
    }

    clone(): AlphaImage {
        return new AlphaImage(
            { width: this.width, height: this.height },
            new Uint8Array(this.data)
        );
    }

    static copy(
        srcImg: AlphaImage,
        dstImg: AlphaImage,
        srcPt: Point,
        dstPt: Point,
        size: Size
    ): void {
        copyImage(srcImg, dstImg, srcPt, dstPt, size, 1);
    }
}

// Not premultiplied, because ImageData is not premultiplied.
// UNPACK_PREMULTIPLY_ALPHA_WEBGL must be used when uploading to a texture.
export class RGBAImage {
    width: number;
    height: number;
    data: Uint8Array;
    colorSpace: PredefinedColorSpace; // Add colorSpace property

    constructor(size: Size, data?: Uint8Array | Uint8ClampedArray) {
        createImage(this, size, 4, data);
    }

    resize(size: Size): void {
        resizeImage(this, size, 4);
    }

    replace(data: Uint8Array | Uint8ClampedArray, copy: boolean = false): void {
        if (copy) {
            this.data.set(data);
        } else if (data instanceof Uint8ClampedArray) {
            this.data = new Uint8Array(data.buffer);
        } else {
            this.data = data;
        }
    }

    clone(): RGBAImage {
        return new RGBAImage({ width: this.width, height: this.height }, new Uint8Array(this.data));
    }

    static copy(
        srcImg: RGBAImage | ImageData,
        dstImg: RGBAImage,
        srcPt: Point,
        dstPt: Point,
        size: Size
    ): void {
        copyImage(srcImg as ImageLike, dstImg, srcPt, dstPt, size, 4);
    }
}
