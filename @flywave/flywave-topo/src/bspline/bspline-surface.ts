/* Copyright (C) 2025 flywave.gl contributors */



import { GeometryQuery } from "../curve/geometry-query";
import { AxisOrder, Geometry } from "../geometry";
import { type GeometryHandler } from "../geometry3d/geometry-handler";
import { Matrix3d } from "../geometry3d/matrix3d";
import { type Plane3dByOriginAndUnitNormal } from "../geometry3d/plane3d-by-origin-and-unit-normal";
import { Plane3dByOriginAndVectors } from "../geometry3d/plane3d-by-origin-and-vectors";
import { Point3dArray, Point4dArray } from "../geometry3d/point-helpers";
import { Point3d } from "../geometry3d/point3d-vector3d";
import { type Range3d } from "../geometry3d/range";
import { Transform } from "../geometry3d/transform";
import { Point4d } from "../geometry4d/point4d";
import { BSplineWrapMode, KnotVector } from "./knot-vector";

export enum UVSelect {
    uDirection = 0,
    VDirection = 1
}

export enum WeightStyle {
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

export abstract class BSpline2dNd extends GeometryQuery {
    public readonly geometryCategory = "bsurf";

    public knots: KnotVector[];

    public coffs: Float64Array;

    public poleDimension: number;
    private readonly _numPoles: number[];

    public degreeUV(select: UVSelect): number {
        return this.knots[select].degree;
    }

    public orderUV(select: UVSelect): number {
        return this.knots[select].degree + 1;
    }

    public numSpanUV(select: UVSelect): number {
        return this._numPoles[select] - this.knots[select].degree;
    }

    public numPolesTotal(): number {
        return this.coffs.length / this.poleDimension;
    }

    public numPolesUV(select: UVSelect): number {
        return this._numPoles[select];
    }

    public poleStepUV(select: UVSelect): number {
        return select === 0 ? 1 : this._numPoles[0];
    }

    public static validOrderAndPoleCounts(
        orderU: number,
        numPolesU: number,
        orderV: number,
        numPolesV: number,
        numUV: number
    ): boolean {
        if (orderU < 2 || numPolesU < orderU) return false;
        if (orderV < 2 || numPolesV < orderV) return false;
        if (numPolesU * numPolesV !== numUV) return false;
        return true;
    }

    public getPoint3dPole(i: number, j: number, result?: Point3d): Point3d | undefined {
        return Point3d.createFromPacked(this.coffs, i + j * this._numPoles[0], result);
    }

    public getPoint3dPoleXYZW(i: number, j: number, result?: Point3d): Point3d | undefined {
        return Point3d.createFromPackedXYZW(this.coffs, i + j * this._numPoles[0], result);
    }

    public numberToUVSelect(value: number): UVSelect {
        return value === 0 ? 0 : 1;
    }

    public extendRangeXYZ(rangeToExtend: Range3d, transform?: Transform) {
        const buffer = this.coffs;
        const pd = this.poleDimension;
        const n = buffer.length + 1 - pd;
        if (transform) {
            for (let i0 = 0; i0 < n; i0 += pd) {
                rangeToExtend.extendTransformedXYZ(
                    transform,
                    buffer[i0],
                    buffer[i0 + 1],
                    buffer[i0 + 2]
                );
            }
        } else {
            for (let i0 = 0; i0 < n; i0 += pd) {
                rangeToExtend.extendXYZ(buffer[i0], buffer[i0 + 1], buffer[i0 + 2]);
            }
        }
    }

    public extendRangeXYZH(rangeToExtend: Range3d, transform?: Transform) {
        const buffer = this.coffs;
        const pd = this.poleDimension;
        const n = buffer.length + 1 - pd;
        let w = 0;
        let divW = 0;
        if (transform) {
            for (let i0 = 0; i0 < n; i0 += pd) {
                w = buffer[i0 + 3];
                if (w !== 0.0) {
                    divW = 1.0 / w;
                    rangeToExtend.extendTransformedXYZ(
                        transform,
                        buffer[i0] * divW,
                        buffer[i0 + 1] * divW,
                        buffer[i0 + 2] * divW
                    );
                }
            }
        } else {
            for (let i0 = 0; i0 < n; i0 += pd) {
                w = buffer[i0 + 3];
                if (w !== 0.0) {
                    divW = 1.0 / w;
                    rangeToExtend.extendXYZ(
                        buffer[i0] * divW,
                        buffer[i0 + 1] * divW,
                        buffer[i0 + 2] * divW
                    );
                }
            }
        }
    }

