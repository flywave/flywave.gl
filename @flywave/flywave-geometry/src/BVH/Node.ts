/* Copyright (C) 2025 flywave.gl contributors */

import { type FloatArray } from "./Utils";

export type BVHNode<NodeData, LeafData> = {
    box: FloatArray; // [minX, maxX, minY, maxY, minZ, maxZ]
    parent?: BVHNode<NodeData, LeafData>;
    left?: BVHNode<NodeData, LeafData> | null;
    right?: BVHNode<NodeData, LeafData> | null;
    object?: LeafData;
} & NodeData;
