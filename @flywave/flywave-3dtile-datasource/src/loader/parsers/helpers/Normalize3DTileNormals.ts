/* Copyright (C) 2025 flywave.gl contributors */

import { GL, octDecode } from "@flywave/flywave-utils";
import { Vector3 } from "three";

import { type Tiles3DTileContent } from "../../types";

const scratchNormal = new Vector3();

export function normalize3DTileNormalAttribute(
    tile: Tiles3DTileContent,
    normals: Float32Array | null
): { type: number; size: number; value: Float32Array } | null {
    if (!normals) {
        return null;
    }

    if (tile.isOctEncoded16P) {
        const decodedArray = new Float32Array((tile.pointsLength || 0) * 3);
        for (let i = 0; i < (tile.pointsLength || 0); i++) {
            octDecode(normals[i * 2], normals[i * 2 + 1], scratchNormal);
            // @ts-ignore
            scratchNormal.toArray(decodedArray, i * 3);
        }

        return {
            type: GL.FLOAT,
            size: 2,
            value: decodedArray
        };
    }

    return {
        type: GL.FLOAT,
        size: 2,
        value: normals
    };
}