    public abstract fractionToPointAndDerivatives(
        _fractionU: number,
        _fractionV: number,
        _result?: Plane3dByOriginAndVectors
    ): Plane3dByOriginAndVectors | undefined;

    public fractionToRigidFrame(
        fractionU: number,
        fractionV: number,
        result?: Transform
    ): Transform | undefined {
        const skewVectors = this.fractionToPointAndDerivatives(fractionU, fractionV);
        if (!skewVectors) return undefined;
        const axes = Matrix3d.createColumnsInAxisOrder(
            AxisOrder.XYZ,
            skewVectors.vectorU,
            skewVectors.vectorV,
            undefined
        );
        const axes1 = Matrix3d.createRigidFromMatrix3d(axes, AxisOrder.XYZ, axes);
        if (axes1) result = Transform.createOriginAndMatrix(skewVectors.origin, axes1, result);
        return result;
    }

    protected _basisBufferUV: Float64Array[];

    protected _basisBuffer1UV: Float64Array[];

    protected _poleBuffer: Float64Array;

    protected _poleBuffer1UV: Float64Array[];

    protected constructor(
        numPolesU: number,
        numPolesV: number,
        poleLength: number,
        knotsU: KnotVector,
        knotsV: KnotVector,
        coffs: Float64Array
    ) {
        super();
        const orderU = knotsU.degree + 1;
        const orderV = knotsV.degree + 1;
        this.knots = [knotsU, knotsV];
        this.coffs = coffs;
        this.poleDimension = poleLength;
        this._basisBufferUV = [new Float64Array(orderU), new Float64Array(orderV)];
        this._basisBuffer1UV = [new Float64Array(orderU), new Float64Array(orderV)];
        this._numPoles = [numPolesU, numPolesV];
        this._poleBuffer = new Float64Array(poleLength);
        this._poleBuffer1UV = [new Float64Array(poleLength), new Float64Array(poleLength)];
    }

    public spanFractionToKnot(select: UVSelect, span: number, localFraction: number): number {
        return this.knots[select].spanFractionToKnot(span, localFraction);
    }

    public spanFractionsToBasisFunctions(
        select: UVSelect,
        spanIndex: number,
        spanFraction: number,
        f: Float64Array,
        df?: Float64Array
    ) {
        spanIndex = Geometry.clampToStartEnd(spanIndex, 0, this.numSpanUV(select));
        const knotIndex0 = spanIndex + this.degreeUV(select) - 1;
        const globalKnot = this.knots[select].baseKnotFractionToKnot(knotIndex0, spanFraction);
        df
            ? this.knots[select].evaluateBasisFunctions1(knotIndex0, globalKnot, f, df)
            : this.knots[select].evaluateBasisFunctions(knotIndex0, globalKnot, f);
    }

    public sumPoleBufferForSpan(spanIndexU: number, spanIndexV: number) {
        const poleBuffer = this._poleBuffer;
        const coffs = this.coffs;
        poleBuffer.fill(0);
        const m = this.poleDimension;
        const stepV = this.poleDimension * this._numPoles[0];
        let kU = m * spanIndexU + spanIndexV * stepV;
        let g = 0;
        for (const fV of this._basisBufferUV[1]) {
            let k = kU;
            for (const fU of this._basisBufferUV[0]) {
                g = fU * fV;
                for (let j = 0; j < m; j++) {
                    poleBuffer[j] += g * coffs[k++];
                }
            }
            kU += stepV;
        }
    }

    public sumpoleBufferDerivativesForSpan(spanIndexU: number, spanIndexV: number) {
        const poleBuffer1U = this._poleBuffer1UV[0];
        const poleBuffer1V = this._poleBuffer1UV[1];
        poleBuffer1U.fill(0);
        poleBuffer1V.fill(0);
        const m = this.poleDimension;
        const stepV = this.poleDimension * this._numPoles[0];
        let kU = m * spanIndexU + spanIndexV * stepV;
        let g = 0;
        for (const fV of this._basisBufferUV[1]) {
            let k = kU;
            for (const fU of this._basisBuffer1UV[0]) {
                g = fU * fV;
                for (let j = 0; j < m; j++) {
                    poleBuffer1U[j] += g * this.coffs[k++];
                }
            }
            kU += stepV;
        }

        kU = m * spanIndexU + spanIndexV * stepV;
        for (const fV of this._basisBuffer1UV[1]) {
            let k = kU;
            for (const fU of this._basisBufferUV[0]) {
                g = fU * fV;
                for (let j = 0; j < m; j++) {
                    poleBuffer1V[j] += g * this.coffs[k++];
                }
            }
            kU += stepV;
        }
    }

