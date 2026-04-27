import { type GeometryQuery } from "../curve/geometry-query";
import { ProxyCurve } from "../curve/proxy-curve";
import { type GeometryHandler } from "../geometry3d/geometry-handler";
import { type Point3d } from "../geometry3d/point3d-vector3d";
import { type Transform } from "../geometry3d/transform";
import { type XYZProps } from "../geometry3d/xyz-props";
export interface AkimaCurve3dProps {
    fitPoints: XYZProps[];
}
export declare class AkimaCurve3dOptions {
    fitPoints: Point3d[];
    constructor(fitPoints?: Point3d[]);
    cloneAsAkimaCurve3dProps(): AkimaCurve3dProps;
    clone(): AkimaCurve3dOptions;
    static create(source: AkimaCurve3dProps): AkimaCurve3dOptions;
    static areAlmostEqual(dataA: AkimaCurve3dOptions | undefined, dataB: AkimaCurve3dOptions | undefined): boolean;
}
export declare class AkimaCurve3d extends ProxyCurve {
    readonly curvePrimitiveType = "interpolationCurve";
    private readonly _options;
    private constructor();
    dispatchToGeometryHandler(handler: GeometryHandler): any;
    static create(options: AkimaCurve3dOptions | AkimaCurve3dProps): AkimaCurve3d | undefined;
    static createCapture(options: AkimaCurve3dOptions): AkimaCurve3d | undefined;
    copyFitPointsFloat64Array(): Float64Array;
    toJSON(): any;
    cloneProps(): AkimaCurve3dProps;
    reverseInPlace(): void;
    tryTransformInPlace(transform: Transform): boolean;
    clone(): AkimaCurve3d;
    isSameGeometryClass(other: GeometryQuery): boolean;
    isAlmostEqual(other: GeometryQuery): boolean;
}
