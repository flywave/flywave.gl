// @ts-nocheck
/* Copyright (C) 2025 flywave.gl contributors */

/**
 * TSL noise functions for procedural cloud texture generation.
 *
 * Ported from three-geospatial's GLSL noise implementation:
 * - perlin.glsl: 4D periodic Perlin noise (from GLM)
 * - tileableNoise.glsl: Worley noise and Perlin wrappers
 *
 * These run inside compute shaders to populate Storage3DTexture / StorageTexture.
 */

import {
    abs,
    clamp,
    Fn,
    floor,
    fract,
    max,
    min,
    mix,
    pow,
    sin,
    dot,
    step,
    vec2,
    vec3,
    vec4,
    float
} from "three/tsl";

import type { Node } from "../../tsl/node";

/* -------------------------------------------------------------------------- */
/*  Math utilities                                                            */
/* -------------------------------------------------------------------------- */

export const remap = Fn(([x, a, b]: [x: any, a: any, b: any]) => {
    return x.sub(a).div(b.sub(a));
});

export const remapClamped = Fn(([x, a, b]: [x: any, a: any, b: any]) => {
    return x.sub(a).div(b.sub(a)).clamp(0, 1);
});

export const remapOut = Fn(
    ([x, inMin, inMax, outMin, outMax]: [
        x: any,
        inMin: any,
        inMax: any,
        outMin: any,
        outMax: any
    ]) => {
        return x.sub(inMin).div(inMax.sub(inMin)).clamp(0, 1).mul(outMax.sub(outMin)).add(outMin);
    }
);

/* -------------------------------------------------------------------------- */
/*  Hash and value noise (from tileableNoise.glsl)                            */
/* -------------------------------------------------------------------------- */

export const hashFloat = Fn(([n]: [n: any]) => {
    return n.add(1.951).sin().mul(43758.5453).fract();
});

export const valueNoise = Fn(([x]: [x: any]) => {
    const p = x.floor();
    const f = x.fract();
    const ff = f.mul(f).mul(f.mul(-2).add(3));

    const n = p.x.add(p.y.mul(57)).add(p.z.mul(113));

    const r0 = hashFloat(n);
    const r1 = hashFloat(n.add(1));
    const r2 = hashFloat(n.add(57));
    const r3 = hashFloat(n.add(58));
    const r4 = hashFloat(n.add(113));
    const r5 = hashFloat(n.add(114));
    const r6 = hashFloat(n.add(170));
    const r7 = hashFloat(n.add(171));

    const xy0 = mix(mix(r0, r1, ff.x), mix(r2, r3, ff.x), ff.y);
    const xy1 = mix(mix(r4, r5, ff.x), mix(r6, r7, ff.x), ff.y);

    return mix(xy0, xy1, ff.z);
});

/* -------------------------------------------------------------------------- */
/*  Worley noise (from tileableNoise.glsl)                                    */
/* -------------------------------------------------------------------------- */

export const worleyNoise = Fn(([p, cellCount]: [p: any, cellCount: any]) => {
    const cell = p.mul(cellCount);
    const cellFloor = cell.floor();

    let minDist: any = float(1e10);

    for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
            for (let dz = -1; dz <= 1; dz++) {
                const offset = vec3(dx, dy, dz);
                const tp = cellFloor.add(offset);
                const noiseVal = valueNoise(tp.mod(cellCount));
                const fp = cell.sub(tp).sub(noiseVal);
                const d = fp.dot(fp);
                minDist = min(minDist, d);
            }
        }
    }

    return minDist.clamp(0, 1);
});

/* -------------------------------------------------------------------------- */
/*  Perlin noise (from perlin.glsl / GLM)                                     */
/*  4D periodic version, line-by-line port                                    */
/* -------------------------------------------------------------------------- */

const mod289 = Fn(([x]: [x: any]) => {
    return x.sub(
        x
            .mul(1.0 / 289.0)
            .floor()
            .mul(289.0)
    );
});

const permute = Fn(([v]: [v: any]) => {
    return mod289(v.mul(34.0).add(1.0).mul(v));
});

const taylorInvSqrt = Fn(([r]: [r: any]) => {
    return float(1.79284291400159).sub(float(0.85373472095314).mul(r));
});

const fade = Fn(([v]: [v: any]) => {
    return v
        .mul(v)
        .mul(v)
        .mul(v.mul(v.mul(6.0).sub(15.0)).add(10.0));
});

/**
 * 4D periodic Perlin noise.
 * Exact port of GLM's perlin(position, rep).
 * For 3D use: position.w = 0, rep.w = 1.
 */
