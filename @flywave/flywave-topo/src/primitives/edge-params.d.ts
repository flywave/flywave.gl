import { type EdgeParams } from "../common/render/primitives/edge-params";
import { type MeshArgs } from "./mesh/mesh-primitives";
export declare function createEdgeParams(meshArgs: MeshArgs, maxWidth?: number, type?: "compact" | "indexed" | "non-indexed"): EdgeParams | undefined;
