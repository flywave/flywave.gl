/** Represents an array of bytes encoded in base-64 with a prefix indicating the encoding, as required when converting EC properties of `binary` type to and from JSON.
 * @see [[TextureProps.data]] and [[BRepEntity.DataProps.data]] for examples of properties of this type.
 * @public
 * @extensions
 */
export type Base64EncodedString = string;
/** Represents an array of bytes encoded in base-64 with a prefix indicating the encoding, as persisted in an [ECDb]($backend) for properties of `binary` type.
 * @public
 */
export declare namespace Base64EncodedString {
    /** The prefix prepended to the string identifying it as base-64-encoded. */
    const prefix = "encoding=base64;";
    /** Encode an array of bytes into a Base64EncodedString. */
    function fromUint8Array(bytes: Uint8Array): Base64EncodedString;
    /** Decode a Base64EncodedString into an array of bytes. */
    function toUint8Array(base64: Base64EncodedString): Uint8Array;
    /** Returns true if the input starts with [[Base64EncodedString.prefix]] indicating it is a well-formed Base64EncodedString. */
    function hasPrefix(str: string): boolean;
    /** Ensure that the base-64-encoded string starts with the [[Base64EncodedString.prefix]]. */
    function ensurePrefix(base64: string): Base64EncodedString;
    /** Remove the [[Base64EncodedString.prefix]] from the string if present. */
    function stripPrefix(base64: Base64EncodedString): string;
    /** A function suitable for use with `JSON.parse` to revive a Base64EncodedString into a Uint8Array. */
    const reviver: (_name: string, value: any) => any;
    /** A function suitable for use with `JSON.stringify` to serialize a Uint8Array as a Base64EncodedString. */
    const replacer: (_name: string, value: any) => any;
    function encode(src: string, urlSafe?: boolean): Base64EncodedString;
    function decode(src: string): Base64EncodedString;
}
