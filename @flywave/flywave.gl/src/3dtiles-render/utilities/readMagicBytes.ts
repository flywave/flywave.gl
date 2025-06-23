/**
 * Reads the first 4 bytes of a buffer or DataView and returns them as a string.
 * Returns null if the first byte indicates JSON content (starts with '{').
 * @param bufferOrDataView The input buffer or DataView to read from
 * @returns The magic bytes string or null if JSON is detected
 */
export function readMagicBytes(
    bufferOrDataView: ArrayBuffer | ArrayBufferView | DataView
): string | null {
    let view: DataView;

    // Handle different input types
    if (bufferOrDataView instanceof DataView) {
        view = bufferOrDataView;
    } else if (ArrayBuffer.isView(bufferOrDataView)) {
        view = new DataView(
            bufferOrDataView.buffer,
            bufferOrDataView.byteOffset,
            bufferOrDataView.byteLength
        );
    } else {
        view = new DataView(bufferOrDataView);
    }

    // Check for JSON content
    if (view.byteLength > 0 && String.fromCharCode(view.getUint8(0)) === "{") {
        return null;
    }

    // Read magic bytes (first 4 bytes)
    let magicBytes = "";
    const length = Math.min(4, view.byteLength); // Ensure we don't read past bounds

    for (let i = 0; i < length; i++) {
        magicBytes += String.fromCharCode(view.getUint8(i));
    }

    return magicBytes;
}
