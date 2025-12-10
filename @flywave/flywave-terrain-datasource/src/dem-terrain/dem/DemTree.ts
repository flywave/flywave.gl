/* Copyright (C) 2025 flywave.gl contributors */

import { clamp, number as interpolate } from "@flywave/flywave-utils";
import { type Vector3Like, type Vector3Tuple, Vector3 } from "three";

import type DEMData from "./DemData";

type vec3Like = Vector3Like | Vector3Tuple;

class MipLevel {
    readonly size: number;
    readonly minimums: Float32Array;
    readonly maximums: Float32Array;
    readonly leaves: Uint8Array;

    constructor(size: number) {
        this.size = size;
        const arraySize = size * size;
        this.minimums = new Float32Array(arraySize);
        this.maximums = new Float32Array(arraySize);
        this.leaves = new Uint8Array(arraySize);
    }

    getElevation(x: number, y: number): { min: number; max: number } {
        const idx = this.toIdx(x, y);
        return {
            min: this.minimums[idx],
            max: this.maximums[idx]
        };
    }

    isLeaf(x: number, y: number): number {
        return this.leaves[this.toIdx(x, y)];
    }

    toIdx(x: number, y: number): number {
        return y * this.size + x;
    }
}

// Constants
const AABB_SKIRT_PADDING = 100;
const EPSILON = 1e-15;
const MAX_VALUE = Number.MAX_VALUE;
const ELEVATION_DIFF_THRESHOLD = 5;
const TEXEL_SIZE_OF_MIP0 = 2;

// Precomputed sibling offsets
const SIBLING_OFFSETS: Array<[number, number]> = [
    [0, 0], // Top-left
    [1, 0], // Top-right
    [0, 1], // Bottom-left
    [1, 1] // Bottom-right
];

// Helper functions
const aabbRayIntersect = (
    min: vec3Like,
    max: vec3Like,
    pos: vec3Like,
    dir: vec3Like
): number | null => {
    let tMin = 0;
    let tMax = MAX_VALUE;

    for (let i = 0; i < 3; i++) {
        if (Math.abs(dir[i]) < EPSILON) {
            if (pos[i] < min[i] || pos[i] > max[i]) return null;
        } else {
            const ood = 1.0 / dir[i];
            let t1 = (min[i] - pos[i]) * ood;
            let t2 = (max[i] - pos[i]) * ood;

            if (t1 > t2) [t1, t2] = [t2, t1];

            tMin = Math.max(tMin, t1);
            tMax = Math.min(tMax, t2);
            if (tMin > tMax) return null;
        }
    }

    return tMin;
};

const triangleRayIntersect = (
    ax: number,
    ay: number,
    az: number,
    bx: number,
    by: number,
    bz: number,
    cx: number,
    cy: number,
    cz: number,
    pos: vec3Like,
    dir: vec3Like
): number | null => {
    const abX = bx - ax;
    const abY = by - ay;
    const abZ = bz - az;
    const acX = cx - ax;
    const acY = cy - ay;
    const acZ = cz - az;

    // pvec = cross(dir, ac)
    const pvecX = dir[1] * acZ - dir[2] * acY;
    const pvecY = dir[2] * acX - dir[0] * acZ;
    const pvecZ = dir[0] * acY - dir[1] * acX;
    const det = abX * pvecX + abY * pvecY + abZ * pvecZ;

    if (Math.abs(det) < EPSILON) return null;

    const invDet = 1.0 / det;
    const tvecX = pos[0] - ax;
    const tvecY = pos[1] - ay;
    const tvecZ = pos[2] - az;
    const u = (tvecX * pvecX + tvecY * pvecY + tvecZ * pvecZ) * invDet;

    if (u < 0.0 || u > 1.0) return null;

    // qvec = cross(tvec, ab)
    const qvecX = tvecY * abZ - tvecZ * abY;
    const qvecY = tvecZ * abX - tvecX * abZ;
    const qvecZ = tvecX * abY - tvecY * abX;
    const v = (dir[0] * qvecX + dir[1] * qvecY + dir[2] * qvecZ) * invDet;

    if (v < 0.0 || u + v > 1.0) return null;

    return (acX * qvecX + acY * qvecY + acZ * qvecZ) * invDet;
};

const frac = (v: number, lo: number, hi: number): number => (v - lo) / (hi - lo);