export const perlin4D = Fn(([position, rep]: [position: any, rep: any]) => {
    const Pi0 = position.floor().mod(rep);
    const Pi1 = Pi0.add(1.0).mod(rep);
    const Pf0 = position.fract();
    const Pf1 = Pf0.sub(1.0);

    const ix = vec4(Pi0.x, Pi1.x, Pi0.x, Pi1.x);
    const iy = vec4(Pi0.y, Pi0.y, Pi1.y, Pi1.y);
    const iz0 = vec4(Pi0.z);
    const iz1 = vec4(Pi1.z);
    const iw0 = vec4(Pi0.w);
    const iw1 = vec4(Pi1.w);

    const ixy = permute(permute(ix).add(iy));
    const ixy0 = permute(ixy.add(iz0));
    const ixy1 = permute(ixy.add(iz1));
    const ixy00 = permute(ixy0.add(iw0));
    const ixy01 = permute(ixy0.add(iw1));
    const ixy10 = permute(ixy1.add(iw0));
    const ixy11 = permute(ixy1.add(iw1));

    // --- Group 00 (iz0, iw0) ---
    let gx00 = ixy00.div(7.0);
    let gy00 = gx00.floor().div(7.0);
    let gz00 = gy00.floor().div(6.0);
    gx00 = gx00.fract().sub(0.5);
    gy00 = gy00.fract().sub(0.5);
    gz00 = gz00.fract().sub(0.5);
    let gw00 = vec4(0.75).sub(gx00.abs()).sub(gy00.abs()).sub(gz00.abs());
    const sw00 = step(gw00, vec4(0.0));
    gx00 = gx00.sub(sw00.mul(step(float(0.0), gx00).sub(0.5)));
    gy00 = gy00.sub(sw00.mul(step(float(0.0), gy00).sub(0.5)));

    // --- Group 01 (iz0, iw1) ---
    let gx01 = ixy01.div(7.0);
    let gy01 = gx01.floor().div(7.0);
    let gz01 = gy01.floor().div(6.0);
    gx01 = gx01.fract().sub(0.5);
    gy01 = gy01.fract().sub(0.5);
    gz01 = gz01.fract().sub(0.5);
    let gw01 = vec4(0.75).sub(gx01.abs()).sub(gy01.abs()).sub(gz01.abs());
    const sw01 = step(gw01, vec4(0.0));
    gx01 = gx01.sub(sw01.mul(step(float(0.0), gx01).sub(0.5)));
    gy01 = gy01.sub(sw01.mul(step(float(0.0), gy01).sub(0.5)));

    // --- Group 10 (iz1, iw0) ---
    let gx10 = ixy10.div(7.0);
    let gy10 = gx10.floor().div(7.0);
    let gz10 = gy10.floor().div(6.0);
    gx10 = gx10.fract().sub(0.5);
    gy10 = gy10.fract().sub(0.5);
    gz10 = gz10.fract().sub(0.5);
    let gw10 = vec4(0.75).sub(gx10.abs()).sub(gy10.abs()).sub(gz10.abs());
    const sw10 = step(gw10, vec4(0.0));
    gx10 = gx10.sub(sw10.mul(step(float(0.0), gx10).sub(0.5)));
    gy10 = gy10.sub(sw10.mul(step(float(0.0), gy10).sub(0.5)));

    // --- Group 11 (iz1, iw1) ---
    let gx11 = ixy11.div(7.0);
    let gy11 = gx11.floor().div(7.0);
    let gz11 = gy11.floor().div(6.0);
    gx11 = gx11.fract().sub(0.5);
    gy11 = gy11.fract().sub(0.5);
    gz11 = gz11.fract().sub(0.5);
    let gw11 = vec4(0.75).sub(gx11.abs()).sub(gy11.abs()).sub(gz11.abs());
    const sw11 = step(gw11, vec4(0.0));
    gx11 = gx11.sub(sw11.mul(step(float(0.0), gx11).sub(0.5)));
    gy11 = gy11.sub(sw11.mul(step(float(0.0), gy11).sub(0.5)));

    // Normalize all groups
    const norm00 = taylorInvSqrt(
        vec4(gx00.mul(gx00).add(gy00.mul(gy00)).add(gz00.mul(gz00)).add(gw00.mul(gw00)))
    );
    gx00 = gx00.mul(norm00);
    gy00 = gy00.mul(norm00);
    gz00 = gz00.mul(norm00);
    gw00 = gw00.mul(norm00);

    const norm01 = taylorInvSqrt(
        vec4(gx01.mul(gx01).add(gy01.mul(gy01)).add(gz01.mul(gz01)).add(gw01.mul(gw01)))
    );
    gx01 = gx01.mul(norm01);
    gy01 = gy01.mul(norm01);
    gz01 = gz01.mul(norm01);
    gw01 = gw01.mul(norm01);

    const norm10 = taylorInvSqrt(
        vec4(gx10.mul(gx10).add(gy10.mul(gy10)).add(gz10.mul(gz10)).add(gw10.mul(gw10)))
    );
    gx10 = gx10.mul(norm10);
    gy10 = gy10.mul(norm10);
    gz10 = gz10.mul(norm10);
    gw10 = gw10.mul(norm10);

    const norm11 = taylorInvSqrt(
        vec4(gx11.mul(gx11).add(gy11.mul(gy11)).add(gz11.mul(gz11)).add(gw11.mul(gw11)))
    );
    gx11 = gx11.mul(norm11);
    gy11 = gy11.mul(norm11);
    gz11 = gz11.mul(norm11);
    gw11 = gw11.mul(norm11);

    // 16 dot products
    const n0000 = vec4(gx00.x, gy00.x, gz00.x, gw00.x).dot(Pf0);
    const n1000 = vec4(gx00.y, gy00.y, gz00.y, gw00.y).dot(vec4(Pf1.x, Pf0.y, Pf0.z, Pf0.w));
    const n0100 = vec4(gx00.z, gy00.z, gz00.z, gw00.z).dot(vec4(Pf0.x, Pf1.y, Pf0.z, Pf0.w));
    const n1100 = vec4(gx00.w, gy00.w, gz00.w, gw00.w).dot(vec4(Pf1.x, Pf1.y, Pf0.z, Pf0.w));

    const n0010 = vec4(gx10.x, gy10.x, gz10.x, gw10.x).dot(vec4(Pf0.x, Pf0.y, Pf1.z, Pf0.w));
    const n1010 = vec4(gx10.y, gy10.y, gz10.y, gw10.y).dot(vec4(Pf1.x, Pf0.y, Pf1.z, Pf0.w));
    const n0110 = vec4(gx10.z, gy10.z, gz10.z, gw10.z).dot(vec4(Pf0.x, Pf1.y, Pf1.z, Pf0.w));
    const n1110 = vec4(gx10.w, gy10.w, gz10.w, gw10.w).dot(vec4(Pf1.x, Pf1.y, Pf1.z, Pf0.w));

    const n0001 = vec4(gx01.x, gy01.x, gz01.x, gw01.x).dot(vec4(Pf0.x, Pf0.y, Pf0.z, Pf1.w));
    const n1001 = vec4(gx01.y, gy01.y, gz01.y, gw01.y).dot(vec4(Pf1.x, Pf0.y, Pf0.z, Pf1.w));
    const n0101 = vec4(gx01.z, gy01.z, gz01.z, gw01.z).dot(vec4(Pf0.x, Pf1.y, Pf0.z, Pf1.w));
    const n1101 = vec4(gx01.w, gy01.w, gz01.w, gw01.w).dot(vec4(Pf1.x, Pf1.y, Pf0.z, Pf1.w));

    const n0011 = vec4(gx11.x, gy11.x, gz11.x, gw11.x).dot(vec4(Pf0.x, Pf0.y, Pf1.z, Pf1.w));
    const n1011 = vec4(gx11.y, gy11.y, gz11.y, gw11.y).dot(vec4(Pf1.x, Pf0.y, Pf1.z, Pf1.w));
    const n0111 = vec4(gx11.z, gy11.z, gz11.z, gw11.z).dot(vec4(Pf0.x, Pf1.y, Pf1.z, Pf1.w));
    const n1111 = vec4(gx11.w, gy11.w, gz11.w, gw11.w).dot(Pf1);

    // Hierarchical mixing (w → z → y → x)
    const fade_xyzw = fade(Pf0);

    const n_0w = mix(
        vec4(n0000, n1000, n0100, n1100),
        vec4(n0001, n1001, n0101, n1101),
        fade_xyzw.w
    );
    const n_1w = mix(
        vec4(n0010, n1010, n0110, n1110),
        vec4(n0011, n1011, n0111, n1111),
        fade_xyzw.w
    );
    const n_zw = mix(n_0w, n_1w, fade_xyzw.z);
    const n_yzw = mix(n_zw.xy, n_zw.zw, fade_xyzw.y);
    const result = mix(n_yzw.x, n_yzw.y, fade_xyzw.x);

    return result.mul(2.2);
});

