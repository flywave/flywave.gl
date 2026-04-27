import { type MeshParams } from "../common/render/primitives/mesh-params";
import { type PointStringParams } from "../common/render/primitives/point-string-params";
import { type PolylineParams } from "../common/render/primitives/polyline-params";
import { type Point3d } from "../core-geometry";
import { MeshRenderGeometry } from "./mesh-render-geometry";
import { PointStringGeometry } from "./pointstring-geometry";
import { PolylineGeometry } from "./polyline-geometry";
export declare class RenderSystem {
    static createMeshGeometry(params: MeshParams, viOrigin?: Point3d): MeshRenderGeometry | undefined;
    static createPolylineGeometry(params: PolylineParams): PolylineGeometry | undefined;
    static createPointStringGeometry(params: PointStringParams): PointStringGeometry | undefined;
}
