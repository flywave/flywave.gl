import { computeBarycentricCoordinates, OrientedBox3, TileKey } from "@flywave/flywave-geoutils";
import { defaultValue, defined, IndexDatatype } from "@flywave/flywave-utils";
import * as THREE from "three";
import { clamp } from "three/src/math/MathUtils";

import { HeightMap } from "../render-heightmap";
import { decodeHeight, decodeTextureCoordinates } from "./decoder";
import TerrainMesh from "./mesh";

interface QuantizedMeshTerrainDataOptions {
    quantizedVertices: Uint16Array;
    indices: Uint16Array | Uint32Array;
    minimumHeight: number;
    maximumHeight: number;
    boundingSphere: THREE.Sphere;
    orientedBoundingBox?: OrientedBox3;
    horizonOcclusionPoint?: THREE.Vector3;
    westIndices: number[] | Uint16Array | Uint32Array;
    southIndices: number[] | Uint16Array | Uint32Array;
    eastIndices: number[] | Uint16Array | Uint32Array;
    northIndices: number[] | Uint16Array | Uint32Array;
    westSkirtHeight: number;
    southSkirtHeight: number;
    eastSkirtHeight: number;
    northSkirtHeight: number;
    childTileMask?: number;
    createdByUpsampling?: boolean;
    encodedNormals?: Uint8Array;
    waterMask?: Uint8Array;
    credits?: any[]; // Replace with proper Credit type if available
    stratumGroups?: any; // Replace with proper type if available
}

interface CreateMeshOptions {
    tilingScheme: any; // Replace with proper TilingScheme type
    x: number;
    y: number;
    level: number;
    exaggeration?: number;
    throttle?: boolean;
}

class QuantizedMeshTerrainData {
    private _quantizedVertices: Uint16Array;
    private _encodedNormals?: Uint8Array;
    private _indices: Uint16Array | Uint32Array;
    private readonly _minimumHeight: number;
    private readonly _maximumHeight: number;
    private readonly _boundingSphere: THREE.Sphere;
    private readonly _orientedBoundingBox?: OrientedBox3;
    private readonly _horizonOcclusionPoint?: THREE.Vector3;
    private _uValues: Uint16Array;
    private _vValues: Uint16Array;
    private _heightValues: Uint16Array;
    private _westIndices: Uint16Array | Uint32Array;
    private _southIndices: Uint16Array | Uint32Array;
    private _eastIndices: Uint16Array | Uint32Array;
    private _northIndices: Uint16Array | Uint32Array;
    private readonly _westSkirtHeight: number;
    private readonly _southSkirtHeight: number;
    private readonly _eastSkirtHeight: number;
    private readonly _northSkirtHeight: number;
    private readonly _childTileMask: number;
    private readonly _createdByUpsampling: boolean;
    private readonly _waterMask?: Uint8Array;
    private readonly _stratumGroups?: any;
    private _mesh?: TerrainMesh;
    private readonly _credits?: any[];
    public heightMap?: HeightMap;

    // Add this getter method
    get mesh(): TerrainMesh | undefined {
        return this._mesh;
    }

    get uValues(): Uint16Array {
        return this._uValues;
    }

    get vValues(): Uint16Array {
        return this._vValues;
    }

    get heightValues(): Uint16Array {
        return this._heightValues;
    }

    get indices(): Uint16Array | Uint32Array {
        return this._indices;
    }

    get minimumHeight(): number {
        return this._minimumHeight;
    }

    get maximumHeight(): number {
        return this._maximumHeight;
    }