    public evaluateBuffersAtKnot(u: number, v: number, numDerivative: number = 0) {
        const knotIndex0U = this.knots[0].knotToLeftKnotIndex(u);
        const knotIndex0V = this.knots[1].knotToLeftKnotIndex(v);
        const poleIndex0U = knotIndex0U - this.degreeUV(0) + 1;
        const poleIndex0V = knotIndex0V - this.degreeUV(1) + 1;

        if (numDerivative < 1) {
            this.knots[0].evaluateBasisFunctions(knotIndex0U, u, this._basisBufferUV[0]);
            this.knots[1].evaluateBasisFunctions(knotIndex0V, v, this._basisBufferUV[1]);
            this.sumPoleBufferForSpan(poleIndex0U, poleIndex0V);
        } else {
            this.knots[0].evaluateBasisFunctions1(
                knotIndex0U,
                u,
                this._basisBufferUV[0],
                this._basisBuffer1UV[0]
            );
            this.knots[1].evaluateBasisFunctions1(
                knotIndex0V,
                v,
                this._basisBufferUV[1],
                this._basisBuffer1UV[1]
            );
            this.sumPoleBufferForSpan(poleIndex0U, poleIndex0V);
            this.sumpoleBufferDerivativesForSpan(poleIndex0U, poleIndex0V);
        }
    }

    private swapBlocks(i0: number, i1: number, numSwap: number) {
        let a: number;
        for (let i = 0; i < numSwap; i++) {
            a = this.coffs[i0 + i];
            this.coffs[i0 + i] = this.coffs[i1 + i];
            this.coffs[i1 + i] = a;
        }
    }

    public reverseInPlace(select: UVSelect): void {
        const m = this.poleDimension;
        const numU = this.numPolesUV(0);
        const numV = this.numPolesUV(1);
        if (select === 0) {
            for (let j = 0; j < numV; j++) {
                const rowStart = j * numU * m;
                for (let i0 = 0, i1 = numU - 1; i0 < i1; i0++, i1--) {
                    this.swapBlocks(rowStart + i0 * m, rowStart + i1 * m, m);
                }
            }
        } else {
            const numPerRow = m * numU;
            for (
                let i0 = 0, i1 = (numV - 1) * numPerRow;
                i0 < i1;
                i0 += numPerRow, i1 -= numPerRow
            ) {
                this.swapBlocks(i0, i1, numPerRow);
            }
        }
        this.knots[select].reflectKnots();
    }

    public setWrappable(select: UVSelect, value: BSplineWrapMode) {
        this.knots[select].wrappable = value;
    }

    public isClosable(select: UVSelect): boolean {
        if (this.knots[select].wrappable === BSplineWrapMode.None) return false;
        if (!this.knots[select].testClosable()) return false;

        const numU = this.numPolesUV(0);
        const numV = this.numPolesUV(1);
        const blockSize = this.poleDimension;
        const rowToRowStep = numU * blockSize;
        const degreeU = this.degreeUV(0);
        const degreeV = this.degreeUV(1);
        const data = this.coffs;
        if (select === 0) {
            const numTest = blockSize * degreeU;
            for (let row = 0; row < numV; row++) {
                const i0 = row * rowToRowStep;
                const i1 = i0 + rowToRowStep - numTest;
                for (let i = 0; i < numTest; i++) {
                    if (!Geometry.isSameCoordinate(data[i0 + i], data[i1 + i])) return false;
                }
            }
        } else {
            const numTest = degreeV * rowToRowStep;
            const i1 = blockSize * numU * numV - numTest;
            for (let i = 0; i < numTest; i++) {
                if (!Geometry.isSameCoordinate(data[i], data[i1 + i])) return false;
            }
        }
        return true;
    }
}

export class BSplineSurface3d extends BSpline2dNd implements BSplineSurface3dQuery {
    public isSameGeometryClass(other: any): boolean {
        return other instanceof BSplineSurface3d;
    }

