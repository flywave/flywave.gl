import { type RenderMaterial } from "../../../common";
import { type MaterialParams } from "../material-params";
import { type MeshParams } from "./mesh-params";
import { type PointStringParams } from "./point-string-params";
import { type PolylineParams } from "./polyline-params";
import { type SurfaceMaterial } from "./surface-params";
import { VertexIndices } from "./vertex-indices";
import { type VertexTable } from "./vertex-table";
export interface VertexTableWithIndices {
    vertices: VertexTable;
    indices: VertexIndices;
    material?: SurfaceMaterial;
}
export declare class IndexBuffer {
    private readonly _builder;
    private readonly _index32;
    private readonly _index8;
    constructor(initialCapacity?: number);
    get numIndices(): number;
    push(index: number): void;
    toVertexIndices(): VertexIndices;
}
type CreateRenderMaterial = (args: MaterialParams) => RenderMaterial | undefined;
export type ComputeAnimationNodeId = (featureIndex: number) => number;
export interface SplitVertexTableArgs {
    maxDimension: number;
    computeNodeId: ComputeAnimationNodeId;
}
export interface SplitPointStringArgs extends SplitVertexTableArgs {
    params: PointStringParams;
}
export declare function splitPointStringParams(args: SplitPointStringArgs): Map<number, PointStringParams>;
export interface SplitMeshArgs extends SplitVertexTableArgs {
    params: MeshParams;
    createMaterial: CreateRenderMaterial;
}
export declare function splitMeshParams(args: SplitMeshArgs): Map<number, MeshParams>;
export interface SplitPolylineArgs extends SplitVertexTableArgs {
    params: PolylineParams;
}
/** @internal */
export declare function splitPolylineParams(args: SplitPolylineArgs): Map<number, PolylineParams>;
export {};
