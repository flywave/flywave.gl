/* Copyright (C) 2025 flywave.gl contributors */



import { type AuxChannelTable } from "./aux-channel-table";
import { type EdgeParams } from "./edge-params";
import { type SurfaceParams } from "./surface-params";
import { type VertexTable } from "./vertex-table";

export interface MeshParams {
    vertices: VertexTable;
    surface: SurfaceParams;
    edges?: EdgeParams;
    isPlanar: boolean;
    auxChannels?: AuxChannelTable;
}
