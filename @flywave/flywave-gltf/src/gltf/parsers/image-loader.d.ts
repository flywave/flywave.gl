import { WebGLRenderer } from 'three';
export interface LoadedImage {
    width: number;
    height: number;
    data: ImageBitmap | HTMLImageElement | HTMLCanvasElement;
    compressed: boolean;
    mimeType: string;
}
export declare class ImageLoader {
    private ktx2Loader?;
    private ddsLoader?;
    private tgaLoader?;
    constructor(webglRender?: WebGLRenderer);
    detectFormat(arrayBuffer: ArrayBuffer): string;
    private isKTX2;
    load(arrayBuffer: ArrayBuffer, mimeType?: string): Promise<LoadedImage>;
    private loadWithKTX2Loader;
    private decodeKTX2Fallback;
    private loadWithDDSLoader;
    private loadWithTGALoader;
    private handleThreeTexture;
    private loadStandardImage;
    private loadImageElement;
    private createPlaceholderImage;
    private createPlaceholderCanvas;
}
export declare const imageLoader: ImageLoader;
