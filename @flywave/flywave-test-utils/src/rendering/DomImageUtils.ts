/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { LoggerManager } from "@flywave/flywave-utils";
import * as THREE from "three";

import { TestOptions } from "./RenderingTestHelper";

declare const require: any;
const pixelmatch = require("pixelmatch");

const logger = LoggerManager.instance.create("DomImageUtils");

/**
 * Create a HTML <img> element from either `ImageData`, `ImageBitmap` or just source URL.
 */
export function createImgElement(data: ImageData | ImageBitmap | string) {
    const img = document.createElement("img");
    if (typeof data === "string") {
        img.src = data;
    } else {
        const canvas = document.createElement("canvas");
        canvas.width = data.width;
        canvas.height = data.height;

        const context = canvas.getContext("2d");
        if (context === null) {
            throw new Error("#createImg: unable to obtain 2d context from canvas");
        }
        if (data instanceof ImageData) {
            context.putImageData(data, 0, 0);
        } else {
            context.drawImage(data, 0, 0);
        }
        img.src = canvas.toDataURL();
    }
    return img;
}

/**
 * Captures raw image from canvas with fallback for 'webgl' canvases, for which '2d' context cannot
 * be obtained as they have `webgl` context already attached.
 *
 * Note, on MS Edge it requires this polyfill: https://github.com/blueimp/JavaScript-Canvas-to-Blob
 */
export async function canvasToImageData(canvas: HTMLCanvasElement): Promise<ImageData> {
    // §506 capture forensics: WHICH canvas/context/branch actually feeds
    // the comparison — the terrain/raster family captures pure white while
    // the live canvas shows content.
    try {
        const glProbe = (canvas.getContext("webgl2") ??
            canvas.getContext("webgl")) as WebGL2RenderingContext | null;
        let probe = 'no-gl';
        if (glProbe) {
            const p8 = new Uint8Array(4);
            glProbe.readPixels(Math.floor(glProbe.drawingBufferWidth / 2),
                Math.floor(glProbe.drawingBufferHeight / 2), 1, 1,
                glProbe.RGBA, glProbe.UNSIGNED_BYTE, p8);
            probe = 'gl px=' + p8[0] + ',' + p8[1] + ',' + p8[2] + ',a' + p8[3]
                + ' buf=' + glProbe.drawingBufferWidth + 'x' + glProbe.drawingBufferHeight;
        }
        // eslint-disable-next-line no-console
        console.log('[MBCapCtx:' + ((globalThis as any).__mbFixture ?? '?') + '] size=' + canvas.width + 'x' + canvas.height
            + ' ' + probe);
    } catch {}
    const context = canvas.getContext("2d");
    if (context === null) {
        // if webgl context was already obtained, 2d returns null.
        // §505: read the drawing buffer SYNCHRONOUSLY. The previous toBlob
        // path serialized ASYNC — the map's render loop keeps clearing the
        // canvas between frames, and the blob encoding landed after a
        // clear, capturing blank white frames (terrain/raster family).
        const gl = (canvas.getContext("webgl2") ??
            canvas.getContext("webgl")) as WebGL2RenderingContext | WebGLRenderingContext | null;
        if (gl) {
            const w = canvas.width, h = canvas.height;
            const data = new Uint8Array(w * h * 4);
            gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, data);
            const imageData = new ImageData(w, h);
            // GL rows are bottom-up; ImageData rows are top-down.
            for (let y = 0; y < h; y++) {
                const src = (h - 1 - y) * w * 4;
                imageData.data.set(data.subarray(src, src + w * 4), y * w * 4);
            }
            return imageData;
        }
        return await new Promise<ImageData>((resolve, reject) => {
            canvas.toBlob(blob => {
                if (blob === null) {
                    reject(new Error("#canvasToImageData: unable to capture image from canvas"));
                    return;
                }
                const url = URL.createObjectURL(blob);
                resolve(loadImageData(url));
            });
        });
    } else {
        return context.getImageData(0, 0, canvas.width, canvas.height);
    }
}

/**
 * Returns image which can be used in another canvas or html element.
 */
