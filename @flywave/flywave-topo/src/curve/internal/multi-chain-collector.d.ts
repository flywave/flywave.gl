import { CurvePrimitive } from "../curve-primitive";
import { type AnyCurve } from "../curve-types";
import { LineString3d } from "../line-string3d";
import { type ChainTypes } from "../region-ops";
import { type StrokeOptions } from "../stroke-options";
/**
 * Manage a growing array of arrays of curve primitives that are to be joined "head to tail" in paths.
 * * The caller makes a sequence of calls to announce individual primitives.
 * * This collector (unlike the simpler [[ChainCollectorContext]]) expects to have inputs arriving in random order, leaving multiple open chains in play at any time.
 * * When all curves have been announced, the call to `grabResults` restructures the various active chains into Paths (and optionally, Loops).
 * * Chain formation is dependent upon input fragment order, as a greedy algorithm is employed.
 * * Usage pattern is
 *   * initialization: `context = new MultiChainCollector(gapTol, planeTol)`
 *   * many times:
 *       * `context.captureCurve(anyCurve)`
 *       * `context.captureCurvePrimitive(primitive)`
 *   * end: `result = context.grabResult(makeLoopIfClosed)`
 * @internal
 */
export declare class MultiChainCollector {
    /** accumulated chains */
    private _chains;
    /** largest gap distance to close */
    private readonly _gapTolerance;
    /** end point snap tolerance (assumed to be as tight or tighter than gapTolerance) */
    private readonly _snapTolerance;
    /** tolerance for choosing Path or Loop. If undefined, always Path. */
    private readonly _planeTolerance;
    private static _staticPointA;
    private static _staticPointB;
    private _xyzWork0?;
    private _xyzWork1?;
    /** Initialize with an empty array of chains.
     * @param gapTolerance tolerance for calling endpoints identical
     * @param planeTolerance tolerance for considering a closed chain to be planar. If undefined, only create Path. If defined, create Loops for closed chains within tolerance of a plane.
     */
    constructor(gapTolerance?: number, planeTolerance?: number | undefined);
    /**
     * Find a chain (with index _other than_ exceptChainIndex) that starts or ends at xyz
     * @param xyz endpoint to check
     * @param tolerance absolute distance tolerance for equating endpoints
     * @param exceptChainIndex index of chain to ignore. Send -1 to consider all chains.
     */
    private findAnyChainToConnect;
    /**
     * Insert a single curve primitive into the active chains.
     * * The primitive is captured (not cloned)
     * * The primitive may be reversed in place
     * @param candidate curve to add to the context
     */
    captureCurvePrimitive(candidate: CurvePrimitive): void;
    /**
     * Insert any curve into the collection.
     * * This recurses into Path, Loop, BagOfCurves etc
     * * All primitives are captured, and may be reversed in place.
     * @param candidate curve to add to the context
     */
    captureCurve(candidate: AnyCurve): void;
    /** If allowed by the geometry type, move an endpoint. */
    private static simpleEndPointMove;
    /**
     * Try to move the end of curve0 and/or the start of curve1 to a common point.
     * * All z-coordinates are ignored.
     * @param curve0 first curve, assumed to end close to the start of curve1
     * @param curve1 second curve, assumed to start close to the end of curve0
     * @param gapTolerance max distance to move a curve start/end point
     * @returns whether curve start/end point(s) moved
     */
    private static moveHeadOrTail;
    /** Announce a curve primitive
     * * If a "nearby" connection is possible, insert the candidate in the chain and force endpoint match.
     * * Otherwise start a new chain.
     */
    private attachPrimitiveToAnyChain;
    /**
     * Merge two entries in the chain array.
     * * Move each primitive from chainB to the end of chainA.
     * * Clear chainB.
     * * Move the final chain to chainB index.
     * * Decrement the array length.
     * @param chainIndexA index of chainA
     * @param chainIndexB index of chainB
     */
    private mergeChainsForwardForward;
    /** Reverse the curve chain in place. */
    private reverseChain;
    /** See if the head or tail of chainIndex matches any existing chain. If so, merge the two chains. */
    private searchAndMergeChainIndex;
    /**
     * Convert an array of curve primitives into the simplest possible strongly typed curve structure.
     * @param curves input array, assembled correctly into a single contiguous path, captured by returned object
     * @param makeLoopIfClosed whether to return a Loop from physically closed curves array, otherwise Path
     * @return Loop or Path if multiple curves; the primitive if only one curve; undefined if no curves
     */
    private promoteArrayToCurves;
    /** Stroke the curve chain to a line string, de-duplicate the points. */
    private chainToLineString3d;
    /** Return the collected results, structured as the simplest possible type. */
    grabResult(makeLoopIfClosed?: boolean): ChainTypes;
    /** Return chains as individual calls to announceChain. */
    announceChainsAsLineString3d(announceChain: (ls: LineString3d) => void, options?: StrokeOptions): void;
}
