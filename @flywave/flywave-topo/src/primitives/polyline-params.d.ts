import { QPoint3dList } from "../common";
import { type PolylineIndices } from "../common/render";
import { type PolylineParams, type TesselatedPolyline } from "../common/render/primitives/polyline-params";
import { type MeshArgs, type PolylineArgs } from "./mesh/mesh-primitives";
export declare function tesselatePolylineFromMesh(args: MeshArgs): TesselatedPolyline | undefined;
export declare function tesselatePolyline(polylines: PolylineIndices[], points: QPoint3dList, doJointTriangles: boolean): TesselatedPolyline;
export declare function createPolylineParams(args: PolylineArgs): PolylineParams | undefined;
export declare function wantJointTriangles(weight: number, is2d: boolean): boolean;
