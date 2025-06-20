import * as turf from "@turf/turf";

const transparentPngUrl =
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVQYV2NgAAIAAAUAAarVyFEAAAAASUVORK5CYII=";

export function arrayBufferToImage(data: ArrayBuffer, callback: Callback<HTMLImageElement>) {
    const img: HTMLImageElement = new window.Image();
    const URL = window.URL;
    img.onload = () => {
        callback(null, img);
        URL.revokeObjectURL(img.src);
        // prevent image dataURI memory leak in Safari;
        // but don't free the image immediately because it might be uploaded in the next frame
        // https://github.com/mapbox/mapbox-gl-js/issues/10226
        img.onload = null;
        window.requestAnimationFrame(() => {
            img.src = transparentPngUrl;
        });
    };
    img.onerror = () =>
        callback(
            new Error(
                "Could not load image. Please make sure to use a supported image type such as PNG or JPEG. Note that SVGs are not supported."
            )
        );
    const blob: Blob = new window.Blob([new Uint8Array(data)], { type: "image/png" });
    img.src = data.byteLength ? URL.createObjectURL(blob) : transparentPngUrl;
}

export function arrayBufferToImageBitmap(data: ArrayBuffer, callback: Callback<ImageBitmap>) {
    const blob: Blob = new window.Blob([new Uint8Array(data)], { type: "image/png" });
    window
        .createImageBitmap(blob)
        .then(imgBitmap => {
            callback(null, imgBitmap);
        })
        .catch(e => {
            callback(
                new Error(
                    `Could not load image because of ${e.message}. Please make sure to use a supported image type such as PNG or JPEG. Note that SVGs are not supported.`
                )
            );
        });
}

/**
 * constrain n to the given range via min + max
 *
 * @param n value
 * @param min the minimum value to be returned
 * @param max the maximum value to be returned
 * @returns the clamped value
 * @private
 */
export function clamp(n, min, max) {
    return Math.min(max, Math.max(min, n));
}

const warnOnceHistory = {};

export function warnOnce(message) {
    if (!warnOnceHistory[message]) {
        // console isn't defined in some WebWorkers, see #2558
        if (typeof console !== "undefined") console.warn(message);
        warnOnceHistory[message] = true;
    }
}
/**
 * Return the previous power of two, or the input value if already a power of two
 * @private
 */
export function prevPowerOfTwo(value) {
    if (value <= 1) return 1;
    return Math.pow(2, Math.floor(Math.log(value) / Math.LN2));
}