    public tryTransformInPlace(transform: Transform): boolean {
        Point3dArray.multiplyInPlace(transform, this.coffs);
        return true;
    }

    public getPole(i: number, j: number, result?: Point3d): Point3d | undefined {
        return this.getPoint3dPole(i, j, result);
    }

    private constructor(
        numPolesU: number,
        numPolesV: number,
        knotsU: KnotVector,
        knotsV: KnotVector,
        coffs: Float64Array
    ) {
        super(numPolesU, numPolesV, 3, knotsU, knotsV, coffs);
    }

    public getPointArray(flatArray: boolean = true): any[] {
        if (flatArray) return Point3dArray.unpackNumbersToNestedArrays(this.coffs, 3);
        return Point3dArray.unpackNumbersToNestedArraysIJK(this.coffs, 3, this.numPolesUV(0));
    }

    public getPointGridJSON(): PackedPointGrid {
        const result = {
            points: Point3dArray.unpackNumbersToNestedArraysIJK(this.coffs, 3, this.numPolesUV(0)),
            weighStyle: WeightStyle.UnWeighted,
            numCartesianDimensions: 3
        };
        return result;
    }

    public copyPointsFloat64Array(): Float64Array {
        return this.coffs.slice();
    }

    public copyKnots(select: UVSelect, includeExtraEndKnot: boolean): number[] {
        return this.knots[select].copyKnots(includeExtraEndKnot);
    }

    public static create(
        controlPointArray: Point3d[] | Float64Array,
        numPolesU: number,
        orderU: number,
        knotArrayU: number[] | Float64Array | undefined,
        numPolesV: number,
        orderV: number,
        knotArrayV: number[] | Float64Array | undefined
    ): BSplineSurface3d | undefined {
        let numPoles = controlPointArray.length;
        if (controlPointArray instanceof Float64Array) numPoles /= 3;
        if (!this.validOrderAndPoleCounts(orderU, numPolesU, orderV, numPolesV, numPoles)) {
            return undefined;
        }
        // shift knots-of-interest limits for over-clamped case ...
        const numKnotsU = knotArrayU ? knotArrayU.length : numPolesU + orderU - 2;
        const numKnotsV = knotArrayV ? knotArrayV.length : numPolesV + orderV - 2;
        const skipFirstAndLastU = numPolesU + orderU === numKnotsU;
        const skipFirstAndLastV = numPolesV + orderV === numKnotsV;

        const knotsU = knotArrayU
            ? KnotVector.create(knotArrayU, orderU - 1, skipFirstAndLastU)
            : KnotVector.createUniformClamped(numPolesU, orderU - 1, 0.0, 1.0);
        const knotsV = knotArrayV
            ? KnotVector.create(knotArrayV, orderV - 1, skipFirstAndLastV)
            : KnotVector.createUniformClamped(numPolesV, orderV - 1, 0.0, 1.0);
        const coffs = new Float64Array(3 * numPolesU * numPolesV);
        if (controlPointArray instanceof Float64Array) {
            let i = 0;
            for (const coordinate of controlPointArray) {
                coffs[i++] = coordinate;
            }
        } else {
            let i = 0;
            for (const p of controlPointArray) {
                coffs[i++] = p.x;
                coffs[i++] = p.y;
                coffs[i++] = p.z;
            }
        }
        const surface = new BSplineSurface3d(numPolesU, numPolesV, knotsU, knotsV, coffs);
        return surface;
    }

