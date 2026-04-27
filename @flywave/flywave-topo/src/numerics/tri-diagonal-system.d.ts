import { Point3d } from "../geometry3d/point3d-vector3d";
/**
 * Linear system operations on a matrix with data only on the diagonal and its immediate left and right neighbors
 * @internal
 */
export declare class TriDiagonalSystem {
    private _aLeft;
    private _aRight;
    private _aDiag;
    private _b;
    private _x;
    private _dataState;
    constructor(n: number);
    /** Reset to RawMatrix state with all coefficients zero */
    reset(): void;
    /** Install data in a row of the matrix */
    setRow(row: number, left: number, diag: number, right: number): void;
    /** Add to row of matrix */
    addToRow(row: number, left: number, diag: number, right: number): void;
    /** Install data in the right side (B) vector */
    setB(row: number, bb: number): void;
    /** Add to an entry in the right side (B) vector */
    addToB(row: number, bb: number): void;
    /** Access data from the right side (B) vector */
    getB(row: number): number;
    /** Install data in the solution (X) vector */
    setX(row: number, xx: number): void;
    /** Access data from the solution (X) vector */
    getX(row: number): number;
    /** Get method for matrix and vector order */
    order(): number;
    /** Compute product of AX and save as B */
    multiplyAX(): boolean;
    /** Compute product of AX and save as B */
    multiplyAXPoints(pointX: Point3d[], pointB: Point3d[]): boolean;
    /** Multiply the stored factors together to return to plain matrix form */
    defactor(): boolean;
    /** Factor the tridiagonal matrix to LU parts. b, x, not altered */
    factor(): boolean;
    /** Solve AX=B. A is left in factored state. B unchanged. */
    factorAndBackSubstitute(): boolean;
    /** Solve AX=B. A is left in factored state. B unchanged. vectorB and vectorX may be the same array */
    factorAndBackSubstitutePointArrays(vectorB: Point3d[], vectorX: Point3d[]): boolean;
    /** Allocate a complete copy */
    copy(): TriDiagonalSystem;
    /** return an array form that may be useful for display ... */
    flatten(): any;
    /** return an array form that may be useful for display ... */
    flattenWithPoints(xyzB: Point3d[]): any;
}
