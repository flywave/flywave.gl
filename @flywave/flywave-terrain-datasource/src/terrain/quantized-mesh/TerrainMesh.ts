import { OrientedBox3 } from "@flywave/flywave-geoutils";
import { defaultValue } from "@flywave/flywave-utils";
import { Sphere, Vector3 } from "three";

import { TerrainEncoding } from "./Decoder";

class TerrainMesh {
    center: Vector3;
    heights: Float32Array;
    textureCoordAndEncodedNormals: Float32Array;
    position3DAndHeight: Float32Array;
    stride: number;
    indices: Uint8Array | Uint16Array | Uint32Array;
    indexCountWithoutSkirts: number;
    vertexCountWithoutSkirts: number;
    minimumHeight: number;
    maximumHeight: number;
    boundingSphere3D: Sphere;
    occludeePointInScaledSpace: Vector3;
    orientedBoundingBox?: OrientedBox3;
    encoding: TerrainEncoding;
    exaggeration: number;
    westIndicesSouthToNorth: Uint16Array | Uint32Array;
    southIndicesEastToWest: Uint16Array | Uint32Array;
    eastIndicesNorthToSouth: Uint16Array | Uint32Array;
    northIndicesWestToEast: Uint16Array | Uint32Array;

    constructor(
        center: Vector3,
        textureCoordAndEncodedNormals: Float32Array,
        position3DAndHeight: Float32Array,
        heights: Float32Array,
        indices: Uint8Array | Uint16Array | Uint32Array,
        indexCountWithoutSkirts: number,
        vertexCountWithoutSkirts: number,
        minimumHeight: number,
        maximumHeight: number,
        boundingSphere3D: Sphere,
        occludeePointInScaledSpace: Vector3,
        vertexStride?: number,
        orientedBoundingBox?: OrientedBox3,
        encoding?: TerrainEncoding,
        exaggeration?: number,
        westIndicesSouthToNorth?: Uint16Array | Uint32Array,
        southIndicesEastToWest?: Uint16Array | Uint32Array,
        eastIndicesNorthToSouth?: Uint16Array | Uint32Array,
        northIndicesWestToEast?: Uint16Array | Uint32Array
    ) {
        this.center = center;
        this.heights = heights;
        this.textureCoordAndEncodedNormals = textureCoordAndEncodedNormals;
        this.position3DAndHeight = position3DAndHeight;
        this.stride = defaultValue(vertexStride, 6);
        this.indices = indices;
        this.indexCountWithoutSkirts = indexCountWithoutSkirts;
        this.vertexCountWithoutSkirts = vertexCountWithoutSkirts;
        this.minimumHeight = minimumHeight;
        this.maximumHeight = maximumHeight;
        this.boundingSphere3D = boundingSphere3D;
        this.occludeePointInScaledSpace = occludeePointInScaledSpace;
        this.orientedBoundingBox = orientedBoundingBox;
        this.encoding = encoding;
        this.exaggeration = exaggeration;
        this.westIndicesSouthToNorth = westIndicesSouthToNorth || new Uint16Array();
        this.southIndicesEastToWest = southIndicesEastToWest || new Uint16Array();
        this.eastIndicesNorthToSouth = eastIndicesNorthToSouth || new Uint16Array();
        this.northIndicesWestToEast = northIndicesWestToEast || new Uint16Array();
    }
}

export default TerrainMesh;
