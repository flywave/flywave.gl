import { type DisplayParams } from "../common/render/primitives/display-params";
import { type Transform } from "../geometry3d/transform";
import { type IndexedPolyface } from "../polyface/polyface";
export declare class PolyfacePrimitive {
    readonly displayParams: DisplayParams;
    private readonly _polyface;
    readonly displayEdges: boolean;
    readonly isPlanar: boolean;
    get indexedPolyface(): IndexedPolyface;
    static create(params: DisplayParams, pf: IndexedPolyface, displayEdges?: boolean, isPlanar?: boolean): PolyfacePrimitive;
    private constructor();
    clone(): PolyfacePrimitive;
    transform(trans: Transform): boolean;
}
export declare class PolyfacePrimitiveList extends Array<PolyfacePrimitive> {
    constructor(...args: PolyfacePrimitive[]);
}
