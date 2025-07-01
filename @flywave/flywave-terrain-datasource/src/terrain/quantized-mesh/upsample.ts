import {
    clipTriangleAtAxisAlignedThreshold,
    GeoBox,
    GeoCoordinates
} from "@flywave/flywave-geoutils";
import { defined, IndexDatatype } from "@flywave/flywave-utils";
import * as THREE from "three";

import { getOctEncodedNormal, TerrainEncoding } from "./decoder";
import { fromVertices } from "./sphere";

const ARC = Math.PI / 180;
const TWO_PI = 2.0 * Math.PI;
const maxShort = 32767;
const halfMaxShort = (maxShort / 2) | 0;

class Vertex {
    uBuffer?: number[];
    vBuffer?: number[];
    heightBuffer?: number[];
    normalBuffer?: number[];
    index?: number;
    first?: Vertex;
    second?: Vertex;
    ratio?: number;
    newIndex?: number;

    clone(result?: Vertex): Vertex {
        if (!defined(result)) {
            result = new Vertex();
        }

        result.uBuffer = this.uBuffer;
        result.vBuffer = this.vBuffer;
        result.heightBuffer = this.heightBuffer;
        result.normalBuffer = this.normalBuffer;
        result.index = this.index;
        result.first = this.first;
        result.second = this.second;
        result.ratio = this.ratio;

        return result;
    }

    initializeIndexed(
        uBuffer: number[],
        vBuffer: number[],
        heightBuffer: number[],
        normalBuffer: number[] | undefined,
        index: number
    ): void {
        this.uBuffer = uBuffer;
        this.vBuffer = vBuffer;
        this.heightBuffer = heightBuffer;
        this.normalBuffer = normalBuffer;
        this.index = index;
        this.first = undefined;
        this.second = undefined;
        this.ratio = undefined;
    }

    initializeFromClipResult(clipResult: number[], index: number, vertices: Vertex[]): number {
        let nextIndex = index + 1;

        if (clipResult[index] !== -1) {
            vertices[clipResult[index]].clone(this);
        } else {
            this.index = undefined;
            this.first = vertices[clipResult[nextIndex]];
            nextIndex++;
            this.second = vertices[clipResult[nextIndex]];
            nextIndex++;
            this.ratio = clipResult[nextIndex];
            nextIndex++;
        }

        return nextIndex;
    }

    getKey(): string | number {
        if (this.isIndexed()) {
            return this.index!;
        }
        return JSON.stringify({
            first: this.first!.getKey(),
            second: this.second!.getKey(),
            ratio: this.ratio
        });
    }

    isIndexed(): boolean {
        return defined(this.index);
    }

    getH(): number {
        if (defined(this.index)) {
            return this.heightBuffer![this.index];
        }
        return THREE.MathUtils.lerp(this.first!.getH(), this.second!.getH(), this.ratio!);
    }

    getU(): number {
        if (defined(this.index)) {
            return this.uBuffer![this.index];
        }
        return THREE.MathUtils.lerp(this.first!.getU(), this.second!.getU(), this.ratio!);
    }

    getV(): number {
        if (defined(this.index)) {
            return this.vBuffer![this.index];
        }
        return THREE.MathUtils.lerp(this.first!.getV(), this.second!.getV(), this.ratio!);
    }

    getNormalX(): number {
        if (!defined(this.index) || !this.normalBuffer) {
            return lerpOctEncodedNormal(this).x;
        }
        return this.normalBuffer[this.index * 2];
    }

    getNormalY(): number {
        if (!defined(this.index) || !this.normalBuffer) {
            return lerpOctEncodedNormal(this).y;
        }
        return this.normalBuffer[this.index * 2 + 1];
    }
}
// 在文件顶部添加这些辅助函数
function octDecode(x: number, y: number, result: THREE.Vector3): THREE.Vector3 {
    result.set(x, y, 1.0 - (Math.abs(x) + Math.abs(y)));
    if (result.z < 0.0) {
        const oldX = result.x;
        result.x = (1.0 - Math.abs(result.y)) * (x < 0.0 ? -1.0 : 1.0);
        result.y = (1.0 - Math.abs(oldX)) * (y < 0.0 ? -1.0 : 1.0);
    }
    return result.normalize();
}

