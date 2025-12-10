/* Copyright (C) 2025 flywave.gl contributors */

// TextureSerializer.ts
import * as THREE from "three";

/**
 * Converts a THREE.Texture to a transferable ImageBitmap
 * @param texture - The THREE.Texture to convert
 * @returns Promise resolving to an ImageBitmap
 */
export async function textureToImageBitmap(texture: THREE.Texture): Promise<ImageBitmap> {
    try {
        // Handle different types of texture images
        if (texture.image instanceof HTMLCanvasElement) {
            return await createImageBitmap(texture.image, {
                imageOrientation: texture.flipY ? "flipY" : "none"
            });
        } else if (texture.image instanceof HTMLImageElement) {
            return await createImageBitmap(texture.image, {
                imageOrientation: texture.flipY ? "flipY" : "none"
            });
        } else if (texture.image instanceof HTMLVideoElement) {
            return await createImageBitmap(texture.image, {
                imageOrientation: texture.flipY ? "flipY" : "none"
            });
        } else if (typeof ImageBitmap !== "undefined" && texture.image instanceof ImageBitmap) {
            return texture.image;
        } else if (typeof ImageData !== "undefined" && texture.image instanceof ImageData) {
            return await createImageBitmap(texture.image, {
                imageOrientation: texture.flipY ? "flipY" : "none"
            });
        } else {
            // For OffscreenCanvas or other cases
            return await createImageBitmap(texture.image, {
                imageOrientation: texture.flipY ? "flipY" : "none"
            });
        }
    } catch (error) {
        throw new Error(`Failed to create ImageBitmap from texture: ${error}`);
    }
}

/**
 * Converts a THREE.Texture to ImageData
 * @param texture - The THREE.Texture to convert
 * @returns Promise resolving to ImageData
 */
export async function textureToImageData(texture: THREE.Texture): Promise<ImageData> {
    try {
        // First convert texture to ImageBitmap
        const imageBitmap = await textureToImageBitmap(texture);

        // Create a canvas to convert ImageBitmap to ImageData
        const canvas = document.createElement("canvas");
        canvas.width = imageBitmap.width;
        canvas.height = imageBitmap.height;

        const ctx = canvas.getContext("2d");
        if (!ctx) {
            throw new Error("Failed to get 2D context from canvas");
        }

        // Draw the ImageBitmap to the canvas
        ctx.drawImage(imageBitmap, 0, 0);

        // Get ImageData from the canvas
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

        // Clean up
        canvas.remove();

        return imageData;
    } catch (error) {
        throw new Error(`Failed to convert texture to ImageData: ${error}`);
    }
}

/**
 * Creates a THREE.Texture from an ImageBitmap
 * @param imageBitmap - The ImageBitmap to create a texture from
 * @returns A new THREE.Texture
 */
export function imageBitmapToTexture(imageBitmap: ImageBitmap): THREE.Texture {
    const texture = new THREE.Texture(imageBitmap);
    texture.needsUpdate = true;
    return texture;
}

/**
 * Prepares an array of textures for transfer by converting to ImageBitmaps
 * @param textures - Array of THREE.Textures
 * @returns Promise resolving to array of ImageBitmaps
 */
export async function texturesToImageBitmaps(textures: THREE.Texture[]): Promise<ImageBitmap[]> {
    const imageBitmaps: ImageBitmap[] = [];

    for (const texture of textures) {
        try {
            const imageBitmap = await textureToImageBitmap(texture);
            imageBitmaps.push(imageBitmap);
        } catch (error) {
            console.warn(`Failed to convert texture to ImageBitmap: ${error}`);
        }
    }

    return imageBitmaps;
}

/**
 * Converts an array of ImageBitmaps back to THREE.Textures
 * @param imageBitmaps - Array of ImageBitmaps
 * @returns Array of THREE.Textures
 */
export function imageBitmapsToTextures(imageBitmaps: ImageBitmap[]): THREE.Texture[] {
    return imageBitmaps.map(imageBitmapToTexture);
}

export default {
    textureToImageBitmap,
    imageBitmapToTexture,
    texturesToImageBitmaps,
    imageBitmapsToTextures
};
