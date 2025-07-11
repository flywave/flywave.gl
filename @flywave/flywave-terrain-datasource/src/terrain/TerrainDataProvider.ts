import {
    BoundingSphere,
    normalizedEquirectangularProjection,
    TileKey,
    TilingScheme,
    webMercatorProjection
} from "@flywave/flywave-geoutils";
import { DataProvider } from "@flywave/flywave-mapview-decoder";
import { TransferManager } from "@flywave/flywave-transfer-manager";
import {
    defaultValue,
    defined,
    formatUrl,
    getJsonFromTypedArray,
    IndexDatatype
} from "@flywave/flywave-utils";
import * as THREE from "three";

import { zigZagDeltaDecode } from "./decoder/Decoder";
import QuantizedMeshTerrainData from "./decoder/TerrainData";
import TileAvailability from "./TileAvailability";
import { TinMeshResourceTile, TinTerrainLoader } from "./TinTerrainLoader";
import { TinTerrainProvider } from "./TinTerrainProvider";
import { TinTerrainSource } from "./TinTerrainSource";

const downloadManager = TransferManager.instance();

class GeographicTilingScheme {
    private readonly _numberOfLevelZeroTilesX: number = 2;
    private readonly _numberOfLevelZeroTilesY: number = 1;

    constructor({
        numberOfLevelZeroTilesX,
        numberOfLevelZeroTilesY
    }: {
        numberOfLevelZeroTilesX?: number;
        numberOfLevelZeroTilesY?: number;
    }) {
        this._numberOfLevelZeroTilesX = numberOfLevelZeroTilesX ?? this._numberOfLevelZeroTilesX;
        this._numberOfLevelZeroTilesY = numberOfLevelZeroTilesY ?? this._numberOfLevelZeroTilesY;
    }

    getSubdivisionX(): number {
        return 2;
    }

    getSubdivisionY(level: number): number {
        return 2;
    }

    getLevelDimensionX(level: number): number {
        return this._numberOfLevelZeroTilesX << level;
    }

    getLevelDimensionY(level: number): number {
        return this._numberOfLevelZeroTilesY << level;
    }
}

const QuantizedMeshExtensionIds = {
    /**
     * Oct-Encoded Per-Vertex Normals are included as an extension to the tile mesh
     *
     * @type {Number}
     * @constant
     * @default 1
     */
    OCT_VERTEX_NORMALS: 1,
    /**
     * A watermask is included as an extension to the tile mesh
     *
     * @type {Number}
     * @constant
     * @default 2
     */
    WATER_MASK: 2,
    /**
     * A json object contain metadata about the tile
     *
     * @type {Number}
     * @constant
     * @default 4
     */
    METADATA: 4
};