    constructor(options: QuantizedMeshTerrainDataOptions) {
        if (!defined(options) || !defined(options.quantizedVertices)) {
            throw new Error("options.quantizedVertices is required.");
        }
        if (!defined(options.indices)) {
            throw new Error("options.indices is required.");
        }
        if (!defined(options.minimumHeight)) {
            throw new Error("options.minimumHeight is required.");
        }
        if (!defined(options.maximumHeight)) {
            throw new Error("options.maximumHeight is required.");
        }
        if (!defined(options.westIndices)) {
            throw new Error("options.westIndices is required.");
        }
        if (!defined(options.southIndices)) {
            throw new Error("options.southIndices is required.");
        }
        if (!defined(options.eastIndices)) {
            throw new Error("options.eastIndices is required.");
        }
        if (!defined(options.northIndices)) {
            throw new Error("options.northIndices is required.");
        }
        if (!defined(options.westSkirtHeight)) {
            throw new Error("options.westSkirtHeight is required.");
        }
        if (!defined(options.southSkirtHeight)) {
            throw new Error("options.southSkirtHeight is required.");
        }
        if (!defined(options.eastSkirtHeight)) {
            throw new Error("options.eastSkirtHeight is required.");
        }
        if (!defined(options.northSkirtHeight)) {
            throw new Error("options.northSkirtHeight is required.");
        }

        this._quantizedVertices = options.quantizedVertices;
        this._encodedNormals = options.encodedNormals;
        this._indices = options.indices;
        this._minimumHeight = options.minimumHeight;
        this._maximumHeight = options.maximumHeight;
        this._boundingSphere = options.boundingSphere;
        this._orientedBoundingBox = options.orientedBoundingBox;
        this._horizonOcclusionPoint = options.horizonOcclusionPoint;

        const vertexCount = this._quantizedVertices.length / 3;
        this._uValues = this._quantizedVertices.subarray(0, vertexCount);
        this._vValues = this._quantizedVertices.subarray(vertexCount, 2 * vertexCount);
        this._heightValues = this._quantizedVertices.subarray(2 * vertexCount, 3 * vertexCount);

        const sortByV = (a: number, b: number) => this._vValues[a] - this._vValues[b];
        const sortByU = (a: number, b: number) => this._uValues[a] - this._uValues[b];

        this._westIndices = sortIndicesIfNecessary(options.westIndices, sortByV, vertexCount);
        this._southIndices = sortIndicesIfNecessary(options.southIndices, sortByU, vertexCount);
        this._eastIndices = sortIndicesIfNecessary(options.eastIndices, sortByV, vertexCount);
        this._northIndices = sortIndicesIfNecessary(options.northIndices, sortByU, vertexCount);

        this._westSkirtHeight = options.westSkirtHeight;
        this._southSkirtHeight = options.southSkirtHeight;
        this._eastSkirtHeight = options.eastSkirtHeight;
        this._northSkirtHeight = options.northSkirtHeight;

        this._childTileMask = defaultValue(options.childTileMask, 15);
        this._createdByUpsampling = defaultValue(options.createdByUpsampling, false);
        this._waterMask = options.waterMask;
        this._stratumGroups = options.stratumGroups;
    }

    get credits(): any[] | undefined {
        return this._credits;
    }

    get waterMask(): Uint8Array | undefined {
        return this._waterMask;
    }

    get childTileMask(): number {
        return this._childTileMask;
    }

    get canUpsample(): boolean {
        return defined(this._mesh);
    }

