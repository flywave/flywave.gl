import { type GeometryHandler } from "../geometry3d/geometry-handler";
import { Point3d } from "../geometry3d/point3d-vector3d";
import { Range3d } from "../geometry3d/range";
import { type Transform } from "../geometry3d/transform";
import { GeometryQuery } from "./geometry-query";
/**
 * A Coordinate is a Point3d with supporting methods from the GeometryQuery abstraction.
 * @public
 */
export declare class CoordinateXYZ extends GeometryQuery {
    /** String name for interface properties */
    readonly geometryCategory = "point";
    private readonly _xyz;
    /** Return a (REFERENCE TO) the coordinate data. */
    get point(): Point3d;
    /**
     * @param xyz point to be CAPTURED.
     */
    private constructor();
    /** Create a new CoordinateXYZ containing a CLONE of point */
    static create(point: Point3d): CoordinateXYZ;
    /** Create a new CoordinateXYZ */
    static createXYZ(x?: number, y?: number, z?: number): CoordinateXYZ;
    /** Return the range of the point */
    range(): Range3d;
    /** Extend `rangeToExtend` to include this point (optionally transformed) */
    extendRange(rangeToExtend: Range3d, transform?: Transform): void;
    /** Apply transform to the Coordinate's point. */
    tryTransformInPlace(transform: Transform): boolean;
    /** Return a transformed clone */
    cloneTransformed(transform: Transform): GeometryQuery | undefined;
    /** Return a clone */
    clone(): GeometryQuery | undefined;
    /**
     * Return GeometryQuery children for recursive queries.
     * * Leaf classes do not need to implement.
     */
    /** Test if (other instanceof Coordinate).  */
    isSameGeometryClass(other: GeometryQuery): boolean;
    /**
     * Test for exact structure and nearly identical geometry.
     * *  Leaf classes must implement !!!
     * *  Base class implementation recurses through children.
     * *  Base implementation is complete for classes with children and no properties.
     * *  Classes with both children and properties must implement for properties, call super for children.
     */
    isAlmostEqual(other: GeometryQuery): boolean;
    /** Second step of double dispatch:  call `handler.handleCoordinateXYZ(this)` */
    dispatchToGeometryHandler(handler: GeometryHandler): any;
}