function createQuantizedMeshTerrainData(
    provider: TerrainDataProvider,
    buffer: ArrayBuffer,
    level: number,
    x: number,
    y: number,
    layer: LayerInformation
): QuantizedMeshTerrainData {
    const littleEndianExtensionSize = layer.littleEndianExtensionSize;
    let pos = 0;
    const cartesian3Elements = 3;
    const boundingSphereElements = cartesian3Elements + 1;
    const cartesian3Length = Float64Array.BYTES_PER_ELEMENT * cartesian3Elements;
    const boundingSphereLength = Float64Array.BYTES_PER_ELEMENT * boundingSphereElements;
    const encodedVertexElements = 3;
    const encodedVertexLength = Uint16Array.BYTES_PER_ELEMENT * encodedVertexElements;
    const triangleElements = 3;
    let bytesPerIndex = Uint16Array.BYTES_PER_ELEMENT;
    const triangleLength = bytesPerIndex * triangleElements;

    const view = new DataView(buffer);
    const center = new THREE.Vector3(
        view.getFloat64(pos, true),
        view.getFloat64(pos + 8, true),
        view.getFloat64(pos + 16, true)
    );
    pos += cartesian3Length;

    const minimumHeight = view.getFloat32(pos, true);
    pos += Float32Array.BYTES_PER_ELEMENT;
    const maximumHeight = view.getFloat32(pos, true);
    pos += Float32Array.BYTES_PER_ELEMENT;

    const boundingSphere = new BoundingSphere(
        new THREE.Vector3(
            view.getFloat64(pos, true),
            view.getFloat64(pos + 8, true),
            view.getFloat64(pos + 16, true)
        ),
        view.getFloat64(pos + cartesian3Length, true)
    );
    pos += boundingSphereLength;

    const horizonOcclusionPoint = new THREE.Vector3(
        view.getFloat64(pos, true),
        view.getFloat64(pos + 8, true),
        view.getFloat64(pos + 16, true)
    );
    pos += cartesian3Length;

    const vertexCount = view.getUint32(pos, true);
    pos += Uint32Array.BYTES_PER_ELEMENT;
    const encodedVertexBuffer = new Uint16Array(buffer, pos, vertexCount * 3);
    pos += vertexCount * encodedVertexLength;

    if (vertexCount > 64 * 1024) {
        // More than 64k vertices, so indices are 32-bit.
        bytesPerIndex = Uint32Array.BYTES_PER_ELEMENT;
    }

    // Decode the vertex buffer.
    const uBuffer = encodedVertexBuffer.subarray(0, vertexCount);
    const vBuffer = encodedVertexBuffer.subarray(vertexCount, 2 * vertexCount);
    const heightBuffer = encodedVertexBuffer.subarray(vertexCount * 2, 3 * vertexCount);

    zigZagDeltaDecode(uBuffer, vBuffer, heightBuffer);

    // skip over any additional padding that was added for 2/4 byte alignment
    if (pos % bytesPerIndex !== 0) {
        pos += bytesPerIndex - (pos % bytesPerIndex);
    }

    const triangleCount = view.getUint32(pos, true);
    pos += Uint32Array.BYTES_PER_ELEMENT;
    const indices = IndexDatatype.createTypedArrayFromArrayBuffer(
        vertexCount,
        buffer,
        pos,
        triangleCount * triangleElements
    );
    pos += triangleCount * triangleLength;

    // High water mark decoding based on decompressIndices_ in webgl-loader's loader.js.
    // https://code.google.com/p/webgl-loader/source/browse/trunk/samples/loader.js?r=99#55
    // Copyright 2012 Google Inc., Apache 2.0 license.
    let highest = 0;
    const length = indices.length;
    for (let i = 0; i < length; ++i) {
        const code = indices[i];
        indices[i] = highest - code;
        if (code === 0) {
            ++highest;
        }
    }

    const westVertexCount = view.getUint32(pos, true);
    pos += Uint32Array.BYTES_PER_ELEMENT;
    const westIndices = IndexDatatype.createTypedArrayFromArrayBuffer(
        vertexCount,
        buffer,
        pos,
        westVertexCount
    );
    pos += westVertexCount * bytesPerIndex;

    const southVertexCount = view.getUint32(pos, true);
    pos += Uint32Array.BYTES_PER_ELEMENT;
    const southIndices = IndexDatatype.createTypedArrayFromArrayBuffer(
        vertexCount,
        buffer,
        pos,
        southVertexCount
    );
    pos += southVertexCount * bytesPerIndex;

    const eastVertexCount = view.getUint32(pos, true);
    pos += Uint32Array.BYTES_PER_ELEMENT;
    const eastIndices = IndexDatatype.createTypedArrayFromArrayBuffer(
        vertexCount,
        buffer,
        pos,
        eastVertexCount
    );
    pos += eastVertexCount * bytesPerIndex;

    const northVertexCount = view.getUint32(pos, true);
    pos += Uint32Array.BYTES_PER_ELEMENT;
    const northIndices = IndexDatatype.createTypedArrayFromArrayBuffer(
        vertexCount,
        buffer,
        pos,
        northVertexCount
    );
    pos += northVertexCount * bytesPerIndex;

    let encodedNormalBuffer: Uint8Array | undefined;
    let waterMaskBuffer: Uint8Array | undefined;
    while (pos < view.byteLength) {
        const extensionId = view.getUint8(pos);
        pos += Uint8Array.BYTES_PER_ELEMENT;
        const extensionLength = view.getUint32(pos, littleEndianExtensionSize);
        pos += Uint32Array.BYTES_PER_ELEMENT;

        if (
            extensionId === QuantizedMeshExtensionIds.OCT_VERTEX_NORMALS &&
            provider.requestVertexNormals
        ) {
            encodedNormalBuffer = new Uint8Array(buffer, pos, vertexCount * 2);
        } else if (
            extensionId === QuantizedMeshExtensionIds.WATER_MASK &&
            provider.requestWaterMask
        ) {
            waterMaskBuffer = new Uint8Array(buffer, pos, extensionLength);
        } else if (extensionId === QuantizedMeshExtensionIds.METADATA && provider.requestMetadata) {
            const stringLength = view.getUint32(pos, true);
            if (stringLength > 0) {
                const metadata = getJsonFromTypedArray(
                    new Uint8Array(buffer),
                    pos + Uint32Array.BYTES_PER_ELEMENT,
                    stringLength
                );
                const availableTiles = metadata.available;
                if (defined(availableTiles)) {
                    for (let offset = 0; offset < availableTiles.length; ++offset) {
                        const availableLevel = level + offset + 1;
                        const rangesAtLevel = availableTiles[offset];
                        const yTiles =
                            provider.tilingScheme.subdivisionScheme.getLevelDimensionY(
                                availableLevel
                            );

                        for (let rangeIndex = 0; rangeIndex < rangesAtLevel.length; ++rangeIndex) {
                            const range = rangesAtLevel[rangeIndex];
                            const yStart = yTiles - range.endY - 1;
                            const yEnd = yTiles - range.startY - 1;
                            provider.availability.addAvailableTileRange(
                                availableLevel,
                                range.startX,
                                yStart,
                                range.endX,
                                yEnd
                            );
                            layer.availability.addAvailableTileRange(
                                availableLevel,
                                range.startX,
                                yStart,
                                range.endX,
                                yEnd
                            );
                        }
                    }
                }
            }
            layer.availabilityTilesLoaded.addAvailableTileRange(level, x, y, x, y);
        }
        pos += extensionLength;
    }

    const skirtHeight = provider.getLevelMaximumGeometricError(level) * 50.0;

    let texture: THREE.DataTexture | undefined;
    if (waterMaskBuffer) {
        const textureSize = Math.sqrt(waterMaskBuffer.length);
        texture = new THREE.DataTexture(
            waterMaskBuffer,
            textureSize,
            textureSize,
            THREE.RedFormat,
            THREE.UnsignedByteType
        );
        texture.minFilter = THREE.LinearFilter;
        texture.magFilter = THREE.LinearFilter;
        texture.generateMipmaps = false;
        texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
    }
    return new QuantizedMeshTerrainData({
        center: center,
        minimumHeight: minimumHeight,
        maximumHeight: maximumHeight,
        boundingSphere: boundingSphere,
        horizonOcclusionPoint: horizonOcclusionPoint,
        quantizedVertices: encodedVertexBuffer,
        encodedNormals: encodedNormalBuffer,
        indices: indices,
        westIndices: westIndices,
        southIndices: southIndices,
        eastIndices: eastIndices,
        northIndices: northIndices,
        westSkirtHeight: skirtHeight,
        southSkirtHeight: skirtHeight,
        eastSkirtHeight: skirtHeight,
        northSkirtHeight: skirtHeight,
        childTileMask: provider.availability.computeChildMaskForTile(level, x, y),
        waterMask: texture
    });
}

