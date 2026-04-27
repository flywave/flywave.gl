import type { GLTFLoaderOptions } from "../../gltf-loader";
import { type GLTFWriterOptions } from "../../gltf-writer";
import { GLTFScenegraph } from "../api/gltf-scenegraph";
import type { GLTF } from "../types/gltf-json-schema";
export declare const name = "EXT_structural_metadata";
export declare function decode(gltfData: {
    json: GLTF;
}, options: GLTFLoaderOptions): Promise<void>;
export declare function encode(gltfData: {
    json: GLTF;
}, options: GLTFWriterOptions): import("../..").GLTFWithBuffers;
export interface PropertyAttribute {
    name: string;
    elementType: string;
    componentType?: string;
    values: number[] | string[];
}
/**
 * Creates ExtStructuralMetadata, creates the schema and creates a property table containing feature data provided.
 * @param scenegraph - Instance of the class for structured access to GLTF data.
 * @param propertyAttributes - property attributes
 * @param classId - classId to use for encoding metadata.
 * @returns Index of the table created.
 */
export declare function createExtStructuralMetadata(scenegraph: GLTFScenegraph, propertyAttributes: PropertyAttribute[], classId?: string): number;
