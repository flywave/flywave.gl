import { GeometryQuery } from "../curve/geometry-query";
import { type GeometryHandler } from "../geometry3d/geometry-handler";
import { type Plane3dByOriginAndUnitNormal } from "../geometry3d/plane3d-by-origin-and-unit-normal";
import { Plane3dByOriginAndVectors } from "../geometry3d/plane3d-by-origin-and-vectors";
import { Point3d } from "../geometry3d/point3d-vector3d";
import { type Range3d } from "../geometry3d/range";
import { Transform } from "../geometry3d/transform";
import { Point4d } from "../geometry4d/point4d";
import { BSplineWrapMode, KnotVector } from "./knot-vector";
export declare enum UVSelect {
    uDirection = 0,
    VDirection = 1
}
export declare enum WeightStyle {
    UnWeighted = 0,
    WeightsAlreadyAppliedToCoordinates = 1,
    WeightsSeparateFromCoordinates = 2
}
export interface PackedPointGrid {
    points: number[][][];
    weightStyle?: WeightStyle;
    numCartesianDimensions: number;
}
export interface BSplineSurface3dQuery {
    fractionToPoint(uFraction: number, vFraction: number): Point3d;
    fractionToRigidFrame(uFraction: number, vFraction: number): Transform | undefined;
    knotToPoint(uKnot: number, vKnot: number): Point3d;
    tryTransformInPlace(transform: Transform): boolean;
    clone(): BSplineSurface3dQuery;
    cloneTransformed(transform: Transform): BSplineSurface3dQuery;
    reverseInPlace(select: UVSelect): void;
    isSameGeometryClass(other: any): boolean;
    extendRange(rangeToExtend: Range3d, transform?: Transform): void;
    isAlmostEqual(other: any): boolean;
    isClosable(select: UVSelect): boolean;
    isInPlane(plane: Plane3dByOriginAndUnitNormal): boolean;
    numPolesTotal(): number;
    numberToUVSelect(value: number): UVSelect;
    degreeUV(select: UVSelect): number;
    orderUV(select: UVSelect): number;
    numSpanUV(select: UVSelect): number;
    numPolesUV(select: UVSelect): number;
    poleStepUV(select: UVSelect): number;
    getPointGridJSON(): PackedPointGrid;
}
export declare abstract class BSpline2dNd extends GeometryQuery {
    readonly geometryCategory = "bsurf";
    knots: KnotVector[];
    coffs: Float64Array;
    poleDimension: number;
    private readonly _numPoles;
    degreeUV(select: UVSelect): number;
    orderUV(select: UVSelect): number;
    numSpanUV(select: UVSelect): number;
    numPolesTotal(): number;
    numPolesUV(select: UVSelect): number;
    poleStepUV(select: UVSelect): number;
    static validOrderAndPoleCounts(orderU: number, numPolesU: number, orderV: number, numPolesV: number, numUV: number): boolean;
    getPoint3dPole(i: number, j: number, result?: Point3d): Point3d | undefined;
    getPoint3dPoleXYZW(i: number, j: number, result?: Point3d): Point3d | undefined;
    numberToUVSelect(value: number): UVSelect;
    extendRangeXYZ(rangeToExtend: Range3d, transform?: Transform): void;
    extendRangeXYZH(rangeToExtend: Range3d, transform?: Transform): void;
    abstract fractionToPointAndDerivatives(_fractionU: number, _fractionV: number, _result?: Plane3dByOriginAndVectors): Plane3dByOriginAndVectors | undefined;
    fractionToRigidFrame(fractionU: number, fractionV: number, result?: Transform): Transform | undefined;
    protected _basisBufferUV: Float64Array[];
    protected _basisBuffer1UV: Float64Array[];
    protected _poleBuffer: Float64Array;
    protected _poleBuffer1UV: Float64Array[];
    protected constructor(numPolesU: number, numPolesV: number, poleLength: number, knotsU: KnotVector, knotsV: KnotVector, coffs: Float64Array);
    spanFractionToKnot(select: UVSelect, span: number, localFraction: number): number;
    spanFractionsToBasisFunctions(select: UVSelect, spanIndex: number, spanFraction: number, f: Float64Array, df?: Float64Array): void;
    sumPoleBufferForSpan(spanIndexU: number, spanIndexV: number): void;
    sumpoleBufferDerivativesForSpan(spanIndexU: number, spanIndexV: number): void;
    evaluateBuffersAtKnot(u: number, v: number, numDerivative?: number): void;
    private swapBlocks;
    reverseInPlace(select: UVSelect): void;
    setWrappable(select: UVSelect, value: BSplineWrapMode): void;
    isClosable(select: UVSelect): boolean;
}
export declare class BSplineSurface3d extends BSpline2dNd implements BSplineSurface3dQuery {
    isSameGeometryClass(other: any): boolean;
    tryTransformInPlace(transform: Transform): boolean;
    getPole(i: number, j: number, result?: Point3d): Point3d | undefined;
    private constructor();
    getPointArray(flatArray?: boolean): any[];
    getPointGridJSON(): PackedPointGrid;
    copyPointsFloat64Array(): Float64Array;
    copyKnots(select: UVSelect, includeExtraEndKnot: boolean): number[];
    static create(controlPointArray: Point3d[] | Float64Array, numPolesU: number, orderU: number, knotArrayU: number[] | Float64Array | undefined, numPolesV: number, orderV: number, knotArrayV: number[] | Float64Array | undefined): BSplineSurface3d | undefined;
    static createGrid(points: number[][][], orderU: number, knotArrayU: number[] | Float64Array | undefined, orderV: number, knotArrayV: number[] | Float64Array | undefined): BSplineSurface3d | undefined;
    clone(): BSplineSurface3d;
    cloneTransformed(transform: Transform): BSplineSurface3d;
    knotToPoint(u: number, v: number): Point3d;
    knotToPointAndDerivatives(u: number, v: number, result?: Plane3dByOriginAndVectors): Plane3dByOriginAndVectors;
    fractionToPoint(fractionU: number, fractionV: number): Point3d;
    fractionToPointAndDerivatives(fractionU: number, fractionV: number, result?: Plane3dByOriginAndVectors): Plane3dByOriginAndVectors;
    isAlmostEqual(other: any): boolean;
    isInPlane(plane: Plane3dByOriginAndUnitNormal): boolean;
    dispatchToGeometryHandler(handler: GeometryHandler): any;
    extendRange(rangeToExtend: Range3d, transform?: Transform): void;
}
export declare class BSplineSurface3dH extends BSpline2dNd implements BSplineSurface3dQuery {
    isSameGeometryClass(other: any): boolean;
    tryTransformInPlace(transform: Transform): boolean;
    getPole(i: number, j: number, result?: Point3d): Point3d | undefined;
    private constructor();
    copyPoints4d(): Point4d[];
    copyPointsAndWeights(points: Point3d[], weights: number[], formatter?: (x: number, y: number, z: number) => any): void;
    copyXYZToFloat64Array(unweight: boolean): Float64Array;
    copyWeightsToFloat64Array(): Float64Array;
    copyKnots(select: UVSelect, includeExtraEndKnot: boolean): number[];
    static create(controlPointArray: Point3d[] | Float64Array, weightArray: number[] | Float64Array, numPolesU: number, orderU: number, knotArrayU: number[] | Float64Array | undefined, numPolesV: number, orderV: number, knotArrayV: number[] | Float64Array | undefined): BSplineSurface3dH | undefined;
    static createGrid(xyzwGrid: number[][][], weightStyle: WeightStyle, orderU: number, knotArrayU: number[], orderV: number, knotArrayV: number[]): BSplineSurface3dH | undefined;
    clone(): BSplineSurface3dH;
    cloneTransformed(transform: Transform): BSplineSurface3dH;
    getPointGridJSON(): PackedPointGrid;
    knotToPoint4d(u: number, v: number): Point4d;
    knotToPointAndDerivatives(u: number, v: number, result?: Plane3dByOriginAndVectors): Plane3dByOriginAndVectors;
    fractionToPoint4d(fractionU: number, fractionV: number): Point4d;
    fractionToPoint(fractionU: number, fractionV: number, result?: Point3d): Point3d;
    knotToPoint(knotU: number, knotV: number, result?: Point3d): Point3d;
    fractionToPointAndDerivatives(fractionU: number, fractionV: number, result?: Plane3dByOriginAndVectors): Plane3dByOriginAndVectors;
    isAlmostEqual(other: any): boolean;
    isInPlane(plane: Plane3dByOriginAndUnitNormal): boolean;
    dispatchToGeometryHandler(handler: GeometryHandler): any;
    extendRange(rangeToExtend: Range3d, transform?: Transform): void;
}