function getRequestHeader(extensionsList?: string[]): { Accept: string } {
    if (!defined(extensionsList) || extensionsList.length === 0) {
        return {
            Accept: "application/vnd.quantized-mesh,application/octet-stream;q=0.9,*/*;q=0.01"
        };
    }
    const extensions = extensionsList.join("-");
    return {
        Accept:
            "application/vnd.quantized-mesh;extensions=" +
            extensions +
            ",application/octet-stream;q=0.9,*/*;q=0.01"
    };
}

function getAvailabilityTile(
    layer: LayerInformation,
    x: number,
    y: number,
    level: number
): { level: number; x: number; y: number } | undefined {
    if (level === 0) {
        return;
    }

    const availabilityLevels = layer.availabilityLevels;
    const parentLevel =
        level % availabilityLevels === 0
            ? level - availabilityLevels
            : ((level / availabilityLevels) | 0) * availabilityLevels;
    const divisor = 1 << (level - parentLevel);
    const parentX = (x / divisor) | 0;
    const parentY = (y / divisor) | 0;

    return {
        level: parentLevel,
        x: parentX,
        y: parentY
    };
}

function checkLayer(
    provider: TerrainDataProvider,
    x: number,
    y: number,
    level: number,
    layer: LayerInformation,
    topLayer: boolean
): { result: boolean; promise?: Promise<any> } {
    if (!defined(layer.availabilityLevels)) {
        // It's definitely not in this layer
        return {
            result: false
        };
    }

    let cacheKey: string;
    const deleteFromCache = function () {
        delete layer.availabilityPromiseCache[cacheKey];
    };
    const availabilityTilesLoaded = layer.availabilityTilesLoaded;
    const availability = layer.availability;

    let tile = getAvailabilityTile(layer, x, y, level);
    while (defined(tile)) {
        if (
            availability.isTileAvailable(tile.level, tile.x, tile.y) &&
            !availabilityTilesLoaded.isTileAvailable(tile.level, tile.x, tile.y)
        ) {
            let requestPromise: Promise<any> | undefined;
            if (!topLayer) {
                cacheKey = `${tile.level}-${tile.x}-${tile.y}`;
                requestPromise = layer.availabilityPromiseCache[cacheKey];
                if (!defined(requestPromise)) {
                    requestPromise = provider.loadTinTerrainBuffer(tile, layer);
                    if (defined(requestPromise)) {
                        layer.availabilityPromiseCache[cacheKey] = requestPromise;
                        requestPromise.then(deleteFromCache);
                    }
                }
            }

            // The availability tile is available, but not loaded, so there
            //  is still a chance that it may become available at some point
            return {
                result: true,
                promise: requestPromise
            };
        }

        tile = getAvailabilityTile(layer, tile.x, tile.y, tile.level);
    }

    return {
        result: false
    };
}

