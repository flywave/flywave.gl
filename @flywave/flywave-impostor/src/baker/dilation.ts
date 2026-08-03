import * as THREE from "three";

const DILATION_OFFSETS = [
    [-1, 0],
    [1, 0],
    [0, 1],
    [0, -1],
    [-1, 1],
    [1, 1],
    [1, -1],
    [-1, -1]
];

export function dilate(
    source: Uint8ClampedArray,
    alphaMask: Uint8ClampedArray,
    width: number,
    height: number,
    distance: number,
    channels: number,
    alphaCutoff: number = 0.95
): Uint8ClampedArray {
    if (distance <= 0) return source;
    const output = new Uint8ClampedArray(source);
    const alphaThreshold = alphaCutoff * 255;

    for (let py = 0; py < height; py++) {
        for (let px = 0; px < width; px++) {
            const idx = (py * width + px) * 4;
            if (alphaMask[idx + 3] > alphaThreshold) continue;

            for (let currDist = 0; currDist < distance; currDist++) {
                let found = false;
                for (let o = 0; o < 8; o++) {
                    const ox = px + DILATION_OFFSETS[o][0] * (currDist + 1);
                    const oy = py + DILATION_OFFSETS[o][1] * (currDist + 1);
                    if (ox < 0 || ox >= width || oy < 0 || oy >= height) continue;
                    const oIdx = (oy * width + ox) * 4;
                    if (alphaMask[oIdx + 3] > alphaThreshold) {
                        for (let c = 0; c < channels; c++) {
                            output[idx + c] = source[oIdx + c];
                        }
                        found = true;
                        break;
                    }
                }
                if (found) break;
            }
        }
    }
    return output;
}
