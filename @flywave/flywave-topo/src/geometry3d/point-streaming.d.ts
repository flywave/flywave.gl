import { type MultiLineStringDataVariant } from "../topology/triangulation";
import { GrowableXYZArray } from "./growable-xyz-array";
import { Range3d } from "./range";
/**
 * "no-op" base class for stream handlers
 * @internal
 */
export declare class PointStreamXYZHandlerBase {
    startChain(_chainData: MultiLineStringDataVariant, _isLeaf: boolean): void;
    handleXYZ(_x: number, _y: number, _z: number): void;
    endChain(_chainData: MultiLineStringDataVariant, _isLeaf: boolean): void;
}
/** Base class for handling points in pairs.
 * * Callers implement handleXYZXYZ to receive point pairs.
 * * Callers may implement startChain and endChain.
 *   * Beware that if startChain is implemented it must call super.startChain () to reset internal x0, y0,z0 to undefined.
 *   * If that is not done, a point pair will appear from the end of previous chain to start of new chain.
 *   * This (intermediate base) class does NOT override startChain
 */
export declare class PointStreamXYZXYZHandlerBase extends PointStreamXYZHandlerBase {
    private _x0?;
    private _y0?;
    private _z0?;
    handleXYZ(x: number, y: number, z: number): void;
    startChain(_chainData: MultiLineStringDataVariant, _isLeaf: boolean): void;
    /**
     * Handler function called successively for each point0, point1 pair.  Concrete class should implement this.
     * @param _x0 x coordinate at point 0
     * @param _y0 y coordinate of point 0
     * @param _z0 z coordinate of point 0
     * @param _x1 x coordinate of point 1
     * @param _y1 y coordinate of point 1
     * @param _z1 z coordinate of point 1
     */
    handleXYZXYZ(_x0: number, _y0: number, _z0: number, _x1: number, _y1: number, _z1: number): void;
}
/**
 * Concrete class to handle startChain, handleXYZ and endChain calls and return a (one-level deep array of
 * GrowableXYZArray
 */
export declare class PointStreamGrowableXYZArrayCollector extends PointStreamXYZHandlerBase {
    private _pointArrays?;
    private _currentData?;
    startChain(_chainData: MultiLineStringDataVariant, _isLeaf: boolean): void;
    handleXYZ(x: number, y: number, z: number): void;
    endChain(_chainData: MultiLineStringDataVariant, _isLeaf: boolean): void;
    /** Return MultiLineStringDataVariant as an array of GrowableXYZArray */
    claimArrayOfGrowableXYZArray(): GrowableXYZArray[] | undefined;
}
/**
 * PointStream handler to collect the range of points.
 */
export declare class PointStreamRangeCollector extends PointStreamXYZHandlerBase {
    private _range?;
    handleXYZ(x: number, y: number, z: number): void;
    claimResult(): Range3d;
}
export declare class PointStringDeepXYZArrayCollector {
    private readonly _resultStack;
    private readonly _xyzFunction;
    /**
     *
     * @param xyzFunction function to map (x,y,z) to the leaf object type in the arrays.
     */
    constructor(xyzFunction: (x: number, y: number, z: number) => any);
    startChain(_chainData: MultiLineStringDataVariant, _isLeaf: boolean): void;
    handleXYZ(x: number, y: number, z: number): void;
    endChain(_chainData: MultiLineStringDataVariant, _isLeaf: boolean): void;
    claimResult(): any[];
}
/**
 * class for converting variant point data into more specific forms.
 * @internal
 */
export declare class VariantPointDataStream {
    private static _workPoint?;
    /** Invoke a callback with each x,y,z from an array of points in variant forms.
     * @param startChainCallback called to announce the beginning of points (or recursion)
     * @param pointCallback (index, x,y,z) = function to receive point coordinates one by one
     * @param endChainCallback called to announce the end of handling of an array.
     */
    static streamXYZ(data: MultiLineStringDataVariant, handler: PointStreamXYZHandlerBase): number;
}
