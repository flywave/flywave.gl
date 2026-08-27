declare function deltaDecode(data: any, shape: any): any;
declare class MRTError extends Error {
    constructor(message: any);
}
declare const VERSION = "2.0.1";
declare class MapboxRasterTile {
    constructor(cacheSize?: number);
    getLayer(layerName: any): any;
    getHeaderLength(buf: any): any;
    parseHeader(buf: any): this;
    createDecodingTask(range: any): MRTDecodingBatch;
}
declare class MapboxRasterLayer {
    constructor({ version, name, units, tileSize, pixelFormat, buffer, dataIndex }: {
        version: any;
        name: any;
        units: any;
        tileSize: any;
        pixelFormat: any;
        buffer: any;
        dataIndex: any;
    }, config: any);
    get dimension(): any;
    get cacheSize(): any;
    getBandList(): any;
    processDecodedData(result: any): void;
    getBlockForBand(band: any): {
        bandIndex: any;
        blockIndex: any;
        blockBandIndex: any;
    } | {
        blockIndex: number;
        blockBandIndex: number;
        bandIndex?: undefined;
    };
    getDataRange(bandList: any): {
        layerName: any;
        firstByte: any;
        lastByte: number;
        blockIndices: any[];
    };
    hasBand(band: any): boolean;
    hasDataForBand(band: any): boolean;
    getBandView(band: any): {
        data: any;
        bytes: any;
        tileSize: any;
        buffer: any;
        pixelFormat: any;
        dimension: any;
        offset: any;
        scale: any;
    };
}
declare class MRTDecodingBatch {
    constructor(tasks: any, onCancel: any, onComplete: any);
    cancel(): void;
    complete(err: any, result: any): void;
}
export { MRTDecodingBatch, MRTError, MapboxRasterTile, MapboxRasterLayer, VERSION, deltaDecode };
//# sourceMappingURL=mrt.d.ts.map