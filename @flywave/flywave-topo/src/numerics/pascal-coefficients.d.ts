export declare class PascalCoefficients {
    private static readonly _allRows;
    /**
     * * return a row of the pascal table.
     * * The contents must not be altered by the user !!!
     * * Hypothetically the request row can be any integer.
     * * BUT in practice, values 60 create integer entries that are too big for IEEE double.
     */
    static getRow(row: number): Float64Array;
    /** Return an array with Bezier weighted pascal coefficients
     * @param row row index in the pascal triangle.  (`row+1` entries)
     * @param u parameter value
     * @param result optional destination array.
     * @note if the destination array is undefined or too small, a new Float64Array is allocated.
     * @note if the destination array is larger than needed, its leading `row+1` values are filled,
     *     and the array is returned.
     */
    static getBezierBasisValues(order: number, u: number, result?: Float64Array): Float64Array;
    /** Return an array with derivatives of Bezier weighted pascal coefficients
     * @param row row index in the pascal triangle.  (`row+1` entries)
     * @param u parameter value
     * @param result optional destination array.
     * @note if the destination array is undefined or too small, a new Float64Array is allocated.
     * @note if the destination array is larger than needed, its leading `row+1` values are filled,
     *     and the array is returned.
     */
    static getBezierBasisDerivatives(order: number, u: number, result?: Float64Array): Float64Array;
}
