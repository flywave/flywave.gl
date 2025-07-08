import { AuxChannelTable } from "./aux-channel-table";
import { EdgeParams } from "./edge-params";
import { SurfaceParams } from "./surface-params";
import { VertexTable } from "./vertex-table";

export interface MeshParams {
    vertices: VertexTable;
    surface: SurfaceParams;
    edges?: EdgeParams;
    isPlanar: boolean;
    auxChannels?: AuxChannelTable;
}