    createMesh(options: CreateMeshOptions, task: Function): Promise<TerrainMesh> | undefined {
        options = defaultValue(options, {} as CreateMeshOptions);

        const tilingScheme = options.tilingScheme;
        const x = options.x;
        const y = options.y;
        const level = options.level;
        const exaggeration = defaultValue(options.exaggeration, 1.0);

        const ellipsoid = tilingScheme.ellipsoid;
        const rectangle = tilingScheme.getGeoBox(new TileKey(y, x, level));

        const verticesPromise = task({
            x,
            y,
            level,
            minimumHeight: this._minimumHeight,
            maximumHeight: this._maximumHeight,
            quantizedVertices: this._quantizedVertices,
            octEncodedNormals: this._encodedNormals,
            includeWebMercatorT: true,
            indices: this._indices,
            westIndices: this._westIndices,
            southIndices: this._southIndices,
            eastIndices: this._eastIndices,
            northIndices: this._northIndices,
            westSkirtHeight: this._westSkirtHeight,
            southSkirtHeight: this._southSkirtHeight,
            eastSkirtHeight: this._eastSkirtHeight,
            northSkirtHeight: this._northSkirtHeight,
            rectangle: rectangle,
            relativeToCenter: this._boundingSphere.center,
            ellipsoid: ellipsoid,
            exaggeration: exaggeration
        });

        if (!defined(verticesPromise)) {
            return undefined;
        }

        return verticesPromise.then((result: any) => {
            const vertexCountWithoutSkirts = this._quantizedVertices.length / 3;
            const vertexCount =
                vertexCountWithoutSkirts +
                this._westIndices.length +
                this._southIndices.length +
                this._eastIndices.length +
                this._northIndices.length;
            const indicesTypedArray = IndexDatatype.createTypedArray(vertexCount, result.indices);

            const textureCoordAndEncodedNormals = new Float32Array(
                result.textureCoordAndEncodedNormals
            );
            const position3DAndHeight = new Float32Array(result.position3DAndHeight);
            const rtc = result.center;
            const minimumHeight = result.minimumHeight;
            const maximumHeight = result.maximumHeight;
            const boundingSphere = defaultValue(
                result.boundingSphere && new THREE.Sphere().copy(result.boundingSphere),
                this._boundingSphere
            );
            const obb = defaultValue(
                result.orientedBoundingBox && result.orientedBoundingBox,
                this._orientedBoundingBox
            );
            const occludeePointInScaledSpace = defaultValue(
                result.occludeePointInScaledSpace &&
                    new THREE.Vector3().copy(result.occludeePointInScaledSpace),
                this._horizonOcclusionPoint
            );
            const stride = result.vertexStride;
            const terrainEncoding = result.encoding;

            this._mesh = new TerrainMesh(
                rtc,
                textureCoordAndEncodedNormals,
                position3DAndHeight,
                result.altitudes,
                indicesTypedArray,
                result.indexCountWithoutSkirts,
                vertexCountWithoutSkirts,
                minimumHeight,
                maximumHeight,
                boundingSphere,
                occludeePointInScaledSpace,
                stride,
                obb,
                terrainEncoding,
                exaggeration,
                result.westIndicesSouthToNorth,
                result.southIndicesEastToWest,
                result.eastIndicesNorthToSouth,
                result.northIndicesWestToEast
            );
            this.heightMap = new HeightMap(result.heightMapBuffer, minimumHeight, maximumHeight);

            // Free memory received from server after mesh is created
            this._quantizedVertices = undefined!;
            this._encodedNormals = undefined;
            this._indices = undefined!;

            this._uValues = undefined!;
            this._vValues = undefined!;
            this._heightValues = undefined!;

            this._westIndices = undefined!;
            this._southIndices = undefined!;
            this._eastIndices = undefined!;
            this._northIndices = undefined!;

            return this._mesh;
        });
    }

