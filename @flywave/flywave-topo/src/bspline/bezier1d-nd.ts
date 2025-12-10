/* Copyright (C) 2025 flywave.gl contributors */



import { Geometry } from "../geometry";
import { Point3dArray } from "../geometry3d/point-helpers";
import { Point2d } from "../geometry3d/point2d-vector2d";
import { Point3d } from "../geometry3d/point3d-vector3d";
import { Segment1d } from "../geometry3d/segment1d";
import { Point4d } from "../geometry4d/point4d";
import { type BezierCoffs, UnivariateBezier } from "../numerics/bezier-polynomials";
import { KnotVector } from "./knot-vector";

export class Bezier1dNd {
    private readonly _packedData: Float64Array;
    private readonly _order: number;
    private readonly _blockSize: number;
    private readonly _basis: BezierCoffs;

    public constructor(blockSize: number, polygon: Float64Array) {
        this._blockSize = blockSize;
        this._order = Math.floor(polygon.length / blockSize);
        this._packedData = polygon;
        this._basis = new UnivariateBezier(this._order);
    }

    public clonePolygon(result?: Float64Array): Float64Array {
        const n = this._packedData.length;
        if (!result || result.length !== n) return this._packedData.slice();
        for (let i = 0; i < n; i++) result[i] = this._packedData[i];
        return result;
    }

    public get order() {
        return this._order;
    }

    public get packedData() {
        return this._packedData;
    }

    public static create(data: Point2d[] | Point3d[] | Point4d[]): Bezier1dNd | undefined {
        if (data.length < 1) return undefined;
        if (data[0] instanceof Point3d) {
            const polygon = new Float64Array(data.length * 3);
            let i = 0;
            for (const p of data as Point3d[]) {
                polygon[i++] = p.x;
                polygon[i++] = p.y;
                polygon[i++] = p.z;
            }
            return new Bezier1dNd(3, polygon);
        } else if (data[0] instanceof Point4d) {
            const polygon = new Float64Array(data.length * 4);
            let i = 0;
            for (const p of data as Point4d[]) {
                polygon[i++] = p.x;
                polygon[i++] = p.y;
                polygon[i++] = p.z;
                polygon[i++] = p.w;
            }
            return new Bezier1dNd(4, polygon);
        } else if (data[0] instanceof Point2d) {
            const polygon = new Float64Array(data.length * 2);
            let i = 0;
            for (const p of data as Point2d[]) {
                polygon[i++] = p.x;
                polygon[i++] = p.y;
            }
            return new Bezier1dNd(2, polygon);
        }
        return undefined;
    }

    public evaluate(s: number, buffer?: Float64Array): Float64Array {
        return this._basis.sumBasisFunctions(s, this._packedData, this._blockSize, buffer);
    }

    public evaluateDerivative(s: number, buffer?: Float64Array): Float64Array {
        return this._basis.sumBasisFunctionDerivatives(
            s,
            this._packedData,
            this._blockSize,
            buffer
        );
    }

    public getPolygonPoint(i: number, buffer?: Float64Array): Float64Array | undefined {
        if (!buffer) buffer = new Float64Array(this._blockSize);
        if (i >= 0 && i < this._order) {
            const k0 = this._blockSize * i;
            for (let k = 0; k < this._blockSize; k++) buffer[k] = this._packedData[k0 + k];
            return buffer;
        }
        return undefined;
    }

    public setPolygonPoint(i: number, buffer: Float64Array) {
        if (i >= 0 && i < this._order) {
            const k0 = this._blockSize * i;
            for (let k = 0; k < this._blockSize; k++) this._packedData[k0 + k] = buffer[k];
        }
    }

    public loadSpanPoles(data: Float64Array, spanIndex: number) {
        let k = spanIndex * this._blockSize;
        for (let i = 0; i < this._packedData.length; i++) this._packedData[i] = data[k++];
    }

    public loadSpanPolesWithWeight(
        data: Float64Array,
        dataDimension: number,
        spanIndex: number,
        weight: number
    ) {
        let destIndex = 0;
        const order = this._order;
        let dataIndex = spanIndex * dataDimension;
        for (let i = 0; i < order; i++) {
            for (let j = 0; j < dataDimension; j++) {
                this._packedData[destIndex++] = data[dataIndex++];
            }
            this._packedData[destIndex++] = weight;
        }
    }

    public unpackToJsonArrays(): any[] {
        return Point3dArray.unpackNumbersToNestedArrays(this._packedData, this._blockSize);
    }

    public isAlmostEqual(other: any): boolean {
        if (other instanceof Bezier1dNd) {
            if (this._blockSize !== other._blockSize) return false;
            if (this._order !== other._order) return false;
            if (this._packedData.length !== other._packedData.length) return false;
            for (let i = 0; i < this._packedData.length; i++) {
                if (!Geometry.isSameCoordinate(this._packedData[i], other._packedData[i])) {
                    return false;
                }
            }
            return true;
        }
        return false;
    }

    public reverseInPlace() {
        const m = this._blockSize;
        const n = this._order;
        let i, j;
        let a;
        for (i = 0, j = (n - 1) * m; i < j; i += m, j -= m) {
            for (let k = 0; k < m; k++) {
                a = this._packedData[i + k];
                this._packedData[i + k] = this._packedData[j + k];
                this._packedData[j + k] = a;
            }
        }
    }

