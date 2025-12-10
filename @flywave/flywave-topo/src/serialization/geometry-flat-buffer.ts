/* Copyright (C) 2025 flywave.gl contributors */



import { type GeometryQuery } from "../curve/geometry-query";
import { BGFBReader } from "./bgfb-reader";
import { BGFBWriter } from "./bgfb-writer";

/**
 * Top level entries to convert between GeometryQuery types and FlatBuffer Bytes.
 * @public
 */
export class GeometryFlatBuffer {
    private constructor() {}
    /**
     * Serialize bytes to a flatbuffer.
     * @public
     */
    public static geometryToBytes(
        data: GeometryQuery | GeometryQuery[],
        addVersionSignature: boolean = false
    ): Uint8Array | undefined {
        return BGFBWriter.geometryToBytes(data, addVersionSignature ? signatureBytes : undefined);
    }

    /**
     * Deserialize bytes from a flatbuffer.
     *  @public
     * @param justTheBytes FlatBuffer bytes as created by BGFBWriter.createFlatBuffer (g);
     */
    public static bytesToGeometry(
        justTheBytes: Uint8Array,
        hasVersionSignature: boolean = false
    ): GeometryQuery | GeometryQuery[] | undefined {
        return BGFBReader.bytesToGeometry(
            justTheBytes,
            hasVersionSignature ? signatureBytes : undefined
        );
    }
}

const signatureBytes = new Uint8Array([98, 103, 48, 48, 48, 49, 102, 98]);