    upsample(
        tilingScheme: any,
        thisX: number,
        thisY: number,
        thisLevel: number,
        descendantX: number,
        descendantY: number,
        descendantLevel: number,
        task: Function
    ): Promise<QuantizedMeshTerrainData> | undefined {
        if (!defined(tilingScheme)) {
            throw new Error("tilingScheme is required.");
        }
        if (!defined(thisX)) {
            throw new Error("thisX is required.");
        }
        if (!defined(thisY)) {
            throw new Error("thisY is required.");
        }
        if (!defined(thisLevel)) {
            throw new Error("thisLevel is required.");
        }
        if (!defined(descendantX)) {
            throw new Error("descendantX is required.");
        }
        if (!defined(descendantY)) {
            throw new Error("descendantY is required.");
        }
        if (!defined(descendantLevel)) {
            throw new Error("descendantLevel is required.");
        }
        const levelDifference = descendantLevel - thisLevel;
        if (levelDifference > 1) {
            throw new Error(
                "Upsampling through more than one level at a time is not currently supported."
            );
        }

        const mesh = this._mesh;
        if (!defined(this._mesh)) {
            return undefined;
        }

        thisY = (1 << thisLevel) - 1 - thisY;
        descendantY = (1 << descendantLevel) - 1 - descendantY;
        const isEastChild = thisX * 2 !== descendantX;
        const isNorthChild = thisY * 2 === descendantY;

        const ellipsoid = tilingScheme.ellipsoid;
        const childRectangle = tilingScheme.getGeoBox(
            new TileKey((1 << descendantLevel) - 1 - descendantY, descendantX, descendantLevel)
        );

        const upsamplePromise = task({
            thisX,
            thisY,
            thisLevel,
            descendantX,
            descendantY,
            descendantLevel,
            upsample: true,
            textureCoordAndEncodedNormals: mesh.textureCoordAndEncodedNormals,
            position3DAndHeight: mesh.position3DAndHeight,
            vertexCountWithoutSkirts: mesh.vertexCountWithoutSkirts,
            heights: mesh.heights,
            indices: mesh.indices,
            indexCountWithoutSkirts: mesh.indexCountWithoutSkirts,
            encoding: mesh.encoding,
            minimumHeight: this._minimumHeight,
            maximumHeight: this._maximumHeight,
            isEastChild: isEastChild,
            isNorthChild: isNorthChild,
            childRectangle: childRectangle,
            ellipsoid: ellipsoid,
            exaggeration: mesh.exaggeration
        });

        if (!defined(upsamplePromise)) {
            return undefined;
        }

        let shortestSkirt = Math.min(this._westSkirtHeight, this._eastSkirtHeight);
        shortestSkirt = Math.min(shortestSkirt, this._southSkirtHeight);
        shortestSkirt = Math.min(shortestSkirt, this._northSkirtHeight);

        const westSkirtHeight = isEastChild ? shortestSkirt * 0.5 : this._westSkirtHeight;
        const southSkirtHeight = isNorthChild ? shortestSkirt * 0.5 : this._southSkirtHeight;
        const eastSkirtHeight = isEastChild ? this._eastSkirtHeight : shortestSkirt * 0.5;
        const northSkirtHeight = isNorthChild ? this._northSkirtHeight : shortestSkirt * 0.5;

        return upsamplePromise.then((result: any) => {
            const quantizedVertices = new Uint16Array(result.vertices);
            const indicesTypedArray = IndexDatatype.createTypedArray(
                quantizedVertices.length / 3,
                result.indices
            );
            let encodedNormals: Uint8Array | undefined;
            if (defined(result.encodedNormals)) {
                encodedNormals = new Uint8Array(result.encodedNormals);
            }

            return new QuantizedMeshTerrainData({
                quantizedVertices: quantizedVertices,
                indices: indicesTypedArray,
                encodedNormals: encodedNormals,
                minimumHeight: result.minimumHeight,
                maximumHeight: result.maximumHeight,
                boundingSphere: new THREE.Sphere().copy(result.boundingSphere),
                westIndices: result.westIndices,
                southIndices: result.southIndices,
                eastIndices: result.eastIndices,
                northIndices: result.northIndices,
                westSkirtHeight: westSkirtHeight,
                southSkirtHeight: southSkirtHeight,
                eastSkirtHeight: eastSkirtHeight,
                northSkirtHeight: northSkirtHeight,
                childTileMask: 0,
                createdByUpsampling: true
            });
        });
    }

    interpolateHeight(rectangle: any, longitude: number, latitude: number): number | undefined {
        const width = rectangle.east - rectangle.west;
        const height = rectangle.north - rectangle.south;
        const u = clamp((longitude - rectangle.west) / width, 0.0, 1.0) * maxShort;
        const v = clamp((latitude - rectangle.south) / height, 0.0, 1.0) * maxShort;

        if (!defined(this._mesh)) {
            return interpolateHeight(this, u, v);
        }

        return interpolateMeshHeight(this, u, v);
    }

    isChildAvailable(thisX: number, thisY: number, childX: number, childY: number): boolean {
        if (!defined(thisX)) {
            throw new Error("thisX is required.");
        }
        if (!defined(thisY)) {
            throw new Error("thisY is required.");
        }
        if (!defined(childX)) {
            throw new Error("childX is required.");
        }
        if (!defined(childY)) {
            throw new Error("childY is required.");
        }

        let bitNumber = 2; // northwest child
        if (childX !== thisX * 2) {
            ++bitNumber; // east child
        }
        if (childY !== thisY * 2) {
            bitNumber -= 2; // south child
        }

        return (this._childTileMask & (1 << bitNumber)) !== 0;
    }

    wasCreatedByUpsampling(): boolean {
        return this._createdByUpsampling;
    }
}

const maxShort = 32767;
const barycentricCoordinateScratch = new THREE.Vector3();
const arrayScratch: number[] = [];

function sortIndicesIfNecessary(
    indices: number[] | Uint16Array | Uint32Array,
    sortFunction: (a: number, b: number) => number,
    vertexCount: number
): Uint16Array | Uint32Array {
    arrayScratch.length = indices.length;

    let needsSort = false;
    for (let i = 0, len = indices.length; i < len; ++i) {
        arrayScratch[i] = indices[i];
        needsSort = needsSort || (i > 0 && sortFunction(indices[i - 1], indices[i]) > 0);
    }

    if (needsSort) {
        arrayScratch.sort(sortFunction);
        return IndexDatatype.createTypedArray(vertexCount, arrayScratch);
    }
    return indices as Uint16Array | Uint32Array;
}