    public static createGrid(
        points: number[][][],
        orderU: number,
        knotArrayU: number[] | Float64Array | undefined,
        orderV: number,
        knotArrayV: number[] | Float64Array | undefined
    ): BSplineSurface3d | undefined {
        const numPolesV = points.length;
        const numPolesU = points[0].length;
        const numPoles = numPolesU * numPolesV;

        const numKnotsU = knotArrayU ? knotArrayU.length : numPolesU + orderU - 2;
        const numKnotsV = knotArrayV ? knotArrayV.length : numPolesV + orderV - 2;
        const skipFirstAndLastU = numPolesU + orderU === numKnotsU;
        const skipFirstAndLastV = numPolesV + orderV === numKnotsV;
        if (!this.validOrderAndPoleCounts(orderU, numPolesU, orderV, numPolesV, numPoles)) {
            return undefined;
        }

        const knotsU = knotArrayU
            ? KnotVector.create(knotArrayU, orderU - 1, skipFirstAndLastU)
            : KnotVector.createUniformClamped(numPolesU, orderU - 1, 0.0, 1.0);
        const knotsV = knotArrayV
            ? KnotVector.create(knotArrayV, orderV - 1, skipFirstAndLastV)
            : KnotVector.createUniformClamped(numPolesU, orderU - 1, 0.0, 1.0);
        const coffs = new Float64Array(3 * numPolesU * numPolesV);
        let i = 0;
        for (const row of points) {
            for (const xyz of row) {
                coffs[i++] = xyz[0];
                coffs[i++] = xyz[1];
                coffs[i++] = xyz[2];
            }
        }
        const surface = new BSplineSurface3d(numPolesU, numPolesV, knotsU, knotsV, coffs);
        return surface;
    }

    public clone(): BSplineSurface3d {
        const knotVector1U = this.knots[0].clone();
        const knotVector1V = this.knots[1].clone();
        const surface1 = new BSplineSurface3d(
            this.numPolesUV(0),
            this.numPolesUV(1),
            knotVector1U,
            knotVector1V,
            this.coffs.slice()
        );
        return surface1;
    }

    public cloneTransformed(transform: Transform): BSplineSurface3d {
        const surface1 = this.clone();
        surface1.tryTransformInPlace(transform);
        return surface1;
    }

    public knotToPoint(u: number, v: number): Point3d {
        this.evaluateBuffersAtKnot(u, v);
        return Point3d.createFrom(this._poleBuffer);
    }

    public knotToPointAndDerivatives(
        u: number,
        v: number,
        result?: Plane3dByOriginAndVectors
    ): Plane3dByOriginAndVectors {
        this.evaluateBuffersAtKnot(u, v, 1);
        return Plane3dByOriginAndVectors.createOriginAndVectorsArrays(
            this._poleBuffer,
            this._poleBuffer1UV[0],
            this._poleBuffer1UV[1],
            result
        );
    }

    public fractionToPoint(fractionU: number, fractionV: number): Point3d {
        return this.knotToPoint(
            this.knots[0].fractionToKnot(fractionU),
            this.knots[1].fractionToKnot(fractionV)
        );
    }

    public fractionToPointAndDerivatives(
        fractionU: number,
        fractionV: number,
        result?: Plane3dByOriginAndVectors
    ): Plane3dByOriginAndVectors {
        const knotU = this.knots[0].fractionToKnot(fractionU);
        const knotV = this.knots[1].fractionToKnot(fractionV);
        return this.knotToPointAndDerivatives(knotU, knotV, result);
    }

    public override isAlmostEqual(other: any): boolean {
        if (other instanceof BSplineSurface3d) {
            return (
                this.knots[0].isAlmostEqual(other.knots[0]) &&
                this.knots[1].isAlmostEqual(other.knots[1]) &&
                Point3dArray.isAlmostEqual(this.coffs, other.coffs)
            );
        }
        return false;
    }

    public isInPlane(plane: Plane3dByOriginAndUnitNormal): boolean {
        return Point3dArray.isCloseToPlane(this.coffs, plane);
    }

    public dispatchToGeometryHandler(handler: GeometryHandler): any {
        return handler.handleBSplineSurface3d(this);
    }

    public extendRange(rangeToExtend: Range3d, transform?: Transform): void {
        this.extendRangeXYZ(rangeToExtend, transform);
    }
}

export class BSplineSurface3dH extends BSpline2dNd implements BSplineSurface3dQuery {
    public isSameGeometryClass(other: any): boolean {
        return other instanceof BSplineSurface3dH;
    }

    public tryTransformInPlace(transform: Transform): boolean {
        Point4dArray.multiplyInPlace(transform, this.coffs);
        return true;
    }

    public getPole(i: number, j: number, result?: Point3d): Point3d | undefined {
        return this.getPoint3dPoleXYZW(i, j, result);
    }

    private constructor(
        numPolesU: number,
        numPolesV: number,
        knotsU: KnotVector,
        knotsV: KnotVector,
        coffs: Float64Array
    ) {
        super(numPolesU, numPolesV, 4, knotsU, knotsV, coffs);
    }

    public copyPoints4d(): Point4d[] {
        return Point4dArray.unpackToPoint4dArray(this.coffs);
    }

