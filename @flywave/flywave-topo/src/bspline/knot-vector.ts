/* Copyright (C) 2025 flywave.gl contributors */



import { Geometry } from "../geometry";
import { NumberArray } from "../geometry3d/point-helpers";

export enum BSplineWrapMode {
    None = 0,
    OpenByAddingControlPoints = 1,
    OpenByRemovingKnots = 2
}

export class KnotVector {
    public knots: Float64Array;
    public degree: number;
    private _knot0: number;
    private _knot1: number;

    private _wrapMode?: BSplineWrapMode;
    public static readonly knotTolerance = 1.0e-9;
    public get leftKnot() {
        return this._knot0;
    }

    public get rightKnot() {
        return this._knot1;
    }

    public get leftKnotIndex() {
        return this.degree - 1;
    }

    public get rightKnotIndex() {
        return this.knots.length - this.degree;
    }

    public get wrappable() {
        return this._wrapMode === undefined ? BSplineWrapMode.None : this._wrapMode;
    }

    public set wrappable(value: BSplineWrapMode) {
        this._wrapMode = value;
    }

    public get numSpans() {
        return this.rightKnotIndex - this.leftKnotIndex;
    }

    private constructor(
        knots: number[] | Float64Array | number,
        degree: number,
        wrapMode?: BSplineWrapMode
    ) {
        this.degree = degree;
        this._wrapMode = wrapMode;
        this._knot0 = 0.0;
        this._knot1 = 1.0;
        if (Array.isArray(knots)) {
            this.knots = new Float64Array(knots.length);
            this.setKnots(knots);
            this.setupFixedValues();
        } else if (knots instanceof Float64Array) {
            this.knots = knots.slice();
            this.setupFixedValues();
        } else {
            this.knots = new Float64Array(knots);
        }
    }

    public clone(): KnotVector {
        return new KnotVector(this.knots, this.degree, this.wrappable);
    }

    private setupFixedValues() {
        this._knot0 = this.knots[this.degree - 1];
        this._knot1 = this.knots[this.knots.length - this.degree];
    }

    public get knotLength01(): number {
        return this._knot1 - this._knot0;
    }

    public testClosable(mode?: BSplineWrapMode): boolean {
        if (mode === undefined) mode = this.wrappable;
        const leftKnotIndex = this.leftKnotIndex;
        const rightKnotIndex = this.rightKnotIndex;
        const period = this.rightKnot - this.leftKnot;
        const degree = this.degree;
        const indexDelta = rightKnotIndex - leftKnotIndex;
        if (mode === BSplineWrapMode.OpenByAddingControlPoints) {
            for (let k0 = leftKnotIndex - degree + 1; k0 < leftKnotIndex + degree - 1; k0++) {
                const k1 = k0 + indexDelta;
                if (!Geometry.isSameCoordinate(this.knots[k0] + period, this.knots[k1])) {
                    return false;
                }
            }
            return true;
        }
        if (mode === BSplineWrapMode.OpenByRemovingKnots) {
            const numRepeated = degree - 1;
            const leftKnot = this.knots[leftKnotIndex];
            const rightKnot = this.knots[rightKnotIndex];
            for (let i = 0; i < numRepeated; i++) {
                if (!Geometry.isSameCoordinate(leftKnot, this.knots[leftKnotIndex - i - 1])) {
                    return false;
                }
                if (!Geometry.isSameCoordinate(rightKnot, this.knots[rightKnotIndex + i + 1])) {
                    return false;
                }
            }
            return true;
        }

        return false;
    }

    public isAlmostEqual(other: KnotVector): boolean {
        if (this.degree !== other.degree) return false;
        return NumberArray.isAlmostEqual(this.knots, other.knots, KnotVector.knotTolerance);
    }

    public getKnotMultiplicity(knot: number): number {
        let m = 0;
        for (const k of this.knots) {
            if (Math.abs(k - knot) < KnotVector.knotTolerance) ++m;
            else if (knot < k) break;
        }
        return m;
    }

    public getKnotMultiplicityAtIndex(knotIndex: number): number {
        let m = 0;
        if (knotIndex >= 0 && knotIndex < this.knots.length) {
            const knot = this.knots[knotIndex];
            ++m;
            for (let i = knotIndex - 1; i >= 0; --i) {
                const k = this.knots[i];
                if (Math.abs(k - knot) < KnotVector.knotTolerance) ++m;
                else if (knot > k) break;
            }
            for (let i = knotIndex + 1; i < this.knots.length; ++i) {
                const k = this.knots[i];
                if (Math.abs(k - knot) < KnotVector.knotTolerance) ++m;
                else if (knot < k) break;
            }
        }
        return m;
    }

