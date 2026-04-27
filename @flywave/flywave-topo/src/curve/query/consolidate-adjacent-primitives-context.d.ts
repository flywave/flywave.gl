import { NullGeometryHandler } from "../../geometry3d/geometry-handler";
import { type CurveChain } from "../curve-collection";
import { type Loop } from "../loop";
import { type ParityRegion } from "../parity-region";
import { type Path } from "../path";
import { ConsolidateAdjacentCurvePrimitivesOptions } from "../region-ops";
import { type UnionRegion } from "../union-region";
/**
 * * Implementation class for ConsolidateAdjacentCurvePrimitives.
 *
 * @internal
 */
export declare class ConsolidateAdjacentCurvePrimitivesContext extends NullGeometryHandler {
    private readonly _options;
    constructor(options?: ConsolidateAdjacentCurvePrimitivesOptions);
    /** look for adjacent compatible primitives in a path or loop. */
    handleCurveChain(g: CurveChain): void;
    handlePath(g: Path): any;
    handleLoop(g: Loop): any;
    handleParityRegion(g: ParityRegion): any;
    handleUnionRegion(g: UnionRegion): any;
}
