import { type ColorIndex, QParams2d, QParams3d } from "../common";
import { type MeshParams } from "../common/render/primitives/mesh-params";
import { type VertexTable } from "../common/render/primitives/vertex-table";
import { type MeshArgs, type PolylineArgs } from "./mesh/mesh-primitives";
export declare function createMeshParams(args: MeshArgs, maxDimension: number): MeshParams;
export declare abstract class VertexTableBuilder {
    data?: Uint8Array;
    private _curIndex;
    abstract get numVertices(): number;
    abstract get numRgbaPerVertex(): number;
    abstract get qparams(): QParams3d;
    abstract get usesUnquantizedPositions(): boolean;
    get uvParams(): QParams2d | undefined;
    abstract appendVertex(vertIndex: number): void;
    appendColorTable(colorIndex: ColorIndex): void;
    protected advance(nBytes: number): void;
    protected append8(val: number): void;
    protected append16(val: number): void;
    protected append32(val: number): void;
    private appendColor;
    build(colorIndex: ColorIndex, maxDimension: number): VertexTable;
    static buildFromPolylines(args: PolylineArgs, maxDimension: number): VertexTable | undefined;
}