const decodeBounds = (
    x: number,
    y: number,
    depth: number,
    boundsMinx: number,
    boundsMiny: number,
    boundsMaxx: number,
    boundsMaxy: number,
    outMin: number[],
    outMax: number[]
): void => {
    const scale = 1 << depth;
    const rangex = boundsMaxx - boundsMinx;
    const rangey = boundsMaxy - boundsMiny;

    outMin[0] = (x / scale) * rangex + boundsMinx;
    outMax[0] = ((x + 1) / scale) * rangex + boundsMinx;
    outMin[1] = (y / scale) * rangey + boundsMiny;
    outMax[1] = ((y + 1) / scale) * rangey + boundsMiny;
};

const bilinearLerp = (
    p00: number,
    p10: number,
    p01: number,
    p11: number,
    x: number,
    y: number
): number => {
    return interpolate(interpolate(p00, p01, y), interpolate(p10, p11, y), x);
};

const sampleElevation = (fx: number, fy: number, dem: DEMData): number => {
    const demSize = dem.dim;
    const x = clamp(fx * demSize - 0.5, 0, demSize - 1);
    const y = clamp(fy * demSize - 0.5, 0, demSize - 1);

    const ixMin = Math.floor(x);
    const iyMin = Math.floor(y);
    const ixMax = Math.min(ixMin + 1, demSize - 1);
    const iyMax = Math.min(iyMin + 1, demSize - 1);

    const e00 = dem.get(ixMin, iyMin);
    const e10 = dem.get(ixMax, iyMin);
    const e01 = dem.get(ixMin, iyMax);
    const e11 = dem.get(ixMax, iyMax);

    return bilinearLerp(e00, e10, e01, e11, x - ixMin, y - iyMin);
};

export default class DemMinMaxQuadTree {
    _maximums: Float32Array;
    _minimums: Float32Array;
    _leaves: Uint8Array;
    _childOffsets: Int32Array;
    private _nodeCount: number = 0;
    private _capacity: number;
    public dem: DEMData;

    get leaves() {
        return this._leaves;
    }

    get childOffsets() {
        return this._childOffsets;
    }

    get minimums() {
        return this._minimums;
    }

    get maximums() {
        return this._maximums;
    }

    constructor(
        dem: DEMData,
        data?: {
            childOffsets: Int32Array;
            leaves: Uint8Array;
            maximums: Float32Array;
            minimums: Float32Array;
        }
    ) {
        this.dem = dem;

        // Estimate initial capacity based on DEM size
        this._capacity = Math.max(1024, dem.dim * dem.dim);
        this._maximums = new Float32Array(this._capacity);
        this._minimums = new Float32Array(this._capacity);
        this._leaves = new Uint8Array(this._capacity);
        this._childOffsets = new Int32Array(this._capacity);

        if (data) {
            this._nodeCount = data.leaves.length;
            this._maximums.set(data.maximums);
            this._minimums.set(data.minimums);
            this._leaves.set(data.leaves);
            this._childOffsets.set(data.childOffsets);
            return;
        }

        const mips = buildDemMipmap(dem);
        const maxLvl = mips.length - 1;
        const rootMip = mips[maxLvl];

        // Create root node
        this._addNode(rootMip.minimums[0], rootMip.maximums[0], rootMip.leaves[0]);

        // Build tree recursively
        this._construct(mips, 0, 0, maxLvl, 0);
    }

    raycastRoot(
        minx: number,
        miny: number,
        maxx: number,
        maxy: number,
        p: vec3Like,
        d: vec3Like,
        exaggeration: number = 1
    ): number | null {
        const min: vec3Like = [minx, miny, -AABB_SKIRT_PADDING];
        const max: vec3Like = [maxx, maxy, this._maximums[0] * exaggeration];
        return aabbRayIntersect(min, max, p, d);
    }

