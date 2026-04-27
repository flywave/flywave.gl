import { Point3d } from "../geometry3d/point3d-vector3d";
/**
 * methods for gathering points and indices of a box (8 corners, 6 faces, 12 edges)
 * @internal
 */
export declare class BoxTopology {
    /**
     * static readonly array with the coordinates of the 8 unit cube corners in standard order, which is:
     * x varies fastest
     * * The point indices for the x edges are (0 to 1), (2 to 3), (4 to 5), (6 to 7)
     * * The point indices for the y edges are (0 to 2), (1 to 3), (4 to 6), (5 to 7)
     * * The point indices for the z edges are (0 to 4), (1 to 5), (2 to 6), (3 to 7)
     * * These indices are tabulated in the `axisEdgeVertex[axis][edge][vertex]` array
     */
    static readonly points: Point3d[];
    static pointsClone(): Point3d[];
    /** IN faceId pair, the first component for bottom and top caps is `primaryCapId` */
    static readonly primaryCapId = -1;
    /** Indices of vertices around faces, in CCW from the outside. */
    static readonly cornerIndexCCW: number[][];
    /**  // [partnerFace[faceIndex][k] = index of k'th adjacent face  */
    static readonly partnerFace: number[][];
    /** face id as used in SolidPrimitive methods */
    static readonly faceId: number[][];
    /**
     * Table to look up axis indices of edges and normals in box faces.
     * faceDirections[faceIndex] =[[edge0AxisIndex, edge1AxisIndex, normalAxisIndex],[direction sign for along the axis]
     */
    static readonly faceDirections: number[][][];
    /** There are 4 edges in each axis direction.
     *  * axisEdgeVertex[axisIndex][edgeIndex 0..3][*] = vertex index at end of edge in axisIndex direction.
     */
    static readonly axisEdgeVertex: number[][][];
}
