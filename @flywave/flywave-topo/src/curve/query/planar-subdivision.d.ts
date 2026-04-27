import { type HalfEdge, HalfEdgeGraph } from "../../topology/graph";
import { CurveLocationDetailPair } from "../curve-location-detail";
import { type CurvePrimitive } from "../curve-primitive";
import { type SignedLoops, Loop } from "../loop";
/**
 * @internal
 */
export declare class PlanarSubdivision {
    /** Create a graph from an array of curves, and an array of the curves' precomputed intersections. Z-coordinates are ignored. */
    static assembleHalfEdgeGraph(primitives: CurvePrimitive[], allPairs: CurveLocationDetailPair[], mergeTolerance?: number): HalfEdgeGraph;
    /**
     * Create a pair of mated half edges referencing an interval of a primitive
     *   * no action if start and end points are identical.
     * @param graph containing graph.
     * @param p the curve
     * @param fraction0 starting fraction
     * @param point0 start point
     * @param fraction1 end fraction
     * @param point1 end point
     * @returns end point and fraction, or start point and fraction if no action
     */
    private static addHalfEdge;
    /**
     * Based on computed (and toleranced) area, push the loop (pointer) onto the appropriate array of positive, negative, or sliver loops.
     * @param zeroAreaTolerance absolute area tolerance for sliver face detection
     * @param isSliverFace whether the loop is known a priori (e.g., via topology) to have zero area
     * @returns the area (forced to zero if within tolerance)
     */
    static collectSignedLoop(loop: Loop, outLoops: SignedLoops, zeroAreaTolerance?: number, isSliverFace?: boolean): number;
    static createLoopInFace(faceSeed: HalfEdge, announce?: (he: HalfEdge, curve: CurvePrimitive, loop: Loop) => void): Loop;
    private static isNullFace;
    private static nonNullEdgeMate;
    static collectSignedLoopSetsInHalfEdgeGraph(graph: HalfEdgeGraph, zeroAreaTolerance?: number): SignedLoops[];
}
