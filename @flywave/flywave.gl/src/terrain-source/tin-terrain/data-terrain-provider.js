import IndexDatatype from "./index-datatype";
import getJsonFromTypedArray from "./get-json-from-typed-array";
import AttributeCompression from "./quantized-mesh/attribute-compression";
import { TransferManager } from "@flywave/flywave-transfer-manager";
import QuantizedMeshTerrainData from "./quantized-mesh/quantized-mesh-terrain-data";
import {
    normalizedEquirectangularProjection,
    webMercatorProjection,
    TilingScheme
} from "@flywave/flywave-geoutils";
import { TinMeshLoader, TinMeshResourceTile } from "./tin-terrain-loader";

import TileAvailability from "./tile-availability";
import { defined, defaultValue, formatUrl } from "./utils";
import * as THREE from "three";

var downloadManager = TransferManager.instance();

class GeographicTilingScheme {
    _numberOfLevelZeroTilesX = 2;
    _numberOfLevelZeroTilesY = 1;

    constructor({ numberOfLevelZeroTilesX, numberOfLevelZeroTilesY }) {
        this._numberOfLevelZeroTilesX = numberOfLevelZeroTilesX;
        this._numberOfLevelZeroTilesY = numberOfLevelZeroTilesY;
    }

    getSubdivisionX() {
        return 2;
    }
    getSubdivisionY(level) {
        return 2;
    }
    getLevelDimensionX(level) {
        return this._numberOfLevelZeroTilesX << level;
    }
    getLevelDimensionY(level) {
        return this._numberOfLevelZeroTilesY << level;
    }
}

