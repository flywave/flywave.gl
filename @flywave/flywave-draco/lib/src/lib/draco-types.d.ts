import * as THREE from "three";
export interface DracoMetadataEntry {
    int: number;
    string: string;
    double: number;
    intArray: Int32Array;
}
export interface DracoQuantizationTransform {
    quantization_bits?: number;
    range?: number;
    min_values?: Float32Array;
}
export interface DracoOctahedronTransform {
    quantization_bits?: number;
}
export interface DracoAttribute {
    unique_id: number;
    num_components: number;
    attribute_type: number;
    data_type: number;
    byte_offset: number;
    byte_stride: number;
    normalized: boolean;
    name?: string;
    quantization_transform?: DracoQuantizationTransform;
    octahedron_transform?: DracoOctahedronTransform;
    metadata: {
        [key: string]: DracoMetadataEntry;
    };
    attribute_index: number;
}
export interface DracoLoaderData {
    geometry_type: number;
    num_attributes: number;
    num_points: number;
    num_faces: number;
    metadata: {
        [entry: string]: DracoMetadataEntry;
    };
    attributes: {
        [unique_id: number]: DracoAttribute;
    };
}
export interface DracoMesh {
    loader: "draco";
    loaderData: DracoLoaderData;
    geometry: THREE.BufferGeometry;
    header: {
        vertexCount: number;
        boundingBox: THREE.Box3;
    };
    schema: {
        attributes: {
            [name: string]: THREE.BufferAttribute;
        };
        index?: THREE.BufferAttribute;
        metadata: Record<string, any>;
    };
}
//# sourceMappingURL=draco-types.d.ts.map