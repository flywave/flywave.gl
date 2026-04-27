import { type AnyRegion } from "../curve-types";
import { Loop } from "../loop";
import { ParityRegion } from "../parity-region";
import { UnionRegion } from "../union-region";
/**
 * Context for testing containment in Loop, ParityRegion and UnionRegion.
 * @internal
 */
export declare class PointInOnOutContext {
    /**
     * In-out test for a single loop.
     * * Test by finding intersections with an xy line (xyz plane) in "some" direction.
     * * Test logic gets complicated if the plane has a vertex hit.
     * * If that happens, don't try to figure out the cases.   Just move on to another plane.
     * * Any "on" point triggers immediate 0 return.
     *   * (Hence if there are overlapping lines their self-canceling effect might be wrong.)
     * @param loop
     * @param x tested x coordinate
     * @param y tested y coordinate
     */
    static testPointInOnOutLoopXY(loop: Loop, x: number, y: number): number;
    /**
     * strongly-typed parity region handling: XOR of all loops. (But any ON is returned as edge hit.)
     * @param parent
     * @param x
     * @param y
     */
    static testPointInOnOutParityRegionXY(parent: ParityRegion, x: number, y: number): number;
    static testPointInOnOutUnionRegionXY(parent: UnionRegion, x: number, y: number): number;
    static testPointInOnOutRegionXY(parent: AnyRegion, x: number, y: number): number;
}
