/**
 * * XYParitySearchContext is an internal class for callers that can feed points (without extracting to array structures)
 * * Most will be via static methods which handle a specific data source.
 *   * PolygonOps.classifyPointInPolygon (x,y,points: XAndY[])
 *   * HalfEdgeGraphSearch.pointInOrOnFaceXY (halfEdgeOnFace, x, y)
 * Use pattern:
 * * Caller must be able walk around polygon producing x,y coordinates (possibly transformed from actual polygon)
 * * Caller announce edges to tryStartEdge until finding one acceptable to the search.
 * * Caller then passes additional points up to and including both x0,y0 and x1, y1 of the accepted start edge.
 * Call sequence is:
 *    `context = new XYParitySearchContext`
 *    `repeat {  acquire edge (x0,y0) (x1,y1)} until context.tryStartEdge (x0,y0,x1,y1);`
 *    `for each (x,y) beginning AFTER x1,y1 and ending with (x1,y1) context.advance (x,y)`
 *  `return context.classifyCounts ();`
 */
export declare class XYParitySearchContext {
    xTest: number;
    yTest: number;
    u0: number;
    v0: number;
    u1: number;
    v1: number;
    numLeftCrossing: number;
    numRightCrossing: number;
    numHit: number;
    /**
     * Create a new searcher for specified test point.
     * @param xTest x coordinate of test point
     * @param yTest y coordinate of test point
     */
    constructor(xTest: number, yTest: number);
    /**
     * test if x,y is a safe first coordinate to start the search.
     * * safe start must have non-zero y so that final point test (return to x0,y0) does not need look back for exact crossing logic.
     * @param x
     * @param y
     */
    tryStartEdge(x0: number, y0: number, x1: number, y1: number): boolean;
    /** Return true if parity accumulation proceeded normally.
     * Return false if interrupted for exact hit.
     */
    advance(x: number, y: number): boolean;
    /**
     * Return classification as ON, IN, or OUT according to hit and crossing counts.
     * * Any nonzero hit count is ON
     * * Otherwise IN if left crossing count is odd.
     * @return 0 if ON, 1 if IN, -1 if OUT
     */
    classifyCounts(): number | undefined;
}