    public copyPointsAndWeights(
        points: Point3d[],
        weights: number[],
        formatter: (x: number, y: number, z: number) => any = (x, y, z) => Point3d.create(x, y, z)
    ) {
        Point4dArray.unpackFloat64ArrayToPointsAndWeights(this.coffs, points, weights, formatter);
    }

    public copyXYZToFloat64Array(unweight: boolean): Float64Array {
        const numPoints = Math.floor(this.coffs.length / 4);
        const result = new Float64Array(numPoints * 3);
        let j = 0;
        for (let i = 0; i < numPoints; i++) {
            const ix = i * 4;
            if (unweight) {
                const dw = 1.0 / this.coffs[ix + 3];
                result[j++] = this.coffs[ix] * dw;
                result[j++] = this.coffs[ix + 1] * dw;
                result[j++] = this.coffs[ix + 2] * dw;
            } else {
                result[j++] = this.coffs[ix];
                result[j++] = this.coffs[ix + 1];
                result[j++] = this.coffs[ix + 2];
            }
        }
        return result;
    }

    public copyWeightsToFloat64Array(): Float64Array {
        const numPoints = Math.floor(this.coffs.length / 4);
        const result = new Float64Array(numPoints);
        let i = 0;
        let j = 0;
        for (; i < numPoints; i++) {
            result[j++] = this.coffs[4 * i + 3];
        }
        return result;
    }

    public copyKnots(select: UVSelect, includeExtraEndKnot: boolean): number[] {
        return this.knots[select].copyKnots(includeExtraEndKnot);
    }

    public static create(
        controlPointArray: Point3d[] | Float64Array,
        weightArray: number[] | Float64Array,
        numPolesU: number,
        orderU: number,
        knotArrayU: number[] | Float64Array | undefined,
        numPolesV: number,
        orderV: number,
        knotArrayV: number[] | Float64Array | undefined
    ): BSplineSurface3dH | undefined {
        const numPoles = numPolesU * numPolesV;
        if (!this.validOrderAndPoleCounts(orderU, numPolesU, orderV, numPolesV, numPoles)) {
            return undefined;
        }

        const numKnotsU = knotArrayU ? knotArrayU.length : numPolesU + orderU - 2;
        const numKnotsV = knotArrayV ? knotArrayV.length : numPolesV + orderV - 2;
        const skipFirstAndLastU = numPolesU + orderU === numKnotsU;
        const skipFirstAndLastV = numPolesV + orderV === numKnotsV;

        const knotsU = knotArrayU
            ? KnotVector.create(knotArrayU, orderU - 1, skipFirstAndLastU)
            : KnotVector.createUniformClamped(numPolesU, orderU - 1, 0.0, 1.0);
        const knotsV = knotArrayV
            ? KnotVector.create(knotArrayV, orderV - 1, skipFirstAndLastV)
            : KnotVector.createUniformClamped(numPolesV, orderV - 1, 0.0, 1.0);
        const coffs = Point4dArray.packPointsAndWeightsToFloat64Array(
            controlPointArray,
            weightArray
        );
        if (coffs === undefined || coffs.length !== 4 * numPolesU * numPolesV) return undefined;
        const surface = new BSplineSurface3dH(numPolesU, numPolesV, knotsU, knotsV, coffs);
        return surface;
    }

    public static createGrid(
        xyzwGrid: number[][][],
        weightStyle: WeightStyle,
        orderU: number,
        knotArrayU: number[],
        orderV: number,
        knotArrayV: number[]
    ): BSplineSurface3dH | undefined {
        const numPolesV = xyzwGrid.length;
        const numPolesU = xyzwGrid[0].length;
        const numPoles = numPolesU * numPolesV;
        if (!this.validOrderAndPoleCounts(orderU, numPolesU, orderV, numPolesV, numPoles)) {
            return undefined;
        }

        const numKnotsU = knotArrayU.length;
        const numKnotsV = knotArrayV.length;
        const skipFirstAndLastU = numPolesU + orderU === numKnotsU;
        const skipFirstAndLastV = numPolesV + orderV === numKnotsV;

        const knotsU = KnotVector.create(knotArrayU, orderU - 1, skipFirstAndLastU);
        const knotsV = KnotVector.create(knotArrayV, orderV - 1, skipFirstAndLastV);

        const coffs = new Float64Array(4 * numPoles);
        if (weightStyle === WeightStyle.WeightsSeparateFromCoordinates) {
            let i = 0;
            for (const row of xyzwGrid) {
                for (const point of row) {
                    const w = point[3];
                    coffs[i++] = point[0] * w;
                    coffs[i++] = point[1] * w;
                    coffs[i++] = point[2] * w;
                    coffs[i++] = point[3];
                }
            }
        } else {
            let i = 0;
            for (const row of xyzwGrid) {
                for (const point of row) {
                    coffs[i++] = point[0];
                    coffs[i++] = point[1];
                    coffs[i++] = point[2];
                    coffs[i++] = point[3];
                }
            }
        }

        const surface = new BSplineSurface3dH(numPolesU, numPolesV, knotsU, knotsV, coffs);

        return surface;
    }