    public normalize(): boolean {
        if (this.knotLength01 < KnotVector.knotTolerance) return false;
        const divisor = 1.0 / this.knotLength01;
        const leftKnot = this.leftKnot;
        for (let i = 0; i < this.knots.length; ++i) {
            this.knots[i] = (this.knots[i] - leftKnot) * divisor;
        }

        for (
            let i = this.rightKnotIndex - 1;
            i > this.leftKnotIndex && this.knots[i] === this.knots[this.rightKnotIndex];
            --i
        ) {
            this.knots[i] = 1.0;
        }
        for (
            let i = this.rightKnotIndex + 1;
            i < this.knots.length && this.knots[i] === this.knots[this.rightKnotIndex];
            ++i
        ) {
            this.knots[i] = 1.0;
        }
        this.knots[this.rightKnotIndex] = 1.0;
        this.setupFixedValues();
        return true;
    }

    public setKnots(knots: number[] | Float64Array, skipFirstAndLast?: boolean) {
        const numAllocate = skipFirstAndLast ? knots.length - 2 : knots.length;
        if (numAllocate !== this.knots.length) this.knots = new Float64Array(numAllocate);
        if (skipFirstAndLast) {
            for (let i = 1; i + 1 < knots.length; i++) this.knots[i - 1] = knots[i];
        } else {
            for (let i = 0; i < knots.length; i++) this.knots[i] = knots[i];
        }
        this.setupFixedValues();
    }

    public setKnotsCapture(knots: Float64Array) {
        this.knots = knots;
        this.setupFixedValues();
    }

    public static createUniformClamped(
        numPoles: number,
        degree: number,
        a0: number,
        a1: number
    ): KnotVector {
        const knots = new KnotVector(numPoles + degree - 1, degree);
        let k = 0;
        for (let m = 0; m < degree; m++) knots.knots[k++] = a0;
        const du = 1.0 / (numPoles - degree);
        for (let i = 1; i + degree < numPoles; i++) knots.knots[k++] = a0 + i * du * (a1 - a0);
        for (let m = 0; m < degree; m++) knots.knots[k++] = a1;
        knots.setupFixedValues();
        return knots;
    }

    public static createUniformWrapped(
        numInterval: number,
        degree: number,
        a0: number,
        a1: number
    ): KnotVector {
        const knots = new KnotVector(numInterval + 2 * degree - 1, degree);
        const du = 1.0 / numInterval;
        for (let i = 1 - degree, k = 0; i < numInterval + degree; i++, k++) {
            knots.knots[k] = Geometry.interpolate(a0, i * du, a1);
        }
        knots.setupFixedValues();
        return knots;
    }

    public static create(
        knotArray: number[] | Float64Array,
        degree: number,
        skipFirstAndLast?: boolean
    ): KnotVector {
        const numAllocate = skipFirstAndLast ? knotArray.length - 2 : knotArray.length;
        const knots = new KnotVector(numAllocate, degree);
        knots.setKnots(knotArray, skipFirstAndLast);
        return knots;
    }

    public grevilleKnot(knotIndex: number): number {
        if (knotIndex < 0) return this.leftKnot;
        if (knotIndex > this.rightKnotIndex) return this.rightKnot;
        let sum = 0.0;
        for (let i = knotIndex; i < knotIndex + this.degree; i++) sum += this.knots[i];
        return sum / this.degree;
    }

    public createBasisArray(): Float64Array {
        return new Float64Array(this.degree + 1);
    }

    public baseKnotFractionToKnot(knotIndex0: number, localFraction: number): number {
        const knot0 = this.knots[knotIndex0];
        localFraction = Geometry.clamp(localFraction, 0, 1);
        return knot0 + localFraction * (this.knots[knotIndex0 + 1] - knot0);
    }

    public spanFractionToKnot(spanIndex: number, localFraction: number): number {
        const k = this.spanIndexToLeftKnotIndex(spanIndex);
        localFraction = Geometry.clamp(localFraction, 0, 1);
        return this.knots[k] + localFraction * (this.knots[k + 1] - this.knots[k]);
    }

    public spanFractionToFraction(spanIndex: number, localFraction: number): number {
        const knot = this.spanFractionToKnot(spanIndex, localFraction);
        return (knot - this.leftKnot) / (this.rightKnot - this.leftKnot);
    }

    public fractionToKnot(fraction: number): number {
        fraction = Geometry.clamp(fraction, 0, 1); // B-splines are not extendable
        return Geometry.interpolate(
            this.knots[this.degree - 1],
            fraction,
            this.knots[this.knots.length - this.degree]
        );
    }

    public evaluateBasisFunctions(knotIndex0: number, u: number, f: Float64Array) {
        f[0] = 1.0;
        if (this.degree < 1) return;
        const u0 = this.knots[knotIndex0];
        const u1 = this.knots[knotIndex0 + 1];
        f[1] = (u - u0) / (u1 - u0);
        f[0] = 1.0 - f[1];
        if (this.degree < 2) return;

        for (let depth = 1; depth < this.degree; depth++) {
            let kLeft = knotIndex0 - depth;
            let kRight = kLeft + depth + 1;
            let gCarry = 0.0;
            for (let step = 0; step <= depth; step++) {
                const tLeft = this.knots[kLeft++];
                const tRight = this.knots[kRight++];
                const fraction = (u - tLeft) / (tRight - tLeft);
                const g1 = f[step] * fraction;
                const g0 = f[step] * (1.0 - fraction);
                f[step] = gCarry + g0;
                gCarry = g1;
            }
            f[depth + 1] = gCarry;
        }
    }