class LayerInformation {
    resource: any;
    version: string;
    isHeightmap: boolean;
    tileUrlTemplates: string[];
    availability: TileAvailability;
    hasVertexNormals: boolean;
    hasWaterMask: boolean;
    hasMetadata: boolean;
    availabilityLevels: number;
    availabilityTilesLoaded: TileAvailability;
    littleEndianExtensionSize: boolean;
    availabilityPromiseCache: Record<string, Promise<any>> = {};

    constructor(layer: {
        resource?: any;
        version: string;
        isHeightmap: boolean;
        tileUrlTemplates: string[];
        availability: TileAvailability;
        hasVertexNormals: boolean;
        hasWaterMask: boolean;
        hasMetadata: boolean;
        availabilityLevels: number;
        availabilityTilesLoaded: TileAvailability;
        littleEndianExtensionSize: boolean;
    }) {
        this.resource = layer.resource;
        this.version = layer.version;
        this.isHeightmap = layer.isHeightmap;
        this.tileUrlTemplates = layer.tileUrlTemplates;
        this.availability = layer.availability;
        this.hasVertexNormals = layer.hasVertexNormals;
        this.hasWaterMask = layer.hasWaterMask;
        this.hasMetadata = layer.hasMetadata;
        this.availabilityLevels = layer.availabilityLevels;
        this.availabilityTilesLoaded = layer.availabilityTilesLoaded;
        this.littleEndianExtensionSize = layer.littleEndianExtensionSize;
    }
}

