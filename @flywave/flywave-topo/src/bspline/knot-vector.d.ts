export declare enum BSplineWrapMode {
    None = 0,
    OpenByAddingControlPoints = 1,
    OpenByRemovingKnots = 2
}
export declare class KnotVector {
    knots: Float64Array;
    degree: number;
    private _knot0;
    private _knot1;
    private _wrapMode?;
    static readonly knotTolerance = 1e-9;
    get leftKnot(): number;
    get rightKnot(): number;
    get leftKnotIndex(): number;
    get rightKnotIndex(): number;
    get wrappable(): BSplineWrapMode;
    set wrappable(value: BSplineWrapMode);
    get numSpans(): number;
    private constructor();
    clone(): KnotVector;
    private setupFixedValues;
    get knotLength01(): number;
    testClosable(mode?: BSplineWrapMode): boolean;
    isAlmostEqual(other: KnotVector): boolean;
    getKnotMultiplicity(knot: number): number;
    getKnotMultiplicityAtIndex(knotIndex: number): number;
    normalize(): boolean;
    setKnots(knots: number[] | Float64Array, skipFirstAndLast?: boolean): void;
    setKnotsCapture(knots: Float64Array): void;
    static createUniformClamped(numPoles: number, degree: number, a0: number, a1: number): KnotVector;
    static createUniformWrapped(numInterval: number, degree: number, a0: number, a1: number): KnotVector;
    static create(knotArray: number[] | Float64Array, degree: number, skipFirstAndLast?: boolean): KnotVector;
    grevilleKnot(knotIndex: number): number;
    createBasisArray(): Float64Array;
    baseKnotFractionToKnot(knotIndex0: number, localFraction: number): number;
    spanFractionToKnot(spanIndex: number, localFraction: number): number;
    spanFractionToFraction(spanIndex: number, localFraction: number): number;
    fractionToKnot(fraction: number): number;
    evaluateBasisFunctions(knotIndex0: number, u: number, f: Float64Array): void;
    evaluateBasisFunctions1(knotIndex0: number, u: number, f: Float64Array, df: Float64Array, ddf?: Float64Array): void;
    knotToLeftKnotIndex(u: number): number;
    spanIndexToLeftKnotIndex(spanIndex: number): number;
    spanIndexToSpanLength(spanIndex: number): number;
    isIndexOfRealSpan(spanIndex: number): boolean;
    reflectKnots(): void;
    copyKnots(includeExtraEndKnot: boolean): number[];
}
