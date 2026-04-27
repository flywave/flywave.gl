import { type Range3d } from "../core-geometry";
export interface RenderGeometry {
    readonly renderGeometryType: "mesh" | "polyline" | "point-string";
    readonly isInstanceable: boolean;
    readonly isDisposed: boolean;
    dispose(): void;
    computeRange(out?: Range3d): Range3d;
}