class TerrainDataProvider extends DataProvider {
    private readonly _requestWaterMask: boolean;
    private readonly _requestMetadata: boolean;
    private readonly _requestVertexNormals: boolean;
    private _readyPromise: { reslove: (value: boolean) => void; reject: (reason?: any) => void };
    private _ready: boolean = false;
    private _hasWaterMask: boolean = false;
    private _hasVertexNormals: boolean = false;
    private _hasMetadata: boolean = false;
    private readonly _layers: LayerInformation[] = [];
    private _availability: TileAvailability;
    private _levelZeroMaximumGeometricError: number;
    private _scheme: string;
    private metadataError: any;
    private _tilingScheme: TilingScheme;
    private readonly _heightmapWidth: number = 65;
    private readonly _skirtHeight: number;

    public get scheme() {
        return this._scheme;
    }

    public get tilingScheme() {
        return this._tilingScheme;
    }

    public get requestWaterMask() {
        return this._requestWaterMask;
    }

    public get requestMetadata() {
        return this._requestMetadata;
    }

    public get requestVertexNormals() {
        return this._requestVertexNormals;
    }

    public get availability() {
        return this._availability;
    }

    url: string;
    request: {
        headers: Record<string, string>;
        queryString: string;
    };

    dataSource: TinTerrainSource;
    csgDatas: any[] = [];
    attribution: string = "";
    overallAvailability: any[] = [];
    overallMaxZoom: number = 0;
    overallMinZoom: number = Number.MAX_SAFE_INTEGER;

    constructor(
        options: {
            requestWaterMask?: boolean;
            requestMetadata?: boolean;
            requestVertexNormals?: boolean;
            url: string;
            headers?: Record<string, string>;
            queryString?: string;
            skirtHeight?: number;
        },
        dataSource: any
    ) {
        super();
        this._requestWaterMask = defaultValue(options.requestWaterMask, false);
        this._requestMetadata = defaultValue(options.requestMetadata, true);
        this._requestVertexNormals = options.requestVertexNormals || false;

        this.url = options.url;
        this.request = {
            headers: { ...options.headers, accept: "application/json" },
            queryString: options.queryString || ""
        };
        this._skirtHeight = options.skirtHeight;
        this.dataSource = dataSource;
    }

    ready(): boolean {
        throw new Error("Method not implemented.");
    }

    getTile(tileKey: TileKey, abortSignal?: AbortSignal): Promise<ArrayBufferLike | {}> {
        throw new Error("Method not implemented.");
    }

    protected dispose(): void {
        throw new Error("Method not implemented.");
    }

    addCsgData(csgdata: any): void {
        this.csgDatas.push(csgdata);
        this.dataSource.updateTileOverlayer();
    }

    removeCsgData(id: string): void {
        this.csgDatas = this.csgDatas.filter(csg => csg.id !== id);
    }

    updateCsgData(): void {
        (this.dataSource.dataProvider() as TinTerrainProvider).tinCache.forEach((e: any) => {
            e.clearCsgGeometry();
        });
        this.dataSource.updateTileOverlayer();
    }

    connect(): Promise<void> {
        return new Promise((resolve, reject) => {
            this._readyPromise = {
                reslove: (value: boolean) => resolve(), // Convert boolean resolve to void
                reject
            };
            return downloadManager
                .downloadJson(
                    `${this.url}/layer.json${this.request.queryString}`,
                    this.request.headers
                )
                .then(this.metadataSuccess.bind(this))
                .then(resolve)
                .catch(reject);
        });
    }

    getLevelMaximumGeometricError(level: number): number {
        return this._skirtHeight !== undefined
            ? this._skirtHeight
            : this._levelZeroMaximumGeometricError / (1 << level);
    }

    makeLoaderTile(tileKey: any, parentTileTinData?: any): TinMeshResourceTile {
        // 使用正确的Tile构造函数参数：dataSource, tileKey, offset, localTangentSpace?
        const tile = new TinMeshResourceTile(
            this.dataSource,
            tileKey,
            0 // 默认offset为0
        );

        // 初始化loader时传递完整的父级数据
        tile.tileLoader = new TinTerrainLoader(
            this.dataSource,
            tileKey,
            tile,
            this.dataSource.decoder,
            parentTileTinData
        );

        return tile;
    }

