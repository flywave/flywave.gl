/* Copyright (C) 2025 flywave.gl contributors */



import { type CurvePrimitive } from "../curve/curve-primitive";
import { type GeometryQuery } from "../curve/geometry-query";
import { ProxyCurve } from "../curve/proxy-curve";
import { Geometry } from "../geometry";
import { type GeometryHandler } from "../geometry3d/geometry-handler";
import { Point3dArray } from "../geometry3d/point-helpers";
import { type Point3d } from "../geometry3d/point3d-vector3d";
import { type Transform } from "../geometry3d/transform";
import { type XYZProps } from "../geometry3d/xyz-props";
import { BSplineCurve3d } from "./bspline-curve";

export interface AkimaCurve3dProps {
    fitPoints: XYZProps[];
}

export class AkimaCurve3dOptions {
    public fitPoints: Point3d[];

    public constructor(fitPoints?: Point3d[]) {
        this.fitPoints = fitPoints ? fitPoints : [];
    }

    public cloneAsAkimaCurve3dProps(): AkimaCurve3dProps {
        const props = {
            fitPoints: Point3dArray.cloneDeepJSONNumberArrays(this.fitPoints)
        };
        return props;
    }

    public clone(): AkimaCurve3dOptions {
        const clone = new AkimaCurve3dOptions(Point3dArray.clonePoint3dArray(this.fitPoints));
        return clone;
    }

    public static create(source: AkimaCurve3dProps): AkimaCurve3dOptions {
        const result = new AkimaCurve3dOptions(Point3dArray.clonePoint3dArray(source.fitPoints));
        return result;
    }

    public static areAlmostEqual(
        dataA: AkimaCurve3dOptions | undefined,
        dataB: AkimaCurve3dOptions | undefined
    ): boolean {
        if (dataA === undefined && dataB === undefined) return true;
        if (dataA !== undefined && dataB !== undefined) {
            return Geometry.almostEqualArrays(
                dataA.fitPoints,
                dataB.fitPoints,
                (a: Point3d, b: Point3d) => a.isAlmostEqual(b)
            );
        }
        return false;
    }
}

export class AkimaCurve3d extends ProxyCurve {
    public readonly curvePrimitiveType = "interpolationCurve";
    private readonly _options: AkimaCurve3dOptions;

    private constructor(properties: AkimaCurve3dOptions, proxyCurve: CurvePrimitive) {
        super(proxyCurve);
        this._options = properties;
    }

    public override dispatchToGeometryHandler(handler: GeometryHandler) {
        return handler.handleAkimaCurve3d(this);
    }

    public static create(
        options: AkimaCurve3dOptions | AkimaCurve3dProps
    ): AkimaCurve3d | undefined {
        let optionsCopy;
        if (options instanceof AkimaCurve3dOptions) {
            optionsCopy = options.clone();
        } else {
            optionsCopy = AkimaCurve3dOptions.create(options);
        }
        return AkimaCurve3d.createCapture(optionsCopy);
    }

    public static createCapture(options: AkimaCurve3dOptions): AkimaCurve3d | undefined {
        const proxyCurve = BSplineCurve3d.createFromAkimaCurve3dOptions(options);
        if (proxyCurve) return new AkimaCurve3d(options, proxyCurve);
        return undefined;
    }

    public copyFitPointsFloat64Array(): Float64Array {
        return Point3dArray.cloneXYZPropsAsFloat64Array(this._options.fitPoints);
    }

    public toJSON(): any {
        return this._options.cloneAsAkimaCurve3dProps();
    }

    public cloneProps(): AkimaCurve3dProps {
        return this._options.cloneAsAkimaCurve3dProps();
    }

    public reverseInPlace(): void {
        this._proxyCurve.reverseInPlace();
        this._options.fitPoints.reverse();
    }

    public tryTransformInPlace(transform: Transform): boolean {
        const proxyOk = this._proxyCurve.tryTransformInPlace(transform);
        if (proxyOk) {
            transform.multiplyPoint3dArray(this._options.fitPoints);
        }
        return proxyOk;
    }

    public override clone(): AkimaCurve3d {
        return new AkimaCurve3d(this._options.clone(), this._proxyCurve.clone());
    }

    public isSameGeometryClass(other: GeometryQuery): boolean {
        return other instanceof AkimaCurve3d;
    }

    public override isAlmostEqual(other: GeometryQuery): boolean {
        if (other instanceof AkimaCurve3d) {
            return AkimaCurve3dOptions.areAlmostEqual(this._options, other._options);
        }
        return false;
    }
}
