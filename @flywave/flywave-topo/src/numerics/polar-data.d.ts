import { type GeometryQuery } from "../curve/geometry-query";
import { Angle } from "../geometry3d/angle";
/** Enumeration of how constraints have been resolved
 * @internal
 */
export declare enum ConstraintState {
    unknown = 0,
    singlePoint = 1,
    impossibleValues = -1,
    onCurve = 2
}
/**
 * PolarData carries (possibly incomplete) data for converting among polar and cartesian coordinates.
 * @internal
 */
export declare class PolarData {
    private static readonly _defaultRadius;
    static get defaultRadius(): number;
    /** x coordinate, possibly unknown */
    x?: number;
    /** y coordinate, possibly unknown */
    y?: number;
    /** radius, possibly unknown */
    r?: number;
    /** angle, possibly unknown */
    theta?: Angle;
    /** point, line, or arc geometry, as determined by  solveFromScalars */
    geometry?: GeometryQuery;
    /** enumeration of resolved state validity conditions. */
    state?: ConstraintState;
    /** Count the number of defined values among x,y,r, theta */
    get numberOfConstrainedScalars(): number;
    /** Create with any combination of known and unknown scalars. */
    static createMixedScalars(state?: ConstraintState, x?: number, y?: number, r?: number, theta?: Angle): PolarData;
    /** Clone the scalar data, replace the state.
     * * Geometry is NOT cloned.
     */
    cloneScalarsWithState(newState: ConstraintState): PolarData;
    /** Given a possibly incomplete set of x,y,r,theta, determine the possible completions. */
    static solveFromScalars(known: PolarData): PolarData[];
}