/* -------------------------------------------------------------------------- */
/*  Multi-octave Perlin wrappers (from tileableNoise.glsl)                    */
/*  Fully unrolled for TSL compatibility — TSL Fn cannot use JS loops         */
/*  that dynamically build node chains.                                       */
/* -------------------------------------------------------------------------- */

export function perlinNoise(point: any, frequency: number, octaveCount: number): any {
    if (octaveCount === 1) {
        const rep = vec4(frequency, frequency, frequency, 1);
        const p = vec4(point.mul(frequency), 0);
        return perlin4D(p, rep);
    }
    if (octaveCount === 2) {
        const f0 = frequency;
        const f1 = frequency * 2;
        const r0 = perlin4D(vec4(point.mul(f0), 0), vec4(f0, f0, f0, 1));
        const r1 = perlin4D(vec4(point.mul(f1), 0), vec4(f1, f1, f1, 1));
        return r0.mul(2.0).add(r1).div(3.0);
    }
    if (octaveCount === 3) {
        const f0 = frequency;
        const f1 = frequency * 2;
        const f2 = frequency * 4;
        const r0 = perlin4D(vec4(point.mul(f0), 0), vec4(f0, f0, f0, 1));
        const r1 = perlin4D(vec4(point.mul(f1), 0), vec4(f1, f1, f1, 1));
        const r2 = perlin4D(vec4(point.mul(f2), 0), vec4(f2, f2, f2, 1));
        return r0.mul(4.0).add(r1.mul(2.0)).add(r2).div(7.0);
    }
    if (octaveCount === 4) {
        const f0 = frequency;
        const f1 = frequency * 2;
        const f2 = frequency * 4;
        const f3 = frequency * 8;
        const r0 = perlin4D(vec4(point.mul(f0), 0), vec4(f0, f0, f0, 1));
        const r1 = perlin4D(vec4(point.mul(f1), 0), vec4(f1, f1, f1, 1));
        const r2 = perlin4D(vec4(point.mul(f2), 0), vec4(f2, f2, f2, 1));
        const r3 = perlin4D(vec4(point.mul(f3), 0), vec4(f3, f3, f3, 1));
        return r0.mul(8.0).add(r1.mul(4.0)).add(r2.mul(2.0)).add(r3).div(15.0);
    }
    if (octaveCount === 8) {
        const f0 = frequency;
        const f1 = frequency * 2;
        const f2 = frequency * 4;
        const f3 = frequency * 8;
        const f4 = frequency * 16;
        const f5 = frequency * 32;
        const f6 = frequency * 64;
        const f7 = frequency * 128;
        const r0 = perlin4D(vec4(point.mul(f0), 0), vec4(f0, f0, f0, 1));
        const r1 = perlin4D(vec4(point.mul(f1), 0), vec4(f1, f1, f1, 1));
        const r2 = perlin4D(vec4(point.mul(f2), 0), vec4(f2, f2, f2, 1));
        const r3 = perlin4D(vec4(point.mul(f3), 0), vec4(f3, f3, f3, 1));
        const r4 = perlin4D(vec4(point.mul(f4), 0), vec4(f4, f4, f4, 1));
        const r5 = perlin4D(vec4(point.mul(f5), 0), vec4(f5, f5, f5, 1));
        const r6 = perlin4D(vec4(point.mul(f6), 0), vec4(f6, f6, f6, 1));
        const r7 = perlin4D(vec4(point.mul(f7), 0), vec4(f7, f7, f7, 1));
        return r0
            .mul(128.0)
            .add(r1.mul(64.0))
            .add(r2.mul(32.0))
            .add(r3.mul(16.0))
            .add(r4.mul(8.0))
            .add(r5.mul(4.0))
            .add(r6.mul(2.0))
            .add(r7)
            .div(255.0);
    }
    // Fallback: 3 octaves
    const f0 = frequency;
    const f1 = frequency * 2;
    const f2 = frequency * 4;
    const r0 = perlin4D(vec4(point.mul(f0), 0), vec4(f0, f0, f0, 1));
    const r1 = perlin4D(vec4(point.mul(f1), 0), vec4(f1, f1, f1, 1));
    const r2 = perlin4D(vec4(point.mul(f2), 0), vec4(f2, f2, f2, 1));
    return r0.mul(4.0).add(r1.mul(2.0)).add(r2).div(7.0);
}

export function perlinNoiseVec3(point: any, frequency: any, octaveCount: number): any {
    // For vec3 frequency, unroll 8 octaves (used by LocalWeather high clouds)
    if (octaveCount === 8) {
        const weights = [128, 64, 32, 16, 8, 4, 2, 1];
        const lacunarity = vec3(2.0, 2.0, 2.0);
        let f = frequency;
        let sum: any = float(0);
        let weightSum = 0;
        for (let i = 0; i < 8; i++) {
            const r = perlin4D(vec4(point.mul(f), 0), vec4(f, 1));
            sum = sum.add(r.mul(weights[i]));
            weightSum += weights[i];
            f = f.mul(lacunarity);
        }
        return sum.div(weightSum);
    }
    // Fallback: 4 octaves
    const weights = [8, 4, 2, 1];
    const lacunarity = vec3(2.0, 2.0, 2.0);
    let f = frequency;
    let sum: any = float(0);
    let weightSum = 0;
    for (let i = 0; i < 4; i++) {
        const r = perlin4D(vec4(point.mul(f), 0), vec4(f, 1));
        sum = sum.add(r.mul(weights[i]));
        weightSum += weights[i];
        f = f.mul(lacunarity);
    }
    return sum.div(weightSum);
}
