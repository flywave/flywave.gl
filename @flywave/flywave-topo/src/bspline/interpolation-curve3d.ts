/* Copyright (C) 2025 flywave.gl contributors */



import { type CurvePrimitive } from "../curve/curve-primitive";
import { type GeometryQuery } from "../curve/geometry-query";
import { ProxyCurve } from "../curve/proxy-curve";
import { Geometry } from "../geometry";
import { type GeometryHandler } from "../geometry3d/geometry-handler";
import { Point3dArray } from "../geometry3d/point-helpers";
import { type Point3d, Vector3d } from "../geometry3d/point3d-vector3d";
import { type Transform } from "../geometry3d/transform";
import { type XYZProps } from "../geometry3d/xyz-props";
import { BSplineCurve3d } from "./bspline-curve";
import { BSplineCurveOps } from "./bspline-curve-ops";

export interface InterpolationCurve3dProps {
    order?: number;
    closed?: boolean;
    isChordLenKnots?: number;
    isColinearTangents?: number;
    isChordLenTangents?: number;
    isNaturalTangents?: number;
    startTangent?: XYZProps;
    endTangent?: XYZProps;
    fitPoints: XYZProps[];
    knots?: number[];
}

export class InterpolationCurve3dOptions {
    public constructor(fitPoints?: Point3d[], knots?: number[]) {
        this._fitPoints = fitPoints ? fitPoints : [];
        this._knots = knots;
    }

    private _order?: number;
    private _closed?: boolean;
    private _isChordLenKnots?: number;
    private _isColinearTangents?: number;
    private _isChordLenTangents?: number;
    private _isNaturalTangents?: number;
    private _startTangent?: Vector3d;
    private _endTangent?: Vector3d;
    private _fitPoints: Point3d[];
    private _knots?: number[];

    public get order(): number {
        return Geometry.resolveNumber(this._order, 4);
    }

    public set order(val: number) {
        this._order = val;
    }

    public get closed(): boolean {
        return Geometry.resolveValue(this._closed, false);
    }

    public set closed(val: boolean) {
        this._closed = val;
    }

    public get isChordLenKnots(): number {
        return Geometry.resolveNumber(this._isChordLenKnots, 0);
    }

    public set isChordLenKnots(val: number) {
        this._isChordLenKnots = val;
    }

    public get isColinearTangents(): number {
        return Geometry.resolveNumber(this._isColinearTangents, 0);
    }

    public set isColinearTangents(val: number) {
        this._isColinearTangents = val;
    }

    public get isChordLenTangents(): number {
        return Geometry.resolveNumber(this._isChordLenTangents, 0);
    }

    public set isChordLenTangents(val: number) {
        this._isChordLenTangents = val;
    }

    public get isNaturalTangents(): number {
        return Geometry.resolveNumber(this._isNaturalTangents, 0);
    }

    public set isNaturalTangents(val: number) {
        this._isNaturalTangents = val;
    }

    public get startTangent(): Vector3d | undefined {
        return this._startTangent;
    }

    public set startTangent(val: Vector3d | undefined) {
        this._startTangent = val;
    }

    public get endTangent(): Vector3d | undefined {
        return this._endTangent;
    }

    public set endTangent(val: Vector3d | undefined) {
        this._endTangent = val;
    }

    public get fitPoints(): Point3d[] {
        return this._fitPoints;
    }

    public set fitPoints(val: Point3d[]) {
        this._fitPoints = val;
    }

    public get knots(): number[] | undefined {
        return this._knots;
    }

    public set knots(val: number[] | undefined) {
        this._knots = val;
    }

    public captureOptionalProps(
        order: number | undefined,
        closed: boolean | undefined,
        isChordLenKnots: number | undefined,
        isColinearTangents: number | undefined,
        isChordLenTangent: number | undefined,
        isNaturalTangents: number | undefined,
        startTangent: Vector3d | undefined,
        endTangent: Vector3d | undefined
    ) {
        this._order = Geometry.resolveToUndefined(order, 0);
        this._closed = Geometry.resolveToUndefined(closed, false);
        this._isChordLenKnots = Geometry.resolveToUndefined(isChordLenKnots, 0);
        this._isColinearTangents = Geometry.resolveToUndefined(isColinearTangents, 0);
        this._isChordLenTangents = Geometry.resolveToUndefined(isChordLenTangent, 0);
        this._isNaturalTangents = Geometry.resolveToUndefined(isNaturalTangents, 0);
        this._startTangent = startTangent;
        this._endTangent = endTangent;
    }

