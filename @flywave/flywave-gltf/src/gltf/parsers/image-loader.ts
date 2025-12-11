// image-loader.ts
// import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';
import { DDSLoader } from 'three/examples/jsm/loaders/DDSLoader.js';
import { TGALoader } from 'three/examples/jsm/loaders/TGALoader.js';
import { WebGLRenderer } from 'three';
// import { read } from 'ktx-parse';

export interface LoadedImage {
    width: number;
    height: number;
    data: ImageBitmap | HTMLImageElement | HTMLCanvasElement;
    compressed: boolean;
    mimeType: string;
}

const webglRenderInstance = new WebGLRenderer();

export class ImageLoader {
    private ktx2Loader?: any;
    private ddsLoader?: DDSLoader;
    private tgaLoader?: TGALoader;

    constructor(webglRender: WebGLRenderer =webglRenderInstance) {
        // 初始化加载器，但KTX2Loader在没有renderer时可能无法工作
        // 我们会处理这种情况
        try {
            this.ddsLoader = new DDSLoader();
            this.tgaLoader = new TGALoader();

            // 尝试创建KTX2Loader，但不设置renderer
            // this.ktx2Loader = new KTX2Loader();
            // 设置transcoder路径
            this.ktx2Loader.setTranscoderPath('https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/libs/basis/');
            this.ktx2Loader.detectSupport(webglRender);

        } catch (error) {
            console.warn('Some Three.js loaders failed to initialize:', error);
        }
    }

    // 检测图片格式
    detectFormat(arrayBuffer: ArrayBuffer): string {
        if (arrayBuffer.byteLength < 4) return 'unknown';

        const view = new Uint8Array(arrayBuffer, 0, 4);

        // KTX2
        if (this.isKTX2(arrayBuffer)) return 'ktx2';

        // DDS
        if (view[0] === 0x44 && view[1] === 0x44 && view[2] === 0x53 && view[3] === 0x20) {
            return 'dds';
        }

        // TGA（简化检测）
        if (arrayBuffer.byteLength > 18) {
            const tgaHeader = new Uint8Array(arrayBuffer, 0, 18);
            const imageType = tgaHeader[2];
            if ([1, 2, 3, 9, 10, 11].includes(imageType)) {
                return 'tga';
            }
        }

        // PNG
        if (view[0] === 0x89 && view[1] === 0x50 && view[2] === 0x4E && view[3] === 0x47) {
            return 'png';
        }

        // JPEG
        if (view[0] === 0xFF && view[1] === 0xD8) return 'jpeg';

        // WebP
        if (view[0] === 0x52 && view[1] === 0x49 && view[2] === 0x46 && view[3] === 0x46) {
            if (arrayBuffer.byteLength > 12) {
                const webpView = new Uint8Array(arrayBuffer, 8, 4);
                if (webpView[0] === 0x57 && webpView[1] === 0x45 && webpView[2] === 0x42 && webpView[3] === 0x50) {
                    return 'webp';
                }
            }
        }

        // BMP
        if (view[0] === 0x42 && view[1] === 0x4D) return 'bmp';

        // GIF
        if (view[0] === 0x47 && view[1] === 0x49 && view[2] === 0x46) return 'gif';

        return 'unknown';
    }

    private isKTX2(arrayBuffer: ArrayBuffer): boolean {
        if (arrayBuffer.byteLength < 12) return false;
        const header = new Uint8Array(arrayBuffer, 0, 12);
        const ktx2Identifier = [0xAB, 0x4B, 0x54, 0x58, 0x20, 0x32, 0x30, 0xBB, 0x0D, 0x0A, 0x1A, 0x0A];
        return header.every((byte, i) => byte === ktx2Identifier[i]);
    }

    // 主加载方法
    async load(arrayBuffer: ArrayBuffer, mimeType?: string): Promise<LoadedImage> {
        const format = this.detectFormat(arrayBuffer);

        try {
            switch (format) {
                case 'ktx2':
                    // 尝试使用KTX2Loader，如果失败则降级
                    try {
                        if (this.ktx2Loader) {
                            const result = await this.loadWithKTX2Loader(arrayBuffer);
                            if (result) return result;
                        }
                    } catch (error) {
                        console.warn('KTX2Loader failed:', error);
                    }
                    // KTX2加载失败，尝试其他方法
                    return await this.decodeKTX2Fallback(arrayBuffer);

                case 'dds':
                    if (this.ddsLoader) {
                        return await this.loadWithDDSLoader(arrayBuffer);
                    }
                    break;

                case 'tga':
                    if (this.tgaLoader) {
                        return await this.loadWithTGALoader(arrayBuffer);
                    }
                    break;

                case 'png':
                case 'jpeg':
                case 'webp':
                case 'bmp':
                case 'gif':
                    return await this.loadStandardImage(arrayBuffer, mimeType || `image/${format}`);

                default:
                    // 尝试作为标准图片加载
                    return await this.loadStandardImage(arrayBuffer, mimeType || 'image/png');
            }
        } catch (error) {
            console.warn(`Failed to load ${format} image:`, error);
        }

        // 所有方法都失败，使用标准方法
        return await this.loadStandardImage(arrayBuffer, mimeType || 'image/png');
    }

