import { FloatArray } from "../utils/types";

export type BVHNode<NodeData, LeafData> = {
  box: FloatArray; // [minX, maxX, minY, maxY, minZ, maxZ]
  parent?: BVHNode<NodeData, LeafData>;
  left?: BVHNode<NodeData, LeafData> | null;
  right?: BVHNode<NodeData, LeafData> | null;
  object?: LeafData;
} & NodeData;