function octEncode(vector: THREE.Vector3, result: THREE.Vector2): THREE.Vector2 {
    const len = Math.abs(vector.x) + Math.abs(vector.y) + Math.abs(vector.z);
    result.x = vector.x / len;
    result.y = vector.y / len;

    if (vector.z < 0.0) {
        const x = result.x;
        result.x = (1.0 - Math.abs(result.y)) * (x < 0.0 ? -1.0 : 1.0);
        result.y = (1.0 - Math.abs(x)) * (result.y < 0.0 ? -1.0 : 1.0);
    }
    return result;
}

let depth = -1;
const cartesianScratch1 = [new THREE.Vector3(), new THREE.Vector3()];
const cartesianScratch2 = [new THREE.Vector3(), new THREE.Vector3()];
const cartesian3Scratch = new THREE.Vector3();
const encodedScratch = new THREE.Vector2();

function lerpOctEncodedNormal(vertex: Vertex): THREE.Vector2 {
    depth++;
    const first = cartesianScratch1[depth];
    const second = cartesianScratch2[depth];

    octDecode(vertex.first!.getNormalX(), vertex.first!.getNormalY(), first);
    octDecode(vertex.second!.getNormalX(), vertex.second!.getNormalY(), second);

    cartesian3Scratch.copy(first).lerp(second, vertex.ratio!);
    cartesian3Scratch.normalize();

    octEncode(cartesian3Scratch, encodedScratch);
    depth--;

    return encodedScratch;
}

function addClippedPolygon(
    uBuffer: number[],
    vBuffer: number[],
    heightBuffer: number[],
    normalBuffer: number[],
    indices: number[],
    vertexMap: Record<string | number, number>,
    clipped: number[],
    triangleVertices: Vertex[],
    hasVertexNormals: boolean
): void {
    if (clipped.length === 0) {
        return;
    }

    const polygonVertices = [new Vertex(), new Vertex(), new Vertex(), new Vertex()];
    let numVertices = 0;
    let clippedIndex = 0;

    while (clippedIndex < clipped.length) {
        clippedIndex = polygonVertices[numVertices].initializeFromClipResult(
            clipped,
            clippedIndex,
            triangleVertices
        );
        numVertices++;
    }

    for (let i = 0; i < numVertices; i++) {
        const polygonVertex = polygonVertices[i];
        if (!polygonVertex.isIndexed()) {
            const key = polygonVertex.getKey();
            if (vertexMap[key] !== undefined) {
                polygonVertex.newIndex = vertexMap[key];
            } else {
                const newIndex = uBuffer.length;
                uBuffer.push(polygonVertex.getU());
                vBuffer.push(polygonVertex.getV());
                heightBuffer.push(polygonVertex.getH());
                if (hasVertexNormals) {
                    normalBuffer.push(polygonVertex.getNormalX());
                    normalBuffer.push(polygonVertex.getNormalY());
                }
                polygonVertex.newIndex = newIndex;
                vertexMap[key] = newIndex;
            }
        } else {
            polygonVertex.newIndex = vertexMap[polygonVertex.index!];
            polygonVertex.uBuffer = uBuffer;
            polygonVertex.vBuffer = vBuffer;
            polygonVertex.heightBuffer = heightBuffer;
            if (hasVertexNormals) {
                polygonVertex.normalBuffer = normalBuffer;
            }
        }
    }

    if (numVertices === 3) {
        indices.push(polygonVertices[0].newIndex!);
        indices.push(polygonVertices[1].newIndex!);
        indices.push(polygonVertices[2].newIndex!);
    } else if (numVertices === 4) {
        indices.push(polygonVertices[0].newIndex!);
        indices.push(polygonVertices[1].newIndex!);
        indices.push(polygonVertices[2].newIndex!);
        indices.push(polygonVertices[0].newIndex!);
        indices.push(polygonVertices[2].newIndex!);
        indices.push(polygonVertices[3].newIndex!);
    }
}

