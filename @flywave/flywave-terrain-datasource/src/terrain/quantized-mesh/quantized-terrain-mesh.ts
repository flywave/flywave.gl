import {
    AxisAlignedBox3,
    eastNorthUpToFixedFrame,
    GeoBox,
    GeoCoordinates,
    MercatorConstants,
    OrientedBox3
} from "@flywave/flywave-geoutils";
import { defined, IndexDatatype } from "@flywave/flywave-utils";
import * as THREE from "three";

import renderHeightMap from "../render-heightmap";
import {
    createTerrainEncoding,
    encodeTerrainData,
    getStride,
    octDecode,
    octEncode,
    octEncodeFloat,
    TerrainEncoding
} from "./decoder";
import { addSkirtIndices } from "./skirt";
import { makeBoundingSphereFromPoints } from "./sphere";

const maxShort = 32767;
const TWO_PI = 2.0 * Math.PI;

const cartesian3Scratch = new THREE.Vector3();
const scratchMinimum = new THREE.Vector3();
const scratchMaximum = new THREE.Vector3();
const cartographicScratch = new GeoCoordinates(0, 0);
const toPack = new THREE.Vector3();
const scratchNormal = new THREE.Vector3();
const scratchFromENU = new THREE.Matrix4();

const ARC = Math.PI / 180;

interface CreateVerticesParameters {
    quantizedVertices: Uint16Array;
    octEncodedNormals?: Uint8Array;
    westIndices: Uint16Array | Uint32Array;
    eastIndices: Uint16Array | Uint32Array;
    southIndices: Uint16Array | Uint32Array;
    northIndices: Uint16Array | Uint32Array;
    westSkirtHeight?: number;
    eastSkirtHeight?: number;
    southSkirtHeight?: number;
    northSkirtHeight?: number;
    includeWebMercatorT: boolean;
    rectangle: {
        southWest: { longitude: number; latitude: number };
        northEast: { longitude: number; latitude: number };
    };
    exaggeration: number;
    minimumHeight: number;
    maximumHeight: number;
    relativeToCenter: THREE.Vector3;
    indices: Uint16Array | Uint32Array;
    offScreenCanvasId: string;
}

interface CreateVerticesResult {
    heightMapBuffer: ArrayBuffer;
    position3DAndHeight: Float32Array;
    altitudes: Float32Array;
    textureCoordAndEncodedNormals: Float32Array;
    indices: ArrayBuffer;
    westIndicesSouthToNorth: Uint16Array | Uint32Array;
    southIndicesEastToWest: Uint16Array | Uint32Array;
    eastIndicesNorthToSouth: Uint16Array | Uint32Array;
    northIndicesWestToEast: Uint16Array | Uint32Array;
    vertexStride: number;
    center: THREE.Vector3;
    minimumHeight: number;
    maximumHeight: number;
    boundingSphere?: THREE.Sphere;
    orientedBoundingBox?: any; // Replace with actual type if available
    occludeePointInScaledSpace?: any; // Replace with actual type if available
    encoding: TerrainEncoding;
    indexCountWithoutSkirts: number;
}

function geodeticLatitudeToMercatorAngle(latitude: number): number {
    // Clamp the latitude coordinate to the valid Mercator bounds.
    if (latitude > MercatorConstants.MAXIMUM_LATITUDE) {
        latitude = MercatorConstants.MAXIMUM_LATITUDE;
    } else if (latitude < -MercatorConstants.MAXIMUM_LATITUDE) {
        latitude = -MercatorConstants.MAXIMUM_LATITUDE;
    }
    const sinLatitude = Math.sin(latitude);
    return 0.5 * Math.log((1.0 + sinLatitude) / (1.0 - sinLatitude));
}

