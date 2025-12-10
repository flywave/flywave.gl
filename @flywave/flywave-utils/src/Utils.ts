/* Copyright (C) 2025 flywave.gl contributors */

/**
 * constrain n to the given range via min + max
 *
 * @param n value
 * @param min the minimum value to be returned
 * @param max the maximum value to be returned
 * @returns the clamped value
 * @private
 */
export function clamp(n: number, min: number, max: number) {
    return Math.min(max, Math.max(min, n));
}

/**
 * Returns the first non-null value.
 *
 * @param a The first value.
 * @param b The second value.
 * @returns The first non-null value, or the second value if both are null.
 */
export function defaultValue<T>(a: T, b: T): T {
    return a || b;
}

/**
 * Returns true if the value is defined.
 *
 * @param value The value to check.
 * @returns True if the value is defined, false otherwise.
 */
export function defined<T>(value: T): value is NonNullable<T> {
    return value !== undefined && value !== null;
}

const warnOnceHistory = {};

export function warnOnce(message) {
    if (!warnOnceHistory[message]) {
        // console isn't defined in some WebWorkers, see #2558
        // eslint-disable-next-line no-console
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

type Callback<T> = (error: Error | null, result?: T) => void;

const transparentPngUrl =
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVQYV2NgAAIAAAUAAarVyFEAAAAASUVORK5CYII=";

export function arrayBufferToImage(data: ArrayBuffer, callback: Callback<HTMLImageElement>): void {
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

    img.onerror = () => {
        callback(
            new Error(
                "Could not load image. Please make sure to use a supported image type such as PNG or JPEG. Note that SVGs are not supported."
            )
        );
    };

    const blob: Blob = new window.Blob([new Uint8Array(data)], { type: "image/png" });
    img.src = data.byteLength ? URL.createObjectURL(blob) : transparentPngUrl;
}

export function arrayBufferToImageBitmap(data: ArrayBuffer, callback: Callback<ImageBitmap>): void {
    const blob: Blob = new Blob([data], { type: "image/png" });

    createImageBitmap(blob)
        .then((imgBitmap: ImageBitmap) => {
            callback(null, imgBitmap);
        })
        .catch((e: Error) => {
            callback(
                new Error(
                    `Could not load image because of ${e.message}. Please make sure to use a supported image type such as PNG or JPEG. Note that SVGs are not supported.`
                )
            );
        });
}

/**
 * Allows to unsubscribe from events without the need to store the method reference.
 */
export interface Subscription {
    /**
     * Unsubscribes from the event.
     */
    unsubscribe(): void;
}

export interface Subscriber {
    addEventListener: typeof window.addEventListener;
    removeEventListener: typeof window.removeEventListener;
}

/**
 * This method is used in order to register an event listener using a lambda function.
 * The return value will allow unsubscribing from the event, without the need to store the method reference.
 * @param target - The target
 * @param message - The message
 * @param listener - The listener
 * @param options - The options
 * @returns a subscription object that can be used to unsubscribe from the event
 */
export function subscribe(
    target: Subscriber,
    message: keyof WindowEventMap,
    listener: (...args: any) => void,
    options: boolean | AddEventListenerOptions
): Subscription {
    target.addEventListener(message, listener, options);
    return {
        unsubscribe: () => {
            target.removeEventListener(message, listener, options);
        }
    };
}
