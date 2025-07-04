import * as THREE from "three";
import type { Decoder, Draco3D, Mesh, Metadata, MetadataQuerier, PointAttribute, PointCloud } from "../draco3d/draco3d-types";
import type { DracoAttribute, DracoLoaderData, DracoMesh, DracoMetadataEntry, DracoOctahedronTransform, DracoQuantizationTransform } from "./draco-types";
export interface DracoParseOptions {
    topology?: "triangle-list" | "triangle-strip";
    attributeNameEntry?: string;
    extraAttributes?: {
        [uniqueId: string]: number;
    };
    quantizedAttributes?: Array<"POSITION" | "NORMAL" | "COLOR" | "TEX_COORD" | "GENERIC">;
    octahedronAttributes?: Array<"POSITION" | "NORMAL" | "COLOR" | "TEX_COORD" | "GENERIC">;
}
export default class DracoParser {
    draco: Draco3D;
    decoder: Decoder;
    metadataQuerier: MetadataQuerier;
    constructor(draco: Draco3D);
    destroy(): void;
    parseSync(arrayBuffer: ArrayBuffer, options?: DracoParseOptions): DracoMesh;
    _getDracoLoaderData(dracoGeometry: Mesh | PointCloud, geometry_type: any, options: DracoParseOptions): DracoLoaderData;
    _getDracoAttributes(dracoGeometry: Mesh | PointCloud, options: DracoParseOptions): {
        [unique_id: number]: DracoAttribute;
    };
    _getMeshData(dracoGeometry: Mesh | PointCloud, loaderData: DracoLoaderData, options: DracoParseOptions): THREE.BufferGeometry;
    private _getMeshAttributes;
    _getTriangleListIndices(dracoGeometry: Mesh): Uint32Array<ArrayBuffer>;
    _getTriangleStripIndices(dracoGeometry: Mesh): Int32Array<ArrayBufferLike>;
    _getAttributeValues(dracoGeometry: Mesh | PointCloud, attribute: DracoAttribute): {
        value: THREE.TypedArray;
        size: number;
    } | null;
    _deduceAttributeName(attribute: DracoAttribute, options: DracoParseOptions): string;
    _getTopLevelMetadata(dracoGeometry: Mesh | PointCloud): {
        [entry: string]: DracoMetadataEntry;
    };
    _getAttributeMetadata(dracoGeometry: Mesh | PointCloud, attributeId: number): {
        [entry: string]: DracoMetadataEntry;
    };
    _getDracoMetadata(dracoMetadata: Metadata): {
        [entry: string]: DracoMetadataEntry;
    };
    _getDracoMetadataField(dracoMetadata: Metadata, entryName: string): DracoMetadataEntry;
    _disableAttributeTransforms(options: DracoParseOptions): void;
    _getQuantizationTransform(dracoAttribute: PointAttribute, options: DracoParseOptions): DracoQuantizationTransform | null;
    _getOctahedronTransform(dracoAttribute: PointAttribute, options: DracoParseOptions): DracoOctahedronTransform | null;
}
//# sourceMappingURL=draco-parser.d.ts.map