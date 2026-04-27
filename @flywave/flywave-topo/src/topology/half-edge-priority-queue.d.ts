import { type OrderedComparator, PriorityQueue } from "../utils";
import { type HalfEdge } from "./graph";
/**
 * * Combination of a priority queue of HalfEdges with
 * * Additional "active" array to carry edges that have been removed from the queue but are still to be
 *    inspected (possibly many times)
 * * The priority queue default sort is Y-then-X lexical sort.
 * * Caller has direct access to the queue and array.
 * * Methods are added here only to do things that involve both the queue and the array.
 * @internal
 */
export declare class HalfEdgePriorityQueueWithPartnerArray {
    priorityQueue: PriorityQueue<HalfEdge>;
    activeEdges: HalfEdge[];
    constructor(compare?: OrderedComparator<HalfEdge>);
    /** Read a member from the queue and transfer to the active array. */
    popQueueToArray(): HalfEdge | undefined;
    /** Pop the last entry and put it back as replacement for current entry at index i.
     * * Effectively remove active member at index i
     * * The array order is changed.
     * * constant time.
     */
    popArrayToArrayIndex(i: number): void;
    /**
     * * Scan the active array.
     * * remove edges whose top y is below y
     * * (pack all remaining ones back towards the beginning)
     */
    removeArrayMembersWithY1Below(y: number): void;
}
