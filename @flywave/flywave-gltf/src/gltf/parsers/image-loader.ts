// image-loader.ts
import { KTX2Loader } from "three/examples/jsm/loaders/KTX2Loader.js";
import { DDSLoader } from "three/examples/jsm/loaders/DDSLoader.js";
import { TGALoader } from "three/examples/jsm/loaders/TGALoader.js";
import { CompressedTexture, Texture } from "three/webgpu";
import type { WebGPURenderer } from "three/webgpu";
import { read } from "ktx-parse";
import type { UriResolver } from "@flywave/flywave-utils";

export interface LoadedImage {
    width: number;
    height: number;
    data: ImageBitmap | HTMLImageElement | HTMLCanvasElement;
    compressed: boolean;
    mimeType: string;
    compressedTexture?: CompressedTexture;
}

const DEFAULT_TRANSCODER_PATH = "resources/libs/basis/";

let sharedKTX2Loader: KTX2Loader | null = null;
let transcoderPathResolved = false;

function ensureKTX2Loader(
    renderer?: WebGPURenderer | null,
    uriResolver?: UriResolver | null
): KTX2Loader {
    if (sharedKTX2Loader == null) {
        sharedKTX2Loader = new KTX2Loader();
    }

    if (!transcoderPathResolved) {
        let path = DEFAULT_TRANSCODER_PATH;
        if (uriResolver) {
            path = uriResolver.resolveUri(DEFAULT_TRANSCODER_PATH);
        }
        sharedKTX2Loader.setTranscoderPath(path);
        transcoderPathResolved = true;
    }

    if (renderer) {
        sharedKTX2Loader.detectSupport(renderer as any);
    }

    return sharedKTX2Loader;
}

export class ImageLoader {
    private ktx2Loader: KTX2Loader | null = null;
    private ddsLoader?: DDSLoader;
    private tgaLoader?: TGALoader;
    private renderer: WebGPURenderer | null = null;
    private uriResolver: UriResolver | null = null;

    constructor(renderer?: WebGPURenderer, uriResolver?: UriResolver) {
        try {
            this.ddsLoader = new DDSLoader();
            this.tgaLoader = new TGALoader();
            this.renderer = renderer ?? null;
            this.uriResolver = uriResolver ?? null;
            this.ktx2Loader = ensureKTX2Loader(this.renderer, this.uriResolver);
        } catch (error) {
            console.warn("Some Three.js loaders failed to initialize:", error);
        }
    }

    configure(renderer: WebGPURenderer, uriResolver?: UriResolver): void {
        this.renderer = renderer;
        if (uriResolver) {
            this.uriResolver = uriResolver;
            transcoderPathResolved = false;
        }
        this.ktx2Loader = ensureKTX2Loader(this.renderer, this.uriResolver);
    }

    setRenderer(renderer: WebGPURenderer): void {
        this.configure(renderer);
    }

    detectFormat(arrayBuffer: ArrayBuffer): string {
        if (arrayBuffer.byteLength < 4) return "unknown";

        const view = new Uint8Array(arrayBuffer, 0, 4);

        if (this.isKTX2(arrayBuffer)) return "ktx2";

        if (view[0] === 0x44 && view[1] === 0x44 && view[2] === 0x53 && view[3] === 0x20) {
            return "dds";
        }

        if (arrayBuffer.byteLength > 18) {
            const tgaHeader = new Uint8Array(arrayBuffer, 0, 18);
            const imageType = tgaHeader[2];
            if ([1, 2, 3, 9, 10, 11].includes(imageType)) {
                return "tga";
            }
        }

        if (view[0] === 0x89 && view[1] === 0x50 && view[2] === 0x4e && view[3] === 0x47) {
            return "png";
        }

        if (view[0] === 0xff && view[1] === 0xd8) return "jpeg";

        if (view[0] === 0x52 && view[1] === 0x49 && view[2] === 0x46 && view[3] === 0x46) {
            if (arrayBuffer.byteLength > 12) {
                const webpView = new Uint8Array(arrayBuffer, 8, 4);
                if (
                    webpView[0] === 0x57 &&
                    webpView[1] === 0x45 &&
                    webpView[2] === 0x42 &&
                    webpView[3] === 0x50
                ) {
                    return "webp";
                }
            }
        }

        if (view[0] === 0x42 && view[1] === 0x4d) return "bmp";

        if (view[0] === 0x47 && view[1] === 0x49 && view[2] === 0x46) return "gif";

        return "unknown";
    }