    public cloneAsInterpolationCurve3dProps(): InterpolationCurve3dProps {
        const props: InterpolationCurve3dProps = {
            fitPoints: Point3dArray.cloneDeepJSONNumberArrays(this.fitPoints),
            knots: this._knots?.slice()
        };
        if (this._order !== undefined) props.order = this._order;
        if (this._closed !== undefined) props.closed = this._closed;
        if (this._isChordLenKnots !== undefined) props.isChordLenKnots = this._isChordLenKnots;
        if (this._isColinearTangents !== undefined) {
            props.isColinearTangents = this._isColinearTangents;
        }
        if (this._isChordLenTangents !== undefined) {
            props.isChordLenTangents = this._isChordLenTangents;
        }
        if (this._isNaturalTangents !== undefined) {
            props.isNaturalTangents = this._isNaturalTangents;
        }
        if (this._startTangent !== undefined) props.startTangent = this._startTangent?.toArray();
        if (this._endTangent !== undefined) props.endTangent = this._endTangent?.toArray();
        return props;
    }

    public clone(): InterpolationCurve3dOptions {
        const clone = new InterpolationCurve3dOptions(
            Point3dArray.clonePoint3dArray(this.fitPoints),
            this.knots?.slice()
        );
        clone._order = this.order;
        clone._closed = this.closed;
        clone._isChordLenKnots = this.isChordLenKnots;
        clone._isColinearTangents = this.isColinearTangents;
        clone._isChordLenTangents = this.isChordLenTangents;
        clone._isNaturalTangents = this.isNaturalTangents;
        clone._startTangent = this._startTangent?.clone();
        clone._endTangent = this._endTangent?.clone();
        return clone;
    }

    public static create(source: InterpolationCurve3dProps): InterpolationCurve3dOptions {
        const result = new InterpolationCurve3dOptions(
            Point3dArray.clonePoint3dArray(source.fitPoints),
            source.knots?.slice()
        );
        result._order = source.order;
        result._closed = source.closed;
        result._isChordLenKnots = source.isChordLenKnots;
        result._isColinearTangents = source.isColinearTangents;
        result._isChordLenTangents = source.isChordLenTangents;
        result._isNaturalTangents = source.isNaturalTangents;
        result._startTangent = source.startTangent
            ? Vector3d.fromJSON(source.startTangent)
            : undefined;
        result._endTangent = source.endTangent ? Vector3d.fromJSON(source.endTangent) : undefined;
        return result;
    }

    private static areAlmostEqualAllow000AsUndefined(
        a: Vector3d | undefined,
        b: Vector3d | undefined
    ): boolean {
        if (a !== undefined && a.maxAbs() === 0) a = undefined;
        if (b !== undefined && b.maxAbs() === 0) b = undefined;
        if (a !== undefined && b !== undefined) return a.isAlmostEqual(b);
        return a === undefined && b === undefined;
    }

    public static areAlmostEqual(
        dataA: InterpolationCurve3dOptions | undefined,
        dataB: InterpolationCurve3dOptions | undefined
    ): boolean {
        if (dataA === undefined && dataB === undefined) return true;
        if (dataA !== undefined && dataB !== undefined) {
            if (
                Geometry.areEqualAllowUndefined(dataA.order, dataB.order) &&
                Geometry.areEqualAllowUndefined(dataA.closed, dataB.closed) &&
                Geometry.areEqualAllowUndefined(dataA.isChordLenKnots, dataB.isChordLenKnots) &&
                Geometry.areEqualAllowUndefined(
                    dataA.isColinearTangents,
                    dataB.isColinearTangents
                ) &&
                Geometry.areEqualAllowUndefined(dataA.isNaturalTangents, dataB.isNaturalTangents) &&
                this.areAlmostEqualAllow000AsUndefined(dataA.startTangent, dataB.startTangent) &&
                this.areAlmostEqualAllow000AsUndefined(dataA.endTangent, dataB.endTangent) &&
                Geometry.almostEqualArrays(
                    dataA.fitPoints,
                    dataB.fitPoints,
                    (a: Point3d, b: Point3d) => a.isAlmostEqual(b)
                )
            ) {
                if (
                    Geometry.almostEqualNumberArrays(
                        dataA.knots,
                        dataB.knots,
                        (a: number, b: number) => a === b
                    )
                ) {
                    return true;
                }
                if (dataA.knots === undefined && dataB.knots === undefined) return true;
                let knotsA = dataA.knots;
                let knotsB = dataB.knots;
                if (dataA.knots === undefined) {
                    knotsA = BSplineCurveOps.C2CubicFit.constructFitParametersFromPoints(
                        dataA.fitPoints,
                        dataA.isChordLenKnots,
                        dataA.closed
                    );
                } else if (dataB.knots === undefined) {
                    knotsB = BSplineCurveOps.C2CubicFit.constructFitParametersFromPoints(
                        dataB.fitPoints,
                        dataB.isChordLenKnots,
                        dataB.closed
                    );
                }
                knotsA = BSplineCurveOps.C2CubicFit.convertCubicKnotVectorToFitParams(
                    knotsA,
                    dataA.fitPoints.length,
                    false
                );
                knotsB = BSplineCurveOps.C2CubicFit.convertCubicKnotVectorToFitParams(
                    knotsB,
                    dataB.fitPoints.length,
                    false
                );
                return Geometry.almostEqualNumberArrays(knotsA, knotsB, (a: number, b: number) =>
                    Geometry.isAlmostEqualNumber(a, b)
                );
            }
        }
        return false;
    }

