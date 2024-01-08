import AttributeCompression from "./attribute-compression";
import AxisAlignedBoundingBox from "../math/axis-aligned-boundingbox";
import * as THREE from "three";
import { makeBoundingSphereFromPoints } from "../math/sphere";
import { GeoCoordinates, GeoBox } from "@flywave/flywave-geoutils";
import { defined } from "../utils";

// import { computeHorizonCullingPointPossiblyUnderEllipsoid } from "../math/ellipsoidal-occluder";

import IndexDatatype from "../index-datatype";
import Matrix4 from "../math/matrix4";
// import OrientedBoundingBox from "../Core/OrientedBoundingBox.js";
// import Rectangle from "../Core/Rectangle.js";
import TerrainEncoding from "./terrain-encoding";
import TerrainProvider from "./terrain-provider";
import { eastNorthUpToFixedFrame } from "../math/transfrom";
import { MercatorConstants } from "@flywave/flywave-geoutils";

import renderHeightMap from "./render-heightmap";

var maxShort = 32767;
var TWO_PI = 2.0 * Math.PI;

var cartesian3Scratch = new THREE.Vector3();
var scratchMinimum = new THREE.Vector3();
var scratchMaximum = new THREE.Vector3();
var cartographicScratch = new GeoCoordinates();
var toPack = new THREE.Vector2();
var scratchNormal = new THREE.Vector3();
var scratchToENU = new Matrix4();
var scratchFromENU = new Matrix4();

var ARC = Math.PI / 180;

/**
 * Converts a geodetic latitude in radians, in the range -PI/2 to PI/2, to a Mercator
 * angle in the range -PI to PI.
 *
 * @param {Number} latitude The geodetic latitude in radians.
 * @returns {Number} The Mercator angle.
 */
function geodeticLatitudeToMercatorAngle(latitude) {
    // Clamp the latitude coordinate to the valid Mercator bounds.
    if (latitude > MercatorConstants.MAXIMUM_LATITUDE) {
        latitude = MercatorConstants.MAXIMUM_LATITUDE;
    } else if (latitude < -MercatorConstants.MAXIMUM_LATITUDE) {
        latitude = -MercatorConstants.MAXIMUM_LATITUDE;
    }
    var sinLatitude = Math.sin(latitude);
    return 0.5 * Math.log((1.0 + sinLatitude) / (1.0 - sinLatitude));
}

