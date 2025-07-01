import { defaultValue } from "@flywave/flywave-utils";
import { Vector3 } from "three";

import { TerrainEncoding } from "./decoder";

class TerrainMesh {
    center: any;
    heights: Float32Array;
    textureCoordAndEncodedNormals: Float32Array;
    position3DAndHeight: Float32Array;
    stride: number;
    indices: Uint8Array | Uint16Array | Uint32Array;
    indexCountWithoutSkirts: number;
    vertexCountWithoutSkirts: number;
    minimumHeight: number;
    maximumHeight: number;
    boundingSphere3D: any;
    occludeePointInScaledSpace: any;
    orientedBoundingBox?: any;
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
        boundingSphere3D: any,
        occludeePointInScaledSpace: Vector3,
        vertexStride?: number,
        orientedBoundingBox?: any,
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