    public reverseInPlace() {
        this.fitPoints.reverse();
        if (this.knots) this.knots.reverse();
        const oldStart = this._startTangent;
        this._startTangent = this.endTangent;
        this._endTangent = oldStart;
    }
}

export class InterpolationCurve3d extends ProxyCurve {
    public readonly curvePrimitiveType = "interpolationCurve";
    private readonly _options: InterpolationCurve3dOptions;

    private constructor(properties: InterpolationCurve3dOptions, proxyCurve: CurvePrimitive) {
        super(proxyCurve);
        this._options = properties;
    }

    public override dispatchToGeometryHandler(handler: GeometryHandler): any {
        let result = handler.handleInterpolationCurve3d(this);
        if (undefined === result) result = this._proxyCurve.dispatchToGeometryHandler(handler);
        return result;
    }

    public static create(
        options: InterpolationCurve3dOptions | InterpolationCurve3dProps
    ): InterpolationCurve3d | undefined {
        let optionsCopy;
        if (options instanceof InterpolationCurve3dOptions) {
            optionsCopy = options.clone();
        } else {
            optionsCopy = InterpolationCurve3dOptions.create(options);
        }
        return InterpolationCurve3d.createCapture(optionsCopy);
    }

    public static createCapture(
        options: InterpolationCurve3dOptions
    ): InterpolationCurve3d | undefined {
        const proxyCurve = BSplineCurve3d.createFromInterpolationCurve3dOptions(options);
        if (proxyCurve) return new InterpolationCurve3d(options, proxyCurve);
        return undefined;
    }

    public copyFitPointsFloat64Array(): Float64Array {
        return Point3dArray.cloneXYZPropsAsFloat64Array(this._options.fitPoints);
    }

    public toJSON(): any {
        return this._options.cloneAsInterpolationCurve3dProps();
    }

    public cloneProps(): InterpolationCurve3dProps {
        return this._options.cloneAsInterpolationCurve3dProps();
    }

    public get options(): InterpolationCurve3dOptions {
        return this._options;
    }

    public reverseInPlace(): void {
        this._proxyCurve.reverseInPlace();
        this._options.reverseInPlace();
    }

    public tryTransformInPlace(transform: Transform): boolean {
        const proxyOk = this._proxyCurve.tryTransformInPlace(transform);
        if (proxyOk) {
            transform.multiplyPoint3dArrayInPlace(this._options.fitPoints);
            if (this._options.startTangent) {
                transform.multiplyVectorInPlace(this._options.startTangent);
            }
            if (this._options.endTangent) transform.multiplyVectorInPlace(this._options.endTangent);
        }
        return proxyOk;
    }

    public override clone(): InterpolationCurve3d {
        return new InterpolationCurve3d(this._options.clone(), this._proxyCurve.clone());
    }

    public override isAlmostEqual(other: GeometryQuery): boolean {
        if (other instanceof InterpolationCurve3d) {
            return InterpolationCurve3dOptions.areAlmostEqual(this._options, other._options);
        }
        return false;
    }

    public isSameGeometryClass(other: GeometryQuery): boolean {
        return other instanceof InterpolationCurve3d;
    }
}