export function imageDataToDataUrl(image: ImageData) {
    const tmpCanvas = document.createElement("canvas");
    tmpCanvas.width = image.width;
    tmpCanvas.height = image.height;
    const context = tmpCanvas.getContext("2d")!;
    context.putImageData(image, 0, 0);

    return tmpCanvas.toDataURL();
}

/**
 * Load image from URL as `ImageData` so it can be easily compared by image comparision libraries.
 */
export function loadImageData(url: string): Promise<ImageData> {
    return new Promise<ImageData>((resolve, reject) => {
        new THREE.ImageLoader().load(
            url,
            image => {
                const canvas = document.createElement("canvas");
                canvas.width = image.width;
                canvas.height = image.height;

                const context = canvas.getContext("2d");
                if (context === null) {
                    reject(new Error("#loadImageData: unable to create 2d context out of canvas"));
                    return;
                }
                context.drawImage(
                    image,
                    0,
                    0,
                    image.width,
                    image.height,
                    0,
                    0,
                    canvas.width,
                    canvas.height
                );
                const imageData = context.getImageData(0, 0, image.width, image.height);
                resolve(imageData);
            },
            undefined, // onProgress
            errorEvent => {
                logger.error(`#loadImageData: failed to load image from ${url}`, errorEvent);
                reject(new Error(`#loadImageData failed to load image from ${url}`));
            }
        );
    });
}

/**
 * Compare two images with specified threshold and returns json with comparison result.
 */
export function compareImages(
    actualImage: ImageData,
    referenceImage: ImageData,
    options: TestOptions
) {
    const { width, height } = actualImage;

    // Mapbox render-test references are RGBA with a TRANSPARENT background
    // (alpha 0 where nothing is drawn), while the engine's canvas capture is
    // fully opaque. Alpha-composite the reference over white (matching the
    // engine's default clear colour) so the comparison reflects visual content
    // differences rather than the alpha channel. References that are already
    // fully opaque (e.g. styles with a background layer) pass through untouched.
    let ref = referenceImage;
    let refHasAlpha = false;
    for (let i = 3; i < referenceImage.data.length; i += 4) {
        if (referenceImage.data[i] !== 255) { refHasAlpha = true; break; }
    }
    if (refHasAlpha) {
        ref = new ImageData(width, height);
        const d = referenceImage.data;
        const o = ref.data;
        for (let i = 0; i < d.length; i += 4) {
            const a = d[i + 3] / 255;
            const inv = 1 - a;
            o[i] = d[i] * a + 255 * inv;
            o[i + 1] = d[i + 1] * a + 255 * inv;
            o[i + 2] = d[i + 2] * a + 255 * inv;
            o[i + 3] = 255;
        }
    }

    const diffCanvas = document.createElement("canvas");
    diffCanvas.width = width;
    diffCanvas.height = height;
    const diffContext = diffCanvas.getContext("2d")!;
    const diffData = diffContext.createImageData(width, height);

    const mismatchedPixels = pixelmatch(
        ref.data,
        actualImage.data,
        diffData.data,
        width,
        height,
        { threshold: options.threshold }
    );
    return {
        mismatchedPixels,
        diffImage: diffData
    };
}

export async function waitImageLoaded(img: HTMLImageElement): Promise<void> {
    if (img.complete) {
        return;
    }

    if (img.naturalWidth !== 0) {
        return;
    }

    return await new Promise((resolve, reject) => {
        const cleanup = () => {
            img.removeEventListener("load", onLoaded);
            img.removeEventListener("error", onError);
        };
        const onLoaded = () => {
            cleanup();
            resolve();
        };
        const onError = () => {
            cleanup();
            reject(new Error("#imageDataFromImage: failed to load image"));
        };
        img.addEventListener("load", onLoaded);
        img.addEventListener("error", onError);
    });
}

export async function imageDataFromImage(img: HTMLImageElement): Promise<ImageData> {
    await waitImageLoaded(img);

    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(img, 0, 0);
    return ctx.getImageData(0, 0, canvas.width, canvas.height);
}
