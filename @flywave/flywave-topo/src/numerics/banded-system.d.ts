/**
 * `BandedSystem` is a class with static methods for solving banded linear systems, such as in computing
 * Bspline poles for pass-through points
 * @internal
 */
export declare class BandedSystem {
    /** apply LU decomposition to a banded system */
    static decomposeLU(numRow: number, bw: number, data: Float64Array): boolean;
    /**
     *
     * @param sum evolving sum.  sum.length
     * @param source data being added
     * @param sourceRow row in source.  Plain offset is sourceRow * sum.length
     * @param scale scale factor to apply.
     */
    private static arrayAddScaledBlock;
    private static blockAssignBlockMinusArray;
    private static blockSumOfScaledBlockScaledArray;
    /**
     * Solve a linear system A*X=B where
     * * A is nominally an `numRow*numRow` matrix, but is stored in banded row-major form
     * * The band storage is `bw` numbers per row, with the middle value being the diagonal of that row.
     *    * Hence rows near top and bottom have band values `outside` the matrix.
     * * The right hand side is an `numRow*numRHS` matrix in row-major order.
     * @param numRow number of rows (and columns) of the nominal full matrix.
     * @param bw total bandwidth (diagonal + equal number of values to left and right)
     * @param matrix the banded matrix, as packed row-major
     * @param numRHS the number of right hand sides.
     * @param rhs the right hand sides
     */
    static solveBandedSystemMultipleRHS(numRow: number, bw: number, matrix: Float64Array, numRHS: number, // number of components in each RHS row.
    rhs: Float64Array): Float64Array | undefined;
    /**
     * Multiply a banded numRow*numRow matrix times a full numRow*numRHS, return as new matrix
     */
    static multiplyBandedTimesFull(numRow: number, bw: number, bandedMatrix: Float64Array, numRHS: number, // number of components in each RHS row.
    rhs: Float64Array): Float64Array;
}
