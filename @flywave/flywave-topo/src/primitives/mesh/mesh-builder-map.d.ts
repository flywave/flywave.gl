import { type DisplayParams } from "../../common/render/primitives/display-params";
import { MeshPrimitiveType } from "../../common/render/primitives/mesh-primitive";
import { type Range3d } from "../../core-geometry";
import { Dictionary } from "../../utils";
import { type GeometryList } from "../geometry/geometry-list";
import { type Geometry } from "../geometry/geometry-primitives";
import { type PolyfacePrimitive } from "../polyface";
import { type GeometryOptions } from "../primitives";
import { type StrokesPrimitive } from "../strokes";
import { MeshBuilder } from "./mesh-builder";
import { type Mesh, MeshList } from "./mesh-primitives";
export declare class MeshBuilderMap extends Dictionary<MeshBuilderMap.Key, MeshBuilder> {
    readonly range: Range3d;
    readonly vertexTolerance: number;
    readonly facetAreaTolerance: number;
    readonly tolerance: number;
    readonly is2d: boolean;
    readonly options: GeometryOptions;
    private _keyOrder;
    constructor(tolerance: number, range: Range3d, is2d: boolean, options: GeometryOptions);
    static createFromGeometries(geometries: GeometryList, tolerance: number, range: Range3d, is2d: boolean, options: GeometryOptions): MeshBuilderMap;
    toMeshes(): MeshList;
    loadGeometry(geom: Geometry): void;
    loadPolyfacePrimitiveList(geom: Geometry): void;
    loadIndexedPolyface(polyface: PolyfacePrimitive): void;
    loadStrokePrimitiveList(geom: Geometry): void;
    loadStrokesPrimitive(strokePrimitive: StrokesPrimitive): void;
    getBuilder(displayParams: DisplayParams, type: MeshPrimitiveType, hasNormals: boolean, isPlanar: boolean): MeshBuilder;
    getKey(displayParams: DisplayParams, type: MeshPrimitiveType, hasNormals: boolean, isPlanar: boolean): MeshBuilderMap.Key;
    getBuilderFromKey(key: MeshBuilderMap.Key, props: MeshBuilder.Props): MeshBuilder;
}
export declare namespace MeshBuilderMap {
    class Key {
        order: number;
        readonly params: DisplayParams;
        readonly type: MeshPrimitiveType;
        readonly hasNormals: boolean;
        readonly isPlanar: boolean;
        constructor(params: DisplayParams, type: MeshPrimitiveType, hasNormals: boolean, isPlanar: boolean);
        static createFromMesh(mesh: Mesh): Key;
        compare(rhs: Key): number;
        equals(rhs: Key): boolean;
    }
}