    getTileDataAvailable(tileKey: any): boolean | undefined {
        const { column: x, row: y, level } = tileKey;
        const adjustedLevel = level - 1;
        if (adjustedLevel < 0) return false;
        if (!defined(this._availability)) {
            return undefined;
        }

        if (adjustedLevel < this._availability.minimumLevel) {
            return false;
        }

        if (adjustedLevel > this._availability.maximumLevel) {
            return false;
        }

        if (this._availability.isTileAvailable(adjustedLevel, x, y)) {
            // If the tile is listed as available, then we are done
            return true;
        }
        if (!this._hasMetadata) {
            // If we don't have any layers with the metadata extension then we don't have this tile
            return false;
        }

        const layers = this._layers;
        const count = layers.length;
        for (let i = 0; i < count; ++i) {
            const layerResult = checkLayer(this, x, y, adjustedLevel, layers[i], i === 0);
            if (layerResult.result) {
                // There is a layer that may or may not have the tile
                return undefined;
            }
        }

        return false;
    }

    loadTileDataAvailability(tileKey: any): Promise<any> | undefined {
        const { column: x, row: y, level } = tileKey;
        const adjustedLevel = level - 1;
        if (
            !defined(this._availability) ||
            adjustedLevel > this._availability.maximumLevel ||
            this._availability.isTileAvailable(adjustedLevel, x, y) ||
            !this._hasMetadata
        ) {
            // We know the tile is either available or not available so nothing to wait on
            return undefined;
        }

        const layers = this._layers;
        const count = layers.length;
        for (let i = 0; i < count; ++i) {
            const layerResult = checkLayer(this, x, y, adjustedLevel, layers[i], i === 0);
            if (defined(layerResult.promise)) {
                return layerResult.promise;
            }
        }
        return undefined;
    }

    requestTileGeometry(
        tileKey: any,
        abortSignal?: AbortSignal
    ): Promise<QuantizedMeshTerrainData> {
        const { column: x, row: y, level } = tileKey;
        if (!this._ready) {
            throw new Error(
                "requestTileGeometry must not be called before the terrain provider is ready."
            );
        }

        const layers = this._layers;
        let layerToUse: LayerInformation | undefined;
        const layerCount = layers.length;

        if (layerCount === 1) {
            // Optimized path for single layers
            layerToUse = layers[0];
        } else {
            for (let i = 0; i < layerCount; ++i) {
                const layer = layers[i];
                if (
                    !defined(layer.availability) ||
                    layer.availability.isTileAvailable(level, x, y)
                ) {
                    layerToUse = layer;
                    break;
                }
            }
        }

        return requestTileGeometry(this, x, y, level, layerToUse);
    }

    heightmapTerrainQuality: number = 0.25;

    getEstimatedLevelZeroGeometricErrorForAHeightmap(
        ellipsoid: any,
        tileImageWidth: number,
        numberOfTilesAtLevelZero: number
    ): number {
        return (
            (ellipsoid.unitScale * 2 * Math.PI * this.heightmapTerrainQuality) /
            (tileImageWidth * numberOfTilesAtLevelZero)
        );
    }

    private readonly metadataSuccess = (data: any): Promise<void> => {
        const overallAvailability = this.overallAvailability;
        return this.parseMetadataSuccess(data).then(() => {
            if (this.metadataError) {
                return;
            }

            const length = overallAvailability.length;
            if (length > 0) {
                const availability = (this._availability = new TileAvailability(
                    this._tilingScheme,
                    this.overallMinZoom,
                    this.overallMaxZoom
                ));
                for (let level = 0; level < length; ++level) {
                    const levelRanges =
                        overallAvailability[level] ||
                        (level === 0
                            ? [
                                  [1, 0, 1, 0],
                                  [0, 1, 0, 1]
                              ]
                            : []);
                    for (let i = 0; i < levelRanges.length; ++i) {
                        const range = levelRanges[i];
                        availability.addAvailableTileRange(
                            level,
                            range[0],
                            range[1],
                            range[2],
                            range[3]
                        );
                    }
                }
            }

            this._ready = true;
            this._readyPromise.reslove(true);
        });
    };