    public clone(): BSplineSurface3dH {
        const knotVector1U = this.knots[0].clone();
        const knotVector1V = this.knots[1].clone();
        const surface1 = new BSplineSurface3dH(
            this.numPolesUV(0),
            this.numPolesUV(1),
            knotVector1U,
            knotVector1V,
            this.coffs.slice()
        );
        surface1.coffs = this.coffs.slice();
        return surface1;
    }

    public cloneTransformed(transform: Transform): BSplineSurface3dH {
        const surface1 = this.clone();
        surface1.tryTransformInPlace(transform);
        return surface1;
    }

    public getPointGridJSON(): PackedPointGrid {
        const result = {
            points: Point3dArray.unpackNumbersToNestedArraysIJK(this.coffs, 4, this.numPolesUV(0)),
            numCartesianDimensions: 3,
            weightStyle: WeightStyle.WeightsAlreadyAppliedToCoordinates
        };
        return result;
    }

    public knotToPoint4d(u: number, v: number): Point4d {
        this.evaluateBuffersAtKnot(u, v);
        return Point4d.createFromPackedXYZW(this._poleBuffer, 0);
    }

    public knotToPointAndDerivatives(
        u: number,
        v: number,
        result?: Plane3dByOriginAndVectors
    ): Plane3dByOriginAndVectors {
        this.evaluateBuffersAtKnot(u, v, 1);
        return Plane3dByOriginAndVectors.createOriginAndVectorsWeightedArrays(
            this._poleBuffer,
            this._poleBuffer1UV[0],
            this._poleBuffer1UV[1],
            result
        );
    }

    public fractionToPoint4d(fractionU: number, fractionV: number): Point4d {
        return this.knotToPoint4d(
            this.knots[0].fractionToKnot(fractionU),
            this.knots[1].fractionToKnot(fractionV)
        );
    }

    public fractionToPoint(fractionU: number, fractionV: number, result?: Point3d): Point3d {
        const point4d = this.knotToPoint4d(
            this.knots[0].fractionToKnot(fractionU),
            this.knots[1].fractionToKnot(fractionV)
        );
        return point4d.realPointDefault000(result);
    }

    public knotToPoint(knotU: number, knotV: number, result?: Point3d): Point3d {
        const point4d = this.knotToPoint4d(knotU, knotV);
        return point4d.realPointDefault000(result);
    }

    public fractionToPointAndDerivatives(
        fractionU: number,
        fractionV: number,
        result?: Plane3dByOriginAndVectors
    ): Plane3dByOriginAndVectors {
        const knotU = this.knots[0].fractionToKnot(fractionU);
        const knotV = this.knots[1].fractionToKnot(fractionV);
        return this.knotToPointAndDerivatives(knotU, knotV, result);
    }

    public override isAlmostEqual(other: any): boolean {
        if (other instanceof BSplineSurface3dH) {
            return (
                this.knots[0].isAlmostEqual(other.knots[0]) &&
                this.knots[1].isAlmostEqual(other.knots[1]) &&
                Point4dArray.isAlmostEqual(this.coffs, other.coffs)
            );
        }
        return false;
    }

    public isInPlane(plane: Plane3dByOriginAndUnitNormal): boolean {
        return Point4dArray.isCloseToPlane(this.coffs, plane);
    }

    public dispatchToGeometryHandler(handler: GeometryHandler): any {
        return handler.handleBSplineSurface3dH(this);
    }

    public extendRange(rangeToExtend: Range3d, transform?: Transform): void {
        this.extendRangeXYZH(rangeToExtend, transform);
    }
}
