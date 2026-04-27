import type { BigTypedArray, TypedArray } from "@flywave/flywave-utils";
import { type GLTFScenegraph } from "../../api/gltf-scenegraph";
import type { GLTFMeshPrimitive, GLTFTextureInfoMetadata } from "../../types/gltf-json-schema";
export type NumericComponentType = "INT8" | "UINT8" | "INT16" | "UINT16" | "INT32" | "UINT32" | "INT64" | "UINT64" | "FLOAT32" | "FLOAT64";
export declare function getArrayElementByteSize(attributeType: any, componentType: any): number;
/**
 * Gets offset array from `arrayOffsets` or `stringOffsets`.
 * @param scenegraph - Instance of the class for structured access to GLTF data.
 * @param bufferViewIndex - Buffer view index
 * @param offsetType - The type of values in `arrayOffsets` or `stringOffsets`.
 * @param numberOfElements - The number of elements in each property array.
 * @returns Array of values offsets. The number of offsets in the array is equal to `numberOfElements` plus one.
 */
export declare function getOffsetsForProperty(scenegraph: GLTFScenegraph, bufferViewIndex: number, offsetType: "UINT8" | "UINT16" | "UINT32" | "UINT64" | string, numberOfElements: number): TypedArray | null;
/**
 * Converts raw bytes that are in the buffer to an array of the type defined by the schema.
 * @param data - Raw bytes in the buffer.
 * @param attributeType - SCALAR, VECN, MATN.
 * @param componentType - Type of the component in elements, e.g. 'UINT8' or 'FLOAT32'.
 * @param elementCount - Number of elements in the array. Default value is 1.
 * @returns Data array
 */
export declare function convertRawBufferToMetadataArray(data: Uint8Array, attributeType: string, componentType: NumericComponentType, elementCount?: number): BigTypedArray;
/**
 * Processes data encoded in the texture associated with the primitive.
 * @param scenegraph - Instance of the class for structured access to GLTF data.
 * @param textureInfo - Reference to the texture where extension data are stored.
 * @param primitive - Primitive object in the mesh.
 * @returns Array of data taken. Null if data can't be taken from the texture.
 */
export declare function getPrimitiveTextureData(scenegraph: GLTFScenegraph, textureInfo: GLTFTextureInfoMetadata, primitive: GLTFMeshPrimitive): number[];
/**
 * Puts property data to attributes.
 * It creates corresponding buffer, bufferView and accessor
 * so the data can be accessed like regular data stored in buffers.
 * @param scenegraph - Scenegraph object.
 * @param attributeName - Name of the attribute.
 * @param propertyData - Property data to store.
 * @param featureTable - Array where unique data from the property data are being stored.
 * @param primitive - Primitive object.
 */
export declare function primitivePropertyDataToAttributes(scenegraph: GLTFScenegraph, attributeName: string, propertyData: number[], featureTable: number[], primitive: GLTFMeshPrimitive): void;
/**
 * Parses variable-length array data.
 * In this case every value of the property in the table will be an array
 * of arbitrary length.
 * @param valuesData - Values in a flat typed array.
 * @param numberOfElements - Number of rows in the property table.
 * @param arrayOffsets - Offsets of nested arrays in the flat values array.
 * @param valuesDataBytesLength - Data byte length.
 * @param valueSize - Value size in bytes.
 * @returns Array of typed arrays.
 */
export declare function parseVariableLengthArrayNumeric(valuesData: BigTypedArray, numberOfElements: number, arrayOffsets: TypedArray, valuesDataBytesLength: number, valueSize: number): BigTypedArray[];
/**
 * Parses fixed-length array data.
 * In this case every value of the property in the table will be an array
 * of constant length equal to `arrayCount`.
 * @param valuesData - Values in a flat typed array.
 * @param numberOfElements - Number of rows in the property table.
 * @param arrayCount - Nested arrays length.
 * @returns Array of typed arrays.
 */
export declare function parseFixedLengthArrayNumeric(valuesData: BigTypedArray, numberOfElements: number, arrayCount: number): BigTypedArray[];
/**
 * Decodes properties of string type from binary source.
 * @param numberOfElements - The number of elements in each property array that propertyTableProperty contains. It's a number of rows in the table.
 * @param valuesDataBytes - Data taken from values property of the property table property.
 * @param arrayOffsets - Offsets for variable-length arrays. It's null for fixed-length arrays or scalar types.
 * @param stringOffsets - Index of the buffer view containing offsets for strings. It should be available for string type.
 * @returns String property values
 */
export declare function getPropertyDataString(numberOfElements: number, valuesDataBytes: Uint8Array, arrayOffsets: TypedArray | null, stringOffsets: TypedArray | null): string[] | string[][];
