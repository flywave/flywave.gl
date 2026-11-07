/* Copyright (C) 2025 flywave.gl contributors */

// TODO - should we automatically parse the embedded glTF or leave it to the app?
// - I.e. some apps might work directly on a GLB, in that case no need for us to decode...
// - And if we decode, do we still keep the GLB in case it is needed?
// - Do we add an option to control this?
// - Also, should we have hard dependency on gltf module or use injection or auto-discovery for gltf parser?

import {
    type GLTFWithBuffers,
    _getMemoryUsageGLTF,
    GLTFLoader,
    postProcessGLTF
} from "@flywave/flywave-gltf";
import { sliceArrayBuffer } from "@flywave/flywave-utils";

import { type Tiles3DLoaderOptions } from "../../Loader";
import { type Tiles3DTileContent } from "../../types";

export const GLTF_FORMAT = {
    URI: 0,
    EMBEDDED: 1
};

/**
 * Resolves the glTF URI of a tile against the URL the tile itself was loaded from.
 *
 * The 3D Tiles spec requires relative glTF URIs (gltfFormat 0) to be resolved
 * against the referring tile: `../templates/model.glb` inside
 * `.../output/i3dm/tile.i3dm` refers to `.../output/templates/model.glb`.
 * Handing the raw relative string to `fetch` would resolve it against the hosting
 * document instead, i.e. against whatever origin serves the page.
 */
export function resolveGltfUrl(gltfUrl: string, tileUrl?: string): string {
    if (!tileUrl) {
        return gltfUrl;
    }
    try {
        return new URL(gltfUrl, tileUrl).toString();
    } catch {
        // Non-absolute base (e.g. a bare string in unit tests): keep it untouched
        return gltfUrl;
    }
}

export function parse3DTileGLTFViewSync(
    tile: Tiles3DTileContent,
    arrayBuffer: ArrayBuffer,
    byteOffset: number,
    options: Tiles3DLoaderOptions | undefined
) {
    // Set flags
    // glTF models need to be rotated from Y to Z up
    // https://github.com/AnalyticalGraphicsInc/3d-tiles/tree/master/specification#y-up-to-z-up
    tile.rotateYtoZ = true;

    // Assume glTF consumes rest of tile
    const gltfByteLength = (tile.byteOffset || 0) + (tile.byteLength || 0) - byteOffset;
    if (gltfByteLength === 0) {
        throw new Error("glTF byte length must be greater than 0.");
    }

    // Save gltf up axis
    tile.gltfUpAxis =
        options?.["3d-tiles"] && options["3d-tiles"].assetGltfUpAxis
            ? options["3d-tiles"].assetGltfUpAxis
            : "Y";

    // TODO - We can avoid copy if already 4-byte aligned...
    // However the rest of the code may not be able to accept byteOffsets, so copy anyway
    tile.gltfArrayBuffer = sliceArrayBuffer(arrayBuffer, byteOffset, gltfByteLength);
    tile.gltfByteOffset = 0;
    tile.gltfByteLength = gltfByteLength;

    if (byteOffset % 4 === 0) {
        // tile.gltfArrayBuffer = arrayBuffer;
        // tile.gltfByteOffset = byteOffset;
        // tile.gltfByteLength = gltfByteLength;
    } else {
        // Create a copy of the glb so that it is 4-byte aligned
        // eslint-disable-next-line
        console.warn(`${tile.type}: embedded glb is not aligned to a 4-byte boundary.`);
    }

    // Entire tile is consumed
    return (tile.byteOffset || 0) + (tile.byteLength || 0);
}

export async function extractGLTF(
    tile: Tiles3DTileContent,
    gltfFormat: number,
    options?: Tiles3DLoaderOptions,
    context?: any
): Promise<void> {
    const tile3DOptions = options?.["3d-tiles"] || {};

    extractGLTFBufferOrURL(tile, gltfFormat, options, context);

    if (tile3DOptions.loadGLTF) {
        if (!context) {
            return;
        }
        if (tile.gltfUrl) {
            const fetchFn: typeof fetch = context.fetch || fetch;
            const response = await fetchFn(tile.gltfUrl, options as RequestInit);
            if (response && response.ok === false) {
                throw new Error(
                    `Failed to fetch glTF "${tile.gltfUrl}": ${response.status} ${response.statusText}`
                );
            }
            tile.gltfArrayBuffer = await response.arrayBuffer();
            tile.gltfByteOffset = 0;
        }
        if (tile.gltfArrayBuffer) {
            // TODO - Should handle byteOffset... However, not used now...
            const gltfWithBuffers = await parseFromContext(
                tile.gltfArrayBuffer,
                GLTFLoader,
                options,
                context
            );
            tile.gltf = postProcessGLTF(gltfWithBuffers);
            tile.gpuMemoryUsageInBytes = _getMemoryUsageGLTF(tile.gltf);
            delete tile.gltfArrayBuffer;
            delete tile.gltfByteOffset;
            delete tile.gltfByteLength;
        }
    }
}

function extractGLTFBufferOrURL(
    tile: Tiles3DTileContent,
    gltfFormat: number,
    options: Tiles3DLoaderOptions | undefined,
    context?: any
) {
    switch (gltfFormat) {
        case GLTF_FORMAT.URI:
            // We need to remove padding from the end of the model URL in case this tile was part of a composite tile.
            // This removes all white space and null characters from the end of the string.
            if (tile.gltfArrayBuffer) {
                const gltfUrlBytes = new Uint8Array(tile.gltfArrayBuffer, tile.gltfByteOffset);
                const textDecoder = new TextDecoder();
                const gltfUrl = textDecoder.decode(gltfUrlBytes);
                // The URI is relative to the referring tile, never to the document
                const tileUrl = (context?.url || context?.response?.url) as string | undefined;
                tile.gltfUrl = resolveGltfUrl(gltfUrl.replace(/[\s\0]+$/, ""), tileUrl);
            }
            delete tile.gltfArrayBuffer;
            delete tile.gltfByteOffset;
            delete tile.gltfByteLength;
            break;
        case GLTF_FORMAT.EMBEDDED:
            break;
        default:
            throw new Error("b3dm: Illegal glTF format field");
    }
}

async function parseFromContext(
    data: ArrayBuffer,
    loader: typeof GLTFLoader,
    options: Parameters<typeof GLTFLoader.parse>[1],
    context: any
): Promise<GLTFWithBuffers> {
    // If there is context, use the parsing capability provided by the context
    if (context && typeof context.parse === "function") {
        return context.parse(data, loader, options);
    }

    // Otherwise, directly use the loader to parse
    if (typeof loader.parse === "function") {
        return await loader.parse(data, options);
    }

    // If neither has a parsing method, throw an error
    throw new Error("No parser available. Context.parse or loader.parse must be implemented.");
}
