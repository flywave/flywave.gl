// @ts-nocheck
import { Vector2 } from "three";
function halton(index, base) {
    let fraction = 1;
    let result = 0;
    while (index > 0) {
        fraction /= base;
        result += fraction * (index % base);
        index = Math.floor(index / base);
    }
    return result;
}
export const haltonOffsets = Array.from({ length: 16 }, (_, index) => new Vector2(halton(index + 1, 2), halton(index + 1, 3)));
const bayerIndices = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
export const bayerOffsets = bayerIndices.reduce((result, _, index) => {
    const offset = new Vector2();
    for (let i = 0; i < 16; ++i) {
        if (bayerIndices[i] === index) {
            offset.set(((i % 4) + 0.5) / 4, (Math.floor(i / 4) + 0.5) / 4);
            break;
        }
    }
    return [...result, offset];
}, []);
//# sourceMappingURL=internals.js.map