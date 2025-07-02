import { ITileDecoder, RequestController, TileInfo } from "@flywave/flywave-datasource-protocol";
import { Projection, TileKey } from "@flywave/flywave-geoutils";

import { RESTER_DEM_TILE_DECODER_ID } from "../Constants";
import DEMData, { DEMEncoding } from "./DemData";

interface DecodeTileParams {
    uid: string;
    encoding: DEMEncoding;
    rawImageData: ImageBitmap | ImageData;
    padding: number;
    buildQuadTree: boolean;
}

export interface DecodeTileResult {
    dem: DEMData;
    geometries: any[];
    techniques: any[];
}

class RasterDEMTileWorkerSource implements ITileDecoder {
    private _offscreenCanvas?: OffscreenCanvas;
    private _offscreenContext?: OffscreenCanvasRenderingContext2D;
    private _isDisposed = false;

    async getTileInfo(
        data: ArrayBufferLike | {},
        tileKey: TileKey,
        projection: Projection,
        requestController?: RequestController
    ): Promise<TileInfo | undefined> {
        if (this._isDisposed) {
            throw new Error("Worker source has been disposed");
        }

        try {
            if (!(data instanceof ArrayBuffer)) return;

            const startTime = performance.now();
            return {
                tileKey: tileKey,
                setupTime: performance.now() - startTime, // 添加耗时统计
                numBytes: data.byteLength, // 添加字节长度
                transferList: [data] // 添加传输列表
            };
        } catch (error) {
            requestController?.abort();
            return undefined;
        }
    }

    dispose(): void {
        if (this._isDisposed) return;

        this._offscreenContext = undefined;
        this._offscreenCanvas = undefined;
        this._isDisposed = true;
    }

    connect(): Promise<void> {
        if (this._isDisposed) {
            throw new Error("Worker source has been disposed");
        }
        return Promise.resolve();
    }

    configure(): void {
        if (this._isDisposed) {
            throw new Error("Worker source has been disposed");
        }
        // Configuration implementation if needed
    }

    async decodeTile(params: DecodeTileParams): Promise<DecodeTileResult> {
        if (this._isDisposed) {
            throw new Error("Worker source has been disposed");
        }

        // eslint-disable-next-line no-useless-catch
        try {
            const { uid, encoding, rawImageData, padding, buildQuadTree } = params;

            // Validate input parameters
            if (padding < 0 || padding > 10) {
                throw new Error(`Invalid padding value: ${padding}`);
            }

            const imagePixels = await this._getImageData(rawImageData, padding);
            const dem = new DEMData(uid, imagePixels, encoding, padding < 1, buildQuadTree);

            // Parallelize these operations when possible
            await Promise.all([
                dem.buildDisplacementMap(),
                buildQuadTree ? dem.buildQuadTree() : Promise.resolve()
            ]);

            return {
                dem,
                geometries: [],
                techniques: []
            };
        } catch (error) {
            throw error;
        }
    }

    private async _getImageData(
        imgSource: ImageBitmap | ImageData,
        padding: number
    ): Promise<ImageData> {
        if (imgSource instanceof ImageData) {
            return await this._handleImageData(imgSource, padding);
        }
        return await this._handleImageBitmap(imgSource, padding);
    }

    private async _handleImageData(imgData: ImageData, padding: number): Promise<ImageData> {
        if (padding === 0) {
            return imgData;
        }

        // Create a new ImageData with padding
        const paddedWidth = imgData.width + 2 * padding;
        const paddedHeight = imgData.height + 2 * padding;
        const paddedData = new Uint8ClampedArray(paddedWidth * paddedHeight * 4);

        // Center the original image in the padded result
        const rowBytes = imgData.width * 4;
        for (let y = 0; y < imgData.height; y++) {
            const srcOffset = y * rowBytes;
            const dstOffset = ((y + padding) * paddedWidth + padding) * 4;
            paddedData.set(imgData.data.subarray(srcOffset, srcOffset + rowBytes), dstOffset);
        }

        return new ImageData(paddedData, paddedWidth, paddedHeight, {
            colorSpace: imgData.colorSpace
        });
    }

    private async _handleImageBitmap(imgBitmap: ImageBitmap, padding: number): Promise<ImageData> {
        if (
            !this._offscreenCanvas ||
            this._offscreenCanvas.width !== imgBitmap.width ||
            this._offscreenCanvas.height !== imgBitmap.height
        ) {
            this._initializeCanvas(imgBitmap.width, imgBitmap.height);
        }

        if (!this._offscreenContext) {
            throw new Error("Failed to initialize offscreen canvas context");
        }

        // eslint-disable-next-line no-useless-catch
        try {
            // Draw the image
            this._offscreenContext.drawImage(imgBitmap, 0, 0);

            // Get image data with padding
            const imgData = this._offscreenContext.getImageData(
                -padding,
                -padding,
                imgBitmap.width + 2 * padding,
                imgBitmap.height + 2 * padding
            );

            // Clear the canvas for next operation
            this._offscreenContext.clearRect(0, 0, imgBitmap.width, imgBitmap.height);

            return imgData;
        } catch (error) {
            throw error;
        }
    }

    private _initializeCanvas(width: number, height: number): void {
        this._offscreenCanvas = new OffscreenCanvas(width, height);
        this._offscreenContext = this._offscreenCanvas.getContext("2d", {
            willReadFrequently: true,
            alpha: false // DEM tiles typically don't need alpha
        }) as OffscreenCanvasRenderingContext2D;

        if (this._offscreenContext) {
            this._offscreenContext.imageSmoothingEnabled = false; // Better for DEM data
        } else {
            throw new Error("Could not create 2D context for OffscreenCanvas");
        }
    }
}

export { RESTER_DEM_TILE_DECODER_ID, RasterDEMTileWorkerSource };
