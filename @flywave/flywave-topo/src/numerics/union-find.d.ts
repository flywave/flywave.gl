/**
 * Implement the classic UnionFind algorithm, viz https://en.wikipedia.org/wiki/Disjoint-set_data_structure
 * * Each of the entities being merged exists as an entry in an array.
 * * The index in the array is the (only!) identification of the entity.
 * * The array entry is the index of a parent in the merge process.
 * * New entries are created as singletons pointing to themselves.
 * * Merge (i,j) merges the collections containing entries (i) and (j) into a single collection.
 * * The merge process updates the indices "above" (i) and (j)
 * * The whole process is extraordinarily efficient regardless of the order that the (i,j) merges are announced.
 * @internal
 */
export declare class UnionFindContext {
    private _parentArray;
    /** Create a set initialized with numLeaf singleton subsets */
    constructor(numLeaf?: number);
    /** Return the number of leaves. */
    get length(): number;
    /** test if index is within the valid index range. */
    isValidIndex(index: number): boolean;
    /** Return the index of a new singleton set */
    addLeaf(): number;
    /**
     * * follow links to parent
     * * after finding the parent, repeat the search and reset parents along the way.
     * * If index is invalid, return index unchanged.
     * @param index start of search
     */
    findRoot(index: number): number;
    /** Merge the subsets containing index (i) and (j)
     * * Look up the root of each.
     * * Fix up the path to the root so it points to the root.
     * * Return the root index of the merged set.
     * * If either index is invalid return index i with no changes.
     */
    mergeSubsets(i: number, j: number): number;
    /** Return the immediate parent of index (i), with no fixups
     * * If index is invalid, return it.
     */
    askParent(index: number): number;
    /** Return the number of entries which are their own parent. */
    countRoots(): number;
    /** Return the number of entries whose parent is not a root. */
    countNonTrivialPaths(): number;
    /** Return an array of all root indices.
     * * This array is sorted.
     */
    collectRootIndices(): number[];
}