export function createVerticesFromQuantizedTerrainMesh(
    parameters,
    transferableObjects,
    projection,
    tileKey
) {
    var quantizedVertices = parameters.quantizedVertices;
    var quantizedVertexCount = quantizedVertices.length / 3;
    var octEncodedNormals = parameters.octEncodedNormals;
    var edgeVertexCount =
        parameters.westIndices.length +
        parameters.eastIndices.length +
        parameters.southIndices.length +
        parameters.northIndices.length;

    if (!parameters.westSkirtHeight) {
        edgeVertexCount -= parameters.westIndices.length;
    }
    if (!parameters.southSkirtHeight) {
        edgeVertexCount -= parameters.southIndices.length;
    }

    if (!parameters.eastSkirtHeight) {
        edgeVertexCount -= parameters.eastIndices.length;
    }
    if (!parameters.northSkirtHeight) {
        edgeVertexCount -= parameters.northIndices.length;
    }

    var includeWebMercatorT = parameters.includeWebMercatorT;

    var rectangle = new GeoBox(
        GeoCoordinates.fromObject(parameters.rectangle.southWest),
        GeoCoordinates.fromObject(parameters.rectangle.northEast)
    );
    var west = rectangle.west * ARC;
    var south = rectangle.south * ARC;
    var east = rectangle.east * ARC;
    var north = rectangle.north * ARC;

    var exaggeration = parameters.exaggeration;
    var minimumHeight = parameters.minimumHeight * exaggeration;
    var maximumHeight = parameters.maximumHeight * exaggeration;

    var center = new THREE.Vector3().copy(parameters.relativeToCenter);
    var fromENU = eastNorthUpToFixedFrame(center, projection);
    var toENU = Matrix4.inverseTransformation(fromENU, new Matrix4());

    var southMercatorY;
    var oneOverMercatorHeight;
    if (includeWebMercatorT) {
        southMercatorY = geodeticLatitudeToMercatorAngle(south);
        oneOverMercatorHeight = 1.0 / (geodeticLatitudeToMercatorAngle(north) - southMercatorY);
    }

    var uBuffer = quantizedVertices.subarray(0, quantizedVertexCount);
    var vBuffer = quantizedVertices.subarray(quantizedVertexCount, 2 * quantizedVertexCount);
    var heightBuffer = quantizedVertices.subarray(
        quantizedVertexCount * 2,
        3 * quantizedVertexCount
    );
    var hasVertexNormals = defined(octEncodedNormals);

    var uvs = new Array(quantizedVertexCount);
    var heights = new Array(quantizedVertexCount);
    var positions = new Array(quantizedVertexCount);
    var cartographicScratchs = new Array(quantizedVertexCount * 3);
    var webMercatorTs = includeWebMercatorT ? new Array(quantizedVertexCount) : [];

    var minimum = scratchMinimum;
    minimum.x = Number.POSITIVE_INFINITY;
    minimum.y = Number.POSITIVE_INFINITY;
    minimum.z = Number.POSITIVE_INFINITY;

    var maximum = scratchMaximum;
    maximum.x = Number.NEGATIVE_INFINITY;
    maximum.y = Number.NEGATIVE_INFINITY;
    maximum.z = Number.NEGATIVE_INFINITY;

    var minLongitude = Number.POSITIVE_INFINITY;
    var maxLongitude = Number.NEGATIVE_INFINITY;
    var minLatitude = Number.POSITIVE_INFINITY;
    var minAltitude = Number.POSITIVE_INFINITY;
    var maxLatitude = Number.NEGATIVE_INFINITY;
    var maxAltitude = Number.NEGATIVE_INFINITY;

    for (var i = 0; i < quantizedVertexCount; ++i) {
        var rawU = uBuffer[i];
        var rawV = vBuffer[i];

        var u = rawU / maxShort;
        var v = rawV / maxShort;
        var height = THREE.MathUtils.lerp(
            minimumHeight,
            maximumHeight,
            new Int16Array(new Uint16Array([heightBuffer[i]]).buffer)[0] / maxShort
        );

        cartographicScratch.longitude = THREE.MathUtils.lerp(west, east, u) / ARC;
        cartographicScratch.latitude = THREE.MathUtils.lerp(south, north, v) / ARC;
        cartographicScratch.altitude = height;

        minLongitude = Math.min(cartographicScratch.longitudeInRadians, minLongitude);
        maxLongitude = Math.max(cartographicScratch.longitudeInRadians, maxLongitude);
        minAltitude = Math.min(cartographicScratch.altitude, minAltitude);
        minLatitude = Math.min(cartographicScratch.latitudeInRadians, minLatitude);
        maxLatitude = Math.max(cartographicScratch.latitudeInRadians, maxLatitude);
        maxAltitude = Math.max(cartographicScratch.altitude, maxAltitude);

        var position = projection.projectPoint(cartographicScratch);

        uvs[i] = new THREE.Vector2(u, v);
        heights[i] = height;
        positions[i] = position;
        cartographicScratchs[i * 3] = cartographicScratch.longitude;
        cartographicScratchs[i * 3 + 1] = cartographicScratch.latitude;
        cartographicScratchs[i * 3 + 2] = cartographicScratch.altitude;

        if (includeWebMercatorT) {
            webMercatorTs[i] =
                (geodeticLatitudeToMercatorAngle(cartographicScratch.latitudeInRadians) -
                    southMercatorY) *
                oneOverMercatorHeight;
        }

        Matrix4.multiplyByPoint(toENU, position, cartesian3Scratch);

        minimum.min(cartesian3Scratch);
        maximum.max(cartesian3Scratch);
    }

    let heightMapBuffer = renderHeightMap(
        parameters.offScreenCanvasId,
        [minLongitude, minLatitude, minAltitude, maxLongitude, maxLatitude, maxAltitude],
        cartographicScratchs,
        parameters.indices
    );

    var westIndicesSouthToNorth = copyAndSort(parameters.westIndices, function (a, b) {
        return uvs[a].y - uvs[b].y;
    });
    var eastIndicesNorthToSouth = copyAndSort(parameters.eastIndices, function (a, b) {
        return uvs[b].y - uvs[a].y;
    });
    var southIndicesEastToWest = copyAndSort(parameters.southIndices, function (a, b) {
        return uvs[a].x - uvs[b].x;
    });
    var northIndicesWestToEast = copyAndSort(parameters.northIndices, function (a, b) {
        return uvs[b].x - uvs[a].x;
    });

    var orientedBoundingBox;
    var boundingSphere;

    if (exaggeration !== 1.0) {
        // Bounding volumes need to be recomputed since the tile payload assumes no exaggeration.
        boundingSphere = makeBoundingSphereFromPoints(positions);
        orientedBoundingBox = OrientedBoundingBox.fromRectangle(
            rectangle,
            minimumHeight,
            maximumHeight,
            projection
        );
    }

    var occludeePointInScaledSpace;
    // if (exaggeration !== 1.0 || minimumHeight < 0.0) {
    //   // Horizon culling point needs to be recomputed since the tile payload assumes no exaggeration.
    //   occludeePointInScaledSpace = computeHorizonCullingPointPossiblyUnderEllipsoid(
    //     center,
    //     positions,
    //     minimumHeight
    //   );
    // }

    var hMin = minimumHeight;
    hMin = Math.min(
        hMin,
        findMinMaxSkirts(
            parameters.westIndices,
            parameters.westSkirtHeight,
            heights,
            uvs,
            rectangle,
            projection,
            toENU,
            minimum,
            maximum
        )
    );
    hMin = Math.min(
        hMin,
        findMinMaxSkirts(
            parameters.southIndices,
            parameters.southSkirtHeight,
            heights,
            uvs,
            rectangle,
            projection,
            toENU,
            minimum,
            maximum
        )
    );
    hMin = Math.min(
        hMin,
        findMinMaxSkirts(
            parameters.eastIndices,
            parameters.eastSkirtHeight,
            heights,
            uvs,
            rectangle,
            projection,
            toENU,
            minimum,
            maximum
        )
    );
    hMin = Math.min(
        hMin,
        findMinMaxSkirts(
            parameters.northIndices,
            parameters.northSkirtHeight,
            heights,
            uvs,
            rectangle,
            projection,
            toENU,
            minimum,
            maximum
        )
    );

    var aaBox = new AxisAlignedBoundingBox(minimum, maximum, center);
    var encoding = new TerrainEncoding(
        aaBox,
        hMin,
        maximumHeight,
        fromENU,
        true,
        includeWebMercatorT
    );
    var vertexStride = encoding.getStride();
    var size = quantizedVertexCount * vertexStride + edgeVertexCount * vertexStride;
    var vertexBuffer = new Float32Array(size);

    var bufferIndex = 0;
    for (var j = 0; j < quantizedVertexCount; ++j) {
        if (hasVertexNormals) {
            var n = j * 2.0;
            toPack.x = octEncodedNormals[n];
            toPack.y = octEncodedNormals[n + 1];

            if (exaggeration !== 1.0) {
                var normal = AttributeCompression.octDecode(toPack.x, toPack.y, scratchNormal);
                var fromENUNormal = eastNorthUpToFixedFrame(
                    positions[j],
                    projection,
                    scratchFromENU
                );
                var toENUNormal = Matrix4.inverseTransformation(fromENUNormal, scratchToENU);

                Matrix4.multiplyByPointAsVector(toENUNormal, normal, normal);
                normal.z *= exaggeration;
                normal.normalize();

                Matrix4.multiplyByPointAsVector(fromENUNormal, normal, normal);
                normal.normalize();

                AttributeCompression.octEncode(normal, toPack);
            }
        }

        bufferIndex = encoding.encode(
            vertexBuffer,
            bufferIndex,
            positions[j],
            uvs[j],
            heights[j],
            toPack,
            webMercatorTs[j]
        );
    }

    var edgeTriangleCount = Math.max(0, (edgeVertexCount - 4) * 2);
    var indexBufferLength = parameters.indices.length + edgeTriangleCount * 3;
    var indexBuffer = IndexDatatype.createTypedArray(
        quantizedVertexCount + edgeVertexCount,
        indexBufferLength
    );
    indexBuffer.set(parameters.indices, 0);

    {
        var geometry = new THREE.BufferGeometry();
        geometry.setAttribute("position", new THREE.BufferAttribute(vertexBuffer, vertexStride));
        geometry.setIndex(new THREE.BufferAttribute(indexBuffer, 1));
        geometry.computeVertexNormals();

        {
            const normalBuffer = geometry.getAttribute("normal").array;
            const positionBuffer = geometry.getAttribute("position");
            let normal = new THREE.Vector3();
            for (var i = 0, j = 0; i < normalBuffer.length; i += 3, j++) {
                normal.fromArray(normalBuffer, i);
                if (normal.length() == 0) {
                    normal
                        .set(positionBuffer.getX(j), positionBuffer.getY(j), positionBuffer.getZ(j))
                        .add(center)
                        .normalize();
                }
                vertexBuffer[j * vertexStride + vertexStride - 1] =
                    AttributeCompression.octEncodeFloat(normal);
            }
        }
    }

    var percentage = 0.0001;
    var lonOffset = (maxLongitude - minLongitude) * percentage;
    var latOffset = (maxLatitude - minLatitude) * percentage;
    var westLongitudeOffset = -lonOffset;
    var westLatitudeOffset = 0.0;
    var eastLongitudeOffset = lonOffset;
    var eastLatitudeOffset = 0.0;
    var northLongitudeOffset = 0.0;
    var northLatitudeOffset = latOffset;
    var southLongitudeOffset = 0.0;
    var southLatitudeOffset = -latOffset;

    // Add skirts.

    if (parameters.westSkirtHeight) {
        var vertexBufferIndex = quantizedVertexCount * vertexStride;
        addSkirt(
            vertexBuffer,
            vertexBufferIndex,
            westIndicesSouthToNorth,
            encoding,
            heights,
            uvs,
            octEncodedNormals,
            projection,
            rectangle,
            parameters.westSkirtHeight,
            exaggeration,
            southMercatorY,
            oneOverMercatorHeight,
            westLongitudeOffset,
            westLatitudeOffset
        );
    }

    if (parameters.southSkirtHeight) {
        vertexBufferIndex += parameters.westIndices.length * vertexStride;
        addSkirt(
            vertexBuffer,
            vertexBufferIndex,
            southIndicesEastToWest,
            encoding,
            heights,
            uvs,
            octEncodedNormals,
            projection,
            rectangle,
            parameters.southSkirtHeight,
            exaggeration,
            southMercatorY,
            oneOverMercatorHeight,
            southLongitudeOffset,
            southLatitudeOffset
        );
    }

    if (parameters.eastSkirtHeight) {
        vertexBufferIndex += parameters.southIndices.length * vertexStride;
        addSkirt(
            vertexBuffer,
            vertexBufferIndex,
            eastIndicesNorthToSouth,
            encoding,
            heights,
            uvs,
            octEncodedNormals,
            projection,
            rectangle,
            parameters.eastSkirtHeight,
            exaggeration,
            southMercatorY,
            oneOverMercatorHeight,
            eastLongitudeOffset,
            eastLatitudeOffset
        );
    }

    if (parameters.northSkirtHeight) {
        vertexBufferIndex += parameters.eastIndices.length * vertexStride;
        addSkirt(
            vertexBuffer,
            vertexBufferIndex,
            northIndicesWestToEast,
            encoding,
            heights,
            uvs,
            octEncodedNormals,
            projection,
            rectangle,
            parameters.northSkirtHeight,
            exaggeration,
            southMercatorY,
            oneOverMercatorHeight,
            northLongitudeOffset,
            northLatitudeOffset
        );
    }

    if (parameters.northSkirtHeight) {
        TerrainProvider.addSkirtIndices(
            westIndicesSouthToNorth,
            southIndicesEastToWest,
            eastIndicesNorthToSouth,
            northIndicesWestToEast,
            quantizedVertexCount,
            indexBuffer,
            parameters.indices.length
        );
    }

    transferableObjects.push(vertexBuffer.buffer, indexBuffer.buffer);

    var pos = center.clone(); // projection.projectPoint(new GeoCoordinates(center.y, center.x, center.z));
    var vertexs = new Float32Array(vertexBuffer.buffer);
    var position = new Float32Array((vertexs.length / vertexStride) * 3);
    var altitudes = new Float32Array(vertexs.length / vertexStride);
    var uv = new Float32Array(vertexs.length / 2);

    // pos.set(0,0,0);
    for (
        var i = 0, j = 0, k = 0, u = 0;
        i < vertexs.length;
        i += vertexStride, j += 4, k += 3, u++
    ) {
        position[k] = vertexs[i] - pos.x;
        position[k + 1] = vertexs[i + 1] - pos.y;
        position[k + 2] = vertexs[i + 2] - pos.z;

        altitudes[u] = vertexs[i + 3];

        uv[j] = vertexs[i + 4];
        uv[j + 1] = vertexs[i + 5];
        uv[j + 2] = vertexs[i + 6];
        uv[j + 3] = vertexs[i + 7];
    }

    return {
        // displacementMapBuffer,
        heightMapBuffer,
        position3DAndHeight: position,
        altitudes,
        textureCoordAndEncodedNormals: uv,
        indices: indexBuffer.buffer,
        westIndicesSouthToNorth: westIndicesSouthToNorth,
        southIndicesEastToWest: southIndicesEastToWest,
        eastIndicesNorthToSouth: eastIndicesNorthToSouth,
        northIndicesWestToEast: northIndicesWestToEast,
        vertexStride: vertexStride,
        center: center,
        minimumHeight: minimumHeight,
        maximumHeight: maximumHeight,
        boundingSphere: boundingSphere,
        orientedBoundingBox: orientedBoundingBox,
        occludeePointInScaledSpace: occludeePointInScaledSpace,
        encoding: encoding,
        indexCountWithoutSkirts: parameters.indices.length
    };
}