    private isKTX2(arrayBuffer: ArrayBuffer): boolean {
        if (arrayBuffer.byteLength < 12) return false;
        const header = new Uint8Array(arrayBuffer, 0, 12);
        const ktx2Identifier = [
            0xab, 0x4b, 0x54, 0x58, 0x20, 0x32, 0x30, 0xbb, 0x0d, 0x0a, 0x1a, 0x0a
        ];
        return header.every((byte, i) => byte === ktx2Identifier[i]);
    }

    async load(arrayBuffer: ArrayBuffer, mimeType?: string): Promise<LoadedImage> {
        const format = this.detectFormat(arrayBuffer);

        try {
            switch (format) {
                case "ktx2":
                    return await this.loadKTX2(arrayBuffer);

                case "dds":
                    if (this.ddsLoader) {
                        return await this.loadWithDDSLoader(arrayBuffer);
                    }
                    break;

                case "tga":
                    if (this.tgaLoader) {
                        return await this.loadWithTGALoader(arrayBuffer);
                    }
                    break;

                case "png":
                case "jpeg":
                case "webp":
                case "bmp":
                case "gif":
                    return await this.loadStandardImage(arrayBuffer, mimeType || `image/${format}`);

                default:
                    return await this.loadStandardImage(arrayBuffer, mimeType || "image/png");
            }
        } catch (error) {
            console.warn(`Failed to load ${format} image:`, error);
        }

        return await this.loadStandardImage(arrayBuffer, mimeType || "image/png");
    }

    private async loadKTX2(arrayBuffer: ArrayBuffer): Promise<LoadedImage> {
        if (!this.ktx2Loader) {
            console.warn("[KTX2] KTX2Loader not available, using fallback");
            return await this.decodeKTX2Fallback(arrayBuffer);
        }

        try {
            const texture = await new Promise<any>((resolve, reject) => {
                this.ktx2Loader!.parse(
                    arrayBuffer,
                    (tex: any) => resolve(tex),
                    (err: any) => reject(err)
                );
            });

            if (texture instanceof CompressedTexture) {
                return {
                    width: texture.image.width,
                    height: texture.image.height,
                    data: this.createPlaceholderCanvas("", 1, 1),
                    compressed: true,
                    mimeType: "image/ktx2",
                    compressedTexture: texture as CompressedTexture
                };
            }

            return this.textureToLoadedImage(texture);
        } catch (error) {
            console.warn("[KTX2] Loader failed, trying fallback:", error);
            return await this.decodeKTX2Fallback(arrayBuffer);
        }
    }

    private async decodeKTX2Fallback(arrayBuffer: ArrayBuffer): Promise<LoadedImage> {
        try {
            const ktx = read(new Uint8Array(arrayBuffer));
            const width = ktx.pixelWidth || 256;
            const height = ktx.pixelHeight || 256;

            const canvas = document.createElement("canvas");
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext("2d");
            if (ctx) {
                const imgData = ctx.createImageData(width, height);
                const level0 = ktx.levels[0];
                if (level0) {
                    const data = level0.levelData;
                    const bpp = 4;
                    const srcPixels = new Uint8Array(
                        data.buffer || data,
                        data.byteOffset || 0,
                        Math.min(data.byteLength, width * height * bpp)
                    );
                    const copyLen = Math.min(srcPixels.length, imgData.data.length);
                    imgData.data.set(srcPixels.subarray(0, copyLen));
                }
                ctx.putImageData(imgData, 0, 0);
            }

            return {
                width,
                height,
                data: canvas,
                compressed: false,
                mimeType: "image/png"
            };
        } catch (error) {
            console.warn("KTX2 fallback decode failed:", error);
            return this.createPlaceholderImage("KTX2 (Decode Failed)");
        }
    }

    private async loadWithDDSLoader(arrayBuffer: ArrayBuffer): Promise<LoadedImage> {
        if (!this.ddsLoader) throw new Error("DDSLoader not available");
        const texture = (this.ddsLoader as any).parse(arrayBuffer);
        return this.textureToLoadedImage(texture);
    }

    private async loadWithTGALoader(arrayBuffer: ArrayBuffer): Promise<LoadedImage> {
        if (!this.tgaLoader) throw new Error("TGALoader not available");
        const texture = (this.tgaLoader as any).parse(arrayBuffer);
        return this.textureToLoadedImage(texture);
    }