    raycast(
        rootMinx: number,
        rootMiny: number,
        rootMaxx: number,
        rootMaxy: number,
        p: vec3Like,
        d: vec3Like,
        exaggeration: number = 1
    ): number | null {
        if (!this._nodeCount) return null;

        const t = this.raycastRoot(rootMinx, rootMiny, rootMaxx, rootMaxy, p, d, exaggeration);
        if (t == null) return null;

        const stack = [
            {
                idx: 0,
                t,
                nodex: 0,
                nodey: 0,
                depth: 0
            }
        ];
        const boundsMin: number[] = [];
        const boundsMax: number[] = [];
        const tHits: number[] = [];
        const sortedHits: number[] = [];

        while (stack.length > 0) {
            const { idx, t, nodex, nodey, depth } = stack.pop()!;

            if (this._leaves[idx]) {
                decodeBounds(
                    nodex,
                    nodey,
                    depth,
                    rootMinx,
                    rootMiny,
                    rootMaxx,
                    rootMaxy,
                    boundsMin,
                    boundsMax
                );

                const scale = 1 << depth;
                const minxUv = nodex / scale;
                const maxxUv = (nodex + 1) / scale;
                const minyUv = nodey / scale;
                const maxyUv = (nodey + 1) / scale;

                const az = sampleElevation(minxUv, minyUv, this.dem) * exaggeration;
                const bz = sampleElevation(maxxUv, minyUv, this.dem) * exaggeration;
                const cz = sampleElevation(maxxUv, maxyUv, this.dem) * exaggeration;
                const dz = sampleElevation(minxUv, maxyUv, this.dem) * exaggeration;

                const t0 = triangleRayIntersect(
                    boundsMin[0],
                    boundsMin[1],
                    az,
                    boundsMax[0],
                    boundsMin[1],
                    bz,
                    boundsMax[0],
                    boundsMax[1],
                    cz,
                    p,
                    d
                );

                const t1 = triangleRayIntersect(
                    boundsMax[0],
                    boundsMax[1],
                    cz,
                    boundsMin[0],
                    boundsMax[1],
                    dz,
                    boundsMin[0],
                    boundsMin[1],
                    az,
                    p,
                    d
                );

                const tMin = Math.min(t0 ?? MAX_VALUE, t1 ?? MAX_VALUE);

                if (tMin === MAX_VALUE) {
                    const hitPos = new Vector3()
                        .copy(p as Vector3)
                        .add(new Vector3(d[0], d[1], d[2]).multiplyScalar(t));
                    const fracx = frac(hitPos.x, boundsMin[0], boundsMax[0]);
                    const fracy = frac(hitPos.y, boundsMin[1], boundsMax[1]);

                    if (bilinearLerp(az, bz, dz, cz, fracx, fracy) >= hitPos.z) return t;
                } else {
                    return tMin;
                }
                continue;
            }

            // Check child nodes
            let hitCount = 0;
            for (let i = 0; i < 4; i++) {
                const [dx, dy] = SIBLING_OFFSETS[i];
                const childNodeX = (nodex << 1) + dx;
                const childNodeY = (nodey << 1) + dy;

                decodeBounds(
                    childNodeX,
                    childNodeY,
                    depth + 1,
                    rootMinx,
                    rootMiny,
                    rootMaxx,
                    rootMaxy,
                    boundsMin,
                    boundsMax
                );

                boundsMin[2] = -AABB_SKIRT_PADDING;
                boundsMax[2] = this._maximums[this._childOffsets[idx] + i] * exaggeration;

                const result = aabbRayIntersect(boundsMin as vec3Like, boundsMax as vec3Like, p, d);
                if (result != null) {
                    tHits[i] = result;
                    let j = 0;
                    for (; j < hitCount && result < tHits[sortedHits[j]]; j++);
                    sortedHits.splice(j, 0, i);
                    hitCount++;
                }
            }

            // Push hits to stack in reverse order
            for (let i = hitCount - 1; i >= 0; i--) {
                const hitIdx = sortedHits[i];
                stack.push({
                    idx: this._childOffsets[idx] + hitIdx,
                    t: tHits[hitIdx],
                    nodex: (nodex << 1) + SIBLING_OFFSETS[hitIdx][0],
                    nodey: (nodey << 1) + SIBLING_OFFSETS[hitIdx][1],
                    depth: depth + 1
                });
            }
        }

        return null;
    }

    private _addNode(min: number, max: number, leaf: number): number {
        if (this._nodeCount >= this._capacity) {
            this._resizeArrays(this._capacity * 2);
        }

        const idx = this._nodeCount++;
        this._minimums[idx] = min;
        this._maximums[idx] = max;
        this._leaves[idx] = leaf;
        this._childOffsets[idx] = 0;
        return idx;
    }