var QuantizedMeshExtensionIds = {
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

function createQuantizedMeshTerrainData(provider, buffer, level, x, y, layer) {
    var littleEndianExtensionSize = layer.littleEndianExtensionSize;
    var pos = 0;
    var cartesian3Elements = 3;
    var boundingSphereElements = cartesian3Elements + 1;
    var cartesian3Length = Float64Array.BYTES_PER_ELEMENT * cartesian3Elements;
    var boundingSphereLength = Float64Array.BYTES_PER_ELEMENT * boundingSphereElements;
    var encodedVertexElements = 3;
    var encodedVertexLength = Uint16Array.BYTES_PER_ELEMENT * encodedVertexElements;
    var triangleElements = 3;
    var bytesPerIndex = Uint16Array.BYTES_PER_ELEMENT;
    var triangleLength = bytesPerIndex * triangleElements;

    var view = new DataView(buffer);
    var center = new THREE.Vector3(
        view.getFloat64(pos, true),
        view.getFloat64(pos + 8, true),
        view.getFloat64(pos + 16, true)
    );
    pos += cartesian3Length;

    var minimumHeight = view.getFloat32(pos, true);
    pos += Float32Array.BYTES_PER_ELEMENT;
    var maximumHeight = view.getFloat32(pos, true);
    pos += Float32Array.BYTES_PER_ELEMENT;

    var boundingSphere = new THREE.Sphere(
        new THREE.Vector3(
            view.getFloat64(pos, true),
            view.getFloat64(pos + 8, true),
            view.getFloat64(pos + 16, true)
        ),
        view.getFloat64(pos + cartesian3Length, true)
    );
    pos += boundingSphereLength;

    var horizonOcclusionPoint = new THREE.Vector3(
        view.getFloat64(pos, true),
        view.getFloat64(pos + 8, true),
        view.getFloat64(pos + 16, true)
    );
    pos += cartesian3Length;

    var vertexCount = view.getUint32(pos, true);
    pos += Uint32Array.BYTES_PER_ELEMENT;
    var encodedVertexBuffer = new Uint16Array(buffer, pos, vertexCount * 3);
    pos += vertexCount * encodedVertexLength;

    if (vertexCount > 64 * 1024) {
        // More than 64k vertices, so indices are 32-bit.
        bytesPerIndex = Uint32Array.BYTES_PER_ELEMENT;
        triangleLength = bytesPerIndex * triangleElements;
    }

    // Decode the vertex buffer.
    var uBuffer = encodedVertexBuffer.subarray(0, vertexCount);
    var vBuffer = encodedVertexBuffer.subarray(vertexCount, 2 * vertexCount);
    var heightBuffer = encodedVertexBuffer.subarray(vertexCount * 2, 3 * vertexCount);

    AttributeCompression.zigZagDeltaDecode(uBuffer, vBuffer, heightBuffer);

    // skip over any additional padding that was added for 2/4 byte alignment
    if (pos % bytesPerIndex !== 0) {
        pos += bytesPerIndex - (pos % bytesPerIndex);
    }

    var triangleCount = view.getUint32(pos, true);
    pos += Uint32Array.BYTES_PER_ELEMENT;
    var indices = IndexDatatype.createTypedArrayFromArrayBuffer(
        vertexCount,
        buffer,
        pos,
        triangleCount * triangleElements
    );
    pos += triangleCount * triangleLength;

    // High water mark decoding based on decompressIndices_ in webgl-loader's loader.js.
    // https://code.google.com/p/webgl-loader/source/browse/trunk/samples/loader.js?r=99#55
    // Copyright 2012 Google Inc., Apache 2.0 license.
    var highest = 0;
    var length = indices.length;
    for (var i = 0; i < length; ++i) {
        var code = indices[i];
        indices[i] = highest - code;
        if (code === 0) {
            ++highest;
        }
    }

    var westVertexCount = view.getUint32(pos, true);
    pos += Uint32Array.BYTES_PER_ELEMENT;
    var westIndices = IndexDatatype.createTypedArrayFromArrayBuffer(
        vertexCount,
        buffer,
        pos,
        westVertexCount
    );
    pos += westVertexCount * bytesPerIndex;

    var southVertexCount = view.getUint32(pos, true);
    pos += Uint32Array.BYTES_PER_ELEMENT;
    var southIndices = IndexDatatype.createTypedArrayFromArrayBuffer(
        vertexCount,
        buffer,
        pos,
        southVertexCount
    );
    pos += southVertexCount * bytesPerIndex;

    var eastVertexCount = view.getUint32(pos, true);
    pos += Uint32Array.BYTES_PER_ELEMENT;
    var eastIndices = IndexDatatype.createTypedArrayFromArrayBuffer(
        vertexCount,
        buffer,
        pos,
        eastVertexCount
    );
    pos += eastVertexCount * bytesPerIndex;

    var northVertexCount = view.getUint32(pos, true);
    pos += Uint32Array.BYTES_PER_ELEMENT;
    var northIndices = IndexDatatype.createTypedArrayFromArrayBuffer(
        vertexCount,
        buffer,
        pos,
        northVertexCount
    );
    pos += northVertexCount * bytesPerIndex;

    var encodedNormalBuffer;
    var waterMaskBuffer;
    while (pos < view.byteLength) {
        var extensionId = view.getUint8(pos, true);
        pos += Uint8Array.BYTES_PER_ELEMENT;
        var extensionLength = view.getUint32(pos, littleEndianExtensionSize);
        pos += Uint32Array.BYTES_PER_ELEMENT;

        if (
            extensionId === QuantizedMeshExtensionIds.OCT_VERTEX_NORMALS &&
            provider._requestVertexNormals
        ) {
            encodedNormalBuffer = new Uint8Array(buffer, pos, vertexCount * 2);
        } else if (
            extensionId === QuantizedMeshExtensionIds.WATER_MASK &&
            provider._requestWaterMask
        ) {
            waterMaskBuffer = new Uint8Array(buffer, pos, extensionLength);
        } else if (
            extensionId === QuantizedMeshExtensionIds.METADATA &&
            provider._requestMetadata
        ) {
            var stringLength = view.getUint32(pos, true);
            if (stringLength > 0) {
                var metadata = getJsonFromTypedArray(
                    new Uint8Array(buffer),
                    pos + Uint32Array.BYTES_PER_ELEMENT,
                    stringLength
                );
                var availableTiles = metadata.available;
                if (defined(availableTiles)) {
                    for (var offset = 0; offset < availableTiles.length; ++offset) {
                        var availableLevel = level + offset + 1;
                        var rangesAtLevel = availableTiles[offset];
                        var yTiles =
                            provider.tilingScheme.subdivisionScheme.getLevelDimensionY(
                                availableLevel
                            );

                        for (var rangeIndex = 0; rangeIndex < rangesAtLevel.length; ++rangeIndex) {
                            var range = rangesAtLevel[rangeIndex];
                            var yStart = yTiles - range.endY - 1;
                            var yEnd = yTiles - range.startY - 1;
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

    var skirtHeight = provider.getLevelMaximumGeometricError(level) * 50.0;

    // The skirt is not included in the OBB computation. If this ever
    // causes any rendering artifacts (cracks), they are expected to be
    // minor and in the corners of the screen. It's possible that this
    // might need to be changed - just change to `minimumHeight - skirtHeight`
    // A similar change might also be needed in `upsampleQuantizedTerrainMesh.js`.
    // var rectangle = provider.tilingScheme.getGeoBox(x, y, level);
    // var orientedBoundingBox = OrientedBoundingBox.fromRectangle(
    //   rectangle,
    //   minimumHeight,
    //   maximumHeight,
    //   provider.tilingScheme.ellipsoid
    // );

    var texture;
    if (waterMaskBuffer) {
        var textureSize = Math.sqrt(waterMaskBuffer.length);
        texture = new THREE.DataTexture(
            waterMaskBuffer,
            textureSize,
            textureSize,
            THREE.LuminanceFormat,
            THREE.UnsignedByteType
        );
        texture.minFilter = THREE.LinearFilter;
        texture.magFilter = THREE.LinearFilter;
        texture.generateMipmaps = false;
        // texture.flipY = false;
        texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
    }
    return new QuantizedMeshTerrainData({
        center: center,
        minimumHeight: minimumHeight,
        maximumHeight: maximumHeight,
        boundingSphere: boundingSphere,
        // orientedBoundingBox: orientedBoundingBox,
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
        childTileMask: provider._availability.computeChildMaskForTile(level, x, y),
        waterMask: texture
    });
}

function getRequestHeader(extensionsList) {
    if (!defined(extensionsList) || extensionsList.length === 0) {
        return {
            Accept: "application/vnd.quantized-mesh,application/octet-stream;q=0.9,*/*;q=0.01"
        };
    }
    var extensions = extensionsList.join("-");
    return {
        Accept:
            "application/vnd.quantized-mesh;extensions=" +
            extensions +
            ",application/octet-stream;q=0.9,*/*;q=0.01"
    };
}

function getAvailabilityTile(layer, x, y, level) {
    if (level === 0) {
        return;
    }

    var availabilityLevels = layer.availabilityLevels;
    var parentLevel =
        level % availabilityLevels === 0
            ? level - availabilityLevels
            : ((level / availabilityLevels) | 0) * availabilityLevels;
    var divisor = 1 << (level - parentLevel);
    var parentX = (x / divisor) | 0;
    var parentY = (y / divisor) | 0;

    return {
        level: parentLevel,
        x: parentX,
        y: parentY
    };
}

function checkLayer(provider, x, y, level, layer, topLayer) {
    if (!defined(layer.availabilityLevels)) {
        // It's definitely not in this layer
        return {
            result: false
        };
    }

    var cacheKey;
    var deleteFromCache = function () {
        delete layer.availabilityPromiseCache[cacheKey];
    };
    var availabilityTilesLoaded = layer.availabilityTilesLoaded;
    var availability = layer.availability;

    var tile = getAvailabilityTile(layer, x, y, level);
    while (defined(tile)) {
        if (
            availability.isTileAvailable(tile.level, tile.x, tile.y) &&
            !availabilityTilesLoaded.isTileAvailable(tile.level, tile.x, tile.y)
        ) {
            var requestPromise;
            if (!topLayer) {
                cacheKey = tile.level + "-" + tile.x + "-" + tile.y;
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

function LayerInformation(layer) {
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
    this.availabilityPromiseCache = {};
}

class DataTerrainProvider {
    constructor(options, dataSource) {
        this._requestWaterMask = defaultValue(options.requestWaterMask, false);

        this._requestMetadata = defaultValue(options.requestMetadata, true);

        this.url = options.url;
        this.request = { headers: { ...options.headers, accept: "application/json" },queryString:options.queryString||"" };
        this._heightmapWidth = 65;
        this.dataSource = dataSource;

        this._requestVertexNormals = options.requestVertexNormals || false;
    }

    _layers = [];

    connect() {
        return new Promise((reslove, reject) => {
            this._readyPromise = { reslove, reject };
            return downloadManager
                .downloadJson(`${this.url}/layer.json${this.request.queryString}`, this.request.headers)
                .then(this.metadataSuccess)
                .then(reslove)
                .catch(reject);
        });
    }

    getLevelMaximumGeometricError = function (level) {
        return this._levelZeroMaximumGeometricError / (1 << level);
    };

    makeLoaderTile(tileKey, parentTileTinData) {
        var tile = new TinMeshResourceTile(this.dataSource, tileKey);
        tile.tileKey.level = tile.tileKey.level - 1;
        tile.geoBox = this.tilingScheme.getGeoBox(tile.tileKey);
        tile.tileLoader = new TinMeshLoader(
            this.dataSource,
            tileKey,
            tile,
            this.dataSource.decoder,
            parentTileTinData
        );
        return tile;
    }

    getTileDataAvailable = function (tileKey) {
        var { column: x, row: y, level } = tileKey;
        level = level - 1;
        if (!defined(this._availability)) {
            return undefined;
        }
        if (level > this._availability._maximumLevel) {
            return false;
        }

        if (this._availability.isTileAvailable(level, x, y)) {
            // If the tile is listed as available, then we are done
            return true;
        }
        if (!this._hasMetadata) {
            // If we don't have any layers with the metadata extension then we don't have this tile
            return false;
        }

        var layers = this._layers;
        var count = layers.length;
        for (var i = 0; i < count; ++i) {
            var layerResult = checkLayer(this, x, y, level, layers[i], i === 0);
            if (layerResult.result) {
                // There is a layer that may or may not have the tile
                return undefined;
            }
        }

        return false;
    };

    loadTileDataAvailability(tileKey) {
        if (
            !defined(this._availability) ||
            level > this._availability._maximumLevel ||
            this._availability.isTileAvailable(level, x, y) ||
            !this._hasMetadata
        ) {
            // We know the tile is either available or not available so nothing to wait on
            return undefined;
        }

        var layers = this._layers;
        var count = layers.length;
        for (var i = 0; i < count; ++i) {
            var layerResult = checkLayer(this, x, y, level, layers[i], i === 0);
            if (defined(layerResult.promise)) {
                return layerResult.promise;
            }
        }
    }

    requestTileGeometry(tileKey, abortSignal) {
        const { column: x, row: y, level } = tileKey;
        if (!this._ready) {
            throw new "requestTileGeometry must not be called before the terrain provider is ready."();
        }
        //>>includeEnd('debug');

        var layers = this._layers;
        var layerToUse;
        var layerCount = layers.length;

        if (layerCount === 1) {
            // Optimized path for single layers
            layerToUse = layers[0];
        } else {
            for (var i = 0; i < layerCount; ++i) {
                var layer = layers[i];
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

    heightmapTerrainQuality = 0.25;

    getEstimatedLevelZeroGeometricErrorForAHeightmap = function (
        ellipsoid,
        tileImageWidth,
        numberOfTilesAtLevelZero
    ) {
        return (
            (ellipsoid.unitScale * 2 * Math.PI * this.heightmapTerrainQuality) /
            (tileImageWidth * numberOfTilesAtLevelZero)
        );
    };

    attribution = "";

    overallAvailability = [];

    overallMaxZoom = 0;

    metadataSuccess = data => {
        var overallAvailability = this.overallAvailability;
        return this.parseMetadataSuccess(data).then(() => {
            if (this.metadataError) {
                return;
            }

            var length = overallAvailability.length;
            if (length > 0) {
                var availability = (this._availability = new TileAvailability(
                    this.tilingScheme,
                    this.overallMaxZoom
                ));
                for (var level = 0; level < length; ++level) {
                    var levelRanges = overallAvailability[level];
                    for (var i = 0; i < levelRanges.length; ++i) {
                        var range = levelRanges[i];
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

    parseMetadataSuccess = data => {
        var overallAvailability = this.overallAvailability;
        var message;
        var that = this;

        if (!data.format) {
            message = "The tile format is not specified in the layer.json file.";
            return;
        }

        if (!data.tiles || data.tiles.length === 0) {
            message = "The layer.json file does not specify any tile URL templates.";
            return;
        }

        var hasVertexNormals = false;
        var hasWaterMask = false;
        var hasMetadata = false;
        var littleEndianExtensionSize = true;
        var isHeightmap = false;

        if (data.format.indexOf("quantized-mesh-1.") !== 0) {
            message = 'The tile format "' + data.format + '" is invalid or not supported.';
            this.metadataError = TileProviderError.handleError(
                this.metadataError,
                that,
                that._errorEvent,
                message,
                undefined,
                undefined,
                undefined,
                requestLayerJson
            );
            return;
        }

        var tileUrlTemplates = data.tiles;

        var maxZoom = data.maxzoom;
        this.overallMaxZoom = Math.max(this.overallMaxZoom, maxZoom);
        // Keeps track of which of the availablity containing tiles have been loaded

        if (!data.projection || data.projection === "EPSG:4326") {
            this.tilingScheme = new TilingScheme(
                new GeographicTilingScheme({
                    numberOfLevelZeroTilesX: 2,
                    numberOfLevelZeroTilesY: 1
                }),
                normalizedEquirectangularProjection
            );
        } else if (data.projection === "EPSG:3857") {
            this.tilingScheme = new TilingScheme(
                new GeographicTilingScheme({
                    numberOfLevelZeroTilesX: 1,
                    numberOfLevelZeroTilesY: 1
                }),
                webMercatorProjection
            );
        } else {
            message = 'The projection "' + data.projection + '" is invalid or not supported.';
            return;
        }

        this._levelZeroMaximumGeometricError =
            this.getEstimatedLevelZeroGeometricErrorForAHeightmap(
                this.dataSource.mapView.projection,
                this._heightmapWidth,
                this.tilingScheme.subdivisionScheme.getLevelDimensionX(0)
            );

        if (!data.scheme || data.scheme === "tms" || data.scheme === "slippyMap") {
            this._scheme = data.scheme;
        } else {
            message = 'The scheme "' + data.scheme + '" is invalid or not supported.';

            return;
        }

        var availabilityTilesLoaded;

        // The vertex normals defined in the 'octvertexnormals' extension is identical to the original
        // contents of the original 'vertexnormals' extension.  'vertexnormals' extension is now
        // deprecated, as the extensionLength for this extension was incorrectly using big endian.
        // We maintain backwards compatibility with the legacy 'vertexnormal' implementation
        // by setting the _littleEndianExtensionSize to false. Always prefer 'octvertexnormals'
        // over 'vertexnormals' if both extensions are supported by the server.
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

        var availabilityLevels = data.metadataAvailability;
        var availableTiles = data.available;
        var availability;
        if (defined(availableTiles) && !defined(availabilityLevels)) {
            availability = new TileAvailability(that.tilingScheme, availableTiles.length);
            for (var level = 0; level < availableTiles.length; ++level) {
                var rangesAtLevel = availableTiles[level];
                var yTiles = that.tilingScheme.subdivisionScheme.getLevelDimensionY(level);
                if (!defined(overallAvailability[level])) {
                    overallAvailability[level] = [];
                }

                for (var rangeIndex = 0; rangeIndex < rangesAtLevel.length; ++rangeIndex) {
                    var range = rangesAtLevel[rangeIndex];
                    var yStart = yTiles - range.endY - 1;
                    var yEnd = yTiles - range.startY - 1;
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
            availabilityTilesLoaded = new TileAvailability(this.tilingScheme, maxZoom);
            availability = new TileAvailability(that.tilingScheme, maxZoom);
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
                // resource: lastResource,
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

        var parentUrl = data.parentUrl;
        if (defined(parentUrl)) {
            if (!defined(availability)) {
                console.log(
                    "A layer.json can't have a parentUrl if it does't have an available array."
                );
                return Promise.resolve();
            }

            return downloadManager
                .downloadJson(`${parentUrl}/layer.json${this.request.queryString}`,this.request.headers)
                .catch(parseMetadataFailure)
                .then(() => {
                    return parentMetadata;
                })
                .then(parseMetadataSuccess);
        }

        return Promise.resolve();
    };
}

function requestTileGeometry(provider, x, y, level, layerToUse) {
    if (!defined(layerToUse)) {
        return Promise.reject(new RuntimeError("Terrain tile doesn't exist"));
    }

    var urlTemplates = layerToUse.tileUrlTemplates;
    if (urlTemplates.length === 0) {
        return undefined;
    }

    // The TileMapService scheme counts from the bottom left
    var terrainY;
    if (!provider._scheme || provider._scheme === "tms") {
        var yTiles = provider.tilingScheme.subdivisionScheme.getLevelDimensionY(level);
        terrainY = y;
    } else {
        terrainY = yTiles - y - 1;
    }

    var extensionList = [];
    if (provider._requestVertexNormals && layerToUse.hasVertexNormals) {
        extensionList.push(
            layerToUse.littleEndianExtensionSize ? "octvertexnormals" : "vertexnormals"
        );
    }
    if (provider._requestWaterMask && layerToUse.hasWaterMask) {
        extensionList.push("watermask");
    }
    if (provider._requestMetadata && layerToUse.hasMetadata) {
        extensionList.push("metadata");
    }

    var headers;
    var query;
    var url = provider.url + urlTemplates[(x + terrainY + level) % urlTemplates.length];

    var resource = layerToUse.resource;
    // if (
    //   defined(resource._ionEndpoint) &&
    //   !defined(resource._ionEndpoint.externalType)
    // ) {
    //   // ion uses query paremeters to request extensions
    //   if (extensionList.length !== 0) {
    //     query = { extensions: extensionList.join("-") };
    //   }
    //   headers = getRequestHeader(undefined);
    // } else {
    //All other terrain servers
    headers = getRequestHeader(extensionList);
    // }

    var promise = downloadManager.downloadArrayBuffer(
        formatUrl(url, {
            version: layerToUse.version,
            z: level,
            x: x,
            y: terrainY,
            queryParameters: query
        }),
        {
            headers: headers
        }
    );

    if (!defined(promise)) {
        return undefined;
    }

    return promise.then(function (buffer) {
        if (defined(provider._heightmapStructure)) {
            throw "Not support this heightmap.";
        }
        return createQuantizedMeshTerrainData(provider, buffer, level, x, y, layerToUse);
    });
}

export { DataTerrainProvider };
