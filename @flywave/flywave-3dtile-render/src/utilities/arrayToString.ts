export function arrayToString(array: ArrayBufferView | ArrayBuffer): string {
    const utf8decoder = new TextDecoder();
    if (array instanceof ArrayBuffer) {
        return utf8decoder.decode(new Uint8Array(array));
    }
    return utf8decoder.decode(array);
}
