/* Copyright (C) 2025 flywave.gl contributors */

import { type RGBA } from "./ColorUtils";
import { type ImageFormat, FileSystem } from "./FileSystem";

export type Color = RGBA;

export interface ImageDecoder {
    readonly width: number;
    readonly height: number;

    getPixelAt(x: number, y: number): Color;

    copy(): ImageEncoder;
}

export interface ImageEncoder {
    readonly width: number;
    readonly height: number;

    setPixelAt(x: number, y: number, color: Color): void;
    getPixelAt(x: number, y: number): Color;

    copy(): ImageEncoder;
    resize(width: number, height: number): ImageEncoder;

    write(filePath: string): Promise<any>;
}

export interface ImageDecoderConstructor {
    load(filePath: string): Promise<ImageDecoder>;
}

export interface ImageEncoderConstructor {
    create(width: number, height: number): Promise<ImageEncoder>;
}

/**
 * Factory class for creating images (decoders, encoders) for registered image formats.
 */
export class ImageFactory {
    private readonly m_encodersMap: Map<ImageFormat, ImageEncoderConstructor>;
    private readonly m_decodersMap: Map<ImageFormat, ImageDecoderConstructor>;

    // TODO: Consider registering all known image types in c-tor.
    constructor() {
        this.m_encodersMap = new Map<ImageFormat, ImageEncoderConstructor>();
        this.m_decodersMap = new Map<ImageFormat, ImageDecoderConstructor>();
    }

    loadImage(filePath: string): Promise<ImageDecoder> {
        const imageFormat: ImageFormat = FileSystem.getImageFormat(filePath);
        const decoderCtor = this.m_decodersMap.get(imageFormat);
        if (decoderCtor !== undefined) {
            return decoderCtor.load(filePath);
        } else {
            return new Promise<ImageDecoder>((resolve, reject) => {
                reject(new Error(`Unrecognized image format/extension: '${filePath}'!`));
            });
        }
    }

    createImage(imageFormat: ImageFormat, width: number, height: number): Promise<ImageEncoder> {
        const encoderCtor = this.m_encodersMap.get(imageFormat);
        if (encoderCtor !== undefined) {
            return encoderCtor.create(width, height);
        } else {
            return new Promise<ImageEncoder>((resolve, reject) => {
                reject(new Error("Unrecognized image format/extension!"));
            });
        }
    }

    registerImageType(
        format: ImageFormat,
        decoderC: ImageDecoderConstructor,
        encoderC: ImageEncoderConstructor
    ): void {
        this.m_decodersMap.set(format, decoderC);
        this.m_encodersMap.set(format, encoderC);
    }
}