export function createVerticesFromQuantizedTerrainMesh(
    parameters: CreateVerticesParameters,
    transferableObjects: ArrayBuffer[],
    projection: any, // Replace with proper projection type
    tileKey: string
): CreateVerticesResult {
    const quantizedVertices = parameters.quantizedVertices;
    const quantizedVertexCount = quantizedVertices.length / 3;
    const octEncodedNormals = parameters.octEncodedNormals;
    let edgeVertexCount =
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

    const includeWebMercatorT = parameters.includeWebMercatorT;

    const rectangle = new GeoBox(
        GeoCoordinates.fromObject(parameters.rectangle.southWest),
        GeoCoordinates.fromObject(parameters.rectangle.northEast)
    );
    const west = rectangle.west * ARC;
    const south = rectangle.south * ARC;
    const east = rectangle.east * ARC;
    const north = rectangle.north * ARC;

    const exaggeration = parameters.exaggeration;
    const minimumHeight = parameters.minimumHeight * exaggeration;
    const maximumHeight = parameters.maximumHeight * exaggeration;

    const center = new THREE.Vector3().copy(parameters.relativeToCenter);
    const fromENU = new THREE.Matrix4().copy(eastNorthUpToFixedFrame(center, projection));
    const toENU = new THREE.Matrix4().copy(fromENU).invert();

    let southMercatorY: number;
    let oneOverMercatorHeight: number;
    if (includeWebMercatorT) {
        southMercatorY = geodeticLatitudeToMercatorAngle(south);
        oneOverMercatorHeight = 1.0 / (geodeticLatitudeToMercatorAngle(north) - southMercatorY);
    }

    const uBuffer = quantizedVertices.subarray(0, quantizedVertexCount);
    const vBuffer = quantizedVertices.subarray(quantizedVertexCount, 2 * quantizedVertexCount);
    const heightBuffer = quantizedVertices.subarray(
        quantizedVertexCount * 2,
        3 * quantizedVertexCount
    );
    const hasVertexNormals = defined(octEncodedNormals);

    const uvs: THREE.Vector2[] = new Array(quantizedVertexCount);
    const heights: number[] = new Array(quantizedVertexCount);
    const positions: THREE.Vector3[] = new Array(quantizedVertexCount);
    const cartographicScratchs: number[] = new Array(quantizedVertexCount * 3);
    const webMercatorTs: number[] = includeWebMercatorT ? new Array(quantizedVertexCount) : [];

    const minimum = scratchMinimum;
    minimum.x = Number.POSITIVE_INFINITY;
    minimum.y = Number.POSITIVE_INFINITY;
    minimum.z = Number.POSITIVE_INFINITY;

    const maximum = scratchMaximum;
    maximum.x = Number.NEGATIVE_INFINITY;
    maximum.y = Number.NEGATIVE_INFINITY;
    maximum.z = Number.NEGATIVE_INFINITY;

    let minLongitude = Number.POSITIVE_INFINITY;
    let maxLongitude = Number.NEGATIVE_INFINITY;
    let minLatitude = Number.POSITIVE_INFINITY;
    let minAltitude = Number.POSITIVE_INFINITY;
    let maxLatitude = Number.NEGATIVE_INFINITY;
    let maxAltitude = Number.NEGATIVE_INFINITY;

    for (let i = 0; i < quantizedVertexCount; ++i) {
        const rawU = uBuffer[i];
        const rawV = vBuffer[i];

        const u = rawU / maxShort;
        const v = rawV / maxShort;
        const height = THREE.MathUtils.lerp(
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

        const position = projection.projectPoint(cartographicScratch);

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

        cartesian3Scratch.copy(position).applyMatrix4(toENU);

        minimum.min(cartesian3Scratch);
        maximum.max(cartesian3Scratch);
    }

    const heightMapBuffer = renderHeightMap(
        parameters.offScreenCanvasId,
        [minLongitude, minLatitude, minAltitude, maxLongitude, maxLatitude, maxAltitude],
        cartographicScratchs,
        parameters.indices
    );

    const westIndicesSouthToNorth = copyAndSort(
        parameters.westIndices,
        (a, b) => uvs[a].y - uvs[b].y
    );
    const eastIndicesNorthToSouth = copyAndSort(
        parameters.eastIndices,
        (a, b) => uvs[b].y - uvs[a].y
    );
    const southIndicesEastToWest = copyAndSort(
        parameters.southIndices,
        (a, b) => uvs[a].x - uvs[b].x
    );
    const northIndicesWestToEast = copyAndSort(
        parameters.northIndices,
        (a, b) => uvs[b].x - uvs[a].x
    );

    let orientedBoundingBox: any; // Replace with actual type
    let boundingSphere: THREE.Sphere | undefined;

    if (exaggeration !== 1.0) {
        boundingSphere = makeBoundingSphereFromPoints(positions);

        // 使用OrientedBox3替换OrientedBoundingBox
        const center = new THREE.Vector3(
            (rectangle.west + rectangle.east) * 0.5,
            (rectangle.south + rectangle.north) * 0.5,
            (minimumHeight + maximumHeight) * 0.5
        );
        const size = new THREE.Vector3(
            rectangle.east - rectangle.west,
            rectangle.north - rectangle.south,
            maximumHeight - minimumHeight
        );

        const enuMatrix = eastNorthUpToFixedFrame(center, projection);
        const rotationMatrix = new THREE.Matrix4().extractRotation(enuMatrix);

        orientedBoundingBox = new OrientedBox3(center, rotationMatrix, size.multiplyScalar(0.5));
    }

    let occludeePointInScaledSpace: any; // Replace with actual type

    let hMin = minimumHeight;
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

    const aaBox = new AxisAlignedBox3(minimum, maximum);
    const encoding = createTerrainEncoding(
        aaBox,
        hMin,
        maximumHeight,
        fromENU,
        true,
        includeWebMercatorT
    );
    const vertexStride = getStride(encoding);
    const size = quantizedVertexCount * vertexStride + edgeVertexCount * vertexStride;
    const vertexBuffer = new Float32Array(size);

    let bufferIndex = 0;
    for (let j = 0; j < quantizedVertexCount; ++j) {
        if (hasVertexNormals) {
            const n = j * 2.0;
            toPack.x = octEncodedNormals[n];
            toPack.y = octEncodedNormals[n + 1];

            if (exaggeration !== 1.0) {
                const normal = octDecode(toPack.x, toPack.y, scratchNormal);
                const fromENUNormal = eastNorthUpToFixedFrame(
                    positions[j],
                    projection,
                    scratchFromENU
                );
                const toENUNormal = new THREE.Matrix4().copy(fromENUNormal).invert();

                normal.applyMatrix4(toENUNormal);
                normal.z *= exaggeration;
                normal.normalize();

                normal.applyMatrix4(fromENUNormal);
                normal.normalize();

                octEncode(normal, toPack);
            }
        }

        bufferIndex = encodeTerrainData(
            encoding,
            vertexBuffer,
            bufferIndex,
            positions[j],
            uvs[j],
            heights[j],
            toPack,
            webMercatorTs[j]
        );
    }

    const edgeTriangleCount = Math.max(0, (edgeVertexCount - 4) * 2);
    const indexBufferLength = parameters.indices.length + edgeTriangleCount * 3;
    const indexBuffer = IndexDatatype.createTypedArray(
        quantizedVertexCount + edgeVertexCount,
        indexBufferLength
    );
    indexBuffer.set(parameters.indices, 0);

    {
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute("position", new THREE.BufferAttribute(vertexBuffer, vertexStride));
        geometry.setIndex(new THREE.BufferAttribute(indexBuffer, 1));
        geometry.computeVertexNormals();

        {
            const normalBuffer = geometry.getAttribute("normal").array;
            const positionBuffer = geometry.getAttribute("position");
            const normal = new THREE.Vector3();
            for (let i = 0, j = 0; i < normalBuffer.length; i += 3, j++) {
                normal.fromArray(normalBuffer, i);
                if (normal.length() === 0) {
                    normal
                        .set(positionBuffer.getX(j), positionBuffer.getY(j), positionBuffer.getZ(j))
                        .sub(center)
                        .normalize();
                    continue;
                }
                vertexBuffer[j * vertexStride + vertexStride - 1] = octEncodeFloat(normal);
            }
        }
    }

    const percentage = 0.0001;
    const lonOffset = (maxLongitude - minLongitude) * percentage;
    const latOffset = (maxLatitude - minLatitude) * percentage;
    const westLongitudeOffset = -lonOffset;
    const westLatitudeOffset = 0.0;
    const eastLongitudeOffset = lonOffset;
    const eastLatitudeOffset = 0.0;
    const northLongitudeOffset = 0.0;
    const northLatitudeOffset = latOffset;
    const southLongitudeOffset = 0.0;
    const southLatitudeOffset = -latOffset;

    // Add skirts
    if (parameters.westSkirtHeight) {
        const vertexBufferIndex = quantizedVertexCount * vertexStride;
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
        const vertexBufferIndex =
            quantizedVertexCount * vertexStride + parameters.westIndices.length * vertexStride;
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
        const vertexBufferIndex =
            quantizedVertexCount * vertexStride +
            parameters.westIndices.length * vertexStride +
            parameters.southIndices.length * vertexStride;
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
        const vertexBufferIndex =
            quantizedVertexCount * vertexStride +
            parameters.westIndices.length * vertexStride +
            parameters.southIndices.length * vertexStride +
            parameters.eastIndices.length * vertexStride;
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
        addSkirtIndices(
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

    const pos = center.clone();
    const vertexs = new Float32Array(vertexBuffer.buffer);
    const position = new Float32Array((vertexs.length / vertexStride) * 3);
    const altitudes = new Float32Array(vertexs.length / vertexStride);
    const uv = new Float32Array(vertexs.length / 2);

    for (
        let i = 0, j = 0, k = 0, u = 0;
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
        heightMapBuffer,
        position3DAndHeight: position,
        altitudes,
        textureCoordAndEncodedNormals: uv,
        indices: indexBuffer.buffer,
        westIndicesSouthToNorth: westIndicesSouthToNorth,
        southIndicesEastToWest: southIndicesEastToWest,
        eastIndicesNorthToSouth: eastIndicesNorthToSouth,
        northIndicesWestToEast: northIndicesWestToEast,
        vertexStride,
        center,
        minimumHeight,
        maximumHeight,
        boundingSphere,
        orientedBoundingBox,
        occludeePointInScaledSpace,
        encoding,
        indexCountWithoutSkirts: parameters.indices.length
    };
}

function findMinMaxSkirts(
    edgeIndices: Uint16Array | Uint32Array,
    edgeHeight: number | undefined,
    heights: number[],
    uvs: THREE.Vector2[],
    rectangle: GeoBox,
    projection: any,
    toENU: THREE.Matrix4,
    minimum: THREE.Vector3,
    maximum: THREE.Vector3
): number {
    let hMin = Number.POSITIVE_INFINITY;

    const north = rectangle.north * ARC;
    const south = rectangle.south * ARC;
    const east = rectangle.east * ARC;
    const west = rectangle.west * ARC;

    const adjustedEast = east < west ? east + TWO_PI : east;

    const length = edgeIndices.length;
    for (let i = 0; i < length; ++i) {
        const index = edgeIndices[i];
        const h = heights[index];
        const uv = uvs[index];

        cartographicScratch.longitude = THREE.MathUtils.lerp(west, adjustedEast, uv.x) / ARC;
        cartographicScratch.latitude = THREE.MathUtils.lerp(south, north, uv.y) / ARC;
        cartographicScratch.altitude = h - (edgeHeight || 0);

        const position = cartesian3Scratch.copy(projection.projectPoint(cartographicScratch));
        position.applyMatrix4(toENU);

        minimum.min(position);
        maximum.max(position);

        hMin = Math.min(hMin, cartographicScratch.altitude);
    }
    return hMin;
}

function addSkirt(
    vertexBuffer: Float32Array,
    vertexBufferIndex: number,
    edgeVertices: Uint16Array | Uint32Array,
    encoding: TerrainEncoding,
    heights: number[],
    uvs: THREE.Vector2[],
    octEncodedNormals: Uint8Array | undefined,
    projection: any,
    rectangle: GeoBox,
    skirtLength: number,
    exaggeration: number,
    southMercatorY: number,
    oneOverMercatorHeight: number,
    longitudeOffset: number,
    latitudeOffset: number
): void {
    const hasVertexNormals = defined(octEncodedNormals);

    const north = rectangle.north * ARC;
    const south = rectangle.south * ARC;
    const east = rectangle.east * ARC;
    const west = rectangle.west * ARC;

    const adjustedEast = east < west ? east + TWO_PI : east;

    const length = edgeVertices.length;
    for (let i = 0; i < length; ++i) {
        const index = edgeVertices[i];
        const h = heights[index];
        const uv = uvs[index];

        cartographicScratch.longitude =
            (THREE.MathUtils.lerp(west, adjustedEast, uv.x) + longitudeOffset) / ARC;
        cartographicScratch.latitude =
            (THREE.MathUtils.lerp(south, north, uv.y) + latitudeOffset) / ARC;
        cartographicScratch.altitude = h - skirtLength;

        const position = cartesian3Scratch.copy(projection.projectPoint(cartographicScratch));

        if (hasVertexNormals) {
            const n = index * 2.0;
            toPack.x = octEncodedNormals[n];
            toPack.y = octEncodedNormals[n + 1];

            if (exaggeration !== 1.0) {
                const normal = octDecode(toPack.x, toPack.y, scratchNormal);
                const fromENUNormal = eastNorthUpToFixedFrame(
                    cartesian3Scratch,
                    projection,
                    scratchFromENU
                );
                const toENUNormal = new THREE.Matrix4().copy(fromENUNormal).invert();

                normal.applyMatrix4(toENUNormal);
                normal.z *= exaggeration;
                normal.normalize();

                normal.applyMatrix4(fromENUNormal);
                normal.normalize();

                octEncode(normal, toPack);
            }
        }

        let webMercatorT: number | undefined;
        if (encoding.hasWebMercatorT) {
            webMercatorT =
                (geodeticLatitudeToMercatorAngle(cartographicScratch.latitudeInRadians) -
                    southMercatorY) *
                oneOverMercatorHeight;
        }

        vertexBufferIndex = encodeTerrainData(
            encoding,
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

function copyAndSort<T extends Uint16Array | Uint32Array>(
    typedArray: T,
    comparator: (a: number, b: number) => number
): T {
    let copy: T;
    if (typeof typedArray.slice === "function") {
        copy = typedArray.slice() as T;
        if (typeof copy.sort !== "function") {
            copy = undefined as unknown as T;
        }
    }

    if (!defined(copy)) {
        copy = Array.prototype.slice.call(typedArray) as unknown as T;
    }

    (copy as unknown as number[]).sort(comparator);

    return copy;
}