    public interpolatePoleInPlace(poleIndexA: number, fraction: number, poleIndexB: number) {
        let i0 = poleIndexA * this._blockSize;
        let i1 = poleIndexB * this._blockSize;
        const data = this._packedData;
        for (let i = 0; i < this._blockSize; i++, i0++, i1++) {
            data[i0] += fraction * (data[i1] - data[i0]);
        }
    }

    public saturateInPlace(knots: KnotVector, spanIndex: number): boolean {
        const degree = knots.degree;
        const kA = spanIndex + degree - 1;
        const kB = kA + 1;
        if (spanIndex < 0 || spanIndex >= knots.numSpans) return false;
        const knotArray = knots.knots;
        const knotA = knotArray[kA];
        const knotB = knotArray[kB];
        this.setInterval(knotA, knotB);
        if (knotB <= knotA + KnotVector.knotTolerance) return false;
        for (let numInsert = degree - 1; numInsert > 0; numInsert--) {
            let k0 = kA - numInsert;
            if (knotArray[k0] < knotA) {
                let k1 = kB;
                for (let i = 0; i < numInsert; i++, k0++, k1++) {
                    const knot0 = knotArray[k0];
                    const knot1 = knotArray[k1];
                    const fraction = (knotA - knot0) / (knot1 - knot0);
                    this.interpolatePoleInPlace(i, fraction, i + 1);
                }
            }
        }
        for (let numInsert = degree - 1; numInsert > 0; numInsert--) {
            let k2 = kB + numInsert;
            if (knotArray[k2] > knotB) {
                for (let i = 0; i < numInsert; i++, k2--) {
                    const knot2 = knotArray[k2];
                    const fraction = (knotB - knot2) / (knotA - knot2);
                    this.interpolatePoleInPlace(degree - i, fraction, degree - i - 1);
                }
            }
        }
        return true;
    }

    public static saturate1dInPlace(
        coffs: Float64Array,
        knots: KnotVector,
        spanIndex: number
    ): boolean {
        const degree = knots.degree;
        const kA = spanIndex + degree - 1;
        const kB = kA + 1;
        if (spanIndex < 0 || spanIndex >= knots.numSpans) return false;
        const knotArray = knots.knots;
        const knotA = knotArray[kA];
        const knotB = knotArray[kB];
        if (knotB <= knotA + KnotVector.knotTolerance) return false;
        for (let numInsert = degree - 1; numInsert > 0; numInsert--) {
            let k0 = kA - numInsert;
            if (knotArray[k0] < knotA) {
                let k1 = kB;
                for (let i = 0; i < numInsert; i++, k0++, k1++) {
                    const knot0 = knotArray[k0];
                    const knot1 = knotArray[k1];
                    const fraction = (knotA - knot0) / (knot1 - knot0);
                    coffs[i] = coffs[i] + fraction * (coffs[i + 1] - coffs[i]);
                }
            }
        }
        for (let numInsert = degree - 1; numInsert > 0; numInsert--) {
            let k2 = kB + numInsert;
            let k;
            if (knotArray[k2] > knotB) {
                for (let i = 0; i < numInsert; i++, k2--) {
                    const knot2 = knotArray[k2];
                    const fraction = (knotB - knot2) / (knotA - knot2);
                    k = degree - i;
                    coffs[k] += fraction * (coffs[k - 1] - coffs[k]);
                }
            }
        }
        return true;
    }

    public subdivideInPlaceKeepLeft(fraction: number): boolean {
        if (Geometry.isAlmostEqualNumber(fraction, 1.0)) return true;
        if (Geometry.isAlmostEqualNumber(fraction, 0.0)) return false;
        const g = 1.0 - fraction;
        const order = this.order;
        for (let level = 1; level < order; level++) {
            for (let i1 = order - 1; i1 >= level; i1--) {
                this.interpolatePoleInPlace(i1, g, i1 - 1);
            }
        }
        return true;
    }

    public subdivideInPlaceKeepRight(fraction: number): boolean {
        if (Geometry.isAlmostEqualNumber(fraction, 0.0)) return true;
        if (Geometry.isAlmostEqualNumber(fraction, 1.0)) return false;
        const order = this.order;
        for (let level = 1; level < order; level++) {
            for (let i0 = 0; i0 + level < order; i0++) {
                this.interpolatePoleInPlace(i0, fraction, i0 + 1);
            }
        }
        return true;
    }

    public subdivideToIntervalInPlace(fraction0: number, fraction1: number): boolean {
        if (Geometry.isAlmostEqualNumber(fraction0, fraction1)) return false;
        if (fraction1 < fraction0) {
            this.subdivideToIntervalInPlace(fraction1, fraction0);
            this.reverseInPlace();
            return true;
        }
        this.subdivideInPlaceKeepLeft(fraction1);
        this.subdivideInPlaceKeepRight(fraction0 / fraction1);
        return true;
    }

    public interval?: Segment1d;

    public setInterval(a: number, b: number) {
        this.interval = Segment1d.create(a, b, this.interval);
    }

    public fractionToParentFraction(fraction: number): number {
        return this.interval ? this.interval.fractionToPoint(fraction) : fraction;
    }
}