const texCoordScratch0 = new THREE.Vector2();
const texCoordScratch1 = new THREE.Vector2();
const texCoordScratch2 = new THREE.Vector2();

function pointInBoundingBox(
    u: number,
    v: number,
    u0: number,
    v0: number,
    u1: number,
    v1: number,
    u2: number,
    v2: number
): boolean {
    const minU = Math.min(u0, u1, u2);
    const maxU = Math.max(u0, u1, u2);
    const minV = Math.min(v0, v1, v2);
    const maxV = Math.max(v0, v1, v2);
    return u >= minU && u <= maxU && v >= minV && v <= maxV;
}

function interpolateMeshHeight(
    terrainData: QuantizedMeshTerrainData,
    u: number,
    v: number
): number | undefined {
    const mesh = terrainData.mesh!;
    const position3DAndHeight = mesh.position3DAndHeight;
    const textureCoordAndEncodedNormals = mesh.textureCoordAndEncodedNormals;
    const encoding = mesh.encoding;
    const indices = mesh.indices;

    for (let i = 0, len = indices.length; i < len; i += 3) {
        const i0 = indices[i];
        const i1 = indices[i + 1];
        const i2 = indices[i + 2];

        const uv0 = decodeTextureCoordinates(
            textureCoordAndEncodedNormals,
            i0,
            encoding,
            texCoordScratch0
        );
        const uv1 = decodeTextureCoordinates(
            textureCoordAndEncodedNormals,
            i1,
            encoding,
            texCoordScratch1
        );
        const uv2 = decodeTextureCoordinates(
            textureCoordAndEncodedNormals,
            i2,
            encoding,
            texCoordScratch2
        );

        if (pointInBoundingBox(u, v, uv0.x, uv0.y, uv1.x, uv1.y, uv2.x, uv2.y)) {
            const barycentric = computeBarycentricCoordinates(
                u,
                v,
                uv0.x,
                uv0.y,
                uv1.x,
                uv1.y,
                uv2.x,
                uv2.y,
                barycentricCoordinateScratch
            );
            if (barycentric.x >= -1e-15 && barycentric.y >= -1e-15 && barycentric.z >= -1e-15) {
                const h0 = decodeHeight(position3DAndHeight, i0, encoding);
                const h1 = decodeHeight(position3DAndHeight, i1, encoding);
                const h2 = decodeHeight(position3DAndHeight, i2, encoding);
                return barycentric.x * h0 + barycentric.y * h1 + barycentric.z * h2;
            }
        }
    }

    return undefined;
}

function interpolateHeight(
    terrainData: QuantizedMeshTerrainData,
    u: number,
    v: number
): number | undefined {
    const uBuffer = terrainData.uValues;
    const vBuffer = terrainData.vValues;
    const heightBuffer = terrainData.heightValues;

    const indices = terrainData.indices;
    for (let i = 0, len = indices.length; i < len; i += 3) {
        const i0 = indices[i];
        const i1 = indices[i + 1];
        const i2 = indices[i + 2];

        const u0 = uBuffer[i0];
        const u1 = uBuffer[i1];
        const u2 = uBuffer[i2];

        const v0 = vBuffer[i0];
        const v1 = vBuffer[i1];
        const v2 = vBuffer[i2];

        if (pointInBoundingBox(u, v, u0, v0, u1, v1, u2, v2)) {
            const barycentric = computeBarycentricCoordinates(
                u,
                v,
                u0,
                v0,
                u1,
                v1,
                u2,
                v2,
                barycentricCoordinateScratch
            );
            if (barycentric.x >= -1e-15 && barycentric.y >= -1e-15 && barycentric.z >= -1e-15) {
                const quantizedHeight =
                    barycentric.x * heightBuffer[i0] +
                    barycentric.y * heightBuffer[i1] +
                    barycentric.z * heightBuffer[i2];
                return THREE.MathUtils.lerp(
                    terrainData.minimumHeight,
                    terrainData.maximumHeight,
                    quantizedHeight / maxShort
                );
            }
        }
    }

    return undefined;
}

export default QuantizedMeshTerrainData;
