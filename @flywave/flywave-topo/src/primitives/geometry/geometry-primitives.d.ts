import { DisplayParams } from "../../common/render/primitives/display-params";
import { type IndexedPolyface, type Loop, type Path, type Point3d, type Range3d, type SolidPrimitive, type Transform, StrokeOptions } from "../../core-geometry";
import { PolyfacePrimitiveList } from "../polyface";
import { StrokesPrimitiveList } from "../strokes";
export type PrimitiveGeometryType = Loop | Path | IndexedPolyface | SolidPrimitive;
export declare abstract class Geometry {
    readonly transform: Transform;
    readonly tileRange: Range3d;
    readonly displayParams: DisplayParams;
    constructor(transform: Transform, tileRange: Range3d, displayParams: DisplayParams);
    static createFromPointString(pts: Point3d[], tf: Transform, tileRange: Range3d, params: DisplayParams): Geometry;
    static createFromLineString(pts: Point3d[], tf: Transform, tileRange: Range3d, params: DisplayParams): Geometry;
    static createFromLoop(loop: Loop, tf: Transform, tileRange: Range3d, params: DisplayParams, disjoint: boolean): Geometry;
    static createFromSolidPrimitive(primitive: SolidPrimitive, tf: Transform, tileRange: Range3d, params: DisplayParams): Geometry;
    static createFromPath(path: Path, tf: Transform, tileRange: Range3d, params: DisplayParams, disjoint: boolean): Geometry;
    static createFromPolyface(ipf: IndexedPolyface, tf: Transform, tileRange: Range3d, params: DisplayParams): Geometry;
    protected abstract _getPolyfaces(facetOptions: StrokeOptions): PolyfacePrimitiveList | undefined;
    protected abstract _getStrokes(facetOptions: StrokeOptions): StrokesPrimitiveList | undefined;
    getPolyfaces(tolerance: number): PolyfacePrimitiveList | undefined;
    getStrokes(tolerance: number): StrokesPrimitiveList | undefined;
    get hasTexture(): boolean;
    doDecimate(): boolean;
    doVertexCluster(): boolean;
    part(): any;
}
export declare class PrimitivePathGeometry extends Geometry {
    readonly path: Path;
    readonly isDisjoint: boolean;
    constructor(path: Path, tf: Transform, range: Range3d, params: DisplayParams, isDisjoint: boolean);
    protected _getPolyfaces(_facetOptions: StrokeOptions): PolyfacePrimitiveList | undefined;
    protected _getStrokes(facetOptions: StrokeOptions): StrokesPrimitiveList | undefined;
    static getStrokesForLoopOrPath(loopOrPath: Loop | Path, facetOptions: StrokeOptions, params: DisplayParams, isDisjoint: boolean, transform: Transform): StrokesPrimitiveList | undefined;
    private static collectCurveStrokes;
}
export declare class PrimitivePointStringGeometry extends Geometry {
    readonly pts: Point3d[];
    constructor(pts: Point3d[], tf: Transform, range: Range3d, params: DisplayParams);
    protected _getPolyfaces(_facetOptions: StrokeOptions): PolyfacePrimitiveList | undefined;
    protected _getStrokes(_facetOptions: StrokeOptions): StrokesPrimitiveList | undefined;
}
export declare class PrimitiveLineStringGeometry extends Geometry {
    readonly pts: Point3d[];
    constructor(pts: Point3d[], tf: Transform, range: Range3d, params: DisplayParams);
    protected _getPolyfaces(_facetOptions: StrokeOptions): PolyfacePrimitiveList | undefined;
    protected _getStrokes(_facetOptions: StrokeOptions): StrokesPrimitiveList | undefined;
}
export declare class PrimitiveLoopGeometry extends Geometry {
    readonly loop: Loop;
    readonly isDisjoint: boolean;
    constructor(loop: Loop, tf: Transform, range: Range3d, params: DisplayParams, isDisjoint: boolean);
    protected _getPolyfaces(facetOptions: StrokeOptions): PolyfacePrimitiveList | undefined;
    protected _getStrokes(facetOptions: StrokeOptions): StrokesPrimitiveList | undefined;
}
export declare class PrimitivePolyfaceGeometry extends Geometry {
    readonly polyface: IndexedPolyface;
    constructor(polyface: IndexedPolyface, tf: Transform, range: Range3d, params: DisplayParams);
    protected _getPolyfaces(facetOptions: StrokeOptions): PolyfacePrimitiveList | undefined;
    protected _getStrokes(_facetOptions: StrokeOptions): StrokesPrimitiveList | undefined;
}
export declare class SolidPrimitiveGeometry extends Geometry {
    readonly primitive: SolidPrimitive;
    constructor(primitive: SolidPrimitive, tf: Transform, range: Range3d, params: DisplayParams);
    protected _getStrokes(): any;
    protected _getPolyfaces(opts: StrokeOptions): PolyfacePrimitiveList;
}
