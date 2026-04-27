/**
 * Utilities to compare json objects by searching through their properties.
 * @public
 */
export declare class DeepCompare {
    /** Statistical accumulations during searchers. */
    typeCounts: {
        numbers: number;
        arrays: number;
        functions: number;
        objects: number;
        strings: number;
        booleans: number;
        undefined: number;
    };
    /** Counts of property names encountered during various searches. */
    propertyCounts: Record<string, number>;
    /** Array of error descriptions. */
    errorTracker: any[];
    /** relative tolerance for declaring numeric values equal. */
    numberRelTol: number;
    /** Construct comparison object with relative tolerance. */
    constructor(numberRelTol?: number);
    /** Test if a and b are within tolerance.
     * * If not, push error message to errorTracker.
     */
    compareNumber(a: number, b: number): boolean;
    private compareArray;
    private compareObject;
    private announce;
    /** Main entry for comparing deep json objects.
     * * errorTracker, typeCounts, and propertyCounts are cleared.
     */
    compare(a: any, b: any, tolerance?: number): boolean;
    private compareInternal;
}