    private textureToLoadedImage(texture: any): LoadedImage {
        if (texture instanceof CompressedTexture) {
            return {
                width: texture.image.width,
                height: texture.image.height,
                data: this.createPlaceholderCanvas("", 1, 1),
                compressed: true,
                mimeType: "image/ktx2",
                compressedTexture: texture
            };
        }

        if (texture.image) {
            if (texture.image instanceof HTMLCanvasElement) {
                return {
                    width: texture.image.width,
                    height: texture.image.height,
                    data: texture.image,
                    compressed: false,
                    mimeType: "image/png"
                };
            } else if (
                texture.image instanceof HTMLImageElement ||
                texture.image instanceof ImageBitmap
            ) {
                const w = texture.image.width || texture.image.naturalWidth || 256;
                const h = texture.image.height || texture.image.naturalHeight || 256;
                const canvas = document.createElement("canvas");
                canvas.width = w;
                canvas.height = h;
                const ctx = canvas.getContext("2d");
                if (ctx) ctx.drawImage(texture.image, 0, 0);
                return {
                    width: w,
                    height: h,
                    data: canvas,
                    compressed: false,
                    mimeType: "image/png"
                };
            }
        }

        if (texture.mipmaps && texture.mipmaps.length > 0) {
            const mipmap = texture.mipmaps[0];
            if (mipmap.width && mipmap.height) {
                const canvas = document.createElement("canvas");
                canvas.width = mipmap.width;
                canvas.height = mipmap.height;
                const ctx = canvas.getContext("2d");
                if (ctx && mipmap.data) {
                    const imgData = ctx.createImageData(mipmap.width, mipmap.height);
                    const src = new Uint8Array(mipmap.data.buffer || mipmap.data);
                    const dst = imgData.data;
                    const bpp = mipmap.width * mipmap.height * 4;
                    if (src.length >= bpp) {
                        dst.set(src.subarray(0, bpp));
                        ctx.putImageData(imgData, 0, 0);
                    }
                }
                return {
                    width: mipmap.width,
                    height: mipmap.height,
                    data: canvas,
                    compressed: false,
                    mimeType: "image/png"
                };
            }
        }

        return this.createPlaceholderImage("Texture");
    }

    private async loadStandardImage(
        arrayBuffer: ArrayBuffer,
        mimeType: string
    ): Promise<LoadedImage> {
        const blob = new Blob([arrayBuffer], { type: mimeType });

        if (typeof createImageBitmap === "function") {
            try {
                const imageBitmap = await createImageBitmap(blob);
                return {
                    width: imageBitmap.width,
                    height: imageBitmap.height,
                    data: imageBitmap,
                    compressed: false,
                    mimeType
                };
            } catch (error) {
                console.warn("createImageBitmap failed:", error);
            }
        }

        const image = await this.loadImageElement(blob);
        return {
            width: image.width,
            height: image.height,
            data: image,
            compressed: false,
            mimeType
        };
    }

    private loadImageElement(blob: Blob): Promise<HTMLImageElement> {
        return new Promise((resolve, reject) => {
            const url = URL.createObjectURL(blob);
            const img = new Image();
            img.onload = () => {
                URL.revokeObjectURL(url);
                resolve(img);
            };
            img.onerror = error => {
                URL.revokeObjectURL(url);
                reject(new Error(`Failed to load image: ${error}`));
            };
            img.src = url;
        });
    }

    private createPlaceholderImage(text: string): LoadedImage {
        const canvas = this.createPlaceholderCanvas(text, 256, 256);
        return {
            width: canvas.width,
            height: canvas.height,
            data: canvas,
            compressed: false,
            mimeType: "image/png"
        };
    }

    private createPlaceholderCanvas(
        text: string,
        width: number,
        height: number
    ): HTMLCanvasElement {
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext("2d");
        if (!ctx) return canvas;

        if (text) {
            ctx.fillStyle = "#2a2a2a";
            ctx.fillRect(0, 0, width, height);

            ctx.strokeStyle = "#3a3a3a";
            ctx.lineWidth = 1;
            const gridSize = 32;
            for (let x = 0; x <= width; x += gridSize) {
                ctx.beginPath();
                ctx.moveTo(x, 0);
                ctx.lineTo(x, height);
                ctx.stroke();
            }
            for (let y = 0; y <= height; y += gridSize) {
                ctx.beginPath();
                ctx.moveTo(0, y);
                ctx.lineTo(width, y);
                ctx.stroke();
            }

            ctx.fillStyle = "#8a8a8a";
            ctx.font = "bold 18px Arial, sans-serif";
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText(text, width / 2, height / 2 - 15);
            ctx.font = "14px Arial, sans-serif";
            ctx.fillText(`${width}x${height}`, width / 2, height / 2 + 15);
        }

        return canvas;
    }
}

export const imageLoader = new ImageLoader();