interface UpsampleParameters {
    isEastChild: boolean;
    isNorthChild: boolean;
    heights: number[];
    vertices: any;
    textureCoordAndEncodedNormals: Uint8Array | Float32Array;
    position3DAndHeight: any;
    indices: Uint16Array | Uint32Array;
    indexCountWithoutSkirts: number;
    exaggeration: number;
    vertexCountWithoutSkirts: number;
    minimumHeight: number;
    maximumHeight: number;
    hasVertexNormals: boolean;
    childRectangle: {
        southWest: GeoCoordinates;
        northEast: GeoCoordinates;
    };
    encoding: TerrainEncoding;
}

export function upsampleQuantizedTerrainMesh(
    parameters: UpsampleParameters,
    transferableObjects: Transferable[],
    projection: {
        projectPoint: (coord: GeoCoordinates) => THREE.Vector3;
    },
    tileKey?: string
): {
    vertices: ArrayBuffer;
    encodedNormals: ArrayBuffer | undefined;
    indices: ArrayBuffer;
    minimumHeight: number;
    maximumHeight: number;
    westIndices: number[];
    southIndices: number[];
    eastIndices: number[];
    northIndices: number[];
    boundingSphere: THREE.Sphere;
} {
    const clipScratch: number[] = [];
    const clipScratch2: number[] = [];
    const verticesScratch: number[] = [];
    const cartographicScratch = new GeoCoordinates(0, 0);
    const uScratch: number[] = [];
    const vScratch: number[] = [];
    const heightScratch: number[] = [];
    const indicesScratch: number[] = [];
    const normalsScratch: number[] = [];
    const boundingSphereScratch = new THREE.Sphere();
    const decodeTexCoordsScratch = new THREE.Vector2();
    const octEncodedNormalScratch = new THREE.Vector3();

    const { isEastChild, isNorthChild } = parameters;
    const minU = isEastChild ? halfMaxShort : 0;
    const maxU = isEastChild ? maxShort : halfMaxShort;
    const minV = isNorthChild ? halfMaxShort : 0;
    const maxV = isNorthChild ? maxShort : halfMaxShort;

    const uBuffer = uScratch;
    const vBuffer = vScratch;
    const heightBuffer = heightScratch;
    const normalBuffer = normalsScratch;
    const { heights } = parameters;

    uBuffer.length = 0;
    vBuffer.length = 0;
    heightBuffer.length = 0;
    normalBuffer.length = 0;

    const indices = indicesScratch;
    indices.length = 0;

    const vertexMap: Record<string | number, number> = {};
    const parentTextureCoordAndEncodedNormals = parameters.textureCoordAndEncodedNormals;
    const hasVertexNormals = parameters.hasVertexNormals;
    const { exaggeration } = parameters;

    let vertexCount = 0;
    const quantizedVertexCount = parameters.vertexCountWithoutSkirts;

    const parentMinimumHeight = parameters.minimumHeight;
    const parentMaximumHeight = parameters.maximumHeight;

    const parentUBuffer: number[] = new Array(quantizedVertexCount);
    const parentVBuffer: number[] = new Array(quantizedVertexCount);
    const parentHeightBuffer: number[] = new Array(quantizedVertexCount);
    const parentNormalBuffer: number[] | undefined = hasVertexNormals
        ? new Array(quantizedVertexCount * 2)
        : undefined;

    const threshold = 20;
    let height: number;

    for (let i = 0, n = 0; i < quantizedVertexCount; ++i, n += 2) {
        decodeTexCoordsScratch.fromArray(parentTextureCoordAndEncodedNormals, i * 4);
        height = heights[i] / exaggeration;

        let u = THREE.MathUtils.clamp(Math.floor(decodeTexCoordsScratch.x * maxShort), 0, maxShort);
        let v = THREE.MathUtils.clamp(Math.floor(decodeTexCoordsScratch.y * maxShort), 0, maxShort);

        parentHeightBuffer[i] = THREE.MathUtils.clamp(
            Math.floor(
                ((height - parentMinimumHeight) / (parentMaximumHeight - parentMinimumHeight)) *
                    maxShort
            ),
            0,
            maxShort
        );

        if (u < threshold) u = 0;
        if (v < threshold) v = 0;
        if (maxShort - u < threshold) u = maxShort;
        if (maxShort - v < threshold) v = maxShort;

        parentUBuffer[i] = u;
        parentVBuffer[i] = v;

        if (hasVertexNormals && parentNormalBuffer) {
            getOctEncodedNormal(
                parentTextureCoordAndEncodedNormals,
                i * 4,
                parameters.encoding,
                octEncodedNormalScratch
            );
            parentNormalBuffer[n] = octEncodedNormalScratch.x;
            parentNormalBuffer[n + 1] = octEncodedNormalScratch.y;
        }

        if (
            ((isEastChild && u >= halfMaxShort) || (!isEastChild && u <= halfMaxShort)) &&
            ((isNorthChild && v >= halfMaxShort) || (!isNorthChild && v <= halfMaxShort))
        ) {
            vertexMap[i] = vertexCount;
            uBuffer.push(u);
            vBuffer.push(v);
            heightBuffer.push(parentHeightBuffer[i]);
            if (hasVertexNormals && parentNormalBuffer) {
                normalBuffer.push(parentNormalBuffer[n]);
                normalBuffer.push(parentNormalBuffer[n + 1]);
            }
            vertexCount++;
        }
    }

    const triangleVertices = [new Vertex(), new Vertex(), new Vertex()];
    const clippedTriangleVertices = [new Vertex(), new Vertex(), new Vertex()];
    const parentIndices = parameters.indices.subarray(0, parameters.indexCountWithoutSkirts);

    for (let i = 0; i < parentIndices.length; i += 3) {
        const i0 = parentIndices[i];
        const i1 = parentIndices[i + 1];
        const i2 = parentIndices[i + 2];

        const u0 = parentUBuffer[i0];
        const u1 = parentUBuffer[i1];
        const u2 = parentUBuffer[i2];

        triangleVertices[0].initializeIndexed(
            parentUBuffer,
            parentVBuffer,
            parentHeightBuffer,
            parentNormalBuffer,
            i0
        );
        triangleVertices[1].initializeIndexed(
            parentUBuffer,
            parentVBuffer,
            parentHeightBuffer,
            parentNormalBuffer,
            i1
        );
        triangleVertices[2].initializeIndexed(
            parentUBuffer,
            parentVBuffer,
            parentHeightBuffer,
            parentNormalBuffer,
            i2
        );

        // Clip triangle on east-west boundary
        const clipped = clipTriangleAtAxisAlignedThreshold(
            halfMaxShort,
            isEastChild,
            u0,
            u1,
            u2,
            clipScratch
        );

        // Process first clipped triangle
        let clippedIndex = 0;
        if (clippedIndex >= clipped.length) continue;

        clippedIndex = clippedTriangleVertices[0].initializeFromClipResult(
            clipped,
            clippedIndex,
            triangleVertices
        );
        if (clippedIndex >= clipped.length) continue;

        clippedIndex = clippedTriangleVertices[1].initializeFromClipResult(
            clipped,
            clippedIndex,
            triangleVertices
        );
        if (clippedIndex >= clipped.length) continue;

        clippedIndex = clippedTriangleVertices[2].initializeFromClipResult(
            clipped,
            clippedIndex,
            triangleVertices
        );

        // Clip against north-south boundary
        const clipped2 = clipTriangleAtAxisAlignedThreshold(
            halfMaxShort,
            isNorthChild,
            clippedTriangleVertices[0].getV(),
            clippedTriangleVertices[1].getV(),
            clippedTriangleVertices[2].getV(),
            clipScratch2
        );
        addClippedPolygon(
            uBuffer,
            vBuffer,
            heightBuffer,
            normalBuffer,
            indices,
            vertexMap,
            clipped2,
            clippedTriangleVertices,
            hasVertexNormals
        );

        // Process second triangle if exists
        if (clippedIndex < clipped.length) {
            clippedTriangleVertices[1].clone(clippedTriangleVertices[2]);
            clippedTriangleVertices[2].initializeFromClipResult(
                clipped,
                clippedIndex,
                triangleVertices
            );

            const clipped2 = clipTriangleAtAxisAlignedThreshold(
                halfMaxShort,
                isNorthChild,
                clippedTriangleVertices[0].getV(),
                clippedTriangleVertices[1].getV(),
                clippedTriangleVertices[2].getV(),
                clipScratch2
            );
            addClippedPolygon(
                uBuffer,
                vBuffer,
                heightBuffer,
                normalBuffer,
                indices,
                vertexMap,
                clipped2,
                clippedTriangleVertices,
                hasVertexNormals
            );
        }
    }

    const uOffset = isEastChild ? -maxShort : 0;
    const vOffset = isNorthChild ? -maxShort : 0;

    const westIndices: number[] = [];
    const southIndices: number[] = [];
    const eastIndices: number[] = [];
    const northIndices: number[] = [];

    let minimumHeight = Number.MAX_VALUE;
    let maximumHeight = -minimumHeight;

    const cartesianVertices = verticesScratch;
    cartesianVertices.length = 0;

    const rectangle = new GeoBox(
        GeoCoordinates.fromObject(parameters.childRectangle.southWest),
        GeoCoordinates.fromObject(parameters.childRectangle.northEast)
    );

    const north = rectangle.north * ARC;
    const south = rectangle.south * ARC;
    const east = rectangle.east * ARC;
    const west = rectangle.west * ARC;

    const adjustedEast = east < west ? east + TWO_PI : east;

    for (let i = 0; i < uBuffer.length; ++i) {
        let u = Math.round(uBuffer[i]);
        if (u <= minU) {
            westIndices.push(i);
            u = 0;
        } else if (u >= maxU) {
            eastIndices.push(i);
            u = maxShort;
        } else {
            u = u * 2 + uOffset;
        }
        uBuffer[i] = u;

        let v = Math.round(vBuffer[i]);
        if (v <= minV) {
            southIndices.push(i);
            v = 0;
        } else if (v >= maxV) {
            northIndices.push(i);
            v = maxShort;
        } else {
            v = v * 2 + vOffset;
        }
        vBuffer[i] = v;

        height = THREE.MathUtils.lerp(
            parentMinimumHeight,
            parentMaximumHeight,
            heightBuffer[i] / maxShort
        );
        minimumHeight = Math.min(minimumHeight, height);
        maximumHeight = Math.max(maximumHeight, height);
        heightBuffer[i] = height;

        cartographicScratch.longitude =
            THREE.MathUtils.lerp(west, adjustedEast, u / maxShort) / ARC;
        cartographicScratch.latitude = THREE.MathUtils.lerp(south, north, v / maxShort) / ARC;
        cartographicScratch.altitude = height;

        const position = projection.projectPoint(cartographicScratch);
        cartesianVertices.push(position.x, position.y, position.z);
    }

    const boundingSphere = fromVertices(
        cartesianVertices,
        new THREE.Vector3(),
        3,
        boundingSphereScratch
    );

    const heightRange = maximumHeight - minimumHeight;
    const vertices = new Uint16Array(uBuffer.length + vBuffer.length + heightBuffer.length);

    vertices.set(uBuffer, 0);
    vertices.set(vBuffer, uBuffer.length);
    const heightOffset = uBuffer.length + vBuffer.length;
    for (let i = 0; i < heightBuffer.length; ++i) {
        vertices[heightOffset + i] = Math.floor(
            (maxShort * (heightBuffer[i] - minimumHeight)) / heightRange
        );
    }

    const indicesTypedArray = IndexDatatype.createTypedArray(uBuffer.length, indices);

    let encodedNormals: ArrayBuffer | undefined;
    if (hasVertexNormals) {
        const normalArray = new Uint8Array(normalBuffer);
        transferableObjects.push(vertices.buffer, indicesTypedArray.buffer, normalArray.buffer);
        encodedNormals = normalArray.buffer;
    } else {
        transferableObjects.push(vertices.buffer, indicesTypedArray.buffer);
    }

    return {
        vertices: vertices.buffer,
        encodedNormals: encodedNormals,
        indices: indicesTypedArray.buffer,
        minimumHeight,
        maximumHeight,
        westIndices,
        southIndices,
        eastIndices,
        northIndices,
        boundingSphere
    };
}
