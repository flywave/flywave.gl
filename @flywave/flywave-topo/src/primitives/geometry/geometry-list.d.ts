import { QParams3d } from "../../common";
import { Range3d } from "../../core-geometry";
import { type Geometry } from "./geometry-primitives";
export declare class GeometryList {
    private readonly _list;
    get first(): Geometry | undefined;
    get isEmpty(): boolean;
    get length(): number;
    push(geom: Geometry): number;
    append(src: GeometryList): this;
    clear(): void;
    computeRange(): Range3d;
    computeQuantizationParams(): QParams3d;
    [Symbol.iterator](): ArrayIterator<Geometry>;
}