    public evaluateBasisFunctions1(
        knotIndex0: number,
        u: number,
        f: Float64Array,
        df: Float64Array,
        ddf?: Float64Array
    ) {
        f[0] = 1.0;
        df[0] = 0.0;
        if (this.degree < 1) return;

        const u0 = this.knots[knotIndex0];
        const u1 = this.knots[knotIndex0 + 1];

        let ah = 1.0 / (u1 - u0);
        f[1] = (u - u0) * ah;
        f[0] = 1.0 - f[1];
        df[0] = -ah;
        df[1] = ah;
        if (ddf) {
            ddf[0] = 0.0;
            ddf[1] = 0.0;
        }
        if (this.degree < 2) return;
        for (let depth = 1; depth < this.degree; depth++) {
            let kLeft = knotIndex0 - depth;
            let kRight = kLeft + depth + 1;
            let gCarry = 0.0;
            let dgCarry = 0.0;
            let ddgCarry = 0.0;

            for (let step = 0; step <= depth; step++) {
                const tLeft = this.knots[kLeft++];
                const tRight = this.knots[kRight++];
                ah = 1.0 / (tRight - tLeft);
                const fraction = (u - tLeft) * ah;
                const fraction1 = 1.0 - fraction;
                const g1 = f[step] * fraction;
                const g0 = f[step] * fraction1;
                const dg1 = df[step] * fraction + f[step] * ah;
                const dg0 = df[step] * fraction1 - f[step] * ah;
                const dfSave = 2.0 * df[step] * ah;
                f[step] = gCarry + g0;
                df[step] = dgCarry + dg0;
                gCarry = g1;
                dgCarry = dg1;
                if (ddf) {
                    const ddg1 = ddf[step] * fraction + dfSave;
                    const ddg0 = ddf[step] * fraction1 - dfSave;
                    ddf[step] = ddgCarry + ddg0;
                    ddgCarry = ddg1;
                }
            }
            f[depth + 1] = gCarry;
            df[depth + 1] = dgCarry;
            if (ddf) ddf[depth + 1] = ddgCarry;
        }
    }

    public knotToLeftKnotIndex(u: number): number {
        for (let i = this.leftKnotIndex; i < this.rightKnotIndex; ++i) {
            if (u < this.knots[i + 1]) return i;
        }
        for (let i = this.rightKnotIndex; i > this.leftKnotIndex; --i) {
            if (this.knots[i] - this.knots[i - 1] >= KnotVector.knotTolerance) return i - 1;
        }
        return this.rightKnotIndex - 1;
    }

    public spanIndexToLeftKnotIndex(spanIndex: number): number {
        const d = this.degree;
        if (spanIndex <= 0.0) return d - 1;
        return Math.min(spanIndex + d - 1, this.knots.length - d - 1);
    }

    public spanIndexToSpanLength(spanIndex: number): number {
        const k = this.spanIndexToLeftKnotIndex(spanIndex);
        return this.knots[k + 1] - this.knots[k];
    }

    public isIndexOfRealSpan(spanIndex: number): boolean {
        if (spanIndex >= 0 && spanIndex < this.numSpans) {
            return !Geometry.isSmallMetricDistance(this.spanIndexToSpanLength(spanIndex));
        }
        return false;
    }

    public reflectKnots() {
        const a = this.leftKnot;
        const b = this.rightKnot;
        const numKnots = this.knots.length;
        for (let i = 0; i < numKnots; i++) this.knots[i] = a + (b - this.knots[i]);
        this.knots.reverse();
    }

    public copyKnots(includeExtraEndKnot: boolean): number[] {
        const wrap =
            this.wrappable === BSplineWrapMode.OpenByAddingControlPoints && this.testClosable();
        const leftIndex = this.leftKnotIndex;
        const rightIndex = this.rightKnotIndex;
        const a0 = this.leftKnot;
        const a1 = this.rightKnot;
        const delta = a1 - a0;
        const degree = this.degree;
        const values: number[] = [];
        if (includeExtraEndKnot) {
            if (wrap) {
                values.push(this.knots[rightIndex - degree] - delta);
            } else {
                values.push(this.knots[0]);
            }
        }
        for (const u of this.knots) values.push(u);
        if (includeExtraEndKnot) {
            if (wrap) {
                values.push(this.knots[leftIndex + degree] + delta);
            } else values.push(values[values.length - 1]);
        }
        return values;
    }
}
