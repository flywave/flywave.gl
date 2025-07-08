import { VertexIndices } from "./vertex-indices";
import { VertexTable } from "./vertex-table";

export interface PointStringParams {
    vertices: VertexTable;
    indices: VertexIndices;
    weight: number;
}
