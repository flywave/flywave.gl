import { Feature, OctEncodedNormal } from "../common";
import { Point2d, Point3d, XYAndZ } from "../core-geometry";
import { assert, comparePossiblyUndefined, compareWithTolerance, IndexMap } from "../utils";

export interface VertexKeyProps {
    position: Point3d;
    fillColor: number;
    normal?: OctEncodedNormal;
    uvParam?: Point2d;
    feature?: Feature;
}

function comparePositions(p0: Point3d, p1: Point3d, tolerance: XYAndZ): number {
    let diff = compareWithTolerance(p0.x, p1.x, tolerance.x);
    if (diff === 0) {
        diff = compareWithTolerance(p0.y, p1.y, tolerance.y);
        if (diff === 0) diff = compareWithTolerance(p0.z, p1.z, tolerance.z);
    }

    return diff;
}

function compareFeatures(f0: Feature | undefined, f1: Feature | undefined): number {
    return comparePossiblyUndefined((lhs, rhs) => lhs.compare(rhs), f0, f1);
}

export class VertexKey {
    public readonly position: Point3d;
    public readonly normal?: OctEncodedNormal;
    public readonly uvParam?: Point2d;
    public readonly fillColor: number;
    public readonly feature?: Feature;

    public constructor(
        position: Point3d,
        fillColor: number,
        normal?: OctEncodedNormal,
        uvParam?: Point2d,
        feature?: Feature
    ) {
        this.position = position.clone();
        this.fillColor = fillColor;
        this.normal = normal;
        this.uvParam = uvParam?.clone();
        this.feature = feature;
    }

    public static create(props: VertexKeyProps): VertexKey {
        return new VertexKey(
            props.position,
            props.fillColor,
            props.normal,
            props.uvParam,
            props.feature
        );
    }

    public equals(rhs: VertexKey, tolerance: XYAndZ): boolean {
        if (this.fillColor !== rhs.fillColor) return false;

        if (compareFeatures(this.feature, rhs.feature) !== 0) return false;

        if (undefined !== this.normal) {
            assert(undefined !== rhs.normal);
            if (this.normal.value !== rhs.normal.value) return false;
        }

        if (comparePositions(this.position, rhs.position, tolerance) !== 0) return false;

        if (undefined !== this.uvParam) {
            assert(undefined !== rhs.uvParam);
            return this.uvParam.isAlmostEqual(rhs.uvParam, 0.0001);
        }

        return true;
    }

    public compare(rhs: VertexKey, tolerance: XYAndZ): number {
        if (this === rhs) return 0;

        let diff = this.fillColor - rhs.fillColor;
        if (diff === 0) {
            diff = comparePositions(this.position, rhs.position, tolerance);
            if (diff === 0) {
                diff = compareFeatures(this.feature, rhs.feature);
                if (diff === 0) {
                    if (undefined !== this.normal) {
                        assert(undefined !== rhs.normal);
                        diff = this.normal.value - rhs.normal.value;
                    }

                    if (diff === 0 && undefined !== this.uvParam) {
                        assert(undefined !== rhs.uvParam);
                        diff = compareWithTolerance(this.uvParam.x, rhs.uvParam.x);
                        if (diff === 0) diff = compareWithTolerance(this.uvParam.x, rhs.uvParam.y);
                    }
                }
            }
        }

        return diff;
    }
}

export class VertexMap extends IndexMap<VertexKey> {
    private readonly _tolerance: XYAndZ;

    public constructor(tolerance: XYAndZ) {
        super((lhs, rhs) => lhs.compare(rhs, tolerance));
        this._tolerance = tolerance;
    }

    public insertKey(props: VertexKeyProps, onInsert?: (vk: VertexKey) => any): number {
        return this.insert(VertexKey.create(props), onInsert);
    }

    public arePositionsAlmostEqual(p0: VertexKeyProps, p1: VertexKeyProps): boolean {
        return this.comparePositions(p0, p1) === 0;
    }

    public comparePositions(p0: VertexKeyProps, p1: VertexKeyProps): number {
        return comparePositions(p0.position, p1.position, this._tolerance);
    }
}