    private parseMetadataSuccess(data: any): Promise<void> {
        const overallAvailability = this.overallAvailability;
        let message: string;
        // eslint-disable-next-line @typescript-eslint/no-this-alias
        const that = this;

        if (!data.format) {
            message = "The tile format is not specified in the layer.json file.";
            return Promise.resolve();
        }

        if (!data.tiles || data.tiles.length === 0) {
            message = "The layer.json file does not specify any tile URL templates.";
            return Promise.resolve();
        }

        let hasVertexNormals = false;
        let hasWaterMask = false;
        let hasMetadata = false;
        let littleEndianExtensionSize = true;
        const isHeightmap = false;

        if (data.format.indexOf("quantized-mesh-1.") !== 0) {
            message = 'The tile format "' + data.format + '" is invalid or not supported.';
            this.metadataError = new Error(message);
            return Promise.resolve();
        }

        const tileUrlTemplates = data.tiles;

        const maxZoom = data.maxzoom;
        const minZoom = data.minzoom;
        this.overallMinZoom = Math.min(this.overallMinZoom, minZoom);
        this.overallMaxZoom = Math.max(this.overallMaxZoom, maxZoom);

        if (!data.projection || data.projection === "EPSG:4326") {
            this._tilingScheme = new TilingScheme(
                new GeographicTilingScheme({
                    numberOfLevelZeroTilesX: 2,
                    numberOfLevelZeroTilesY: 1
                }),
                normalizedEquirectangularProjection
            );
        } else if (data.projection === "EPSG:3857") {
            this._tilingScheme = new TilingScheme(
                new GeographicTilingScheme({
                    numberOfLevelZeroTilesX: 1,
                    numberOfLevelZeroTilesY: 1
                }),
                webMercatorProjection
            );
        } else {
            message = 'The projection "' + data.projection + '" is invalid or not supported.';
            return Promise.resolve();
        }

        this._levelZeroMaximumGeometricError =
            this.getEstimatedLevelZeroGeometricErrorForAHeightmap(
                this.dataSource.mapView.projection,
                this._heightmapWidth,
                this._tilingScheme.subdivisionScheme.getLevelDimensionX(0)
            );

        if (!data.scheme || data.scheme === "tms" || data.scheme === "slippyMap") {
            this._scheme = data.scheme;
        } else {
            message = 'The scheme "' + data.scheme + '" is invalid or not supported.';
            return Promise.resolve();
        }

        let availabilityTilesLoaded: TileAvailability;

        if (defined(data.extensions) && data.extensions.indexOf("octvertexnormals") !== -1) {
            hasVertexNormals = true;
        } else if (defined(data.extensions) && data.extensions.indexOf("vertexnormals") !== -1) {
            hasVertexNormals = true;
            littleEndianExtensionSize = false;
        }
        if (defined(data.extensions) && data.extensions.indexOf("watermask") !== -1) {
            hasWaterMask = true;
        }
        if (defined(data.extensions) && data.extensions.indexOf("metadata") !== -1) {
            hasMetadata = true;
        }

        const availabilityLevels = data.metadataAvailability;
        const availableTiles = data.available;
        let availability: TileAvailability;
        if (defined(availableTiles) && !defined(availabilityLevels)) {
            availability = new TileAvailability(
                that._tilingScheme,
                minZoom || 0, // minimumLevel
                minZoom + availableTiles.length - 1 // maximumLevel
            );
            for (let level = minZoom || 0; level < minZoom + availableTiles.length; ++level) {
                const index = level - minZoom;
                const rangesAtLevel = availableTiles[index];
                const yTiles = that._tilingScheme.subdivisionScheme.getLevelDimensionY(level);
                if (!defined(overallAvailability[level])) {
                    overallAvailability[level] = [];
                }

                for (let rangeIndex = 0; rangeIndex < rangesAtLevel.length; ++rangeIndex) {
                    const range = rangesAtLevel[rangeIndex];
                    const yStart = yTiles - range.endY - 1;
                    const yEnd = yTiles - range.startY - 1;
                    overallAvailability[level].push([range.startX, yStart, range.endX, yEnd]);
                    availability.addAvailableTileRange(
                        level,
                        range.startX,
                        yStart,
                        range.endX,
                        yEnd
                    );
                }
            }
        } else if (defined(availabilityLevels)) {
            availabilityTilesLoaded = new TileAvailability(that._tilingScheme, minZoom, maxZoom);
            availability = new TileAvailability(that._tilingScheme, minZoom, maxZoom);
            overallAvailability[0] = [[0, 0, 1, 0]];
            availability.addAvailableTileRange(0, 0, 0, 1, 0);
        }

        this._hasWaterMask = that._hasWaterMask || hasWaterMask;
        this._hasVertexNormals = that._hasVertexNormals || hasVertexNormals;
        this._hasMetadata = that._hasMetadata || hasMetadata;
        if (defined(data.attribution)) {
            if (this.attribution.length > 0) {
                this.attribution += " ";
            }
            this.attribution += data.attribution;
        }

        this._layers.push(
            new LayerInformation({
                version: data.version,
                isHeightmap: isHeightmap,
                tileUrlTemplates: tileUrlTemplates,
                availability: availability,
                hasVertexNormals: hasVertexNormals,
                hasWaterMask: hasWaterMask,
                hasMetadata: hasMetadata,
                availabilityLevels: availabilityLevels,
                availabilityTilesLoaded: availabilityTilesLoaded,
                littleEndianExtensionSize: littleEndianExtensionSize
            })
        );

        const parentUrl = data.parentUrl;
        if (defined(parentUrl)) {
            if (!defined(availability)) {
                return Promise.resolve();
            }

            return downloadManager
                .downloadJson(
                    `${parentUrl}/layer.json${this.request.queryString}`,
                    this.request.headers
                )
                .then(parentData => {
                    return this.parseMetadataSuccess(parentData);
                });
        }

        return Promise.resolve();
    }