    private _resizeArrays(newCapacity: number): void {
        const newMaximums = new Float32Array(newCapacity);
        const newMinimums = new Float32Array(newCapacity);
        const newLeaves = new Uint8Array(newCapacity);
        const newChildOffsets = new Int32Array(newCapacity);

        newMaximums.set(this._maximums);
        newMinimums.set(this._minimums);
        newLeaves.set(this._leaves);
        newChildOffsets.set(this._childOffsets);

        this._maximums = newMaximums;
        this._minimums = newMinimums;
        this._leaves = newLeaves;
        this._childOffsets = newChildOffsets;
        this._capacity = newCapacity;
    }

    private _construct(
        mips: MipLevel[],
        x: number,
        y: number,
        lvl: number,
        parentIdx: number
    ): void {
        if (mips[lvl].isLeaf(x, y)) return;

        if (!this._childOffsets[parentIdx]) {
            this._childOffsets[parentIdx] = this._nodeCount;
        }

        const childLvl = lvl - 1;
        const childMip = mips[childLvl];
        const firstNodeIdx = this._nodeCount;
        let leafMask = 0;

        for (let i = 0; i < 4; i++) {
            const [dx, dy] = SIBLING_OFFSETS[i];
            const childX = x * 2 + dx;
            const childY = y * 2 + dy;

            const elevation = childMip.getElevation(childX, childY);
            const leaf = childMip.isLeaf(childX, childY);
            this._addNode(elevation.min, elevation.max, leaf);

            if (leaf) leafMask |= 1 << i;
        }

        for (let i = 0; i < 4; i++) {
            if (!(leafMask & (1 << i))) {
                this._construct(
                    mips,
                    x * 2 + SIBLING_OFFSETS[i][0],
                    y * 2 + SIBLING_OFFSETS[i][1],
                    childLvl,
                    firstNodeIdx + i
                );
            }
        }
    }
}

const buildDemMipmap = (dem: DEMData): MipLevel[] => {
    const demSize = dem.dim;
    const levelCount = Math.ceil(Math.log2(demSize / TEXEL_SIZE_OF_MIP0));
    const mips: MipLevel[] = [];

    // Build base mip level
    let blockCount = Math.ceil(Math.pow(2, levelCount));
    let mip = new MipLevel(blockCount);

    for (let y = 0; y < blockCount; y++) {
        for (let x = 0; x < blockCount; x++) {
            const idx = mip.toIdx(x, y);
            const blockSize = 1 / blockCount;
            const minx = x * blockSize;
            const maxx = (x + 1) * blockSize;
            const miny = y * blockSize;
            const maxy = (y + 1) * blockSize;

            const e0 = sampleElevation(minx, miny, dem);
            const e1 = sampleElevation(maxx, miny, dem);
            const e2 = sampleElevation(maxx, maxy, dem);
            const e3 = sampleElevation(minx, maxy, dem);

            mip.minimums[idx] = Math.min(e0, e1, e2, e3);
            mip.maximums[idx] = Math.max(e0, e1, e2, e3);
            mip.leaves[idx] = 1;
        }
    }
    mips.push(mip);

    // Build higher mip levels
    for (blockCount /= 2; blockCount >= 1; blockCount /= 2) {
        const prevMip = mips[mips.length - 1];
        mip = new MipLevel(blockCount);

        for (let y = 0; y < blockCount; y++) {
            for (let x = 0; x < blockCount; x++) {
                const idx = mip.toIdx(x, y);
                const e0 = prevMip.getElevation(x * 2, y * 2);
                const e1 = prevMip.getElevation(x * 2 + 1, y * 2);
                const e2 = prevMip.getElevation(x * 2 + 1, y * 2 + 1);
                const e3 = prevMip.getElevation(x * 2, y * 2 + 1);

                const minElevation = Math.min(e0.min, e1.min, e2.min, e3.min);
                const maxElevation = Math.max(e0.max, e1.max, e2.max, e3.max);

                mip.minimums[idx] = minElevation;
                mip.maximums[idx] = maxElevation;

                const canConcatenate =
                    prevMip.isLeaf(x * 2, y * 2) &&
                    prevMip.isLeaf(x * 2 + 1, y * 2) &&
                    prevMip.isLeaf(x * 2 + 1, y * 2 + 1) &&
                    prevMip.isLeaf(x * 2, y * 2 + 1);

                mip.leaves[idx] =
                    maxElevation - minElevation <= ELEVATION_DIFF_THRESHOLD && canConcatenate
                        ? 1
                        : 0;
            }
        }
        mips.push(mip);
    }

    return mips;
};
