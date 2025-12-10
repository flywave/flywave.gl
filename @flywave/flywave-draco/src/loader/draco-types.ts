/* Copyright (C) 2025 flywave.gl contributors */

import * as THREE from "three";

// DRACO FORMAT SPECIFIC DATA

export interface DracoMetadataEntry {
    int: number;
    string: string;
    double: number;
    intArray: Int32Array;
}

/** For attributes that have not been fully decompressed */
export interface DracoQuantizationTransform {
    quantization_bits?: number;
    range?: number;
    min_values?: Float32Array;
}

/** For attributes that have not been fully decompressed */
export interface DracoOctahedronTransform {
    quantization_bits?: number;
}

/** Draco attribute fields */
export interface DracoAttribute {
    unique_id: number;

    num_components: number; // Duplicate of size
    attribute_type: number;
    data_type: number;

    byte_offset: number;
    byte_stride: number;
    normalized: boolean;
    name?: string;

    quantization_transform?: DracoQuantizationTransform;
    octahedron_transform?: DracoOctahedronTransform;

    metadata: { [key: string]: DracoMetadataEntry };
    attribute_index: number;
}

/**
 * Draco format specific data
 * The `data.loaderData` field will have this layout when `data.loader === 'draco'`.
 * @todo Metadata should also be available in normalized form in a standard `Schema`.
 */
export interface DracoLoaderData {
    geometry_type: number;
    num_attributes: number;
    num_points: number;
    num_faces: number;
    metadata: { [entry: string]: DracoMetadataEntry };
    attributes: { [unique_id: number]: DracoAttribute };
}

/**
 * Mesh with Draco specific data
 */
export interface DracoMesh {
    loader: "draco";
    loaderData: DracoLoaderData;
    geometry: THREE.BufferGeometry;
    header: {
        vertexCount: number;
        boundingBox: THREE.Box3;
    };
    schema: {
        attributes: { [name: string]: THREE.BufferAttribute };
        index?: THREE.BufferAttribute;
        metadata: Record<string, any>;
    };
}