    public loadTinTerrainBuffer(
        tile: { level: number; x: number; y: number },
        layer: LayerInformation
    ): Promise<any> {
        // Implementation would go here
        return Promise.resolve();
    }
}

function requestTileGeometry(
    provider: TerrainDataProvider,
    x: number,
    y: number,
    level: number,
    layerToUse: LayerInformation
): Promise<QuantizedMeshTerrainData> {
    if (!defined(layerToUse)) {
        return Promise.reject(new Error("Terrain tile doesn't exist"));
    }

    const urlTemplates = layerToUse.tileUrlTemplates;
    if (urlTemplates.length === 0) {
        return Promise.reject(new Error("No tile URL templates available"));
    }

    // The TileMapService scheme counts from the bottom left
    let terrainY: number;
    const yTiles = provider.tilingScheme.subdivisionScheme.getLevelDimensionY(level);
    if (!provider.scheme || provider.scheme === "tms") {
        terrainY = y;
    } else {
        terrainY = yTiles - y - 1;
    }

    const extensionList: string[] = [];
    if (provider.requestVertexNormals && layerToUse.hasVertexNormals) {
        extensionList.push(
            layerToUse.littleEndianExtensionSize ? "octvertexnormals" : "vertexnormals"
        );
    }
    if (provider.requestWaterMask && layerToUse.hasWaterMask) {
        extensionList.push("watermask");
    }
    if (provider.requestMetadata && layerToUse.hasMetadata) {
        extensionList.push("metadata");
    }

    const headers = getRequestHeader(extensionList);
    const url = provider.url + urlTemplates[(x + terrainY + level) % urlTemplates.length];

    const promise = downloadManager.downloadArrayBuffer(
        formatUrl(url, {
            version: layerToUse.version,
            z: level,
            x: x,
            y: terrainY
        }),
        {
            headers: headers
        }
    );

    if (!defined(promise)) {
        return Promise.reject(new Error("Failed to create download promise"));
    }

    return promise.then(function (buffer: ArrayBuffer) {
        return createQuantizedMeshTerrainData(provider, buffer, level, x, y, layerToUse);
    });
}

export { TerrainDataProvider };
