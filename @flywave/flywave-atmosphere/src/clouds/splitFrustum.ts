export type FrustumSplitMode = "uniform" | "logarithmic" | "practical";

function lerp(a: number, b: number, t: number): number {
    return a + (b - a) * t;
}

export function splitFrustum(
    mode: FrustumSplitMode,
    count: number,
    near: number,
    far: number,
    lambda: number = 0.5,
    result: number[] = []
): number[] {
    for (let i = 0; i < count; ++i) {
        const uniform = (near + ((far - near) * (i + 1)) / count) / far;
        const logarithmic = (near * (far / near) ** ((i + 1) / count)) / far;
        if (mode === "uniform") {
            result[i] = uniform;
        } else if (mode === "logarithmic") {
            result[i] = logarithmic;
        } else {
            result[i] = lerp(uniform, logarithmic, lambda);
        }
    }
    result.length = count;
    return result;
}
