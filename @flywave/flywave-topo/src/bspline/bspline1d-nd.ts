/* Copyright (C) 2025 flywave.gl contributors */



import { Geometry } from "../geometry";
import { Point3d } from "../geometry3d/point3d-vector3d";
import { BSplineWrapMode, KnotVector } from "./knot-vector";

export class BSpline1dNd {
    public knots: KnotVector;

    public packedData: Float64Array;

    public poleLength: number;

    public get degree(): number {
        return this.knots.degree;
    }

    public get order(): number {
        return this.knots.degree + 1;
    }

    public get numSpan(): number {
        return this.numPoles - this.knots.degree;
    }

    public get numPoles(): number {
        return this.packedData.length / this.poleLength;
    }

    public getPoint3dPole(i: number, result?: Point3d): Point3d | undefined {
        return Point3d.createFromPacked(this.packedData, i, result);
    }

    public basisBuffer: Float64Array;

    public poleBuffer: Float64Array;

    public basisBuffer1: Float64Array;

    public basisBuffer2: Float64Array;

    public poleBuffer1: Float64Array;

    public poleBuffer2: Float64Array;

    protected constructor(numPoles: number, poleLength: number, order: number, knots: KnotVector) {
        this.knots = knots;
        this.packedData = new Float64Array(numPoles * poleLength);
        this.poleLength = poleLength;
        this.basisBuffer = new Float64Array(order);
        this.poleBuffer = new Float64Array(poleLength);
        this.basisBuffer1 = new Float64Array(order);
        this.basisBuffer2 = new Float64Array(order);
        this.poleBuffer1 = new Float64Array(poleLength);
        this.poleBuffer2 = new Float64Array(poleLength);
    }

    public static create(
        numPoles: number,
        poleLength: number,
        order: number,
        knots: KnotVector
    ): BSpline1dNd | undefined {
        return new BSpline1dNd(numPoles, poleLength, order, knots);
    }

    public spanFractionToKnot(span: number, localFraction: number): number {
        return this.knots.spanFractionToKnot(span, localFraction);
    }

    public evaluateBasisFunctionsInSpan(
        spanIndex: number,
        spanFraction: number,
        f: Float64Array,
        df?: Float64Array,
        ddf?: Float64Array
    ) {
        if (spanIndex < 0) spanIndex = 0;
        if (spanIndex >= this.numSpan) spanIndex = this.numSpan - 1;
        const knotIndex0 = spanIndex + this.degree - 1;
        const globalKnot = this.knots.baseKnotFractionToKnot(knotIndex0, spanFraction);
        df
            ? this.knots.evaluateBasisFunctions1(knotIndex0, globalKnot, f, df, ddf)
            : this.knots.evaluateBasisFunctions(knotIndex0, globalKnot, f);
    }

    public evaluateBuffersInSpan(spanIndex: number, spanFraction: number) {
        this.evaluateBasisFunctionsInSpan(spanIndex, spanFraction, this.basisBuffer);
        this.sumPoleBufferForSpan(spanIndex);
    }

    public evaluateBuffersInSpan1(spanIndex: number, spanFraction: number) {
        this.evaluateBasisFunctionsInSpan(
            spanIndex,
            spanFraction,
            this.basisBuffer,
            this.basisBuffer1
        );
        this.sumPoleBufferForSpan(spanIndex);
        this.sumPoleBuffer1ForSpan(spanIndex);
    }

    public sumPoleBufferForSpan(spanIndex: number) {
        this.poleBuffer.fill(0);
        let k = spanIndex * this.poleLength;
        for (const f of this.basisBuffer) {
            for (let j = 0; j < this.poleLength; j++) {
                this.poleBuffer[j] += f * this.packedData[k++];
            }
        }
    }

    public sumPoleBuffer1ForSpan(spanIndex: number) {
        this.poleBuffer1.fill(0);
        let k = spanIndex * this.poleLength;
        for (const f of this.basisBuffer1) {
            for (let j = 0; j < this.poleLength; j++) {
                this.poleBuffer1[j] += f * this.packedData[k++];
            }
        }
    }

    public sumPoleBuffer2ForSpan(spanIndex: number) {
        this.poleBuffer2.fill(0);
        let k = spanIndex * this.poleLength;
        for (const f of this.basisBuffer2) {
            for (let j = 0; j < this.poleLength; j++) {
                this.poleBuffer2[j] += f * this.packedData[k++];
            }
        }
    }

