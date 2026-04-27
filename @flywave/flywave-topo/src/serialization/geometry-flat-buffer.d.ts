import { type GeometryQuery } from "../curve/geometry-query";
/**
 * Top level entries to convert between GeometryQuery types and FlatBuffer Bytes.
 * @public
 */
export declare class GeometryFlatBuffer {
    private constructor();
    /**
     * Serialize bytes to a flatbuffer.
     * @public
     */
    static geometryToBytes(data: GeometryQuery | GeometryQuery[], addVersionSignature?: boolean): Uint8Array | undefined;
    /**
     * Deserialize bytes from a flatbuffer.
     *  @public
     * @param justTheBytes FlatBuffer bytes as created by BGFBWriter.createFlatBuffer (g);
     */
    static bytesToGeometry(justTheBytes: Uint8Array, hasVersionSignature?: boolean): GeometryQuery | GeometryQuery[] | undefined;
}