    // 使用KTX2Loader加载
    private async loadWithKTX2Loader(arrayBuffer: ArrayBuffer): Promise<LoadedImage> {
        return new Promise((resolve, reject) => {
            if (!this.ktx2Loader) {
                reject(new Error('KTX2Loader not available'));
                return;
            }

            const blob = new Blob([arrayBuffer], { type: 'image/ktx2' });
            const url = URL.createObjectURL(blob);

            this.ktx2Loader.load(
                url,
                (texture) => {
                    URL.revokeObjectURL(url);
                    this.handleThreeTexture(texture, resolve, 'KTX2');
                },
                undefined,
                (error) => {
                    URL.revokeObjectURL(url);
                    reject(error);
                }
            );
        });
    }

    // KTX2降级解码方案
    private async decodeKTX2Fallback(arrayBuffer: ArrayBuffer): Promise<LoadedImage> {
        console.log('Using fallback KTX2 decoder');

        // 方案1：尝试使用ktx-parse解析基本信息
        try { 
            const ktx = undefined;// read(new Uint8Array(arrayBuffer));
            console.log('KTX2 Info:', ktx);
            // 创建占位图，显示KTX2信息
            const canvas = document.createElement('canvas');
            canvas.width = Math.max(ktx.pixelWidth, 256);
            canvas.height = Math.max(ktx.pixelHeight, 256);

            const ctx = canvas.getContext('2d');
            if (ctx) {
                ctx.fillStyle = '#1a1a1a';
                ctx.fillRect(0, 0, canvas.width, canvas.height);

                ctx.fillStyle = '#4a9eff';
                ctx.font = 'bold 20px Arial';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText('KTX2 Texture', canvas.width / 2, canvas.height / 2 - 30);

                ctx.font = '16px Arial';
                ctx.fillText(`${ktx.pixelWidth}×${ktx.pixelHeight}`, canvas.width / 2, canvas.height / 2);
                ctx.fillText(`${ktx.levelCount} mipmaps`, canvas.width / 2, canvas.height / 2 + 30);
            }

            return {
                width: canvas.width,
                height: canvas.height,
                data: canvas,
                compressed: false,
                mimeType: 'image/png'
            };
        } catch (error) {
            console.warn('ktx-parse failed:', error);
        }

        // 方案2：使用纯占位图
        return this.createPlaceholderImage('KTX2 (Decode Failed)');
    }

    // 使用DDSLoader加载
    private async loadWithDDSLoader(arrayBuffer: ArrayBuffer): Promise<LoadedImage> {
        return new Promise((resolve, reject) => {
            if (!this.ddsLoader) {
                reject(new Error('DDSLoader not available'));
                return;
            }

            try {
                // DDSLoader的parse方法是同步的
                const texture = (this.ddsLoader as any).parse(arrayBuffer);
                this.handleThreeTexture(texture, resolve, 'DDS');
            } catch (error) {
                reject(error);
            }
        });
    }

    // 使用TGALoader加载
    private async loadWithTGALoader(arrayBuffer: ArrayBuffer): Promise<LoadedImage> {
        return new Promise((resolve, reject) => {
            if (!this.tgaLoader) {
                reject(new Error('TGALoader not available'));
                return;
            }

            try {
                const texture = (this.tgaLoader as any).parse(arrayBuffer);
                this.handleThreeTexture(texture, resolve, 'TGA');
            } catch (error) {
                reject(error);
            }
        });
    }

    // 处理Three.js纹理对象的通用方法
    private handleThreeTexture(
        texture: any,
        resolve: (value: LoadedImage) => void,
        format: string
    ): void {
        let canvas: HTMLCanvasElement;

        if (texture.image) {
            // 如果已经有image数据
            if (texture.image instanceof HTMLCanvasElement) {
                canvas = texture.image;
            } else if (texture.image instanceof HTMLImageElement || texture.image instanceof ImageBitmap) {
                canvas = document.createElement('canvas');
                canvas.width = texture.image.width || texture.image.naturalWidth || 256;
                canvas.height = texture.image.height || texture.image.naturalHeight || 256;

                const ctx = canvas.getContext('2d');
                if (ctx) {
                    ctx.drawImage(texture.image, 0, 0);
                }
            } else {
                // 其他类型，创建占位图
                canvas = this.createPlaceholderCanvas(format, 256, 256);
            }
        } else {
            // 没有image数据，创建占位图
            canvas = this.createPlaceholderCanvas(format, 256, 256);
        }

        resolve({
            width: canvas.width,
            height: canvas.height,
            data: canvas,
            compressed: false,
            mimeType: 'image/png'
        });
    }

    // 加载标准图片格式
    private async loadStandardImage(arrayBuffer: ArrayBuffer, mimeType: string): Promise<LoadedImage> {
        const blob = new Blob([arrayBuffer], { type: mimeType });

        // 优先使用ImageBitmap
        if (typeof createImageBitmap === 'function') {
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
                console.warn('createImageBitmap failed:', error);
            }
        }

        // 回退到HTMLImageElement
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

            img.onerror = (error) => {
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
            mimeType: 'image/png'
        };
    }

    private createPlaceholderCanvas(text: string, width: number, height: number): HTMLCanvasElement {
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        if (!ctx) return canvas;

        // 背景
        ctx.fillStyle = '#2a2a2a';
        ctx.fillRect(0, 0, width, height);

        // 网格
        ctx.strokeStyle = '#3a3a3a';
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

        // 文字
        ctx.fillStyle = '#8a8a8a';
        ctx.font = 'bold 18px Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, width / 2, height / 2 - 15);

        ctx.font = '14px Arial, sans-serif';
        ctx.fillText(`${width}×${height}`, width / 2, height / 2 + 15);

        return canvas;
    }
}

// 创建一个全局实例方便使用
export const imageLoader = new ImageLoader();