    public evaluateBuffersAtKnot(u: number, numDerivative: number = 0) {
        const knotIndex0 = this.knots.knotToLeftKnotIndex(u);
        if (numDerivative < 1) {
            this.knots.evaluateBasisFunctions(knotIndex0, u, this.basisBuffer);
            this.sumPoleBufferForSpan(knotIndex0 - this.degree + 1);
        } else if (numDerivative === 1) {
            this.knots.evaluateBasisFunctions1(knotIndex0, u, this.basisBuffer, this.basisBuffer1);
            this.sumPoleBufferForSpan(knotIndex0 - this.degree + 1);
            this.sumPoleBuffer1ForSpan(knotIndex0 - this.degree + 1);
        } else {
            this.knots.evaluateBasisFunctions1(
                knotIndex0,
                u,
                this.basisBuffer,
                this.basisBuffer1,
                this.basisBuffer2
            );
            this.sumPoleBufferForSpan(knotIndex0 - this.degree + 1);
            this.sumPoleBuffer1ForSpan(knotIndex0 - this.degree + 1);
            this.sumPoleBuffer2ForSpan(knotIndex0 - this.degree + 1);
        }
    }

    public reverseInPlace(): void {
        const b = this.poleLength;
        const data = this.packedData;
        for (let i0 = 0, j0 = b * (this.numPoles - 1); i0 < j0; i0 += b, j0 -= b) {
            let t = 0;
            for (let i = 0; i < b; i++) {
                t = data[i0 + i];
                data[i0 + i] = data[j0 + i];
                data[j0 + i] = t;
            }
        }
        this.knots.reflectKnots();
    }

    public testCloseablePolygon(mode?: BSplineWrapMode): boolean {
        if (mode === undefined) mode = this.knots.wrappable;
        const degree = this.degree;
        const blockSize = this.poleLength;
        const indexDelta = (this.numPoles - this.degree) * blockSize;
        const data = this.packedData;
        if (mode === BSplineWrapMode.OpenByAddingControlPoints) {
            const numValuesToTest = degree * blockSize;
            for (let i0 = 0; i0 < numValuesToTest; i0++) {
                if (!Geometry.isSameCoordinate(data[i0], data[i0 + indexDelta])) return false;
            }
            return true;
        }

        if (mode === BSplineWrapMode.OpenByRemovingKnots) {
            return true;
        }

        return false;
    }

    public addKnot(knot: number, totalMultiplicity: number): boolean {
        if (knot < this.knots.leftKnot || knot > this.knots.rightKnot) return false;
        let iLeftKnot = this.knots.knotToLeftKnotIndex(knot);

        if (Math.abs(knot - this.knots.knots[iLeftKnot]) < KnotVector.knotTolerance) {
            knot = this.knots.knots[iLeftKnot];
        } else if (Math.abs(knot - this.knots.knots[iLeftKnot + 1]) < KnotVector.knotTolerance) {
            iLeftKnot += this.knots.getKnotMultiplicityAtIndex(iLeftKnot + 1);
            if (iLeftKnot > this.knots.rightKnotIndex) return true;
            knot = this.knots.knots[iLeftKnot];
        }
        const numKnotsToAdd =
            Math.min(totalMultiplicity, this.degree) - this.knots.getKnotMultiplicity(knot);
        if (numKnotsToAdd <= 0) return true;

        let currKnotCount = this.knots.knots.length;
        const newKnots = new Float64Array(currKnotCount + numKnotsToAdd);
        for (let i = 0; i < currKnotCount; ++i) newKnots[i] = this.knots.knots[i];
        let currPoleCount = this.numPoles;
        const newPackedData = new Float64Array(
            this.packedData.length + numKnotsToAdd * this.poleLength
        );
        for (let i = 0; i < this.packedData.length; ++i) newPackedData[i] = this.packedData[i];
        const dataBuf = new Float64Array(this.degree * this.poleLength);

        for (let iter = 0; iter < numKnotsToAdd; ++iter) {
            let iBuf = 0;
            const iStart = iLeftKnot - this.degree + 2;
            for (let i = iStart; i < iStart + this.degree; ++i) {
                const fraction =
                    (knot - newKnots[i - 1]) / (newKnots[i + this.degree - 1] - newKnots[i - 1]);
                for (let j = i * this.poleLength; j < (i + 1) * this.poleLength; ++j) {
                    dataBuf[iBuf++] = Geometry.interpolate(
                        newPackedData[j - this.poleLength],
                        fraction,
                        newPackedData[j]
                    );
                }
            }

            newPackedData.copyWithin(
                (iStart + this.degree) * this.poleLength,
                (iStart + this.degree - 1) * this.poleLength,
                currPoleCount * this.poleLength
            );
            let iData = iStart * this.poleLength;
            for (const d of dataBuf) newPackedData[iData++] = d;

            newKnots.copyWithin(iLeftKnot + 2, iLeftKnot + 1, currKnotCount);
            newKnots[iLeftKnot + 1] = knot;

            ++iLeftKnot;
            ++currKnotCount;
            ++currPoleCount;
        }
        this.knots.setKnotsCapture(newKnots);
        this.packedData = newPackedData;
        return true;
    }
}