function findMinMaxSkirts(
    edgeIndices,
    edgeHeight,
    heights,
    uvs,
    rectangle,
    projection,
    toENU,
    minimum,
    maximum
) {
    var hMin = Number.POSITIVE_INFINITY;

    var north = rectangle.north * ARC;
    var south = rectangle.south * ARC;
    var east = rectangle.east * ARC;
    var west = rectangle.west * ARC;

    if (east < west) {
        east += TWO_PI;
    }

    var length = edgeIndices.length;
    for (var i = 0; i < length; ++i) {
        var index = edgeIndices[i];
        var h = heights[index];
        var uv = uvs[index];

        cartographicScratch.longitude = THREE.MathUtils.lerp(west, east, uv.x) / ARC;
        cartographicScratch.latitude = THREE.MathUtils.lerp(south, north, uv.y) / ARC;
        cartographicScratch.altitude = h - edgeHeight;

        var position = cartesian3Scratch.copy(projection.projectPoint(cartographicScratch));
        Matrix4.multiplyByPoint(toENU, position, position);

        minimum.min(position);
        maximum.max(position);

        hMin = Math.min(hMin, cartographicScratch.altitude);
    }
    return hMin;
}

function addSkirt(
    vertexBuffer,
    vertexBufferIndex,
    edgeVertices,
    encoding,
    heights,
    uvs,
    octEncodedNormals,
    projection,
    rectangle,
    skirtLength,
    exaggeration,
    southMercatorY,
    oneOverMercatorHeight,
    longitudeOffset,
    latitudeOffset
) {
    var hasVertexNormals = defined(octEncodedNormals);

    var north = rectangle.north * ARC;
    var south = rectangle.south * ARC;
    var east = rectangle.east * ARC;
    var west = rectangle.west * ARC;

    if (east < west) {
        east += TWO_PI;
    }

    var length = edgeVertices.length;
    for (var i = 0; i < length; ++i) {
        var index = edgeVertices[i];
        var h = heights[index];
        var uv = uvs[index];

        cartographicScratch.longitude =
            (THREE.MathUtils.lerp(west, east, uv.x) + longitudeOffset) / ARC;
        cartographicScratch.latitude =
            (THREE.MathUtils.lerp(south, north, uv.y) + latitudeOffset) / ARC;
        cartographicScratch.altitude = h - skirtLength;

        var position = cartesian3Scratch.copy(projection.projectPoint(cartographicScratch));

        if (hasVertexNormals) {
            var n = index * 2.0;
            toPack.x = octEncodedNormals[n];
            toPack.y = octEncodedNormals[n + 1];

            if (exaggeration !== 1.0) {
                var normal = AttributeCompression.octDecode(toPack.x, toPack.y, scratchNormal);
                var fromENUNormal = eastNorthUpToFixedFrame(
                    cartesian3Scratch,
                    projection,
                    scratchFromENU
                );
                var toENUNormal = Matrix4.inverseTransformation(fromENUNormal, scratchToENU);

                Matrix4.multiplyByPointAsVector(toENUNormal, normal, normal);
                normal.z *= exaggeration;
                normal.normalize();

                Matrix4.multiplyByPointAsVector(fromENUNormal, normal, normal);
                normal.normalize();

                AttributeCompression.octEncode(normal, toPack);
            }
        }

        var webMercatorT;
        if (encoding.hasWebMercatorT) {
            webMercatorT =
                (geodeticLatitudeToMercatorAngle(cartographicScratch.latitudeInRadians) -
                    southMercatorY) *
                oneOverMercatorHeight;
        }

        vertexBufferIndex = encoding.encode(
            vertexBuffer,
            vertexBufferIndex,
            position,
            uv,
            cartographicScratch.altitude,
            toPack,
            webMercatorT
        );
    }
}

function copyAndSort(typedArray, comparator) {
    var copy;
    if (typeof typedArray.slice === "function") {
        copy = typedArray.slice();
        if (typeof copy.sort !== "function") {
            // Sliced typed array isn't sortable, so we can't use it.
            copy = undefined;
        }
    }

    if (!defined(copy)) {
        copy = Array.prototype.slice.call(typedArray);
    }

    copy.sort(comparator);

    return copy;
}
