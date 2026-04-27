import { BagOfCurves } from "../curve-collection";
import { CurvePrimitive } from "../curve-primitive";
import { Loop } from "../loop";
import { Path } from "../path";
/**
 * Manage a growing array of arrays of curve primitives that are to be joined "head to tail" in paths.
 * * The caller makes a sequence of calls to announce individual primitives.
 *    * The collector has 2 use cases in mind, controlled by `searchAllPaths` flag on `chainCollectorContext.announceCurvePrimitive`
 *    * (a) "simple chains" -- the caller has the curve primitives in order and just needs to have them monitored for coordinate breaks that indicate transition to a new chain.
 *        * The collector needs to watch for connection to the most recent path but not search for prior paths to join to instead.
 *    * (b)  "mixed" primitives -- primitive order is NOT significant for chain assembly.
 *        * The collector needs to search all prior paths at both start and end, and consider connection to both the start and end of each new primitive.
 * * The per-curve announcement is
 *    * chainCollector.announceCurvePrimitive (curve, searchAllPaths).
 * * When all curves have been announced, the call to grab the paths option
 *    * formLoopsIfClosed
 *       * If true, convert closed paths to `Loop`, open paths to `Path`
 *       * If false, convert all paths (open or not) to `Path`
 * * Usage pattern is
 *   * initialization: `context = new ChainCollectorContext (makeClones: boolean)`
 *   * many times: `   context.announceCurvePrimitive (primitive, searchAllPaths)`
 *   * end:        ` result = context.grabResults (formLoopsIfClosed)`
 * @internal
 */
export declare class ChainCollectorContext {
    private readonly _chains;
    private readonly _makeClones;
    private static _staticPointA;
    private static _staticPointB;
    /**
     * Push a new chain with an optional first primitive.
     */
    private pushNewChain;
    private findOrCreateTailChain;
    private _xyzWork0?;
    private findAnyChainToConnect;
    /** Initialize with an empty array of chains.
     * @param makeClones if true, all CurvePrimitives sent to `announceCurvePrimitive` is immediately cloned.  If false, the reference to the original curve is maintained.
     */
    constructor(makeClones: boolean);
    private _xyzWork1?;
    /** Announce a curve primitive
     * * searchAllChains controls the extent of search for connecting points.
     *   * false ==> only consider connection to most recent chain.
     *   * true ==> search for any connection, reversing direction as needed.
     * * Otherwise start a new chain.
     */
    announceCurvePrimitive(candidate: CurvePrimitive, searchAllChains?: boolean): void;
    /** Transfer markup (e.g. startCut, endCut) from source to destination */
    private transferMarkup;
    /** turn an array of curve primitives into the simplest possible strongly typed curve structure.
     * * The input array is assumed to be connected appropriately to act as the curves of a Path.
     * * When a path is created the curves array is CAPTURED.
     */
    private promoteArrayToCurves;
    /** Return the collected results, structured as the simplest possible type. */
    grabResult(makeLoopIfClosed?: boolean): CurvePrimitive | Path | BagOfCurves | Loop | undefined;
    /** test if there is a break between primitiveA and primitiveB, due to any condition such as
     * * primitiveA.endCut
     * * primitiveB.startCut
     * * physical gap between primitives.
     */
    static needBreakBetweenPrimitives(primitiveA: CurvePrimitive | undefined, primitiveB: CurvePrimitive | undefined, isXYOnly?: boolean): boolean;
}
